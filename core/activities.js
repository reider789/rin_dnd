"use strict";
const ActivityCapabilities = typeof module !== "undefined"
  ? require("./capabilities").CombatCapabilities : CombatCapabilities;

// A bounded D&D catalogue. No formulas, scripts, hooks or new rule types in packs.
class CombatActivities {
  static SPELLS = {
    fireBolt: {"name": "Огненный снаряд", "level": 0, "cost": "action", "range": 120, "target": "attack", "school": "evocation"},
    rayFrost: {"name": "Луч холода", "level": 0, "cost": "action", "range": 60, "target": "attack", "school": "evocation"},
    mindSliver: {"name": "Расщепление разума", "level": 0, "cost": "action", "range": 60, "target": "enemy", "school": "enchantment"},
    mageHand: {"name": "Магическая рука", "level": 0, "cost": "action", "range": 30, "target": "point", "school": "conjuration"},
    prestidigitation: {"name": "Фокусы", "level": 0, "cost": "action", "range": 10, "target": "point", "school": "transmutation"},
    mageArmor: {"name": "Доспехи мага", "level": 1, "cost": "action", "range": 5, "target": "ally", "school": "abjuration"},
    magicMissile: {"name": "Волшебная стрела", "level": 1, "cost": "action", "range": 120, "target": "enemies", "school": "evocation"},
    thunderwave: {"name": "Громовая волна", "level": 1, "cost": "action", "range": 0, "target": "direction", "school": "evocation"},
    burningHands: {"name": "Огненные ладони", "level": 1, "cost": "action", "range": 0, "target": "direction", "school": "evocation"},
    fogCloud: {"name": "Туманное облако", "level": 1, "cost": "action", "range": 120, "target": "point", "school": "conjuration", "concentrationSeconds": 3600},
    shield: {"name": "Щит", "level": 1, "cost": "reaction", "range": 0, "target": "self", "school": "abjuration"},
    scorchingRay: {"name": "Палящий луч", "level": 2, "cost": "action", "range": 120, "target": "enemies", "school": "evocation"},
    mistyStep: {"name": "Туманный шаг", "level": 2, "cost": "bonus", "range": 30, "target": "point", "school": "conjuration"},
    web: {"name": "Паутина", "level": 2, "cost": "action", "range": 60, "target": "point", "school": "conjuration", "concentrationSeconds": 3600},
    fireball: {"name": "Огненный шар", "level": 3, "cost": "action", "range": 150, "target": "point", "school": "evocation"},
    slow: {"name": "Замедление", "level": 3, "cost": "action", "range": 120, "target": "enemies", "school": "transmutation", "concentrationSeconds": 60},
    counterspell: {"name": "Контрзаклинание", "level": 3, "cost": "reaction", "range": 60, "target": "enemy", "school": "abjuration"},
    dispelMagic: {"name": "Рассеивание магии", "level": 3, "cost": "action", "range": 120, "target": "any", "school": "abjuration"},
    fly: {"name": "Полёт", "level": 3, "cost": "action", "range": 5, "target": "allies", "school": "transmutation", "concentrationSeconds": 600},
    dimensionDoor: {"name": "Дверь в измерение", "level": 4, "cost": "action", "range": 500, "target": "point", "school": "conjuration"},
    greaterInvisibility: {"name": "Высшая невидимость", "level": 4, "cost": "action", "range": 5, "target": "ally", "school": "illusion", "concentrationSeconds": 60},
    revivify: {"name": "Возрождение", "level": 3, "cost": "action", "range": 5, "target": "any", "school": "necromancy"},
    tashasBubblingCauldron: {"name": "Кипящий котёл Таши", "level": 6, "cost": "action", "range": 5, "target": "point", "school": "conjuration"},
    globeInvulnerability: {"name": "Сфера неуязвимости", "level": 6, "cost": "action", "range": 0, "target": "self", "school": "abjuration", "concentrationSeconds": 60},
    chainLightning: {"name": "Цепная молния", "level": 6, "cost": "action", "range": 150, "target": "enemies", "school": "evocation"},
    coneCold: {"name": "Конус холода", "level": 5, "cost": "action", "range": 0, "target": "direction", "school": "evocation"},
    seeming: {"name": "Кажущаяся внешность", "level": 5, "cost": "action", "range": 30, "target": "allies", "school": "illusion"},
    holdMonster: {"name": "Удержание чудовища", "level": 5, "cost": "action", "range": 90, "target": "enemies", "school": "enchantment", "concentrationSeconds": 60},
    bigbyHand: {"name": "Рука Бигби", "level": 5, "cost": "action", "range": 120, "target": "point", "school": "evocation", "concentrationSeconds": 60},
    bless: {"name": "Благословение", "level": 1, "cost": "action", "range": 30, "target": "allies", "school": "enchantment", "concentrationSeconds": 60},
    cureWounds: {"name": "Лечение ран", "level": 1, "cost": "action", "range": 5, "target": "ally", "school": "abjuration"},
    heroism: {"name": "Героизм", "level": 1, "cost": "action", "range": 5, "target": "allies", "school": "enchantment", "concentrationSeconds": 60},
    command: {"name": "Приказ: Стой", "level": 1, "cost": "action", "range": 60, "target": "enemies", "school": "enchantment"},
    compelledDuel: {"name": "Вынужденная дуэль", "level": 1, "cost": "bonus", "range": 30, "target": "enemy", "school": "enchantment", "concentrationSeconds": 60},
    protectionEvil: {"name": "Защита от зла и добра", "level": 1, "cost": "action", "range": 5, "target": "ally", "school": "abjuration", "concentrationSeconds": 600},
    shieldFaith: {"name": "Щит веры", "level": 1, "cost": "bonus", "range": 60, "target": "ally", "school": "abjuration", "concentrationSeconds": 600},
    aid: {"name": "Помощь", "level": 2, "cost": "action", "range": 30, "target": "allies", "school": "abjuration"},
    lesserRestoration: {"name": "Малое восстановление", "level": 2, "cost": "bonus", "range": 5, "target": "ally", "school": "abjuration"},
    zoneTruth: {"name": "Зона истины", "level": 2, "cost": "action", "range": 60, "target": "point", "school": "enchantment"},
    wardingBond: {"name": "Защитная связь", "level": 2, "cost": "action", "range": 5, "target": "ally", "school": "abjuration"},
    beaconHope: {"name": "Маяк надежды", "level": 3, "cost": "action", "range": 30, "target": "allies", "school": "abjuration", "concentrationSeconds": 60},
    crusaderMantle: {"name": "Мантия крестоносца", "level": 3, "cost": "action", "range": 0, "target": "self", "school": "evocation", "concentrationSeconds": 60},
    auraVitality: {"name": "Аура жизненной силы", "level": 3, "cost": "action", "range": 0, "target": "self", "school": "abjuration", "concentrationSeconds": 60},
    divineSmite: {"name": "Божественная кара", "level": 1, "cost": "bonus", "range": 0, "target": "enemy", "school": "evocation"},
    findSteed: {"name": "Верный скакун", "level": 2, "cost": "action", "range": 30, "target": "point", "school": "conjuration"},
    stormSphere: {"name": "Сфера бури · наручи", "level": 4, "cost": "action", "range": 150, "target": "point", "school": "evocation", "concentrationSeconds": 60},
    drainingWave: {"name": "Истощающая волна · фокус", "level": 0, "cost": "action", "range": 0, "target": "direction", "school": "necromancy"},
  };
  static HEALING = {
    cureWounds: {handler: "healing", version: 1, dicePerLevel: 2, sides: 8, castingBonus: true},
    healingPotion: {handler: "healing", version: 1, count: 2, sides: 4, flat: 2},
  };
  static spell(id) {
    const definition = this.SPELLS[id];
    return definition ? structuredClone({id, ...definition, automation: "supportedCombatSubset",
      handler: this.HEALING[id] ? "healing" : "spellSpecific", handlerVersion: 1}) : null;
  }
  static legacySpellTuples() {
    return Object.fromEntries(Object.entries(this.SPELLS).map(([id,d]) =>
      [id, [d.name,d.level,d.cost,d.range,d.target,d.school,...(d.concentrationSeconds ? [d.concentrationSeconds] : [])]]));
  }
  static healing(id, {level = 1, ability = 0, count, flat} = {}) {
    const d = this.HEALING[id];
    if (!d) return null;
    return {count: count ?? (d.dicePerLevel ? d.dicePerLevel * level : d.count),
      sides: d.sides, bonus: flat ?? (d.castingBonus ? ability : d.flat || 0)};
  }
  static validate(definition) {
    const C = ActivityCapabilities, d = definition;
    C.require(d && typeof d === "object" && !Array.isArray(d), "Неверное описание действия");
    const allowed = ["handler","version","name","cost","target","range","dice","resource","reference"];
    C.require(Object.keys(d).every(k => allowed.includes(k)), "Неизвестное поле действия");
    C.require(d.handler === "healing" && d.version === 1, "Неизвестный обработчик действия");
    C.require(typeof d.name === "string" && d.name.trim() && d.name.length <= 120, "Нужно имя действия");
    C.require(["action","bonus"].includes(d.cost) && ["self","ally"].includes(d.target), "Неверная активация действия");
    C.require(Number.isInteger(d.range) && d.range >= 0 && d.range <= 60 &&
      (d.target !== "self" || d.range === 0), "Неверная дальность действия");
    C.require(d.dice && Object.keys(d.dice).every(k => ["count","sides","flat"].includes(k)) &&
      Number.isInteger(d.dice.count) && d.dice.count >= 1 && d.dice.count <= 12 &&
      [4,6,8,10,12].includes(d.dice.sides) && Number.isInteger(d.dice.flat) &&
      d.dice.flat >= 0 && d.dice.flat <= 30, "Неверные кости лечения");
    C.require(d.resource && Object.keys(d.resource).every(k => ["counter","amount"].includes(k)) &&
      C.COUNTERS.includes(d.resource.counter) && Number.isInteger(d.resource.amount) &&
      d.resource.amount >= 1 && d.resource.amount <= 100, "Действию нужен известный расходуемый ресурс");
    C.require(typeof d.reference === "string" && d.reference.trim() && d.reference.length <= 500,
      "Укажи правило или согласованное описание действия");
    return true;
  }
  static validateUnit(unit) {
    const entries = Object.entries(unit.activities || {});
    ActivityCapabilities.require(entries.length <= 50, "Слишком много действий");
    for (const [id,d] of entries) {
      ActivityCapabilities.require(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,99}$/.test(id) &&
        !["__proto__","prototype","constructor"].includes(id), "Неверный ID действия");
      this.validate(d);
      ActivityCapabilities.require(unit.counters?.[d.resource.counter], "Нет ресурса действия: " + id);
    }
  }
  static catalogue(unit) {
    return Object.entries(unit.activities || {}).map(([id,d]) => ({id, ...structuredClone(d)}));
  }
  static command(e, c, u) {
    if (c.kind !== "activity") return false;
    const d = u.activities?.[c.activity];
    e.require(d, "Неизвестное действие персонажа");
    this.validate(d);
    const target = d.target === "self" ? c.actor : c.target;
    e.require(target && e.s.units[target], "Выбери союзника");
    const v = e.unit(target), resource = u.counters?.[d.resource.counter];
    e.require(v.team === u.team && !v.dead && e.distance(u,v) <= d.range && e.canSee(c.actor,target),
      "Нужен живой союзник в пределах дальности и видимости");
    e.require(resource?.current >= d.resource.amount, "Недостаточно ресурса действия");
    if (d.cost === "bonus") { e.require(u.bonus > 0, "Нет бонусного действия"); u.bonus--; }
    else e.spendAction(c.actor);
    resource.current -= d.resource.amount;
    e.emit("activity", c.actor, u.name + ": " + d.name + ".", {
      activity: c.activity, target, reference: d.reference,
      costs: [{resource: d.resource.counter, amount: d.resource.amount}],
    });
    e.enqueue({kind: "roll", actor: c.actor, label: d.name,
      count: d.dice.count, sides: d.dice.sides, bonus: d.dice.flat,
      next: {kind: "healingResult", actor: c.actor, target,
        maxHealing: d.dice.count * d.dice.sides + d.dice.flat}});
    return true;
  }
}
if (typeof module !== "undefined") module.exports = {CombatActivities};
