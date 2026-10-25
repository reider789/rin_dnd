"use strict";
class CombatMartialFeatures {
  static count(e, id) {
    return e.unit(id).counters?.superiority?.current || 0;
  }
  static spend(e, id) {
    e.require(this.count(e, id) > 0, "Нет костей превосходства");
    e.unit(id).counters.superiority.current--;
  }
  static command(e, c, u) {
    if (c.kind !== "bait") return false;
    e.require(
      u.features.maneuvers?.includes("bait") &&
        u.move >= 5 &&
        e.speed(c.actor) > 0,
      "Нет манёвра или движения",
    );
    const ally = e.unit(c.target);
    e.require(
      c.target !== c.actor &&
        ally.team === u.team &&
        !e.incapacitated(c.target) &&
        e.distance(u, ally) <= 5 &&
        e.wallLOS(u, ally),
      "Союзник недоступен",
    );
    e.require(
      [c.actor, c.target].includes(c.recipient),
      "Выбери получателя защиты",
    );
    this.spend(e, c.actor);
    u.move -= 5;
    u.movedThisTurn = (u.movedThisTurn || 0) + 5;
    const old = { x: u.x, y: u.y };
    Object.assign(u, { x: ally.x, y: ally.y });
    Object.assign(ally, old);
    e.releaseGrapples();
    e.enqueue({
      kind: "roll",
      actor: c.actor,
      label: "Приманка и смена",
      count: 1,
      sides: u.features.superiorityDie || 8,
      bonus: 0,
      next: { kind: "baitResult", actor: c.actor, target: c.recipient },
    });
    return true;
  }
  static afterMiss(e, t) {
    const u = e.unit(t.actor),
      jobs = [];
    if (t.spec.mastery === "graze" && u.features.masteries?.includes("graze"))
      jobs.push({
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount: Math.max(0, u.stats[t.spec.ability] || 0),
        damageType: t.spec.damageType,
        attack: t.spec,
        attackHit: false,
      });
    jobs.push({
      kind: "martialMiss",
      actor: t.actor,
      target: t.target,
      attack: t,
    });
    e.enqueue(...jobs);
  }
  static prepareAttack(e, c, spec) {
    const u = e.unit(c.actor);
    if (c.mastery) {
      e.require(
        u.features.tacticalMaster &&
          ["push", "sap", "slow"].includes(c.mastery) &&
          u.features.masteries?.includes(spec.mastery),
        "Нельзя заменить свойство этого оружия",
      );
      spec.mastery = c.mastery;
    }
  }
  static beforeResult(e, t) {
    const u = e.unit(t.actor),
      d = t.result.kept,
      miss =
        d !== 20 &&
        (d === 1 ||
          t.result.total < e.ac(t.target, u, t.spec) + (t.acBonus || 0));
    if (
      !miss ||
      d === 1 ||
      t.precisionResolved ||
      !u.features.maneuvers?.includes("precision") ||
      this.count(e, t.actor) <= 0
    )
      return false;
    const next = { ...t, precisionResolved: true };
    if (u.controlled) e.decision("precision", t.actor, { attack: next });
    else {
      this.spend(e, t.actor);
      e.enqueue({
        kind: "roll",
        actor: t.actor,
        label: "Точная атака",
        count: 1,
        sides: u.features.superiorityDie || 8,
        bonus: 0,
        next: { kind: "precisionResult", actor: t.actor, attack: next },
      });
    }
    return true;
  }
  static options(e, t) {
    const u = e.unit(t.actor),
      target = e.unit(t.target);
    return (u.features.maneuvers || []).filter(
      (m) =>
        ["trip", "push", "goad", "maneuvering"].includes(m) &&
        (!["trip", "push"].includes(m) || e.size(t.target) <= 3) &&
        (m !== "maneuvering" ||
          e.s.order.some(
            (k) =>
              k !== t.actor &&
              e.unit(k).team === u.team &&
              !e.incapacitated(k) &&
              e.unit(k).reaction > 0,
          )),
    );
  }
  static decision(e, c, p) {
    if (p.kind === "riposte") {
      e.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      if (c.choice === "yes") {
        const u = e.unit(p.actor);
        e.require(
          u.reaction > 0 && !e.incapacitated(p.actor),
          "Реакция недоступна",
        );
        e.validateAttack(p.actor, p.target, p.spec);
        this.spend(e, p.actor);
        u.reaction--;
        e.enqueue({
          kind: "attackRoll",
          actor: p.actor,
          target: p.target,
          spec: p.spec,
          mode: "reaction",
          maneuverUsed: true,
          maneuver: "riposte",
        });
      }
    } else if (p.kind === "precision") {
      e.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      if (c.choice === "yes") {
        this.spend(e, p.actor);
        e.enqueue({
          kind: "roll",
          actor: p.actor,
          label: "Точная атака",
          count: 1,
          sides: e.unit(p.actor).features.superiorityDie || 8,
          bonus: 0,
          next: { kind: "precisionResult", actor: p.actor, attack: p.attack },
        });
      } else e.enqueue(p.attack);
    } else if (p.kind === "strikeChoice") {
      e.require(["use", "skip"].includes(c.choice), "Неверный выбор удара");
      const frame = { ...p.attack, strikeResolved: true },
        u = e.unit(p.actor);
      if (c.choice === "use") {
        if (c.maneuver) {
          e.require(p.maneuvers.includes(c.maneuver), "Манёвр недоступен");
          if (c.maneuver === "maneuvering") {
            const ally = e.unit(c.ally);
            e.require(
              c.ally !== p.actor &&
                ally.team === u.team &&
                !e.incapacitated(c.ally) &&
                ally.reaction > 0 &&
                (e.canSee(c.ally, p.actor) || !e.has(c.ally, "deafened")),
              "Союзник не может выполнить манёвр",
            );
            frame.ally = c.ally;
          }
          this.spend(e, p.actor);
          frame.maneuver = c.maneuver;
        }
        if (c.savage) {
          e.require(p.savage, "Свирепый атакующий недоступен");
          u.savageTurn = e.s.turnSerial;
          frame.savage = true;
        }
      }
      e.enqueue(frame);
    } else return false;
    return true;
  }
  static restoreLegacyHits(e) {
    const source = e.s.engineVersion.split('.').map(Number);
    if (source[1] > 5 || (source[1] === 5 && source[2] >= 2)) return false;
    let resume = false;
    for (const hit of [...e.s.queue]) {
      if (hit.kind !== "weaponHitEffects") continue;
      const f = hit.frame, strike = f.strikeId;
      const p = e.s.pending;
      const damage = strike && p?.damage?.strikeId === strike ? p.damage :
        e.s.queue.find(t => strike && t.kind === "damage" && t.strikeId === strike);
      let raw = (f.baseDamage || 0) + Math.max(0, f.result?.total);
      if (f.maneuverAdded) {
        const die = e.s.events.findLast(x => x.type === "roll" && x.actor === hit.actor &&
          typeof x.text === "string" && x.text.includes("Кость превосходства — урон"));
        raw += die?.total ?? NaN;
      }
      const untouched = damage && !damage.components && !damage.mitigated &&
        Number.isFinite(raw) && !damage.uncannyResolved && !damage.deflectResolved &&
        !e.s.events.some(x => x.type === "damage" && x.strikeId === strike);
      if (untouched && (!p || (p.damage === damage && ["deflect","uncannyDodge"].includes(p.kind)))) {
        const next = {kind:"weaponDamage",actor:hit.actor,target:hit.target,
          frame:f,amount:raw};
        e.s.queue = e.s.queue.filter(t => t !== hit);
        if (p?.damage === damage) {
          e.s.pending = null;
          e.enqueue(next);
          resume = true;
        } else e.s.queue[e.s.queue.indexOf(damage)] = next;
      } else {
        // A historical base hit or a partially resolved defense cannot be
        // replayed. Finish only its still-unresolved old rider continuation.
        hit.frame = {...f,legacyRiders:true};
      }
    }
    const visit = t => {
      if (!t || typeof t !== "object") return;
      if (t.kind === "attackRoll" && !t.spec?.dynamicWeaponBase &&
          !["reaction","haste"].includes(t.mode)) t.weaponPrepared = true;
      for (const value of Object.values(t)) if (value && typeof value === "object") visit(value);
    };
    visit(e.s.queue);visit(e.s.pending);
    return resume;
  }
  static weaponRoll(e, t) {
    if (
      (typeof module !== "undefined"
        ? require("./advanced_features").CombatAdvancedFeatures
        : CombatAdvancedFeatures
      ).beforeWeapon(e, t)
    )
      return;
    const u = e.unit(t.actor),
      maneuvers =
        !t.maneuverUsed && this.count(e, t.actor) > 0 ? this.options(e, t) : [],
      savage =
        u.features.savageAttacker &&
        u.savageTurn !== e.s.turnSerial &&
        ["melee", "ranged"].includes(t.spec.kind) &&
        !t.spec.unarmed;
    if (!t.strikeResolved && u.controlled && (maneuvers.length || savage)) {
      e.decision("strikeChoice", t.actor, {
        attack: t,
        maneuvers,
        savage: Boolean(savage),
      });
      return;
    }
    // NPCs choose only from observed combat conditions; they do not inspect target saves.
    if (!u.controlled && !t.strikeResolved) {
      let maneuver = null;
      if (
        maneuvers.includes("push") &&
        u.tactics?.role === "ranged" &&
        e.distance(u, e.unit(t.target)) <= 5
      )
        maneuver = "push";
      else if (
        maneuvers.includes("trip") &&
        !e.has(t.target, "prone") &&
        t.spec.kind === "melee"
      )
        maneuver = "trip";
      else if (
        maneuvers.includes("goad") &&
        !e.has(t.target, "goaded") &&
        e.s.order.some(
          (k) =>
            k !== t.actor &&
            e.unit(k).team === u.team &&
            e.active(k) &&
            e.canSee(t.actor, k) &&
            e.distance(e.unit(k), e.unit(t.target)) <= 5,
        )
      )
        maneuver = "goad";
      if (maneuver) this.spend(e, t.actor);
      if (savage) u.savageTurn = e.s.turnSerial;
      t = {
        ...t,
        strikeResolved: true,
        ...(maneuver ? { maneuver } : {}),
        ...(savage ? { savage: true } : {}),
      };
    }
    const minimumDie =
      u.features.greatWeaponFighting &&
      t.spec.kind === "melee" &&
      t.spec.twoHanded
        ? 3
        : 0;
    e.enqueue({
      kind: "roll",
      actor: t.actor,
      label: "Урон " + t.spec.name,
      count: t.spec.count * (t.critical ? 2 : 1),
      sides: t.spec.die,
      minimumDie,
      bonus:
        (t.mode === "nick" ? Math.min(0, t.spec.flat) : t.spec.flat) +
        (["action", "haste"].includes(t.mode) && t.spec.heavy
          ? u.features.greatWeaponMaster || 0
          : 0),
      next: {
        ...t,
        kind: t.savage ? "savageFirst" : "damageResult",
        minimumDie,
      },
    });
  }
  static task(e, t) {
    const u = t.actor ? e.unit(t.actor) : null;
    if (t.kind === "baitResult") {
      e.status(t.target, "bait", {
        amount: t.result.total,
        source: t.actor,
        expiresOnSourceStart: t.actor,
        stackBySource: true,
      });
    } else if (t.kind === "martialMiss") {
      const defender = e.unit(t.target),
        spec = defender.attacks.find(
          (a) => a.kind === "melee" && e.distance(defender, u) <= a.range,
        );
      if (
        t.attack.spec.kind !== "melee" ||
        !defender.features.maneuvers?.includes("riposte") ||
        !spec ||
        defender.reaction <= 0 ||
        !(
          typeof module !== "undefined"
            ? require("./magic").CombatMagic
            : CombatMagic
        ).canReact(e, t.target) ||
        e.incapacitated(t.target) ||
        this.count(e, t.target) <= 0
      )
        return true;
      const p = { actor: t.target, target: t.actor, spec };
      if (defender.controlled)
        e.decision("riposte", t.target, { target: t.actor, spec });
      else this.decision(e, { choice: "yes" }, { kind: "riposte", ...p });
    } else if (t.kind === "precisionResult") {
      e.enqueue({
        ...t.attack,
        maneuverUsed: true,
        result: {
          ...t.attack.result,
          total: t.attack.result.total + t.result.total,
          bonusParts: [...(t.attack.result.bonusParts || [{rule:"base",label:"Основной модификатор",
            amount:t.attack.result.total-t.attack.result.kept}]),
            {rule:"maneuver.precision",label:"Точная атака",amount:t.result.total,rolls:t.result.rolls}],
        },
      });
    } else if (t.kind === "weaponDamageRoll") this.weaponRoll(e, t);
    else if (t.kind === "savageFirst") {
      e.enqueue({
        kind: "roll",
        actor: t.actor,
        label: "Свирепый атакующий — второй бросок оружия",
        count: t.spec.count * (t.critical ? 2 : 1),
        sides: t.spec.die,
        bonus: 0,
        minimumDie: t.minimumDie,
        next: { ...t, kind: "savageSecond", first: t.result },
      });
    } else if (t.kind === "savageSecond") {
      const flat =
        (t.mode === "nick" ? Math.min(0, t.spec.flat) : t.spec.flat) +
        (["action", "haste"].includes(t.mode) && t.spec.heavy
          ? u.features.greatWeaponMaster || 0
          : 0);
      const result =
        t.result.total + flat > t.first.total
          ? { ...t.result, total: t.result.total + flat }
          : t.first;
      e.enqueue({ ...t, kind: "damageResult", result });
    } else if (t.kind === "weaponDamage") {
      if (t.frame.maneuver && !t.frame.maneuverAdded) {
        e.enqueue({
          kind: "roll",
          actor: t.actor,
          label: "Кость превосходства — урон",
          count: t.frame.critical ? 2 : 1,
          sides: u.features.superiorityDie || 8,
          bonus: 0,
          minimumDie: t.frame.minimumDie,
          next: { ...t, kind: "maneuverDamageResult" },
        });
        return true;
      }
      const f = t.frame;
      const M =
        typeof module !== "undefined"
          ? require("./magic").CombatMagic
          : CombatMagic;
      const components = t.components || [
        { amount: t.amount, damageType: f.spec.damageType },
      ];
      if (f.smite && !t.smiteResolved) {
        const hitContinue = {
          ...t,
          components,
          smiteResolved: true,
          frame: { ...f, smiteIntegrated: true },
        };
        const sf = {
          id: "spell-" + ++e.s.sequence,
          actor: t.actor,
          spell: "divineSmite",
          level: f.smite,
          targets: [t.target],
          critical: f.critical,
          offered: [],
          cancelled: false,
          paidSlot: Boolean(f.smitePaid),
          hitContinue,
        };
        e.s.spellFrames[sf.id] = sf;
        e.enqueue(M.task(t.actor, "window", { frame: sf.id }));
        return true;
      }
      if (t.smiteResult)
        components.push({ amount: t.result.total, damageType: "radiant" });
      if (t.rider)
        components.push({
          amount: t.result.total,
          damageType: t.rider.damageType,
        });
      const riders =
        t.riders ||
        (["melee", "ranged"].includes(f.spec.kind)
          ? [
              ...(u.features.radiantStrikes &&
                (f.spec.kind === "melee" || f.spec.unarmed ||
                 (f.spec.kind === "ranged" && f.spec.meleeWeapon))
                ? [{ label: "Сияющие удары", damageType: "radiant", die: 8 }]
                : []),
              ...(f.forge
                ? [
                    {
                      label: "Кузнечный резонанс",
                      damageType: "thunder",
                      die: 8,
                    },
                  ]
                : []),
              ...(M.effects(e, t.actor, "crusaderMantle").length
                ? [{ label: "Мантия крестоносца", damageType: "radiant" }]
                : []),
              ...(M.effects(e, t.actor, "enlarge").length
                ? [{ label: "Рост", damageType: f.spec.damageType }]
                : []),
            ]
          : []);
      if (riders.length) {
        const [rider, ...rest] = riders;
        e.enqueue({
          kind: "roll",
          actor: t.actor,
          label: rider.label,
          count: f.critical ? 2 : 1,
          sides: rider.die || 4,
          bonus: 0,
          next: { ...t, smiteResult: false, components, rider, riders: rest },
        });
        return true;
      }
      e.enqueue(
        {
          kind: "damage",
          actor: t.actor,
          target: t.target,
          amount: components.reduce((n, p) => n + p.amount, 0),
          components,
          damageType: f.spec.damageType,
          attack: f.spec,
          critical: f.critical,
          strikeId: f.strikeId,
        },
        {
          kind: "weaponHitEffects",
          actor: t.actor,
          target: t.target,
          frame: f,
        },
      );
    } else if (t.kind === "maneuverDamageResult")
      e.enqueue({
        ...t,
        kind: "weaponDamage",
        amount: t.amount + t.result.total,
        frame: { ...t.frame, maneuverAdded: true },
      });
    else if (t.kind === "weaponHitEffects") {
      (typeof module !== "undefined"
        ? require("./advanced_features").CombatAdvancedFeatures
        : CombatAdvancedFeatures
      ).afterWeapon(e, t);
      const f = t.frame,
        target = e.unit(t.target),
        mastery = f.spec.mastery,
        damage =
          e.s.events.findLast(
            (x) => x.type === "damage" && x.strikeId === f.strikeId,
          )?.amount || 0;
      if (
        u.features.greatWeaponMaster &&
        f.spec.kind === "melee" &&
        !f.spec.unarmed &&
        (f.critical || target.hp === 0)
      )
        u.hewTurn = e.s.turnSerial;
      if (!e.active(t.target)) return true;
      if (
        u.features.masteries?.includes(mastery) ||
        (u.features.tacticalMaster && ["push", "sap", "slow"].includes(mastery))
      ) {
        if (mastery === "sap")
          e.status(t.target, "sap", {
            source: t.actor,
            expiresOnSourceStart: t.actor,
            stackBySource: true,
          });
        if (mastery === "push" && e.size(t.target) <= 3)
          this.push(e, t.actor, t.target, 10);
        if (mastery === "slow" && damage > 0) {
          e.status(t.target, "slow", {
            source: t.actor,
            expiresOnSourceStart: t.actor,
            stackBySource: true,
          });
        }
      }
      if (
        f.maneuver === "trip" ||
        f.maneuver === "push" ||
        f.maneuver === "goad"
      )
        e.enqueue(
          e.saveTask(
            t.target,
            f.maneuver === "goad" ? "WIS" : "STR",
            u.features.maneuverDC,
            {
              kind: "maneuverEffect",
              actor: t.actor,
              target: t.target,
              maneuver: f.maneuver,
            },
          ),
        );
      if (f.maneuver === "maneuvering") {
        const a = e.unit(f.ally);
        if (!e.incapacitated(f.ally) && a.reaction > 0 && e.speed(f.ally) > 0)
          e.decision("freeMovement", f.ally, {
            budget: Math.floor(e.speed(f.ally) / 2),
            label: "Манёвр союзника",
            spendReaction: true,
            oaExempt: [t.target],
          });
      }
    } else if (t.kind === "maneuverEffect") {
      if (t.result.success || !e.active(t.target)) return true;
      if (t.maneuver === "trip") e.status(t.target, "prone");
      if (t.maneuver === "push") this.push(e, t.actor, t.target, 15);
      if (t.maneuver === "goad")
        e.status(t.target, "goaded", {
          source: t.actor,
          expiresOnSourceEnd: t.actor,
          expiresOnSourceEndTurn: u.turnCount + 1,
          stackBySource: true,
        });
    } else return false;
    return true;
  }
  static push(e, actor, target, feet) {
    const a = e.unit(actor),
      u = e.unit(target),
      dx = Math.sign(u.x - a.x),
      dy = Math.sign(u.y - a.y),
      path = [];
    if (!dx && !dy) return;
    let from = { x: u.x, y: u.y };
    for (let n = 0; n < feet / 5; n++) {
      const p = { x: from.x + dx, y: from.y + dy };
      if (
        e.wall(p) ||
        e.occupied(p.x, p.y, target) ||
        (dx &&
          dy &&
          (e.wall({ x: from.x, y: p.y }) || e.wall({ x: p.x, y: from.y })))
      )
        break;
      path.push(p);
      from = p;
    }
    if (path.length)
      e.enqueue({
        kind: "moveStep",
        actor: target,
        path,
        provoked: [],
        freeBudget: 600,
        noOA: true,
        forced: true,
      });
  }
}
if (typeof module !== "undefined") module.exports = { CombatMartialFeatures };
