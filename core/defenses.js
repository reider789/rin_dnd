"use strict";
class CombatDefenses {
  static canReact(e,id){return (typeof module!=="undefined"?require("./magic").CombatMagic:CombatMagic).canReact(e,id);}
  static inAura(e, owner, target, radius) {
    return (
      !e.incapacitated(owner) &&
      e.active(owner) &&
      e.unit(owner).team === e.unit(target).team &&
      e.distance(e.unit(owner), e.unit(target)) <= radius &&
      e.wallLOS(e.unit(owner), e.unit(target))
    );
  }
  static saveBonus(e, id) {
    let aura = 0,
      mark = 0;
    for (const owner of e.s.order) {
      const f = e.unit(owner).features;
      if (f.auraProtection && this.inAura(e, owner, id, f.auraRadius || 10))
        aura = Math.max(aura, f.auraProtection);
      if (owner !== id && f.guardianSaveBonus && this.inAura(e, owner, id, 5))
        mark = Math.max(mark, f.guardianSaveBonus);
    }
    return aura + mark;
  }
  static suppresses(e, id, condition) {
    if(condition==="frightened" && (typeof module!=="undefined"?require("./magic").CombatMagic:CombatMagic).effects(e,id,"heroism").length)return true;
    const feature = { charmed: "auraDevotion", frightened: "auraCourage" }[
      condition
    ];
    return Boolean(
      feature &&
        e.s.order.some(
          (owner) =>
            e.unit(owner).features[feature] &&
            this.inAura(e, owner, id, e.unit(owner).features.auraRadius || 10),
        ),
    );
  }
  static refresh(e, starting = null) {
    for (const id of e.s.order) {
      const before = e.speed(id);
      e.unit(id).statuses = e
        .unit(id)
        .statuses.filter(
          (z) =>
            !(z.expiresOnSourceStart === starting) &&
            !(
              z.kind === "protected" &&
              (!e.active(z.source) ||
                e.incapacitated(z.source) ||
                e.distance(e.unit(z.source), e.unit(id)) > 5)
            ),
        );
      e.adjustMovementForSpeed(id, before);
    }
  }
  static protected(e, id) {
    return e.unit(id).statuses.some((z) => z.kind === "protected");
  }
  static beforeAttack(e, t) {
    if (this.protected(e, t.target)) return false;
    const considered = t.protectorsConsidered || [];
    for (const id of e.s.order) {
      const u = e.unit(id);
      if (
        id === t.target ||
        considered.includes(id) ||
        !u.features.protection ||
        !u.features.shieldEquipped ||
        u.reaction <= 0 || !this.canReact(e,id) ||
        e.incapacitated(id) ||
        u.team !== e.unit(t.target).team ||
        e.distance(u, e.unit(t.target)) > 5 ||
        !e.canSee(id, t.actor)
      )
        continue;
      const next = { ...t, protectorsConsidered: [...considered, id] };
      if (u.controlled)
        e.decision("defensiveReaction", id, {
          ability: "protection",
          attack: next,
        });
      else {
        u.reaction--;
        e.status(t.target, "protected", {
          source: id,
          expiresOnSourceStart: id,
        });
        e.enqueue(next);
      }
      return true;
    }
    return false;
  }
  static canShield(e, id) {
    const u = e.unit(id);
    return (
      u.features.shieldSpell &&
      u.reaction > 0 && this.canReact(e,id) &&
      !e.incapacitated(id) &&
      !e.has(id, "shield") &&
      ((u.counters?.shield_magic_initiate?.current || 0) > 0 ||
        (u.slotTurn !== e.s.turnSerial &&
          Object.entries(u.slots || {}).some(
            ([n, p]) => +n >= 1 && p.current > 0,
          )))
    );
  }
  static shield(e, id, after=null) {
    if(e.unit(id).casting && after){(typeof module!=="undefined"?require("./magic").CombatMagic:CombatMagic).castShield(e,id,after);return;}
    const u = e.unit(id);
    e.require(this.canShield(e, id), "Щит недоступен");
    u.reaction--;
    if ((u.counters?.shield_magic_initiate?.current || 0) > 0)
      u.counters.shield_magic_initiate.current--;
    else {
      const level = Object.keys(u.slots)
        .map(Number)
        .sort((a, b) => a - b)
        .find((n) => n >= 1 && u.slots[n].current > 0);
      u.slots[level].current--;
      u.slotTurn = e.s.turnSerial;
    }
    e.status(id, "shield", { expiresAtStart: id });
    e.emit("cast", id, u.name + ": Щит, +5 КД до начала следующего хода.");
  }
  static beforeResult(e, t) {
    const target = e.unit(t.target),
      from = e.unit(t.actor),
      d = t.result.kept,
      ac = e.ac(t.target, from, t.spec) + (t.acBonus || 0),
      hit = d === 20 || (d !== 1 && t.result.total >= ac);
    if (!hit) return false;
    const considered = t.defensesConsidered || [],
      tag = (id, key) => id + ":" + key;
    if (
      d !== 20 &&
      t.result.total < ac + 5 &&
      this.canShield(e, t.target) &&
      !considered.includes(tag(t.target, "shield"))
    ) {
      const next = {
        ...t,
        defensesConsidered: [...considered, tag(t.target, "shield")],
      };
      if (target.features.autoShield || !target.controlled) {
        this.shield(e, t.target,next);
        if(!target.casting)e.enqueue(next);
      } else
        e.decision("defensiveReaction", t.target, {
          ability: "shield",
          attack: next,
        });
      return true;
    }
    if (
      target.features.acReaction &&
      target.reaction > 0 && this.canReact(e,t.target) &&
      !e.incapacitated(t.target) &&
      (target.counters?.cloak_charges?.current || 0) > 0 &&
      !considered.includes(tag(t.target, "cloak"))
    ) {
      const next = {
        ...t,
        defensesConsidered: [...considered, tag(t.target, "cloak")],
      };
      if (target.controlled)
        e.decision("defensiveReaction", t.target, {
          ability: "cloak",
          attack: next,
        });
      else {
        target.reaction--;
        target.counters.cloak_charges.current--;
        e.enqueue({
          ...next,
          acBonus: (next.acBonus || 0) + target.features.acReaction,
        });
      }
      return true;
    }
    const critical =
      !t.cancelCritical &&
      (d === 20 ||
        (e.distance(from, target) <= 5 &&
          ["paralyzed", "unconscious"].some((k) => e.has(t.target, k))));
    if (critical)
      for (const id of e.s.order) {
        const u = e.unit(id);
        if (
          id === t.target ||
          u.team !== target.team ||
          !u.features.critNegation ||
          u.reaction <= 0 || !this.canReact(e,id) ||
          e.incapacitated(id) ||
          !(u.counters?.guardian_mark?.current > 0) ||
          e.distance(u, target) > 30 ||
          !e.canSee(id, t.target) ||
          considered.includes(tag(id, "mark"))
        )
          continue;
        const next = {
          ...t,
          defensesConsidered: [...considered, tag(id, "mark")],
        };
        if (u.controlled)
          e.decision("defensiveReaction", id, {
            ability: "mark",
            attack: next,
          });
        else {
          u.reaction--;
          u.counters.guardian_mark.current--;
          e.enqueue({ ...next, cancelCritical: true });
        }
        return true;
      }
    return false;
  }
  static decision(e, c, p) {
    if (p.kind !== "defensiveReaction") return false;
    e.require(["yes", "no"].includes(c.choice), "Неверный выбор реакции");
    const u = e.unit(p.actor),
      t = p.attack;
    if (c.choice === "yes") {
      e.require(
        u.reaction > 0 && this.canReact(e,p.actor) && !e.incapacitated(p.actor),
        "Реакция недоступна",
      );
      if (p.ability === "shield") {this.shield(e, p.actor,t);if(u.casting)return true;}
      else if (p.ability === "protection") {
        u.reaction--;
        e.status(t.target, "protected", {
          source: p.actor,
          expiresOnSourceStart: p.actor,
        });
      } else if (p.ability === "cloak") {
        e.require(u.counters.cloak_charges.current > 0, "Нет зарядов плаща");
        u.reaction--;
        u.counters.cloak_charges.current--;
        t.acBonus = (t.acBonus || 0) + u.features.acReaction;
      } else if (p.ability === "mark") {
        e.require(u.counters.guardian_mark.current > 0, "Нет зарядов Знака");
        u.reaction--;
        u.counters.guardian_mark.current--;
        t.cancelCritical = true;
      } else throw Error("Неизвестная защитная реакция");
      e.emit(
        "reaction",
        p.actor,
        u.name +
          ": " +
          {
            shield: "Щит",
            protection: "Защита союзника",
            cloak: "Плащ Ваэльтира",
            mark: "Отмена критического попадания",
          }[p.ability] +
          ".",
      );
    }
    e.enqueue(t);
    return true;
  }
}
if (typeof module !== "undefined") module.exports = { CombatDefenses };
