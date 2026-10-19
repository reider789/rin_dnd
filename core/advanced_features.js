"use strict";
const AdvancedMagic =
  typeof module !== "undefined" ? require("./magic").CombatMagic : CombatMagic;
class CombatAdvancedFeatures {
  static OPS = new Set([
    "strike",
    "cunningSave",
    "shieldBashSave",
    "abjureSave",
    "smiteRoll",
    "smiteDamage",
    "forgeRoll",
    "forgeSave",
    "mantleRoll",
    "poisonRoll",
    "poisonSave",
    "burning",
    "poisonRepeat",
    "extinguish",
  ]);
  static CHOICES = new Set([
    "strikeExtras",
    "cunning",
    "shieldBash",
    "forge",
    "smite",
    "itemRuling",
    "living",
  ]);
  static job(actor, op, data = {}) {
    return { kind: "advancedTask", actor, op, ...data };
  }
  static count(u, k) {
    return u.counters?.[k]?.current || 0;
  }
  static command(e, c, u) {
    const M = AdvancedMagic,
      id = c.actor;
    if (c.kind === "hasteAction") {
      e.require(
        u.hasteAction > 0 && M.effects(e, id, "haste").length,
        "Нет ускоренного действия",
      );
      e.require(
        ["attack", "dash", "disengage", "hide"].includes(c.action),
        "Выбери ускоренное действие",
      );
      if (c.action === "attack") {
        e.require(
          !M.effects(e, id, "slow").length || u.slowAttacks !== e.s.turnSerial,
          "Замедление: одна атака за ход",
        );
        if (M.effects(e, id, "slow").length) u.slowAttacks = e.s.turnSerial;
        const spec = e.attackSpec(id, c.weapon);
        e.validateAttack(id, c.target, spec);
        e.enqueue({
          kind: "attackRoll",
          actor: id,
          target: c.target,
          spec,
          mode: "haste",
        });
      } else if (c.action === "dash") u.move += e.speed(id);
      else if (c.action === "disengage") u.disengaged = true;
      else {
        u.action++;
        e.command({ ...c, kind: "hide" }, u);
      }
      u.hasteAction--;
      return true;
    }
    if (c.kind === "steedPower") {
      e.require(
        u.summoner && u.powerAvailable && u.bonus > 0,
        "Способность скакуна недоступна",
      );
      const type = u.creatureType;
      if (type === "celestial") {
        e.require(e.distance(u, e.unit(c.target)) <= 5, "Цель вне касания");
        M.healing(e, id, c.target, 2, 8, u.summonLevel, "Исцеляющее касание");
      } else if (type === "fiend") {
        e.require(
          e.distance(u, e.unit(c.target)) <= 60 && e.canSee(id, c.target),
          "Нужна видимая цель в 60 фт",
        );
        e.enqueue(
          e.saveTask(
            c.target,
            "WIS",
            u.summonDC,
            this.job(id, "cunningSave", { target: c.target, mode: "fear" }),
          ),
        );
      } else {
        e.require(
          c.point &&
            e.inside(c.point) &&
            !e.wall(c.point) &&
            !e.occupied(c.point.x, c.point.y) &&
            e.distance(u, c.point) <= 60,
          "Нужна свободная клетка в 60 фт",
        );
        Object.assign(u, c.point);
      }
      u.bonus--;
      u.powerAvailable = false;
      return true;
    }
    if (c.kind === "abjure") {
      const targets = M.targets(e, c);
      e.require(
        u.features.abjureFoes && this.count(u, "channel_divinity") > 0,
        "Нет Божественного канала",
      );
      e.require(
        targets.length > 0 &&
          targets.length <= Math.max(1, u.stats.CHA) &&
          new Set(targets).size === targets.length,
        "Выбери до " + Math.max(1, u.stats.CHA) + " целей",
      );
      for (const t of targets)
        e.require(
          e.canSee(id, t) && e.distance(u, e.unit(t)) <= 60,
          "Цель должна быть видна в 60 фт",
        );
      e.spendAction(id, true);
      u.counters.channel_divinity.current--;
      e.enqueue(
        ...targets.map((target) =>
          e.saveTask(
            target,
            "WIS",
            u.casting.dc,
            this.job(id, "abjureSave", { target }),
          ),
        ),
      );
      return true;
    }
    if (c.kind === "leafStep") {
      e.require(
        this.count(u, "leaf_charges") > 0 && u.bonus > 0,
        "Нет Листового шага / бонусного действия",
      );
      u.bonus--;
      u.counters.leaf_charges.current--;
      u.move = Math.min(e.speed(id), u.move + 10);
      u.disengaged = true;
      e.emit(
        "item",
        id,
        "Листовой шаг: +10 фт движения, без атак по возможности.",
      );
      return true;
    }
    if (c.kind === "livingArrow") {
      e.require(this.count(u, "living_arrow") > 0, "Живая стрела потрачена");
      e.require(!u.livingArmed, "Живая стрела уже подготовлена");
      u.livingArmed = true;
      e.emit("item", id, "Следующее попадание из лука применит Живую стрелу.");
      return true;
    }
    if (c.kind === "mantleMissile") {
      e.require(this.count(u, "mantle_stars") > 0, "Нет звёзд мантии");
      const targets = M.targets(e, c);
      e.require(targets.length > 0 && targets.length <= 7, "Выбери до 7 целей");
      for (const t of targets)
        e.require(
          e.canSee(id, t) && e.distance(u, e.unit(t)) <= 120,
          "Цель в 120 фт должна быть видна",
        );
      e.spendAction(id, true);
      u.counters.mantle_stars.current--;
      const f = {
        id: "spell-" + ++e.s.sequence,
        actor: id,
        spell: "magicMissile",
        level: 5,
        targets,
        offered: [],
        item: true,
      };
      e.s.spellFrames[f.id] = f;
      e.enqueue(M.task(id, "window", { frame: f.id }));
      return true;
    }
    if (c.kind === "extinguish") {
      const target = c.target || id;
      e.require(
        e.distance(u, e.unit(target)) <= 5 && e.has(target, "burning"),
        "Нужно горящее существо в 5 фт",
      );
      e.spendAction(id);
      e.enqueue({
        kind: "roll",
        actor: id,
        label: "Погасить пламя",
        count: 1,
        sides: 20,
        bonus: u.stats.DEX,
        dc: 10,
        next: this.job(id, "extinguish", { target }),
      });
      return true;
    }
    if (c.kind === "useItem") {
      const kind = u.equipment?.consumables?.[c.item];
      e.require(kind && u.items[c.item] > 0, "Нет доступного предмета");
      if (kind === "smoke") {
        e.require(c.point && e.inside(c.point), "Выбери клетку дыма");
        const cost =
          u.features.thiefHands && c.cost === "bonus" ? "bonus" : "action";
        e.require(
          cost === "bonus" ? u.bonus > 0 : u.action > 0 || u.surgeAction > 0,
          "Нет действия",
        );
        M.choice(e, id, "itemRuling", ["use", "skip"], {
          item: c.item,
          point: c.point,
          cost,
        });
        return true;
      }
      const bonus =
        !["acid", "alchemistFire"].includes(kind) &&
        ([
          "heroismPotion",
          "speedPotion",
          "growthPotion",
          "climbingPotion",
          "giantStrength",
          "fireResistance",
        ].includes(kind) ||
          (u.features.thiefHands && c.cost === "bonus"));
      if (bonus) {
        e.require(u.bonus > 0, "Нет бонусного действия");
        u.bonus--;
      } else if (["acid", "alchemistFire"].includes(kind)) {
        e.require(
          u.action > 0 || u.surgeAction > 0 || u.attacksLeft > 0,
          "Нет атаки",
        );
        if (u.attacksLeft > 0) u.attacksLeft--;
        else {
          e.spendAction(id);
          u.attacksLeft = (u.features.extraAttack || 1) - 1;
        }
      } else e.spendAction(id);
      u.items[c.item]--;
      const frame = {
        actor: id,
        id: "item-" + ++e.s.sequence,
        spell: "item",
        level: 0,
        item: true,
      };
      if (kind === "heroismPotion") {
        u.temp = Math.max(u.temp, 10);
        M.add(e, frame, "bless", [id], 3600, { concentration: false });
      } else if (kind === "fireResistance")
        M.add(e, frame, "fireResistance", [id], 3600, { concentration: false });
      else if (kind === "antitoxin")
        M.add(e, frame, "antitoxin", [id], 3600, { concentration: false });
      else if (kind === "poison") {
        u.weaponPoison = { dc: 14, count: 2, die: 6 };
      } else if (kind === "acid" || kind === "alchemistFire") {
        const v = e.unit(c.target);
        e.require(
          e.distance(u, v) <= 20 && e.canSee(id, c.target),
          "Цель в 20 фт должна быть видна",
        );
        e.enqueue(
          e.saveTask(
            c.target,
            "DEX",
            8 + u.stats.DEX + u.proficiency,
            this.job(id, "poisonSave", { target: c.target, itemKind: kind }),
          ),
        );
      } else if (kind === "speedPotion") {
        M.add(e, frame, "haste", [id], 60, {
          concentration: false,
          noLethargy: true,
        });
        u.hasteAction = 1;
      } else if (kind === "growthPotion")
        M.add(e, frame, "enlarge", [id], 3600, { concentration: false });
      else if (kind === "giantStrength")
        M.add(e, frame, "giantStrength", [id], 3600, { concentration: false });
      else if (kind === "climbingPotion")
        M.add(e, frame, "climbing", [id], 3600, { concentration: false });
      else throw Error("Предмет требует решения мастера");
      e.emit("item", id, "Использован расходник.", {
        item: c.item,
        handler: kind,
      });
      return true;
    }
    return false;
  }
  static prepareAttack(e, c, spec) {
    const u = e.unit(c.actor);
    if (c.sacred) {
      e.require(
        u.features.sacredWeapon &&
          spec.kind === "melee" &&
          u.attacksLeft === 0 &&
          (u.action > 0 || u.surgeAction > 0) &&
          c.mode !== "bonus" &&
          this.count(u, "channel_divinity") > 0,
        "Священное оружие применяется при действии Атака",
      );
      u.counters.channel_divinity.current--;
      AdvancedMagic.remove(
        e,
        (e.s.effects || [])
          .filter((x) => x.kind === "sacredWeapon" && x.owner === c.actor)
          .map((x) => x.id),
      );
      AdvancedMagic.add(
        e,
        { actor: c.actor, level: 0, spell: "sacredWeapon" },
        "sacredWeapon",
        [c.actor],
        600,
        {
          weapon: spec.id,
          amount: Math.max(1, u.stats.CHA),
          concentration: false,
        },
      );
    }
    spec.sacredRadiant = Boolean(c.radiant);
  }
  static weaponSpec(e, actor, original) {
    const spec = structuredClone(original),
      u = e.unit(actor);
    if (!["melee", "ranged"].includes(spec.kind)) return spec;
    const sacred = AdvancedMagic.effects(e, actor, "sacredWeapon").find(
      (x) => x.weapon === spec.id,
    );
    if (sacred) {
      spec.bonus += sacred.amount;
      if (spec.sacredRadiant) spec.damageType = "radiant";
    }
    if (
      AdvancedMagic.effects(e, actor, "giantStrength").length &&
      spec.ability === "STR"
    ) {
      const extra = Math.max(0, 5 - u.stats.STR);
      spec.bonus += extra;
      spec.flat += extra;
    }
    return spec;
  }
  static beforeWeapon(e, t) {
    const u = e.unit(t.actor);
    if (t.extrasResolved) return false;
    const options = [];
    if (t.sneakCount && u.features.cunningStrike) options.push("cunning");
    if (
      t.spec.id === "leafBow" &&
      !u.livingArmed &&
      this.count(u, "living_arrow") > 0
    )
      options.push("living");
    if (
      u.features.shieldMaster &&
      u.features.shieldEquipped &&
      t.mode === "action" &&
      t.spec.kind === "melee" &&
      e.distance(u, e.unit(t.target)) <= 5 &&
      u.shieldBashTurn !== e.s.turnSerial
    )
      options.push("shieldBash");
    if (
      u.features.divineSmite &&
      t.spec.kind === "melee" &&
      u.bonus > 0 &&
      (this.count(u, "smite_free") > 0 ||
        (u.slotTurn !== e.s.turnSerial &&
          Object.values(u.slots).some((p) => p.current > 0)))
    )
      options.push("smite");
    if (
      t.spec.id === "forgeMaul" &&
      u.equipment?.forgeAttuned &&
      this.count(u, "forge_resonance") > 0
    )
      options.push("forge");
    if (!options.length) return false;
    if (u.controlled)
      AdvancedMagic.choice(e, t.actor, "strikeExtras", [...options, "skip"], {
        attack: t,
        extras: options,
      });
    else e.enqueue({ ...t, extrasResolved: true });
    return true;
  }
  static decision(e, c, p) {
    if (p.kind !== "magicChoice" || !this.CHOICES.has(p.choice)) return false;
    const u = e.unit(p.actor),
      M = AdvancedMagic;
    e.require(p.options.includes(c.choice), "Неверный выбор способности");
    if (p.choice === "itemRuling") {
      if (c.choice === "use") {
        e.require(
          Number.isInteger(c.range) &&
            c.range >= 0 &&
            c.range <= 600 &&
            Number.isInteger(c.radius) &&
            c.radius >= 0 &&
            c.radius <= 100 &&
            Number.isInteger(c.duration) &&
            c.duration > 0 &&
            c.duration <= 86400,
          "Нужны дальность, радиус и длительность от мастера",
        );
        e.require(
          p.point &&
            e.inside(p.point) &&
            e.distance(u, p.point) <= c.range &&
            e.wallLOS(u, p.point),
          "Точка вне согласованной дальности",
        );
        e.require(u.items[p.item] > 0, "Предмет уже израсходован");
        if (p.cost === "bonus") {
          e.require(u.bonus > 0, "Нет бонусного действия");
          u.bonus--;
        } else e.spendAction(p.actor);
        u.items[p.item]--;
        e.s.zones.push({
          ...p.point,
          id: "smoke-" + ++e.s.sequence,
          kind: "smoke",
          owner: p.actor,
          radius: c.radius,
          until: e.s.elapsed + c.duration,
          concentration: false,
        });
        e.emit(
          "adjudication",
          p.actor,
          "Дымовая бомба: применены параметры мастера.",
          {
            range: c.range,
            radius: c.radius,
            duration: c.duration,
            item: p.item,
          },
        );
      }
      return true;
    }
    if (p.choice === "strikeExtras") {
      if (c.choice === "skip") {
        e.enqueue({ ...p.attack, extrasResolved: true });
        return true;
      }
      const t = { ...p.attack },
        remaining = p.extras.filter((x) => x !== c.choice);
      t.extraOptions = remaining;
      t.extrasResolved = true;
      if (c.choice === "living")
        M.choice(e, p.actor, "living", ["yes", "skip"], { attack: t });
      if (c.choice === "cunning") {
        const opts = ["skip", "withdraw"];
        if (u.features.poisonerKit) opts.push("poison");
        if (e.unit(t.target).size <= 3) opts.push("trip");
        if (t.hiddenBefore && u.features.stealthAttack) opts.push("stealth");
        M.choice(e, p.actor, "cunning", opts, { attack: t });
      }
      if (c.choice === "shieldBash")
        M.choice(e, p.actor, "shieldBash", ["skip", "prone", "push"], {
          attack: t,
        });
      if (c.choice === "forge")
        M.choice(e, p.actor, "forge", ["skip", "push", "reactions"], {
          attack: t,
        });
      if (c.choice === "smite")
        M.choice(
          e,
          p.actor,
          "smite",
          [
            "skip",
            "free",
            ...Object.keys(u.slots)
              .filter(
                (n) => u.slots[n].current > 0 && u.slotTurn !== e.s.turnSerial,
              )
              .map((n) => "slot" + n),
          ].filter((x) => x !== "free" || this.count(u, "smite_free") > 0),
          { attack: t },
        );
      return true;
    }
    const t = { ...p.attack };
    if (c.choice !== "skip") {
      if (p.choice === "living") {
        e.require(this.count(u, "living_arrow") > 0, "Живая стрела потрачена");
        u.counters.living_arrow.current--;
        t.living = true;
      }
      if (p.choice === "cunning") {
        const factor = t.critical ? 2 : 1;
        t.sneakCount -= factor;
        e.require(t.sneakCount >= 0, "Нет кубов Скрытой атаки");
        t.cunning = c.choice;
        if (c.choice === "stealth") {
          u.hidden = true;
          u.stealthAttackTurn = e.s.turnSerial;
          e.status(p.actor, "invisible");
        }
      }
      if (p.choice === "shieldBash") {
        u.shieldBashTurn = e.s.turnSerial;
        t.shieldBash = c.choice;
      }
      if (p.choice === "forge") {
        e.require(this.count(u, "forge_resonance") > 0, "Нет зарядов");
        u.counters.forge_resonance.current--;
        t.forge = c.choice;
      }
      if (p.choice === "smite") {
        e.require(u.bonus > 0, "Нет бонусного действия");
        u.bonus--;
        let level = 1;
        if (c.choice === "free") {
          e.require(this.count(u, "smite_free") > 0, "Нет бесплатной Кары");
          u.counters.smite_free.current--;
        } else {
          level = Number(c.choice.slice(4));
          e.require(
            u.slotTurn !== e.s.turnSerial && u.slots[level]?.current > 0,
            "Нет ячейки",
          );
          u.slots[level].current--;
          u.slotTurn = e.s.turnSerial;
        }
        t.smite = level;
        t.smitePaid = c.choice !== "free";
      }
    }
    // Other optional effects on the same hit remain available, each at most once.
    if (t.extraOptions?.length) {
      const extras = t.extraOptions;
      delete t.extraOptions;
      M.choice(e, p.actor, "strikeExtras", [...extras, "skip"], {
        attack: t,
        extras,
      });
    } else e.enqueue(t);
    return true;
  }
  static afterWeapon(e, t) {
    const u = e.unit(t.actor),
      f = t.frame,
      M = AdvancedMagic,
      jobs = [];
    if (!e.active(t.target)) return;
    if (f.smite && !f.smiteIntegrated) {
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
      };
      e.s.spellFrames[sf.id] = sf;
      jobs.push(M.task(t.actor, "window", { frame: sf.id }));
    }
    if (f.forge)
      jobs.push(
        e.saveTask(
          t.target,
          "STR",
          17,
          this.job(t.actor, "forgeSave", { target: t.target, mode: f.forge }),
        ),
      );
    if (f.shieldBash)
      jobs.push(
        e.saveTask(
          t.target,
          "STR",
          8 + u.proficiency + u.stats.STR,
          this.job(t.actor, "shieldBashSave", {
            target: t.target,
            mode: f.shieldBash,
          }),
        ),
      );
    if (f.cunning === "poison" || f.cunning === "trip")
      jobs.push(
        e.saveTask(
          t.target,
          f.cunning === "trip" ? "DEX" : "CON",
          u.features.cunningDC || 8 + u.proficiency + u.stats.DEX,
          this.job(t.actor, "cunningSave", {
            target: t.target,
            mode: f.cunning,
          }),
        ),
      );
    if (f.cunning === "withdraw")
      jobs.push(
        this.job(t.actor, "strike", { target: t.target, mode: "withdraw" }),
      );
    if ((f.living || u.livingArmed) && f.spec.id === "leafBow") {
      u.livingArmed = false;
      if (!f.living) u.counters.living_arrow.current--;
      jobs.push(
        e.saveTask(
          t.target,
          "STR",
          15,
          this.job(t.actor, "cunningSave", {
            target: t.target,
            mode: "living",
          }),
        ),
      );
    }
    if (u.weaponPoison && ["melee", "ranged"].includes(f.spec.kind)) {
      delete u.weaponPoison;
      jobs.push(
        e.saveTask(
          t.target,
          "CON",
          14,
          this.job(t.actor, "poisonSave", {
            target: t.target,
            itemKind: "poison",
          }),
        ),
      );
    }
    e.enqueue(...jobs);
  }
  static task(e, t) {
    if (t.kind !== "advancedTask") return false;
    const u = e.unit(t.actor),
      M = AdvancedMagic;
    e.require(this.OPS.has(t.op), "Неизвестный классовый этап");
    if (t.op === "abjureSave") {
      if (!t.result.success)
        M.add(
          e,
          { actor: t.actor, spell: "abjure", level: 0, dc: u.casting.dc },
          "abjure",
          [t.target],
          60,
          { concentration: false },
        );
    } else if (t.op === "shieldBashSave") {
      if (!t.result.success) {
        if (t.mode === "prone") e.status(t.target, "prone");
        else M.push(e, t.target, u, 5);
      }
    } else if (t.op === "cunningSave") {
      if (!t.result.success) {
        if (t.mode === "fear")
          e.status(t.target, "frightened", {
            source: t.actor,
            expiresOnSourceEnd: t.actor,
            expiresOnSourceEndTurn: u.turnCount + 1,
          });
        else if (t.mode === "trip") e.status(t.target, "prone");
        else if (
          t.mode === "poison" &&
          !e.unit(t.target).conditionImmunities.includes("poisoned")
        )
          e.status(t.target, "poisoned", {
            source: t.actor,
            until: e.s.elapsed + 60,
            repeatDC: u.features.cunningDC,
            repeatStat: "CON",
          });
        else if (t.mode === "living")
          e.status(t.target, "rooted", {
            source: t.actor,
            until: e.s.elapsed + 6,
          });
      }
    } else if (t.op === "strike") {
      if (t.mode === "withdraw")
        e.decision("freeMovement", t.actor, {
          budget: Math.floor(e.speed(t.actor) / 2 / 5) * 5,
          label: "Отход · Хитрый удар",
          ignoreAll: true,
        });
    } else if (t.op === "smiteDamage")
      e.enqueue({
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount: t.result.total,
        damageType: "radiant",
        strikeId: t.strikeId,
      });
    else if (t.op === "forgeRoll")
      e.enqueue(
        {
          kind: "damage",
          actor: t.actor,
          target: t.target,
          amount: t.result.total,
          damageType: "thunder",
        },
        e.saveTask(
          t.target,
          "STR",
          17,
          this.job(t.actor, "forgeSave", { target: t.target, mode: t.mode }),
        ),
      );
    else if (t.op === "forgeSave") {
      if (!t.result.success) {
        if (t.mode === "push") M.push(e, t.target, u, 10);
        else
          e.status(t.target, "noReactions", { expiresOnSourceStart: t.actor });
      }
    } else if (t.op === "poisonSave") {
      const passed = t.result.success,
        type =
          t.itemKind === "poison"
            ? "poison"
            : t.itemKind === "acid"
              ? "acid"
              : "fire";
      if (t.itemKind === "poison" || !passed)
        e.enqueue({
          kind: "roll",
          actor: t.actor,
          label: "Расходник",
          count: t.itemKind === "poison" ? 2 : t.itemKind === "acid" ? 2 : 1,
          sides: ["poison", "acid"].includes(t.itemKind) ? 6 : 4,
          bonus: 0,
          next: this.job(t.actor, "poisonRoll", {
            target: t.target,
            damageType: type,
            half: passed,
          }),
        });
      if (!passed && t.itemKind === "poison")
        e.status(t.target, "noReactions", { expiresAtStart: t.target });
      if (!passed && t.itemKind === "alchemistFire")
        e.status(t.target, "burning", { source: t.actor });
    } else if (t.op === "poisonRoll")
      e.enqueue({
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount: t.half ? Math.floor(t.result.total / 2) : t.result.total,
        damageType: t.damageType,
      });
    else if (t.op === "extinguish") {
      if (t.result.success) e.removeStatus(t.target, "burning");
    } else if (t.op === "poisonRepeat") {
      if (t.result.success) e.removeStatus(t.target, "poisoned");
    }
    return true;
  }
  static endTurn(e, t) {
    if (t.advancedEndDone) return false;
    const jobs = [];
    for (const z of e
      .unit(t.actor)
      .statuses.filter((x) => x.kind === "poisoned" && x.repeatDC))
      jobs.push(
        e.saveTask(
          t.actor,
          z.repeatStat,
          z.repeatDC,
          this.job(e.s.units[z.source] ? z.source : t.actor, "poisonRepeat", {
            target: t.actor,
          }),
        ),
      );
    if (jobs.length) {
      e.enqueue(...jobs, { ...t, advancedEndDone: true });
      return true;
    }
    return false;
  }
}
if (typeof module !== "undefined") module.exports = { CombatAdvancedFeatures };
