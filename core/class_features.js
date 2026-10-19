"use strict";
// Registered class mechanics. All continuations are plain queue records; no character IDs.
class CombatClassFeatures {
  static validateUnit(u) {
    const requirements = {
      secondWind: "second_wind",
      tacticalMind: "second_wind",
      actionSurge: "action_surge",
      indomitable: "indomitable",
      layOnHands: "lay_on_hands",
      critNegation: "guardian_mark",
      acReaction: "cloak_charges",
      knowEnemy: "know_enemy",
    };
    for (const [feature, key] of Object.entries(requirements))
      if (u.features[feature] && !u.counters?.[key])
        throw Error("Не задан текущий ресурс " + key + " для " + u.name);
    if (
      u.features.maneuvers?.length &&
      (!u.counters?.superiority ||
        !u.features.superiorityDie ||
        !u.features.maneuverDC)
    )
      throw Error(
        "Не заданы кости превосходства, размер кости или СЛ манёвров",
      );
    if (
      u.features.shieldSpell &&
      !u.counters?.shield_magic_initiate &&
      !Object.keys(u.slots || {}).length
    )
      throw Error("Не заданы доступные применения Щита");
  }
  static count(e, id, key) {
    return e.unit(id).counters?.[key]?.current || 0;
  }
  static spend(e, id, key, amount = 1) {
    const p = e.unit(id).counters?.[key];
    e.require(
      p && Number.isInteger(amount) && amount > 0 && p.current >= amount,
      "Недостаточно ресурса: " + key,
    );
    p.current -= amount;
  }
  static command(e, c, u) {
    const id = c.actor,
      f = u.features;
    if (c.kind === "secondWind") {
      e.require(
        f.secondWind && u.bonus > 0,
        "Нет Второго дыхания или бонусного действия",
      );
      this.spend(e, id, "second_wind");
      u.bonus--;
      e.enqueue({
        kind: "roll",
        actor: id,
        label: "Второе дыхание",
        count: 1,
        sides: 10,
        bonus: f.fighterLevel,
        next: { kind: "secondWindResult", actor: id },
      });
    } else if (c.kind === "actionSurge") {
      e.require(
        f.actionSurge && u.surgeTurn !== e.s.turnSerial,
        "Всплеск действий уже использован в этот ход",
      );
      this.spend(e, id, "action_surge");
      u.surgeTurn = e.s.turnSerial;
      // Keep the additional action distinct: it can never pay for Magic.
      u.surgeAction = (u.surgeAction || 0) + 1;
      e.emit(
        "ability",
        id,
        u.name + ": Всплеск действий — дополнительное действие без Магии.",
      );
    } else if (c.kind === "steadyAim") {
      e.require(
        f.steadyAim && u.bonus > 0 && !(u.movedThisTurn > 0),
        "Точный прицел требует бонусное действие и отсутствие движения",
      );
      u.bonus--;
      u.aimTurn = e.s.turnSerial;
      u.move = 0;
      e.status(id, "aim", { expiresAtEnd: id });
    } else if (c.kind === "layOnHands") {
      const t = e.unit(c.target),
        amount = c.amount;
      e.require(
        f.layOnHands &&
          u.bonus > 0 &&
          t.team === u.team &&
          !t.dead &&
          e.distance(u, t) <= 5 &&
          e.wallLOS(u, t),
        "Наложение рук: цель или бонусное действие недоступны",
      );
      if (c.curePoison) {
        e.require(e.has(c.target, "poisoned"), "У цели нет отравления");
        this.spend(e, id, "lay_on_hands", 5);
        e.removeStatus(c.target, "poisoned");
      } else {
        e.require(
          Number.isInteger(amount) && amount > 0 && amount <= t.max - t.hp,
          "Выбери допустимое число восстанавливаемых ПЗ",
        );
        this.spend(e, id, "lay_on_hands", amount);
        e.heal(c.target, amount);
      }
      u.bonus--;
    } else if (c.kind === "knowEnemy") {
      const t = e.unit(c.target);
      e.require(
        f.knowEnemy &&
          u.bonus > 0 &&
          e.active(c.target) &&
          e.distance(u, t) <= 30 &&
          e.canSee(id, c.target),
        "Цель анализа недоступна",
      );
      this.spend(e, id, "know_enemy");
      u.bonus--;
      const names = {
        acid: "кислота",
        bludgeoning: "дробящий",
        cold: "холод",
        fire: "огонь",
        force: "силовое поле",
        lightning: "электричество",
        necrotic: "некротический",
        piercing: "колющий",
        poison: "яд",
        psychic: "психический",
        radiant: "излучение",
        slashing: "рубящий",
        thunder: "звук",
      };
      const label = (types) =>
        types.length ? types.map((t) => names[t] || t).join(", ") : "нет";
      e.emit(
        "enemyAnalyzed",
        id,
        u.name +
          ": " +
          t.name +
          "; сопротивления: " +
          label(t.resistances) +
          "; иммунитеты: " +
          label(t.immunities) +
          "; уязвимости: " +
          label(t.vulnerabilities) +
          ".",
        {
          target: c.target,
          resistances: t.resistances,
          immunities: t.immunities,
          vulnerabilities: t.vulnerabilities,
        },
      );
    } else if (c.kind === "restoreKnowEnemy") {
      e.require(
        f.knowEnemy && u.counters?.know_enemy?.current === 0,
        "Использование анализа ещё доступно",
      );
      this.spend(e, id, "superiority");
      u.counters.know_enemy.current = 1;
    } else return false;
    return true;
  }
  static afterRoll(e, t) {
    if (t.featureResolved || t.autoFail || t.sides !== 20) return false;
    const u = e.unit(t.actor),
      kept =
        t.mode > 0
          ? Math.max(...t.rolls)
          : t.mode < 0
            ? Math.min(...t.rolls)
            : t.rolls[0],
      total = Math.max(t.minimum || 0, kept) + (t.bonus || 0),
      dc = t.dc ?? t.next?.dc;
    if (
      !Number.isFinite(dc) ||
      (t.deathSave ? kept === 20 || (kept !== 1 && total >= dc) : total >= dc)
    )
      return false;
    const kind =
      t.save &&
      u.features.indomitable &&
      this.count(e, t.actor, "indomitable") > 0
        ? "indomitable"
        : !t.save &&
            t.check &&
            u.features.tacticalMind &&
            this.count(e, t.actor, "second_wind") > 0
          ? "tacticalMind"
          : null;
    if (!kind) return false;
    const p = { roll: structuredClone(t), ability: kind };
    if (u.controlled) e.decision("classRoll", t.actor, p);
    else this.useRollAbility(e, { actor: t.actor, ...p }, true);
    return true;
  }
  static useRollAbility(e, p, use) {
    const roll = { ...p.roll, featureResolved: true },
      u = e.unit(p.actor);
    if (!use) {
      e.finishRoll(roll);
      return;
    }
    if (p.ability === "indomitable") {
      this.spend(e, p.actor, "indomitable");
      delete roll.rolls;
      e.enqueue({
        ...roll,
        kind: "roll",
        bonus: (roll.bonus || 0) + u.features.fighterLevel,
        label: "Несгибаемость: " + roll.label,
      });
    } else {
      e.require(
        this.count(e, p.actor, "second_wind") > 0,
        "Нет Второго дыхания",
      );
      e.enqueue({
        kind: "roll",
        actor: p.actor,
        label: "Тактический разум",
        count: 1,
        sides: 10,
        bonus: 0,
        next: { kind: "tacticalMindResult", actor: p.actor, original: roll },
      });
    }
  }
  static decision(e, c, p) {
    const u = e.unit(p.actor);
    if (p.kind === "classRoll") {
      e.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      this.useRollAbility(e, p, c.choice === "yes");
    } else if (p.kind === "freeMovement") {
      e.require(
        ["move", "skip"].includes(c.choice),
        "Выбери перемещение или пропуск",
      );
      if (c.choice === "move") {
        e.validatePath(p.actor, c.path, p.budget);
        if (p.spendReaction) {
          e.require(u.reaction > 0, "Реакция потрачена");
          u.reaction--;
        }
        e.enqueue({
          noOA: !p.oaExempt,
          oaExempt: p.oaExempt,
          kind: "moveStep",
          actor: p.actor,
          path: structuredClone(c.path),
          provoked: [],
          freeBudget: p.budget,
        });
      }
    } else if (p.kind === "uncannyDodge") {
      e.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      const damage = { ...p.damage, uncannyResolved: true };
      if (c.choice === "yes") {
        e.require(u.reaction > 0, "Реакция потрачена");
        u.reaction--;
        damage.amount = Math.floor(damage.amount / 2);
      }
      e.enqueue(damage);
    } else return false;
    return true;
  }
  static task(e, t) {
    const u = t.actor ? e.unit(t.actor) : null;
    if (t.kind === "saveDamage") {
      const target = e.unit(t.target),
        evasion =
          t.stat === "DEX" &&
          t.halfOnSuccess &&
          target.features.evasion &&
          !e.incapacitated(t.target);
      const amount = evasion
        ? t.result.success
          ? 0
          : Math.floor(t.amount / 2)
        : t.result.success
          ? t.halfOnSuccess
            ? Math.floor(t.amount / 2)
            : 0
          : t.amount;
      if (amount > 0)
        e.enqueue({
          kind: "damage",
          actor: t.actor,
          target: t.target,
          amount,
          damageType: t.damageType,
          attack: null,
        });
    } else if (t.kind === "secondWindResult") {
      e.heal(t.actor, (typeof module!=="undefined"?require("./magic").CombatMagic:CombatMagic).effects(e,t.actor,"beaconHope").length ? 10+u.features.fighterLevel : t.result.total);
      if (u.controlled && u.features.tacticalShift && e.speed(t.actor) > 0)
        e.decision("freeMovement", t.actor, {
          budget: Math.floor(e.speed(t.actor) / 2),
          label: "Тактическое перемещение",
        });
    } else if (t.kind === "tacticalMindResult") {
      const roll = t.original,
        kept =
          roll.mode > 0
            ? Math.max(...roll.rolls)
            : roll.mode < 0
              ? Math.min(...roll.rolls)
              : roll.rolls[0],
        total =
          Math.max(roll.minimum || 0, kept) +
          (roll.bonus || 0) +
          t.result.total,
        dc = roll.dc ?? roll.next.dc;
      if (total >= dc) this.spend(e, t.actor, "second_wind");
      e.finishRoll({ ...roll, bonus: (roll.bonus || 0) + t.result.total });
    } else return false;
    return true;
  }
  static beforeDamage(e, t) {
    const u = e.unit(t.target);
    if (
      t.amount > 0 &&
      !t.uncannyResolved &&
      t.attackHit !== false &&
      t.attack &&
      u.features.uncannyDodge &&
      u.reaction > 0 && (typeof module!=="undefined"?require("./magic").CombatMagic:CombatMagic).canReact(e,t.target) &&
      !e.incapacitated(t.target) &&
      e.canSee(t.target, t.actor)
    ) {
      if (u.controlled) e.decision("uncannyDodge", t.target, { damage: t });
      else {
        u.reaction--;
        e.enqueue({
          ...t,
          amount: Math.floor(t.amount / 2),
          uncannyResolved: true,
        });
      }
      return true;
    }
    return false;
  }
}
if (typeof module !== "undefined") module.exports = { CombatClassFeatures };
