"use strict";
// The only registration point for supported data-level mechanics. No code from packs is executed.
class CombatCapabilities {
  static API = 1;
  static ENGINE = "30.2.0";
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
    masteries: ["vex", "nick"],
    alert: "boolean",
    extraAttack: [1, 4],
    packTactics: "boolean",
    cunningAction: "boolean",
  };
  static require(ok, message) {
    if (!ok) throw Error(message);
  }
  static features(features = {}) {
    for (const [key, value] of Object.entries(features)) {
      const type = this.FEATURES[key];
      this.require(type, "Нет проверенного обработчика способности: " + key);
      const valid =
        type === "boolean"
          ? typeof value === "boolean"
          : key === "masteries"
            ? Array.isArray(value) && value.every((v) => type.includes(v))
            : key === "martialDie"
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
          "ammo",
          "ammoInventoryId",
          "ammoItem",
          "effects",
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
    if (attack.mastery)
      this.require(
        ["vex", "nick"].includes(attack.mastery),
        "Неподдержанное свойство оружия: " + attack.mastery,
      );
  }
  static manifest() {
    return {
      api: this.API,
      engine: this.ENGINE,
      rules: this.RULES,
      features: structuredClone(this.FEATURES),
      handlers: ["features", "onHitCondition"],
      conditions: ["poisoned", "prone", "frost"],
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatCapabilities };
