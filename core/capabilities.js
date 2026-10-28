"use strict";
// The only registration point for supported data-level mechanics. No code from packs is executed.
class CombatCapabilities {
  static API = 1;
  static ENGINE = "30.7.1";
  static STATUSES = new Set([
    "prone",
    "unconscious",
    "grappled",
    "dodge",
    "invisible",
    "restrained",
    "blinded",
    "deafened",
    "stunned",
    "paralyzed",
    "incapacitated",
    "poisoned",
    "frightened",
    "petrified",
    "frost",
    "shield",
    "aim",
    "bait",
    "protected",
    "sap",
    "slow",
    "goaded",
    "charmed",
    "noReactions",
    "burning",
    "rooted",
  ]);
  static RULES = "dnd-2024-2026-10";
  static FEATURES = {
    martialArts: "boolean",
    monkFocus: "boolean",
    monkLevel: [1, 20],
    martialDie: [4, 6, 8, 10, 12],
    flurryCount: [1, 10],
    deflectAttacks: [1, 20],
    shadowArts: "boolean",
    uncannyMetabolism: "boolean",
    sneakDice: [1, 10],
    masteries: ["vex", "nick", "graze", "sap", "push", "slow"],
    greatWeaponFighting: "boolean",
    greatWeaponMaster: [1, 6],
    savageAttacker: "boolean",
    tacticalMaster: "boolean",
    superiorityDie: [4, 6, 8, 10, 12],
    maneuverDC: [1, 30],
    maneuvers: [
      "precision",
      "trip",
      "push",
      "goad",
      "maneuvering",
      "riposte",
      "bait",
    ],
    alert: "boolean",
    extraAttack: [1, 4],
    packTactics: "boolean",
    cunningAction: "boolean",
    fighterLevel: [1, 20],
    secondWind: "boolean",
    actionSurge: "boolean",
    tacticalMind: "boolean",
    tacticalShift: "boolean",
    indomitable: "boolean",
    uncannyDodge: "boolean",
    evasion: "boolean",
    reliableTalent: "boolean",
    auraProtection: [1, 10],
    auraRadius: [5, 30],
    auraDevotion: "boolean",
    auraCourage: "boolean",
    guardianSaveBonus: [1, 10],
    protection: "boolean",
    shieldEquipped: "boolean",
    shieldSpell: "boolean",
    autoShield: "boolean",
    critNegation: "boolean",
    acReaction: [1, 10],
    heavyArmorReduction: [1, 10],
    heavyArmor: "boolean",
    steadyAim: "boolean",
    sharpshooter: "boolean",
    layOnHands: "boolean",
    knowEnemy: "boolean",
    sculptSpells: "boolean",
    potentCantrip: "boolean",
    empoweredEvocation: "boolean",
    sacredWeapon: "boolean",
    abjureFoes: "boolean",
    shieldMaster: "boolean",
    divineSmite: "boolean",
    radiantStrikes: "boolean",
    cunningStrike: "boolean",
    improvedCunningStrike: "boolean",
    stealthAttack: "boolean",
    thiefHands: "boolean",
    climbSpeed: [5, 120],
    cunningDC: [1, 30],
    poisonerKit: "boolean",
    silentShadow: "boolean",
  };
  static COUNTERS = [
    "second_wind",
    "action_surge",
    "indomitable",
    "superiority",
    "lay_on_hands",
    "channel_divinity",
    "shield_magic_initiate",
    "guardian_mark",
    "cloak_charges",
    "forge_resonance",
    "leaf_charges",
    "living_arrow",
    "arcane_recovery",
    "smite_free",
    "storm_thrower_ammo",
    "know_enemy",
    "storm_bracers",
    "storm_daily",
    "vaeltir_focus",
    "faithful_steed",
    "mantle_stars",
  ];
  static counter(value) {
    this.require(
      value &&
        Number.isInteger(value.current) &&
        Number.isInteger(value.max) &&
        value.current >= 0 &&
        value.current <= value.max,
      "Неверный счётчик current/max",
    );
  }
  static require(ok, message) {
    if (!ok) throw Error(message);
  }
  static validateStatus(kind) {
    this.require(kind !== "exhaustion",
      "Истощение пока не поддерживается: требуется разбор состояния ведущим; исходные данные сохранены");
    this.require(this.STATUSES.has(kind), "Неизвестное состояние участника: " + kind);
  }
  static features(features = {}) {
    for (const key of ["secondWind", "tacticalMind", "indomitable"])
      this.require(
        !features[key] || Number.isInteger(features.fighterLevel),
        "Для способности нужен уровень воина: " + key,
      );
    for (const [key, value] of Object.entries(features)) {
      const type = this.FEATURES[key];
      this.require(type, "Нет проверенного обработчика способности: " + key);
      const valid =
        type === "boolean"
          ? typeof value === "boolean"
          : ["masteries", "maneuvers"].includes(key)
            ? Array.isArray(value) && value.every((v) => type.includes(v))
            : ["martialDie", "superiorityDie"].includes(key)
              ? type.includes(value)
              : Number.isInteger(value) && value >= type[0] && value <= type[1];
      this.require(valid, "Неверные параметры способности: " + key);
    }
  }
  static effect(effect) {
    this.require(
      effect && effect.handler === "onHitCondition",
      "Неподдержанный обработчик эффекта",
    );
    this.require(
      Object.keys(effect).every((k) =>
        ["handler", "condition", "save", "duration", "name"].includes(k),
      ),
      "Неизвестное поле эффекта",
    );
    this.require(
      ["poisoned", "prone", "frost"].includes(effect.condition),
      "Неподдержанное состояние эффекта",
    );
    this.require(
      effect.duration === "target-next-start" ||
        effect.duration === "source-next-start" ||
        (effect.condition === "prone" && effect.duration === "until-removed"),
      "Неподдержанная длительность эффекта",
    );
    if (effect.save) {
      this.require(
        Object.keys(effect.save).every((k) => ["stat", "dc"].includes(k)),
        "Неизвестное поле спасброска",
      );
      this.require(
        ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(effect.save.stat) &&
          Number.isInteger(effect.save.dc) &&
          effect.save.dc >= 1 &&
          effect.save.dc <= 30,
        "Неверный спасбросок эффекта",
      );
    }
  }
  static attack(attack) {
    this.require(
      typeof attack.id === "string" &&
        attack.id.length > 0 &&
        ["melee", "ranged", "meleeSpell", "rangedSpell"].includes(
          attack.kind,
        ) &&
        Number.isInteger(attack.count) &&
        attack.count >= 1 &&
        attack.count <= 12 &&
        [4, 6, 8, 10, 12, 20].includes(attack.die) &&
        Number.isInteger(attack.range) &&
        attack.range >= 5 &&
        attack.range <= 600,
      "Неверные параметры атаки",
    );
    this.require(
      attack.ability === undefined ||
        ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(attack.ability),
      "Неизвестная характеристика атаки",
    );
    this.require(
      attack.ability !== undefined ||
        (Number.isFinite(attack.bonus) && Number.isFinite(attack.flat)),
      "Нужны модификаторы или характеристика атаки",
    );
    this.require(
      [
        "acid",
        "bludgeoning",
        "cold",
        "fire",
        "force",
        "lightning",
        "necrotic",
        "piercing",
        "poison",
        "psychic",
        "radiant",
        "slashing",
        "thunder",
      ].includes(attack.damageType),
      "Неизвестный тип урона",
    );
    this.require(
      attack.normalRange === undefined ||
        (Number.isInteger(attack.normalRange) &&
          attack.normalRange >= 5 &&
          attack.normalRange <= attack.range),
      "Неверная нормальная дальность",
    );
    this.require(
      Object.keys(attack).every((k) =>
        [
          "id",
          "name",
          "ability",
          "count",
          "die",
          "kind",
          "range",
          "normalRange",
          "bonus",
          "flat",
          "damageType",
          "sneakEligible",
          "inventoryId",
          "light",
          "mastery",
          "unarmed",
          "meleeWeapon",
          "ammo",
          "ammoCounter",
          "ammoInventoryId",
          "ammoItem",
          "effects",
          "heavy",
          "twoHanded",
          "spellKey",
          "potent",
          "magicAdvantage",
          "grappleOnHit",
          "constrict",
        ].includes(k),
      ),
      "Неподдержанное поле атаки",
    );
    this.require(
      !attack.effects ||
        (Array.isArray(attack.effects) && attack.effects.length <= 4),
      "Неверный набор эффектов атаки",
    );
    for (const effect of attack.effects || []) this.effect(effect);
    if (attack.grappleOnHit !== undefined) {
      const g = attack.grappleOnHit;
      this.require(
        g && typeof g === "object" && !Array.isArray(g) &&
          Object.keys(g).every(k => ["dc", "maxTargets", "reach", "vineHP", "vineAC"].includes(k)) &&
          Number.isInteger(g.dc) && g.dc >= 1 && g.dc <= 30 &&
          Number.isInteger(g.maxTargets) && g.maxTargets >= 1 && g.maxTargets <= 4 &&
          Number.isInteger(g.reach) && g.reach >= 5 && g.reach <= attack.range &&
          Number.isInteger(g.vineHP) && g.vineHP >= 1 && g.vineHP <= 100 &&
          Number.isInteger(g.vineAC) && g.vineAC >= 1 && g.vineAC <= 40 &&
          attack.kind === "melee",
        "Неверные параметры захватывающей лозы",
      );
    }
    if (attack.constrict !== undefined) {
      const c = attack.constrict;
      this.require(
        c && typeof c === "object" && !Array.isArray(c) &&
          Object.keys(c).every(k => ["count", "die", "flat", "damageType"].includes(k)) &&
          Number.isInteger(c.count) && c.count >= 1 && c.count <= 12 &&
          [4, 6, 8, 10, 12, 20].includes(c.die) &&
          Number.isInteger(c.flat) && c.flat >= 0 && c.flat <= 30 &&
          c.damageType === "bludgeoning" && attack.grappleOnHit,
        "Неверные параметры сжатия захваченных целей",
      );
    }
    this.require(
      attack.meleeWeapon === undefined ||
        (typeof attack.meleeWeapon === "boolean" &&
          ["melee", "ranged"].includes(attack.kind)),
      "meleeWeapon применяется только к оружейной атаке",
    );
    if (attack.mastery)
      this.require(
        ["vex", "nick", "graze", "sap", "push", "slow"].includes(
          attack.mastery,
        ),
        "Неподдержанное свойство оружия: " + attack.mastery,
      );
  }
  static manifest() {
    return {
      api: this.API,
      engine: this.ENGINE,
      rules: this.RULES,
      features: structuredClone(this.FEATURES),
      handlers: [
        "features",
        "onHitCondition",
        "spellcasting",
        "magicItems",
        "advancedClasses",
        "healing",
      ],
      counters: [...this.COUNTERS],
      conditions: ["poisoned", "prone", "frost"],
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatCapabilities };
