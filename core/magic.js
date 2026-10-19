"use strict";
// Declarative spell data and serialized continuations. Campaign packs contain no executable code.
class CombatMagic {
  static SPELLS = {
    fireBolt: ["Огненный снаряд", 0, "action", 120, "attack", "evocation"],
    rayFrost: ["Луч холода", 0, "action", 60, "attack", "evocation"],
    mindSliver: ["Расщепление разума", 0, "action", 60, "enemy", "enchantment"],
    mageHand: ["Магическая рука", 0, "action", 30, "point", "conjuration"],
    prestidigitation: ["Фокусы", 0, "action", 10, "point", "transmutation"],
    mageArmor: ["Доспехи мага", 1, "action", 5, "ally", "abjuration"],
    magicMissile: [
      "Волшебная стрела",
      1,
      "action",
      120,
      "enemies",
      "evocation",
    ],
    thunderwave: ["Громовая волна", 1, "action", 0, "direction", "evocation"],
    burningHands: ["Огненные ладони", 1, "action", 0, "direction", "evocation"],
    fogCloud: [
      "Туманное облако",
      1,
      "action",
      120,
      "point",
      "conjuration",
      3600,
    ],
    shield: ["Щит", 1, "reaction", 0, "self", "abjuration"],
    scorchingRay: ["Палящий луч", 2, "action", 120, "enemies", "evocation"],
    mistyStep: ["Туманный шаг", 2, "bonus", 30, "point", "conjuration"],
    web: ["Паутина", 2, "action", 60, "point", "conjuration", 3600],
    fireball: ["Огненный шар", 3, "action", 150, "point", "evocation"],
    slow: ["Замедление", 3, "action", 120, "enemies", "transmutation", 60],
    counterspell: ["Контрзаклинание", 3, "reaction", 60, "enemy", "abjuration"],
    dispelMagic: ["Рассеивание магии", 3, "action", 120, "any", "abjuration"],
    fly: ["Полёт", 3, "action", 5, "allies", "transmutation", 600],
    dimensionDoor: [
      "Дверь в измерение",
      4,
      "action",
      500,
      "point",
      "conjuration",
    ],
    greaterInvisibility: [
      "Высшая невидимость",
      4,
      "action",
      5,
      "ally",
      "illusion",
      60,
    ],
    coneCold: ["Конус холода", 5, "action", 0, "direction", "evocation"],
    seeming: ["Кажущаяся внешность", 5, "action", 30, "allies", "illusion"],
    holdMonster: [
      "Удержание чудовища",
      5,
      "action",
      90,
      "enemies",
      "enchantment",
      60,
    ],
    bigbyHand: ["Рука Бигби", 5, "action", 120, "point", "evocation", 60],
    bless: ["Благословение", 1, "action", 30, "allies", "enchantment", 60],
    cureWounds: ["Лечение ран", 1, "action", 5, "ally", "abjuration"],
    heroism: ["Героизм", 1, "action", 5, "allies", "enchantment", 60],
    command: ["Приказ: Стой", 1, "action", 60, "enemies", "enchantment"],
    compelledDuel: [
      "Вынужденная дуэль",
      1,
      "bonus",
      30,
      "enemy",
      "enchantment",
      60,
    ],
    protectionEvil: [
      "Защита от зла и добра",
      1,
      "action",
      5,
      "ally",
      "abjuration",
      600,
    ],
    shieldFaith: ["Щит веры", 1, "bonus", 60, "ally", "abjuration", 600],
    aid: ["Помощь", 2, "action", 30, "allies", "abjuration"],
    lesserRestoration: [
      "Малое восстановление",
      2,
      "bonus",
      5,
      "ally",
      "abjuration",
    ],
    zoneTruth: ["Зона истины", 2, "action", 60, "point", "enchantment"],
    wardingBond: ["Защитная связь", 2, "action", 5, "ally", "abjuration"],
    beaconHope: ["Маяк надежды", 3, "action", 30, "allies", "abjuration", 60],
    crusaderMantle: [
      "Мантия крестоносца",
      3,
      "action",
      0,
      "self",
      "evocation",
      60,
    ],
    auraVitality: [
      "Аура жизненной силы",
      3,
      "action",
      0,
      "self",
      "abjuration",
      60,
    ],
    divineSmite: ["Божественная кара", 1, "bonus", 0, "enemy", "evocation"],
    findSteed: ["Верный скакун", 2, "action", 30, "point", "conjuration"],
    stormSphere: [
      "Сфера бури · наручи",
      4,
      "action",
      150,
      "point",
      "evocation",
      60,
    ],
    drainingWave: [
      "Истощающая волна · фокус",
      0,
      "action",
      0,
      "direction",
      "necromancy",
    ],
  };
  static OPS = new Set([
    "window",
    "resolve",
    "counterResult",
    "areaRoll",
    "apply",
    "save",
    "heal",
    "missile",
    "missileDamage",
    "hand",
    "handSave",
    "handAttack",
    "handDamage",
    "stormTick",
    "repeat",
    "dispel",
    "extraDamage",
    "leafSplit",
    "resumeDamage",
    "itemSave",
    "poisonDamage",
    "smiteDamage",
    "objectHit",
    "objectDamage",
    "shadowSearch",
  ]);
  static LABELS = {
    abjure: "Изгнание врагов",
    sacredWeapon: "Священное оружие",
    fireResistance: "Сопротивление огню",
    antitoxin: "Противоядие",
    haste: "Ускорение",
    enlarge: "Рост",
    giantStrength: "Сила великана",
    climbing: "Лазание",
    prone: "Лежит",
    unconscious: "Без сознания",
    grappled: "В захвате",
    dodge: "Уклоняется",
    invisible: "Невидим",
    restrained: "Опутан",
    blinded: "Ослеплён",
    deafened: "Оглох",
    stunned: "Ошеломлён",
    paralyzed: "Парализован",
    incapacitated: "Недееспособен",
    poisoned: "Отравлен",
    frightened: "Испуган",
    petrified: "Окаменел",
    frost: "Охлаждён",
    aim: "Точный прицел",
    bait: "Прикрыт манёвром",
    protected: "Под защитой",
    sap: "Ослаблен",
    slow: "Замедлен",
    goaded: "Спровоцирован",
    charmed: "Очарован",
    exhaustion: "Истощение",
    noReactions: "Без реакций",
    burning: "Горение",
    rooted: "Укоренён",
  };
  static label(kind) {
    return this.SPELLS[kind]?.[0] || this.LABELS[kind] || kind;
  }
  static catalogue(u) {
    return [
      ...new Set([
        ...(u.casting?.prepared || []),
        ...(u.casting?.cantrips || []),
        ...(u.equipment?.stormBracers ? ["stormSphere"] : []),
        ...(u.equipment?.vaeltirFocus ? ["drainingWave"] : []),
      ]),
    ].map((id) => ({
      id,
      name: this.SPELLS[id][0],
      level: this.SPELLS[id][1],
      cost: this.SPELLS[id][2],
      target: this.SPELLS[id][4],
    }));
  }
  static validateCasting(c) {
    if (!c) return;
    const C =
      typeof module !== "undefined"
        ? require("./capabilities").CombatCapabilities
        : CombatCapabilities;
    C.require(
      Object.keys(c).every((k) =>
        [
          "ability",
          "attack",
          "dc",
          "level",
          "prepared",
          "cantrips",
          "book",
          "components",
          "recoveryLevels",
          "reference",
        ].includes(k),
      ),
      "Неизвестное поле магии",
    );
    C.require(
      ["INT", "WIS", "CHA"].includes(c.ability) &&
        Number.isInteger(c.attack) &&
        Number.isInteger(c.dc) &&
        c.dc >= 1 &&
        c.dc <= 30 &&
        Number.isInteger(c.level) &&
        c.level > 0 &&
        c.level <= 20,
      "Неверный профиль заклинателя",
    );
    for (const k of ["prepared", "cantrips"])
      C.require(
        Array.isArray(c[k]) &&
          new Set(c[k]).size === c[k].length &&
          c[k].every((x) => Object.hasOwn(this.SPELLS, x)),
        "Нет обработчика подготовленного заклинания",
      );
    C.require(
      c.cantrips.every((x) => this.SPELLS[x][1] === 0) &&
        c.prepared.every((x) => this.SPELLS[x][1] > 0),
      "Неверная подготовка",
    );
  }
  static validateState(s) {
    const req = (ok, msg) => {
      if (!ok) throw Error(msg);
    };
    if (s.effects !== undefined) {
      req(Array.isArray(s.effects), "Повреждены магические эффекты");
      const ids = new Set();
      for (const x of s.effects) {
        req(
          x &&
            typeof x.id === "string" &&
            !ids.has(x.id) &&
            s.units[x.owner] &&
            Array.isArray(x.targets) &&
            x.targets.every((id) => s.units[id]) &&
            Number.isFinite(x.until) &&
            Number.isInteger(x.level) &&
            x.level >= 0 &&
            x.level <= 9,
          "Повреждён магический эффект",
        );
        ids.add(x.id);
        req(
          Object.hasOwn(this.SPELLS, x.kind) ||
            [
              "abjure",
              "sacredWeapon",
              "fireResistance",
              "antitoxin",
              "haste",
              "enlarge",
              "giantStrength",
              "climbing",
            ].includes(x.kind),
          "Неизвестный магический эффект",
        );
      }
    }
    if (s.spellFrames !== undefined) {
      req(
        s.spellFrames &&
          typeof s.spellFrames === "object" &&
          !Array.isArray(s.spellFrames),
        "Повреждены этапы заклинаний",
      );
      for (const [id, f] of Object.entries(s.spellFrames)) {
        req(
          f &&
            f.id === id &&
            s.units[f.actor] &&
            (Object.hasOwn(this.SPELLS, f.spell) ||
              ["abjure", "sacredWeapon", "item"].includes(f.spell)),
          "Повреждено заклинание",
        );
        if (f.dispelTarget)
          req(
            ["creature", "object", "effect"].includes(f.dispelTarget.kind) &&
              typeof f.dispelTarget.id === "string" &&
              /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(f.dispelTarget.id),
            "Повреждена цель рассеивания",
          );
      }
    }
    if (s.objects !== undefined) {
      req(
        s.objects && typeof s.objects === "object" && !Array.isArray(s.objects),
        "Повреждены предметы на поле",
      );
      for (const [id, o] of Object.entries(s.objects)) {
        req(
          o &&
            o.id === id &&
            s.units[o.owner] &&
            Number.isInteger(o.hp) &&
            o.hp >= 0 &&
            o.hp <= o.max &&
            o.ac === 20 &&
            Number.isInteger(o.x) &&
            o.x >= 0 &&
            o.x < s.terrain.width &&
            Number.isInteger(o.y) &&
            o.y >= 0 &&
            o.y < s.terrain.height &&
            (!o.grappled || s.units[o.grappled]),
          "Повреждена Рука Бигби",
        );
        req(
          s.effects.some((x) => x.id === id && x.kind === "bigbyHand"),
          "Нет заклинания Руки Бигби",
        );
      }
    }
  }
  static init(s) {
    s.effects ??= [];
    s.spellFrames ??= {};
    s.objects ??= {};
  }
  static task(actor, op, data = {}) {
    return { kind: "magicTask", actor, op, ...data };
  }
  static effects(e, id, kind) {
    return (e.s.effects || []).filter(
      (x) =>
        x.kind === kind &&
        (x.targets?.includes(id) ||
          (x.aura &&
            e.active(x.owner) &&
            !e.incapacitated(x.owner) &&
            e.unit(id).team === e.unit(x.owner).team &&
            e.distance(e.unit(id), e.unit(x.owner)) <= x.aura)),
    );
  }
  static has(e, id, kind) {
    return (
      (kind === "invisible" &&
        this.effects(e, id, "greaterInvisibility").length > 0) ||
      (kind === "frightened" && this.effects(e, id, "abjure").length > 0) ||
      (kind === "paralyzed" && this.effects(e, id, "holdMonster").length > 0) ||
      (kind === "grappled" &&
        Object.values(e.s.objects || {}).some((o) => o.grappled === id))
    );
  }
  static concentrating(e, id) {
    return (
      (e.s.effects || []).some((x) => x.owner === id && x.concentration) ||
      e.s.zones.some((x) => x.owner === id && x.concentration)
    );
  }
  static add(e, f, kind, targets, duration, extra = {}) {
    this.init(e.s);
    const speeds = Object.fromEntries(targets.map((id) => [id, e.speed(id)]));
    const x = {
      id: "effect-" + ++e.s.sequence,
      kind,
      owner: f.actor,
      targets: [...targets],
      level: f.level || 0,
      dc: e.unit(f.actor).casting?.dc || f.dc || 10,
      until: e.s.elapsed + duration,
      concentration: Boolean(this.SPELLS[f.spell]?.[6]),
      ...extra,
    };
    e.s.spellFrames[x.id] = { ...f, id: x.id };
    e.s.effects.push(x);
    if (["slow", "haste"].includes(kind))
      for (const id of targets) e.adjustMovementForSpeed(id, speeds[id]);
    e.emit("effect", f.actor, this.label(kind), {
      effect: structuredClone(x),
    });
    return x;
  }
  static remove(e, ids) {
    if (!ids.length) return;
    const speeds = Object.fromEntries(e.s.order.map((id) => [id, e.speed(id)]));
    this.removeState(e.s, ids);
    for (const id of e.s.order) e.adjustMovementForSpeed(id, speeds[id]);
  }
  static removeState(s, ids) {
    for (const x of s.effects || [])
      if (ids.includes(x.id)) {
        if (x.kind === "aid")
          for (const id of x.targets) {
            const u = s.units[id];
            u.max -= x.amount;
            u.hp = Math.min(u.hp, u.max);
          }
        if (x.kind === "heroism")
          for (const id of x.targets)
            if (s.units[id].tempSource === x.id) {
              s.units[id].temp = 0;
              delete s.units[id].tempSource;
            }
        delete s.objects[x.id];
        s.zones = s.zones.filter((z) => z.effect !== x.id);
      }
    for (const u of Object.values(s.units))
      u.statuses = u.statuses.filter((x) => !ids.includes(x.effect));
    s.effects = (s.effects || []).filter((x) => !ids.includes(x.id));
  }
  static expireState(s, at) {
    const expired = s.effects.filter((x) => x.until <= at);
    this.removeState(
      s,
      expired.map((x) => x.id),
    );
    s.zones = s.zones.filter((z) => z.until > at);
    for (const u of Object.values(s.units)) {
      if (u.mindSliver?.until <= at) delete u.mindSliver;
      u.statuses = u.statuses.filter(
        (z) =>
          (z.until === undefined || z.until > at) &&
          (!z.effect || s.effects.some((x) => x.id === z.effect)),
      );
    }
    return expired;
  }
  static normalizedAt(state, at) {
    // Journal and baselines are immutable here; avoid copying a long event log.
    const s = {
      ...state,
      elapsed: at,
      ...structuredClone({
        units: state.units,
        effects: state.effects,
        objects: state.objects,
        zones: state.zones,
      }),
    };
    this.expireState(s, at);
    return s;
  }
  static endConcentration(e, id) {
    const ids = (e.s.effects || [])
      .filter((x) => x.owner === id && x.concentration)
      .map((x) => x.id);
    this.remove(e, ids);
    if (ids.length)
      e.emit(
        "concentrationEnded",
        id,
        e.name(id) + ": концентрация прекращена.",
      );
  }
  static ac(e, id, from) {
    const u = e.unit(id);
    let n = this.effects(e, id, "haste").length ? 2 : 0;
    if (this.effects(e, id, "mageArmor").length && !u.equipment?.armor)
      n += Math.max(0, 13 + u.stats.DEX - u.ac);
    n += this.effects(e, id, "shieldFaith").length ? 2 : 0;
    n += this.effects(e, id, "wardingBond").length ? 1 : 0;
    n -= this.effects(e, id, "slow").length ? 2 : 0;
    return n;
  }
  static cover(e, from, id) {
    let result = 0;
    for (const o of Object.values(e.s.objects || {}))
      if (
        o.interposing &&
        e.unit(o.owner).team === e.unit(id).team &&
        e.crosses(from, e.unit(id), { ...o, radius: 2.5 })
      )
        result = 2;
    return result;
  }
  static saveBonus(e, id, stat) {
    const u = e.unit(id);
    let n = this.effects(e, id, "wardingBond").length ? 1 : 0;
    if (stat === "DEX" && this.effects(e, id, "slow").length) n -= 2;
    if (stat === "STR" && this.effects(e, id, "giantStrength").length)
      n += Math.max(0, 5 - u.stats.STR);
    return n;
  }
  static saveAdv(e, id, stat, next) {
    return (
      (stat === "DEX" && this.effects(e, id, "haste").length > 0) ||
      (stat === "STR" && this.effects(e, id, "enlarge").length > 0) ||
      (stat === "CON" &&
        next?.itemKind === "poison" &&
        this.effects(e, id, "antitoxin").length > 0) ||
      (stat === "WIS" && this.effects(e, id, "beaconHope").length > 0)
    );
  }
  static rollBonus(e, t) {
    let n = 0;
    const id = t.actor;
    if ((t.save || t.attackRoll) && this.effects(e, id, "bless").length)
      n += e.roll(4);
    if (t.save && !t.deathSave) {
      const u = e.unit(id);
      if (u.mindSliver) {
        n -= e.roll(4);
        delete u.mindSliver;
      }
    }
    if (
      t.check &&
      t.stat === "STR" &&
      this.effects(e, id, "giantStrength").length
    )
      n += Math.max(0, 5 - e.unit(id).stats.STR);
    if (n)
      e.emit(
        "magicRollBonus",
        id,
        "Магический модификатор броска: " + (n > 0 ? "+" : "") + n,
        { amount: n },
      );
    return n;
  }
  static speed(e, id, n) {
    if (this.effects(e, id, "haste").length) n *= 2;
    if (this.effects(e, id, "slow").length) n = Math.floor(n / 2 / 5) * 5;
    return n;
  }
  static difficult(e, id, p) {
    return (
      e.s.zones.some(
        (z) => ["web", "stormSphere"].includes(z.kind) && e.zoneAt(p, z),
      ) ||
      Object.values(e.s.objects || {}).some(
        (o) =>
          o.interposing &&
          e.unit(o.owner).team !== e.unit(id).team &&
          o.x === p.x &&
          o.y === p.y,
      )
    );
  }
  static canReact(e, id) {
    return (
      !this.effects(e, id, "slow").length &&
      !e.unit(id).statuses.some((z) => z.kind === "noReactions")
    );
  }
  static targets(e, c) {
    return c.targets?.length ? [...c.targets] : c.target ? [c.target] : [];
  }
  static dispelSelection(e, c) {
    const target = c.dispelTarget || {
      kind: e.s.objects[c.target] ? "object" : "creature",
      id: c.target || c.targets?.[0],
    };
    e.require(
      target &&
        ["creature", "object", "effect"].includes(target.kind) &&
        typeof target.id === "string",
      "Выбери цель рассеивания",
    );
    let point;
    if (target.kind === "creature") {
      const u = e.unit(target.id);
      e.require(!u.dead, "Цель мертва");
      point = u;
    } else if (target.kind === "object") point = e.s.objects[target.id];
    else {
      const x = e.s.effects.find(
        (x) => x.id === target.id && Object.hasOwn(this.SPELLS, x.kind),
      );
      point =
        x &&
        (e.s.objects[x.id] ||
          e.s.zones.find((z) => z.effect === x.id) ||
          x.point ||
          e.s.units[x.targets[0] || x.owner]);
    }
    e.require(
      point &&
        e.distance(e.unit(c.actor), point) <= this.SPELLS.dispelMagic[3] &&
        e.wallLOS(e.unit(c.actor), point),
      "Цель рассеивания вне дистанции / за стеной",
    );
    return { kind: target.kind, id: target.id };
  }
  static validate(e, c, u) {
    e.require(c.spell !== "divineSmite", "Кара применяется после попадания");
    const def = this.SPELLS[c.spell];
    e.require(def, "Неизвестное заклинание");
    const [name, base, cost, range, shape] = def,
      id = c.actor,
      targets = c.spell === "dispelMagic" ? [] : this.targets(e, c),
      dispelTarget =
        c.spell === "dispelMagic" ? this.dispelSelection(e, c) : undefined;
    e.require(
      this.catalogue(u).some((x) => x.id === c.spell),
      "Заклинание не подготовлено / предмет не настроен",
    );
    e.require(
      !["reaction", "minute"].includes(cost),
      cost === "minute"
        ? "Нужно 10 последовательных действий Магия: используй длительное сотворение"
        : "Это заклинание применяется в окне реакции",
    );
    const item = ["stormSphere", "drainingWave"].includes(c.spell),
      level = item ? base : Number(c.level ?? base);
    e.require(
      Number.isInteger(level) &&
        level >= base &&
        level <= 9 &&
        (base > 0 || level === 0),
      "Неверный круг заклинания",
    );
    const free =
      c.spell === "findSteed" &&
      level === base &&
      u.counters.faithful_steed?.current > 0 &&
      c.free !== false;
    if (c.spell === "findSteed") {
      e.require(
        c.free === undefined || typeof c.free === "boolean",
        "Выбери способ призыва",
      );
      e.require(
        c.free !== true || free,
        "Бесплатный скакун: только II круг и доступное применение",
      );
      e.require(
        c.steedType === undefined ||
          ["celestial", "fey", "fiend"].includes(c.steedType),
        "Выбери тип скакуна",
      );
    }
    if (base && !item && !free) {
      e.require(
        u.slotTurn !== e.s.turnSerial,
        "В этом ходу уже потрачена ячейка",
      );
      e.require(u.slots[level]?.current > 0, "Нет ячейки этого круга");
    }
    if (c.spell === "stormSphere")
      e.require(
        u.counters.storm_bracers?.current > 0 &&
          u.counters.storm_daily?.current > 0,
        "Нет заряда наручей или дневного применения",
      );
    if (c.spell === "drainingWave")
      e.require(u.counters.vaeltir_focus?.current > 0, "Нет зарядов фокуса");
    e.require(
      cost === "bonus" ? u.bonus > 0 : u.action > 0,
      "Нет нужного действия",
    );
    if (
      c.spell !== "dispelMagic" &&
      ["ally", "enemy", "any", "attack", "allies", "enemies"].includes(shape)
    ) {
      e.require(
        targets.length > 0 &&
          (["magicMissile", "scorchingRay"].includes(c.spell) ||
            new Set(targets).size === targets.length),
        "Выбери цели",
      );
      const max =
        {
          bless: 3 + level - 1,
          heroism: level,
          aid: 3,
          command: level,
          fly: level - 2,
          slow: 6,
          holdMonster: 1 + level - 5,
          magicMissile: 2 + level,
          scorchingRay: level + 1,
          beaconHope: 100,
          seeming: 100,
        }[c.spell] || 1;
      e.require(targets.length <= max, "Слишком много целей");
      for (const t of targets) {
        const v = e.unit(t);
        e.require(
          !v.dead && e.distance(u, v) <= range && e.wallLOS(u, v),
          "Цель вне дистанции / за стеной",
        );
        if (["enemy", "enemies", "attack"].includes(shape))
          e.require(
            e.canSee(id, t) && e.knowsPosition(id, t),
            "Нужна видимая цель",
          );
        if (["ally", "allies"].includes(shape))
          e.require(v.team === u.team, "Выбери союзника");
      }
    }
    if (["point", "direction"].includes(shape)) {
      e.require(
        c.point && e.inside(c.point) && !e.wall(c.point),
        "Выбери клетку",
      );
      if (range)
        e.require(
          e.distance(u, c.point) <= range &&
            (c.spell === "dimensionDoor" || e.wallLOS(u, c.point)),
          "Точка вне дистанции / за стеной",
        );
      if (shape === "direction")
        e.require(e.distance(u, c.point) > 0, "Выбери направление");
    }
    if (["mistyStep", "dimensionDoor"].includes(c.spell))
      e.require(!e.occupied(c.point.x, c.point.y, id), "Клетка занята");
    if (c.spell === "mistyStep")
      e.require(e.canSee(id, c.point), "Точка должна быть видна");
    if (c.spell === "dimensionDoor" && c.passenger) {
      const v = e.unit(c.passenger),
        p = c.passengerPoint;
      e.require(
        v.team === u.team &&
          e.distance(u, v) <= 5 &&
          v.size <= u.size &&
          !e.incapacitated(c.passenger) &&
          p &&
          e.inside(p) &&
          !e.wall(p) &&
          !e.occupied(p.x, p.y, c.passenger) &&
          e.distance(p, c.point) <= 5 &&
          e.distance(p, c.point) > 0,
        "Пассажиру нужна соседняя свободная клетка",
      );
    }
    if (c.spell === "findSteed")
      e.require(
        !e.occupied(c.point.x, c.point.y),
        "Нужно свободное место для скакуна",
      );
    if (c.spell === "bigbyHand") {
      e.require(
        !e.occupied(c.point.x, c.point.y),
        "Рука создаётся в свободном месте",
      );
      this.validateHand(e, c, { ...c.point, owner: id }, true);
    }
    if (c.spell === "mageArmor")
      e.require(
        !e.unit(targets[0]).equipment?.armor,
        "Доспехи мага действуют без надетой брони",
      );
    if (c.spell === "lesserRestoration") {
      const options = this.restorationOptions(e, targets[0]);
      e.require(
        c.condition === undefined || options.includes(c.condition),
        "У цели нет выбранного состояния",
      );
      e.require(
        options.length <= 1 || c.condition !== undefined,
        "Выбери одно состояние для восстановления",
      );
    }
    if (c.spell === "wardingBond") {
      e.require(
        targets[0] !== id,
        "Защитная связь требует другого согласного союзника",
      );
      e.require(
        u.casting?.components?.wardingBond === true,
        "Нет подтверждённых платиновых колец (2 × 50 зм)",
      );
    }
    if (c.spell === "protectionEvil")
      e.require(
        u.casting?.components?.protectionEvil === true,
        "Нужны подтверждённые расходуемые святая вода или серебро",
      );
    if (c.spell === "slow") {
      const ps = targets.map((t) => e.unit(t));
      e.require(
        Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)) < 8 &&
          Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)) < 8,
        "Цели должны помещаться в куб 40 фт",
      );
    }
    if (c.sculpt?.length) {
      e.require(
        u.features.sculptSpells &&
          def[5] === "evocation" &&
          c.sculpt.length <= 1 + level &&
          new Set(c.sculpt).size === c.sculpt.length,
        "Скульптура заклинаний недоступна",
      );
      for (const t of c.sculpt)
        e.require(
          t !== id && e.canSee(id, t),
          "Защищаемый союзник должен быть виден",
        );
    }
    return {
      id: "spell-" + ++e.s.sequence,
      actor: id,
      spell: c.spell,
      level,
      targets,
      point: c.point,
      sculpt: c.sculpt || [],
      handMode: c.handMode || "interpose",
      target: c.spell === "dispelMagic" ? undefined : c.target,
      dispelTarget,
      passenger: c.passenger,
      passengerPoint: c.passengerPoint,
      offered: [],
      item,
      free,
      steedType: c.steedType || "celestial",
      condition:
        c.condition ||
        (c.spell === "lesserRestoration"
          ? this.restorationOptions(e, targets[0])[0]
          : undefined),
      cancelled: false,
    };
  }
  static pay(e, f, cost) {
    const u = e.unit(f.actor);
    if (cost === "action") e.spendAction(f.actor, true);
    else if (cost === "bonus") {
      e.require(u.bonus > 0, "Нет бонусного действия");
      u.bonus--;
    } else if (cost === "reaction") {
      e.require(u.reaction > 0 && this.canReact(e, f.actor), "Нет реакции");
      u.reaction--;
    }
    if (f.free && f.spell === "findSteed") {
      e.require(
        u.counters.faithful_steed?.current > 0,
        "Нет бесплатного применения",
      );
      u.counters.faithful_steed.current--;
    } else if (f.item) {
      for (const k of f.spell === "stormSphere"
        ? ["storm_bracers", "storm_daily"]
        : ["vaeltir_focus"])
        u.counters[k].current--;
    } else if (f.level) {
      e.require(
        u.slotTurn !== e.s.turnSerial && u.slots[f.level]?.current > 0,
        "Ячейка недоступна",
      );
      u.slots[f.level].current--;
      u.slotTurn = e.s.turnSerial;
      f.paidSlot = true;
    }
  }
  static command(e, c, u) {
    this.init(e.s);
    if (c.kind === "cast") {
      const f = this.validate(e, c, u);
      this.pay(e, f, this.SPELLS[f.spell][2]);
      if (this.SPELLS[f.spell][6]) e.endConcentration(c.actor);
      e.s.spellFrames[f.id] = f;
      e.emit("cast", c.actor, u.name + ": " + this.SPELLS[f.spell][0] + ".", {
        spell: f.spell,
        level: f.level,
        targets: f.targets,
      });
      e.enqueue(this.task(c.actor, "window", { frame: f.id }));
      return true;
    }
    if (c.kind === "hand") {
      const effect = (e.s.effects || []).find(
          (x) => x.owner === c.actor && x.kind === "bigbyHand",
        ),
        o = effect && e.s.objects[effect.id];
      e.require(
        o && u.bonus > 0 && o.createdTurn < e.s.turnSerial,
        "Нужна рука и бонусное действие следующего хода",
      );
      this.validateHand(e, c, o, false);
      u.bonus--;
      e.enqueue(
        this.task(c.actor, "hand", {
          object: effect.id,
          ...c,
          kind: "magicTask",
          op: "hand",
        }),
      );
      return true;
    }
    if (c.kind === "stormStrike") {
      const effect = (e.s.effects || []).find(
          (x) => x.owner === c.actor && x.kind === "stormSphere",
        ),
        z = effect && e.s.zones.find((z) => z.effect === effect.id),
        v = e.unit(c.target);
      e.require(
        z &&
          u.bonus > 0 &&
          e.distance(z, v) <= 60 &&
          e.canSee(c.actor, c.target),
        "Нужны сфера, бонусное действие и видимая цель в 60 фт от сферы",
      );
      u.bonus--;
      this.attack(
        e,
        { actor: c.actor, spell: "stormSphere", level: 4, id: effect.id },
        c.target,
        {
          count: 4,
          die: 6,
          flat: 0,
          type: "lightning",
          bonus: 8,
          advantage: e.zoneAt(v, z),
        },
      );
      return true;
    }
    if (c.kind === "escapeMagic") {
      const o = Object.values(e.s.objects).find((x) => x.grappled === c.actor),
        web = u.statuses.find((x) => x.kind === "restrained" && x.magic);
      e.require(o || web, "Нет магического захвата");
      e.spendAction(c.actor);
      e.enqueue({
        kind: "roll",
        actor: c.actor,
        label: "Освободиться",
        count: 1,
        sides: 20,
        bonus: web
          ? (u.skills.athletics ?? u.stats.STR)
          : Math.max(
              u.skills.athletics ?? u.stats.STR,
              u.skills.acrobatics ?? u.stats.DEX,
            ),
        dc: o ? o.dc : web.dc,
        next: this.task(c.actor, "itemSave", {
          target: c.actor,
          remove: o ? "hand" : "web",
          object: o?.id,
        }),
      });
      return true;
    }
    if (c.kind === "attackObject") {
      const o = e.s.objects[c.object],
        spec = (
          typeof module !== "undefined"
            ? require("./advanced_features").CombatAdvancedFeatures
            : CombatAdvancedFeatures
        ).weaponSpec(e, c.actor, e.attackSpec(c.actor, c.weapon));
      e.require(
        o && e.distance(u, o) <= spec.range && e.wallLOS(u, o),
        "Предмет вне дистанции",
      );
      e.validateAmmunition(c.actor, spec);
      if (this.effects(e, c.actor, "slow").length) {
        e.require(
          u.slowAttacks !== e.s.turnSerial,
          "Замедление: только одна атака за ход",
        );
        u.slowAttacks = e.s.turnSerial;
      }
      e.require(
        u.attacksLeft > 0 || u.action > 0 || u.surgeAction > 0,
        "Нет атаки",
      );
      if (u.attacksLeft > 0) u.attacksLeft--;
      else {
        e.spendAction(c.actor);
        u.attacksLeft = (u.features.extraAttack || 1) - 1;
      }
      const adv = e.has(c.actor, "aim") || e.has(c.actor, "invisible"),
        ranged = !["melee", "meleeSpell"].includes(spec.kind),
        disadv =
          ["restrained", "poisoned", "prone", "frightened", "blinded"].some(
            (k) => e.has(c.actor, k),
          ) ||
          e.has(c.actor, "sap") ||
          (ranged &&
            !(u.features.sharpshooter && spec.kind === "ranged") &&
            (e.distance(u, o) > (spec.normalRange || spec.range) ||
              e
                .enemies(c.actor)
                .some(
                  (id) =>
                    e.distance(u, e.unit(id)) <= 5 &&
                    !e.incapacitated(id) &&
                    e.canSee(id, c.actor),
                )));
      e.removeStatus(c.actor, "aim");
      e.removeStatus(c.actor, "sap");
      e.removeStatus(c.actor, "invisible");
      u.hidden = false;
      e.spendAmmo(u, spec);
      e.enqueue({
        kind: "roll",
        actor: c.actor,
        count: 1,
        sides: 20,
        bonus: spec.bonus,
        mode: adv === disadv ? 0 : adv ? 1 : -1,
        attackRoll: true,
        dc: o.ac,
        label: "Атака руки",
        next: this.task(c.actor, "objectHit", { object: c.object, spec }),
      });
      return true;
    }
    return false;
  }
  static finishSteed(e, f) {
    const u = e.unit(f.actor),
      lv = f.level,
      id = f.actor + "-steed";
    e.require(
      ["celestial", "fey", "fiend"].includes(f.steedType),
      "Выбери природу скакуна",
    );
    const A =
      typeof module !== "undefined"
        ? require("./campaign_adapter").CombatCampaignAdapter
        : CombatCampaignAdapter;
    const p = {
      name: "Верный скакун",
      hp: 5 + 10 * lv,
      ac: 10 + lv,
      speed: 60,
      size: 3,
      scores: { STR: 18, DEX: 12, CON: 14, INT: 6, WIS: 12, CHA: 8 },
      proficiency: u.proficiency,
      features: {},
      attacks: [
        {
          id: "strike",
          name: "Потусторонний удар",
          kind: "melee",
          count: 1,
          die: 8,
          flat: lv,
          bonus: u.casting.attack,
          range: 5,
          damageType:
            f.steedType === "fiend"
              ? "fire"
              : f.steedType === "fey"
                ? "psychic"
                : "radiant",
        },
      ],
    };
    const exists = Boolean(e.s.units[id]);
    if (exists) this.dismissSummon(e, id);
    e.s.units[id] = A.unit(id, p, {
      ...f.point,
      team: u.team,
      controlled: u.controlled,
    });
    if (!exists) e.s.order.push(id);
    e.s.initiative[id] = e.s.initiative[f.actor];
    Object.assign(e.s.units[id], {
      summoner: f.actor,
      creatureType: f.steedType,
      summonLevel: lv,
      summonDC: u.casting.dc,
      powerAvailable: true,
    });
    e.emit("summon", f.actor, "Призван Верный скакун.", { target: id });
  }
  static dismissSummon(e, id) {
    const u = e.unit(id);
    // Remove only this incarnation's links; shared Bless/Aid keep other targets.
    this.remove(
      e,
      e.s.effects.filter((x) => x.owner === id).map((x) => x.id),
    );
    for (const x of e.s.effects) x.targets = x.targets.filter((v) => v !== id);
    for (const v of Object.values(e.s.units))
      v.statuses = v.statuses.filter(
        (z) =>
          z.source !== id &&
          z.expiresOnSourceStart !== id &&
          z.expiresOnSourceEnd !== id,
      );
    for (const o of Object.values(e.s.objects))
      if (o.grappled === id) o.grappled = null;
    u.statuses = [];
    u.temp = 0;
    delete u.tempSource;
    u.fled = true;
    u.action = 0;
    u.bonus = 0;
    u.reaction = 0;
    u.move = 0;
    e.emit("summonEnded", u.summoner, "Верный скакун исчезает.", {
      target: id,
    });
  }
  static maintain(e) {
    this.remove(
      e,
      e.s.effects
        .filter(
          (x) =>
            x.kind === "wardingBond" &&
            (!e.active(x.owner) ||
              x.targets.some(
                (id) =>
                  !e.s.units[id] ||
                  e.distance(e.unit(x.owner), e.unit(id)) > 60,
              )),
        )
        .map((x) => x.id),
    );
    for (const id of e.s.order) {
      const u = e.unit(id);
      if (u.summoner && !u.fled && (u.hp === 0 || e.unit(u.summoner).dead))
        this.dismissSummon(e, id);
    }
  }
  static frame(e, id) {
    const f = e.s.spellFrames[id];
    e.require(f, "Потерян этап заклинания");
    return f;
  }
  static eligibleCounter(e, f) {
    return e.s.order.filter((id) => {
      const u = e.unit(id);
      return (
        !f.offered.includes(id) &&
        u.team !== e.unit(f.actor).team &&
        u.reaction > 0 &&
        this.canReact(e, id) &&
        !e.incapacitated(id) &&
        u.casting?.prepared.includes("counterspell") &&
        u.slotTurn !== e.s.turnSerial &&
        Object.entries(u.slots).some(([n, p]) => +n >= 3 && p.current > 0) &&
        e.distance(u, e.unit(f.actor)) <= 60 &&
        e.canSee(id, f.actor)
      );
    });
  }
  static decision(e, c, p) {
    if (p.kind !== "magicChoice") return false;
    e.require(p.options.includes(c.choice), "Неверный выбор");
    const u = e.unit(p.actor);
    if (p.choice === "counterspell") {
      const f = this.frame(e, p.frame);
      f.offered.push(p.actor);
      e.enqueue(this.task(f.actor, "window", { frame: f.id }));
      if (c.choice === "yes") {
        const level = Number(
          c.level ??
            Object.keys(u.slots)
              .map(Number)
              .sort((a, b) => a - b)
              .find((n) => n >= 3 && u.slots[n].current > 0),
        );
        e.require(level >= 3 && u.slots[level]?.current > 0, "Нет ячейки");
        const child = {
          id: "spell-" + ++e.s.sequence,
          actor: p.actor,
          spell: "counterspell",
          level,
          targets: [f.actor],
          targetFrame: f.id,
          offered: [],
          cancelled: false,
        };
        this.pay(e, child, "reaction");
        e.s.spellFrames[child.id] = child;
        e.emit("cast", p.actor, u.name + ": Контрзаклинание.", {
          spell: "counterspell",
          targetFrame: f.id,
        });
        e.enqueue(this.task(p.actor, "window", { frame: child.id }));
      }
    } else if (p.choice === "missileShield") {
      if (c.choice === "yes") {
        const f = {
          id: "spell-" + ++e.s.sequence,
          actor: p.actor,
          spell: "shield",
          level: 1,
          targets: [p.actor],
          offered: [],
          cancelled: false,
          after: p.next,
        };
        if (u.counters.shield_magic_initiate?.current > 0) {
          u.counters.shield_magic_initiate.current--;
          u.reaction--;
        } else {
          f.level = Object.keys(u.slots)
            .map(Number)
            .sort((a, b) => a - b)
            .find((n) => u.slots[n].current > 0);
          this.pay(e, f, "reaction");
        }
        e.s.spellFrames[f.id] = f;
        e.enqueue(this.task(p.actor, "window", { frame: f.id }));
      } else e.enqueue(p.next);
    } else if (p.choice === "vitality") {
      if (c.choice !== "skip") {
        e.require(p.targets.includes(c.target), "Выбери цель лечения");
        this.healing(e, p.actor, c.target, 2, 6, 0, "Аура жизненной силы");
      }
    } else return this.advancedDecision(e, c, p);
    return true;
  }
  static choice(e, actor, choice, options, data = {}) {
    e.decision("magicChoice", actor, { choice, options, ...data });
  }
  static taskRun(e, t) {
    if (t.kind !== "magicTask") return false;
    this.init(e.s);
    e.require(this.OPS.has(t.op), "Неизвестный магический этап");
    const u = e.unit(t.actor);
    if (t.op === "window") {
      const f = this.frame(e, t.frame);
      if (f.cancelled) {
        if (f.hitContinue) e.enqueue(f.hitContinue);
        if (f.after) e.enqueue(f.after);
        return true;
      }
      const id = this.eligibleCounter(e, f)[0];
      if (id) {
        if (e.unit(id).controlled)
          this.choice(e, id, "counterspell", ["yes", "no"], { frame: f.id });
        else
          this.decision(
            e,
            { choice: "yes" },
            {
              kind: "magicChoice",
              actor: id,
              choice: "counterspell",
              options: ["yes", "no"],
              frame: f.id,
            },
          );
      } else e.enqueue(this.task(f.actor, "resolve", { frame: f.id }));
    } else if (t.op === "counterResult") {
      const parent = this.frame(e, t.targetFrame);
      if (!t.result.success) {
        parent.cancelled = true;
        if (parent.paidSlot) {
          const v = e.unit(parent.actor);
          v.slots[parent.level].current++;
          if (v.slotTurn === e.s.turnSerial) delete v.slotTurn;
          parent.paidSlot = false;
        }
        e.emit(
          "counterspell",
          t.actor,
          "Заклинание прервано; исходная ячейка сохранена.",
          { targetFrame: parent.id },
        );
      } else
        e.emit(
          "counterspell",
          t.actor,
          "Заклинание выдержало Контрзаклинание.",
          { targetFrame: parent.id },
        );
    } else if (t.op === "resolve") {
      const f = this.frame(e, t.frame);
      if (!f.cancelled) this.resolve(e, f);
      else if (f.hitContinue) e.enqueue(f.hitContinue);
      if (f.after) e.enqueue(f.after);
    } else if (t.op === "areaRoll") {
      const f = this.frame(e, t.frame);
      e.enqueue(
        ...t.targets.map((target) =>
          this.task(t.actor, "apply", {
            frame: f.id,
            target,
            amount: t.result.total,
            ...t.effect,
          }),
        ),
      );
    } else if (t.op === "apply") {
      if (t.halfMiss) {
        this.apply(e, t, false);
        return true;
      }
      const f = this.frame(e, t.frame);
      if (f.sculpt?.includes(t.target)) {
        e.emit(
          "sculpt",
          t.actor,
          "Скульптура: " + e.name(t.target) + ", 0 урона.",
          { target: t.target },
        );
        return true;
      }
      if (t.stat)
        e.enqueue(
          e.saveTask(
            t.target,
            t.stat,
            t.dc ?? u.casting.dc,
            this.task(t.actor, "save", { ...t, kind: "magicTask", op: "save" }),
            { origin: f.point || e.unit(t.actor) },
          ),
        );
      else this.apply(e, t, false);
    } else if (t.op === "save") this.apply(e, t, t.result.success);
    else if (t.op === "heal") e.heal(t.target, t.result.total);
    else if (t.op === "missile") this.missile(e, t);
    else if (t.op === "missileDamage") {
      if (!e.has(t.target, "shield"))
        e.enqueue({
          kind: "damage",
          actor: t.actor,
          target: t.target,
          amount: t.result.total,
          damageType: "force",
        });
      else e.emit("shieldBlocked", t.target, "Щит блокирует Волшебную стрелу.");
    } else if (t.op === "hand") this.hand(e, t);
    else if (t.op === "handSave") this.handSave(e, t);
    else if (t.op === "handAttack") {
      // Resume pre-30.5.1 saves without rolling or paying a second time.
      const o = e.s.objects[t.object];
      if (o) {
        const attack = this.handAttack(e, t.actor, t.target, o);
        e.enqueue({
          ...attack,
          kind: "attackResult",
          result: t.result,
          modifiers: e.attackModifiers(t.actor, t.target, attack.spec, null, o),
        });
      }
    } else if (t.op === "handDamage")
      e.enqueue({
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount: t.result.total,
        damageType: t.damageType || "force",
        attack: t.attack || null,
        critical: t.critical,
      });
    else if (t.op === "repeat") {
      if (t.result.success) {
        const x = e.s.effects.find((x) => x.id === t.effect);
        if (x) x.targets = x.targets.filter((id) => id !== t.target);
      }
    } else if (t.op === "dispel") {
      if (t.result.success) this.remove(e, [t.effect]);
    } else if (t.op === "stormTick") {
      const x = e.s.effects.find((x) => x.id === t.effect);
      if (x)
        this.area(
          e,
          {
            actor: x.owner,
            spell: "stormSphere",
            level: 4,
            id: t.effect,
            sculpt: [],
            dc: 16,
          },
          [t.target],
          2,
          6,
          0,
          { stat: "STR", dc: 16, type: "bludgeoning", half: false },
        );
    } else if (t.op === "extraDamage")
      e.enqueue({
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount: t.result.total,
        damageType: t.damageType,
        attack: t.attack,
        attackHit: t.attackHit,
      });
    else if (t.op === "leafSplit") {
      const ratio = t.result.total <= 3 ? 0.5 : t.result.total <= 5 ? 0.75 : 1,
        transferred = Math.floor(t.damage.amount * ratio);
      e.emit(
        "damageTransfer",
        t.actor,
        "Кольца Корня и Листа: перенос " + transferred + " урона.",
        {
          target: t.recipient,
          roll: t.result.total,
          ratio,
          amount: transferred,
        },
      );
      e.enqueue(
        {
          ...e.reduceDamage(t.damage, transferred),
          leafResolved: true,
          mitigated: true,
        },
        {
          kind: "damage",
          actor: t.actor,
          target: t.recipient,
          amount: transferred,
          damageType: t.damage.damageType,
          finalTransfer: true,
          mitigated: true,
        },
      );
    } else if (t.op === "itemSave") {
      if (t.result.success) {
        const previous = e.speed(t.target);
        if (t.remove === "hand") {
          const o = e.s.objects[t.object];
          if (o) o.grappled = null;
        } else
          e.unit(t.target).statuses = e
            .unit(t.target)
            .statuses.filter((x) => !x.magic);
        e.adjustMovementForSpeed(t.target, previous);
      }
    } else if (t.op === "shadowSearch") {
      if (t.result.success) {
        const v = e.unit(t.target);
        v.hidden = false;
        e.removeStatus(t.target, "invisible");
        e.emit(
          "found",
          t.actor,
          e.name(t.actor) + " обнаруживает " + v.name + ".",
          { target: t.target },
        );
      }
    } else if (t.op === "objectHit") {
      const o = e.s.objects[t.object];
      if (o)
        e.emit(
          "objectAttack",
          t.actor,
          e.name(t.actor) +
            ": " +
            t.spec.name +
            " → Рука Бигби; " +
            t.result.total +
            " против КД " +
            o.ac +
            ".",
          {
            object: o.id,
            hit:
              t.result.kept === 20 ||
              (t.result.kept !== 1 && t.result.total >= o.ac),
            critical: t.result.kept === 20,
          },
        );
      if (
        o &&
        (t.result.kept === 20 ||
          (t.result.kept !== 1 && t.result.total >= o.ac))
      )
        e.enqueue({
          kind: "roll",
          actor: t.actor,
          label: "Урон предмету",
          count: t.spec.count * (t.result.kept === 20 ? 2 : 1),
          sides: t.spec.die,
          bonus: t.spec.flat,
          minimumDie:
            u.features.greatWeaponFighting && t.spec.twoHanded ? 3 : 0,
          next: this.task(t.actor, "objectDamage", {
            object: t.object,
            spec: t.spec,
          }),
        });
    } else if (t.op === "objectDamage") {
      const o = e.s.objects[t.object];
      if (o) {
        o.hp = Math.max(
          0,
          o.hp -
            t.result.total *
              (t.spec.id === "forgeMaul" && u.equipment?.forgeAttuned ? 2 : 1),
        );
        e.emit("objectDamage", t.actor, "Рука: осталось " + o.hp + " ПЗ.", {
          object: t.object,
        });
        if (!o.hp) this.remove(e, [t.object]);
      }
    } else if (!this.advancedTask(e, t))
      throw Error("Неизвестный этап магии: " + t.op);
    return true;
  }
  static empowered(e, f) {
    const u = e.unit(f.actor);
    return u.features.empoweredEvocation &&
      this.SPELLS[f.spell]?.[5] === "evocation" &&
      !f.item
      ? u.stats.INT
      : 0;
  }
  static area(e, f, targets, count, sides, flat, effect) {
    this.init(e.s);
    e.s.spellFrames[f.id] ??= f;
    e.enqueue({
      kind: "roll",
      actor: f.actor,
      label: this.SPELLS[f.spell]?.[0] || "Урон",
      count,
      sides,
      bonus: flat,
      next: this.task(f.actor, "areaRoll", { frame: f.id, targets, effect }),
    });
  }
  static areaTargets(e, f, range, shape = "radius") {
    const u = e.unit(f.actor),
      p = f.point;
    return e.s.order.filter((id) => {
      const v = e.unit(id);
      if (v.dead || !e.wallLOS(shape === "radius" ? p : u, v)) return false;
      const dx = v.x - u.x,
        dy = v.y - u.y,
        vx = p.x - u.x,
        vy = p.y - u.y,
        d = Math.hypot(dx, dy) * 5;
      if (shape === "cone")
        return (
          id !== f.actor &&
          d <= range &&
          dx * vx + dy * vy >=
            Math.hypot(dx, dy) * Math.hypot(vx, vy) * Math.SQRT1_2 - 1e-7
        );
      if (shape === "cube") {
        const ax = Math.abs(vx) >= Math.abs(vy),
          forward = ax ? dx * Math.sign(vx) : dy * Math.sign(vy),
          side = ax ? dy : dx;
        return forward >= 1 && forward <= 3 && Math.abs(side) <= 1;
      }
      return Math.hypot(v.x - p.x, v.y - p.y) * 5 <= range;
    });
  }
  static healing(e, actor, target, count, sides, flat, label) {
    if (this.effects(e, target, "beaconHope").length)
      e.heal(target, count * sides + flat);
    else
      e.enqueue({
        kind: "roll",
        actor,
        label,
        count,
        sides,
        bonus: flat,
        next: this.task(actor, "heal", { target }),
      });
  }
  static resolve(e, f) {
    const u = e.unit(f.actor),
      lv = f.level,
      dc = f.dc || u.casting?.dc || 10,
      ev = this.empowered(e, f),
      targets = f.targets || [],
      t = targets[0],
      p = f.point;
    this.init(e.s);
    if (f.spell === "counterspell") {
      const parent = this.frame(e, f.targetFrame);
      if (!parent.cancelled)
        e.enqueue(
          e.saveTask(
            parent.actor,
            "CON",
            dc,
            this.task(f.actor, "counterResult", { targetFrame: parent.id }),
          ),
        );
      return;
    }
    switch (f.spell) {
      case "findSteed":
        this.finishSteed(e, f);
        break;
      case "divineSmite": {
        const extra = ["fiend", "undead"].includes(e.unit(t).creatureType)
          ? 1
          : 0;
        e.enqueue({
          kind: "roll",
          actor: f.actor,
          label: "Божественная кара",
          count: (1 + lv + extra) * (f.critical ? 2 : 1),
          sides: 8,
          bonus: 0,
          next: f.hitContinue
            ? { ...f.hitContinue, smiteResult: true }
            : this.task(f.actor, "extraDamage", {
                target: t,
                damageType: "radiant",
              }),
        });
        break;
      }
      case "shield":
        e.status(f.actor, "shield", { expiresAtStart: f.actor });
        break;
      case "fireBolt":
      case "rayFrost": {
        const count =
          u.casting.level >= 17
            ? 4
            : u.casting.level >= 11
              ? 3
              : u.casting.level >= 5
                ? 2
                : 1;
        this.attack(e, f, t, {
          count,
          die: f.spell === "fireBolt" ? 10 : 8,
          flat: ev,
          type: f.spell === "fireBolt" ? "fire" : "cold",
          potent: u.features.potentCantrip,
        });
        break;
      }
      case "mindSliver":
        this.area(
          e,
          f,
          targets,
          u.casting.level >= 17
            ? 4
            : u.casting.level >= 11
              ? 3
              : u.casting.level >= 5
                ? 2
                : 1,
          6,
          0,
          {
            stat: "INT",
            dc,
            type: "psychic",
            half: !!u.features.potentCantrip,
            condition: "mindSliver",
          },
        );
        break;
      case "fireball":
        this.area(e, f, this.areaTargets(e, f, 20), 8 + lv - 3, 6, ev, {
          stat: "DEX",
          dc,
          type: "fire",
          half: true,
        });
        break;
      case "coneCold":
        this.area(e, f, this.areaTargets(e, f, 60, "cone"), 8 + lv - 5, 8, ev, {
          stat: "CON",
          dc,
          type: "cold",
          half: true,
        });
        break;
      case "thunderwave":
        this.area(e, f, this.areaTargets(e, f, 15, "cube"), 2 + lv - 1, 8, ev, {
          stat: "CON",
          dc,
          type: "thunder",
          half: true,
          push: 10,
        });
        break;
      case "burningHands":
        this.area(e, f, this.areaTargets(e, f, 15, "cone"), 3 + lv - 1, 6, ev, {
          stat: "DEX",
          dc,
          type: "fire",
          half: true,
        });
        break;
      case "drainingWave":
        this.area(e, f, this.areaTargets(e, f, 30, "cone"), 4, 6, 0, {
          stat: "CON",
          dc,
          type: "necrotic",
          half: true,
        });
        break;
      case "scorchingRay":
        for (let i = lv; i >= 0; i--)
          this.attack(e, f, targets[i % targets.length], {
            count: 2,
            die: 6,
            flat: i === 0 ? ev : 0,
            type: "fire",
          });
        break;
      case "magicMissile": {
        const jobs = [];
        for (let i = 0; i < lv + 2; i++)
          jobs.push(
            this.task(f.actor, "missile", {
              frame: f.id,
              target: targets[i % targets.length],
              empowered: i === 0 ? ev : 0,
            }),
          );
        e.enqueue(...jobs);
        break;
      }
      case "cureWounds":
        this.healing(
          e,
          f.actor,
          t,
          2 * lv,
          8,
          u.stats[u.casting.ability],
          this.SPELLS[f.spell][0],
        );
        break;
      case "mageArmor":
        this.remove(
          e,
          this.effects(e, t, "mageArmor").map((x) => x.id),
        );
        this.add(e, f, "mageArmor", targets, 28800);
        break;
      case "mistyStep":
      case "dimensionDoor":
        Object.assign(u, p);
        if (f.passenger) Object.assign(e.unit(f.passenger), f.passengerPoint);
        u.hidden = false;
        e.removeStatus(f.actor, "invisible");
        e.releaseGrapples();
        e.emit(
          "teleport",
          f.actor,
          u.name + " перемещается в " + e.cell(p) + ".",
        );
        break;
      case "greaterInvisibility":
      case "shieldFaith":
      case "beaconHope":
      case "fly":
      case "seeming":
      case "protectionEvil":
        this.add(
          e,
          f,
          f.spell,
          targets,
          f.spell === "seeming" ? 28800 : this.SPELLS[f.spell][6],
        );
        break;
      case "bless":
        this.add(e, f, "bless", targets, 60);
        break;
      case "heroism": {
        const x = this.add(e, f, "heroism", targets, 60, {
          amount: Math.max(0, u.stats[u.casting.ability]),
        });
        for (const id of targets) this.heroTemp(e, id, x);
        break;
      }
      case "aid": {
        const amount = 5 * (lv - 1);
        for (const id of targets) {
          const existing = this.effects(e, id, "aid")[0];
          if (existing && existing.amount >= amount) continue;
          if (existing) this.remove(e, [existing.id]);
          const v = e.unit(id);
          v.max += amount;
          e.heal(id, amount);
          this.add(e, f, "aid", [id], 28800, { amount });
        }
        break;
      }
      case "lesserRestoration": {
        const v = e.unit(t);
        const condition = f.condition || this.restorationOptions(e, t)[0];
        e.removeStatus(t, condition);
        if (condition === "paralyzed") {
          const holds = this.effects(e, t, "holdMonster");
          for (const x of holds) x.targets = x.targets.filter((id) => id !== t);
          this.remove(
            e,
            holds.filter((x) => !x.targets.length).map((x) => x.id),
          );
        }
        break;
      }
      case "wardingBond":
        this.remove(
          e,
          e.s.effects
            .filter(
              (x) =>
                x.kind === "wardingBond" &&
                [f.actor, ...targets].some(
                  (id) => x.owner === id || x.targets.includes(id),
                ),
            )
            .map((x) => x.id),
        );
        this.add(e, f, "wardingBond", targets, 3600);
        break;
      case "crusaderMantle":
        this.add(e, f, "crusaderMantle", [], 60, { aura: 30 });
        break;
      case "auraVitality": {
        const x = this.add(e, f, "auraVitality", [], 60, { aura: 30 });
        this.vitality(e, x);
        break;
      }
      case "slow":
      case "holdMonster":
      case "command":
      case "compelledDuel":
        e.enqueue(
          ...targets.map((target) =>
            this.task(f.actor, "apply", {
              frame: f.id,
              target,
              stat: "WIS",
              dc,
              condition: f.spell,
            }),
          ),
        );
        break;
      case "fogCloud":
      case "web":
      case "zoneTruth":
      case "stormSphere": {
        const duration =
            f.spell === "zoneTruth" ? 600 : this.SPELLS[f.spell][6],
          x = this.add(e, f, f.spell, [], duration);
        const z = {
          ...p,
          id: x.id,
          kind: f.spell === "fogCloud" ? "smoke" : f.spell,
          owner: f.actor,
          effect: x.id,
          radius: f.spell === "fogCloud" ? 20 * lv : 20,
          ...(f.spell === "web"
            ? { shape: "cube", cells: 4, x: p.x - 1, y: p.y - 1 }
            : {}),
          until: x.until,
          concentration: x.concentration,
        };
        e.s.zones.push(z);
        if (f.spell === "stormSphere")
          this.area(e, { ...f, dc: 16 }, this.areaTargets(e, f, 20), 2, 6, 0, {
            stat: "STR",
            dc: 16,
            type: "bludgeoning",
            half: false,
          });
        if (f.spell === "zoneTruth") this.zoneTruth(e, z);
        break;
      }
      case "bigbyHand": {
        const x = this.add(e, f, "bigbyHand", [], 60);
        e.s.objects[x.id] = {
          id: x.id,
          ...p,
          owner: f.actor,
          hp: u.max,
          max: u.max,
          ac: 20,
          dc,
          createdTurn: e.s.turnSerial,
          grappled: null,
          interposing: false,
        };
        e.enqueue(
          this.task(f.actor, "hand", {
            object: x.id,
            point: p,
            target: f.target || t,
            handMode: f.handMode,
          }),
        );
        break;
      }
      case "dispelMagic": {
        const selected = f.dispelTarget || { kind: "creature", id: t };
        const effects = (e.s.effects || []).filter(
          (x) =>
            Object.hasOwn(this.SPELLS, x.kind) &&
            (selected.kind === "creature"
              ? x.targets?.includes(selected.id) ||
                (x.owner === selected.id && x.aura)
              : x.id === selected.id),
        );
        for (const x of effects) {
          if (x.level <= lv) this.remove(e, [x.id]);
          else
            e.enqueue({
              kind: "roll",
              actor: f.actor,
              label: "Рассеивание магии",
              count: 1,
              sides: 20,
              bonus: u.stats[u.casting.ability],
              dc: 10 + x.level,
              next: this.task(f.actor, "dispel", { effect: x.id }),
            });
        }
        break;
      }
      case "mageHand":
        this.add(e, f, "mageHand", [], 60, { point: p });
        e.emit(
          "utility",
          f.actor,
          "Рука переносит до 10 фунтов; атаки недоступны.",
        );
        break;
      case "prestidigitation":
        e.emit("utility", f.actor, "Небольшой бытовой или иллюзорный эффект.");
        break;
      default:
        throw Error("Нет обработчика заклинания " + f.spell);
    }
  }
  static attack(e, f, target, a) {
    const u = e.unit(f.actor);
    e.enqueue({
      kind: "attackRoll",
      actor: f.actor,
      target,
      mode: "spell",
      spec: {
        id: f.spell,
        name: this.SPELLS[f.spell][0],
        kind: "rangedSpell",
        count: a.count,
        die: a.die,
        flat: a.flat,
        bonus: a.bonus ?? u.casting.attack,
        range: this.SPELLS[f.spell][3] || 600,
        damageType: a.type,
        spellKey: f.spell,
        potent: !!a.potent,
        magicAdvantage: !!a.advantage,
        ...(f.spell === "rayFrost"
          ? {
              effects: [
                {
                  handler: "onHitCondition",
                  condition: "frost",
                  duration: "source-next-start",
                },
              ],
            }
          : {}),
      },
    });
  }
  static afterMiss(e, t) {
    if (!t.spec.potent) return false;
    e.enqueue({
      kind: "roll",
      actor: t.actor,
      label: "Мощный заговор · половина урона",
      count: t.spec.count,
      sides: t.spec.die,
      bonus: t.spec.flat,
      next: this.task(t.actor, "apply", {
        frame: "",
        target: t.target,
        type: t.spec.damageType,
        halfMiss: true,
      }),
    });
    return true;
  }
  static apply(e, t, passed) {
    const f = t.frame ? this.frame(e, t.frame) : {},
      u = e.unit(t.actor);
    if (
      t.condition === "holdMonster" &&
      e.unit(t.target).conditionImmunities.includes("paralyzed")
    )
      return;
    let amount = t.amount ?? t.result?.total ?? 0;
    if (t.halfMiss) amount = Math.floor(amount / 2);
    else if (t.type) {
      if (
        t.stat === "DEX" &&
        t.half &&
        e.unit(t.target).features.evasion &&
        !e.incapacitated(t.target)
      )
        amount = passed ? 0 : Math.floor(amount / 2);
      else if (passed) amount = t.half ? Math.floor(amount / 2) : 0;
    }
    if (t.type && amount > 0) {
      const job = {
        kind: "damage",
        actor: t.actor,
        target: t.target,
        amount,
        damageType: t.type,
      };
      if (
        passed &&
        t.stat === "DEX" &&
        t.half &&
        e.unit(t.target).features.shieldMaster &&
        e.unit(t.target).features.shieldEquipped &&
        e.unit(t.target).reaction > 0 &&
        this.canReact(e, t.target) &&
        !e.incapacitated(t.target)
      ) {
        this.choice(e, t.target, "shieldMaster", ["yes", "no"], {
          damage: job,
        });
      } else e.enqueue(job);
    }
    if (passed) return;
    if (t.push) this.push(e, t.target, e.unit(t.actor), t.push);
    if (t.condition === "mindSliver")
      e.unit(t.target).mindSliver = { until: e.s.elapsed + 6 };
    else if (["slow", "holdMonster", "compelledDuel"].includes(t.condition)) {
      this.add(e, f, t.condition, [t.target], 60);
      if (t.condition === "holdMonster") e.endConcentration(t.target);
    } else if (t.condition === "command") {
      this.add(e, f, "command", [t.target], 60, {
        remaining: 1,
        concentration: false,
      });
    } else if (t.condition === "web") {
      e.status(t.target, "restrained", {
        magic: true,
        dc: t.dc,
        source: t.actor,
        until: e.s.elapsed + 3600,
        effect: t.effect,
      });
    } else if (t.condition === "zoneTruth")
      e.unit(t.target).truthZone = t.effect;
  }
  static missile(e, t) {
    const u = e.unit(t.target);
    if (e.has(t.target, "shield")) {
      e.emit("shieldBlocked", t.target, "Щит блокирует Волшебную стрелу.");
      return;
    }
    if (
      !t.offered &&
      u.features.shieldSpell &&
      u.reaction > 0 &&
      this.canReact(e, t.target) &&
      !e.incapacitated(t.target) &&
      (u.counters.shield_magic_initiate?.current > 0 ||
        (u.slotTurn !== e.s.turnSerial &&
          Object.values(u.slots).some((p) => p.current > 0)))
    ) {
      this.choice(e, t.target, "missileShield", ["yes", "no"], {
        next: { ...t, offered: true },
      });
      return;
    }
    e.enqueue({
      kind: "roll",
      actor: t.actor,
      label: "Волшебная стрела",
      count: 1,
      sides: 4,
      bonus: 1 + t.empowered,
      next: this.task(t.actor, "missileDamage", { target: t.target }),
    });
  }
  static validateHand(e, c, o, creation) {
    const p = c.point || o;
    e.require(
      e.inside(p) && !e.wall(p) && e.distance(o, p) <= (creation ? 0 : 60),
      "Рука перемещается не дальше 60 фт",
    );
    const mode = c.handMode || "interpose";
    e.require(
      ["fist", "push", "grasp", "crush", "interpose", "move"].includes(mode),
      "Выбери режим руки",
    );
    if (!["interpose", "move"].includes(mode)) {
      const v = e.unit(c.target || c.targets?.[0]);
      e.require(
        e.canSee(c.actor, c.target || c.targets[0]) && e.distance(p, v) <= 5,
        "Цель должна быть видна и в 5 фт от руки",
      );
      if (mode === "crush")
        e.require(o.grappled === c.target, "Рука должна удерживать эту цель");
      if (["push", "grasp"].includes(mode))
        e.require(v.size <= 4, "Цель Огромного размера или меньше");
    }
  }
  static restorationOptions(e, id) {
    return ["blinded", "deafened", "paralyzed", "poisoned"].filter((kind) =>
      e.has(id, kind),
    );
  }
  static handAttack(e, actor, target, o) {
    const x = e.s.effects.find((x) => x.id === o.id),
      u = e.unit(actor);
    return {
      kind: "attackRoll",
      actor,
      target,
      mode: "spell",
      magicObject: o.id,
      origin: { x: o.x, y: o.y },
      spec: {
        id: "bigbyFist",
        name: "Кулак Бигби",
        kind: "meleeSpell",
        range: 5,
        bonus: u.casting.attack,
        count: 5 + 2 * (x.level - 5),
        die: 8,
        flat:
          !o.empoweredUsed && u.features.empoweredEvocation ? u.stats.INT : 0,
        damageType: "force",
      },
    };
  }
  static hand(e, t) {
    const o = e.s.objects[t.object];
    if (!o) return;
    const p = t.point || o,
      mode = t.handMode || "interpose";
    if (o.grappled && e.distance(p, e.unit(o.grappled)) > 5) o.grappled = null;
    Object.assign(o, p);
    o.interposing = mode === "interpose";
    const v = t.target && e.unit(t.target);
    if (mode === "fist") e.enqueue(this.handAttack(e, t.actor, t.target, o));
    else if (["grasp", "push"].includes(mode))
      e.enqueue(
        e.saveTask(
          t.target,
          mode === "grasp" ? "DEX" : "STR",
          o.dc,
          this.task(t.actor, "handSave", {
            object: t.object,
            target: t.target,
            handMode: mode,
          }),
        ),
      );
    else if (mode === "crush") {
      const x = e.s.effects.find((x) => x.id === o.id);
      e.enqueue({
        kind: "roll",
        actor: t.actor,
        label: "Сдавливание Бигби",
        count: 4 + 2 * (x.level - 5),
        sides: 6,
        bonus: e.unit(t.actor).stats[e.unit(t.actor).casting.ability],
        next: this.task(t.actor, "handDamage", {
          target: t.target,
          damageType: "bludgeoning",
        }),
      });
    }
    e.emit("hand", t.actor, "Рука Бигби: " + mode + ".", {
      object: o.id,
      target: t.target,
      point: { x: o.x, y: o.y },
    });
  }
  static handSave(e, t) {
    const o = e.s.objects[t.object];
    if (!o || t.result.success) return;
    if (t.handMode === "grasp") {
      const previous = e.speed(t.target);
      o.grappled = t.target;
      e.adjustMovementForSpeed(t.target, previous);
    } else {
      const p = { ...o };
      this.push(
        e,
        t.target,
        p,
        5 +
          5 *
            Math.max(0, e.unit(t.actor).stats[e.unit(t.actor).casting.ability]),
      );
      const v = e.unit(t.target);
      o.x = v.x - Math.sign(v.x - p.x);
      o.y = v.y - Math.sign(v.y - p.y);
    }
  }
  static push(e, id, from, feet) {
    const u = e.unit(id),
      dx = Math.sign(u.x - from.x),
      dy = Math.sign(u.y - from.y);
    if (!dx && !dy) return;
    for (let n = 0; n < feet / 5; n++) {
      const p = { x: u.x + dx, y: u.y + dy };
      if (e.wall(p) || e.occupied(p.x, p.y, id)) break;
      Object.assign(u, p);
    }
    e.releaseGrapples();
    e.emit("forcedMove", id, e.name(id) + " оттеснён в " + e.cell(u) + ".");
  }
  static heroTemp(e, id, x) {
    const u = e.unit(id);
    if (u.temp <= x.amount) {
      u.temp = x.amount;
      u.tempSource = x.id;
    }
  }
  static vitality(e, x) {
    const targets = e.s.order.filter(
      (id) =>
        e.unit(id).team === e.unit(x.owner).team &&
        !e.unit(id).dead &&
        e.distance(e.unit(id), e.unit(x.owner)) <= 30,
    );
    if (!targets.length) return;
    if (e.unit(x.owner).controlled)
      this.choice(e, x.owner, "vitality", ["heal", "skip"], { targets });
    else
      this.healing(
        e,
        x.owner,
        targets.sort(
          (a, b) => e.unit(a).hp / e.unit(a).max - e.unit(b).hp / e.unit(b).max,
        )[0],
        2,
        6,
        0,
        "Аура жизненной силы",
      );
  }
  static zoneTruth(e, z) {
    for (const id of e.s.order)
      if (e.zoneAt(e.unit(id), z) && e.unit(id).truthZone !== z.effect)
        e.enqueue(
          e.saveTask(
            id,
            "CHA",
            e.unit(z.owner).casting.dc,
            this.task(z.owner, "save", {
              frame: z.effect,
              target: id,
              condition: "zoneTruth",
              effect: z.effect,
            }),
          ),
        );
  }
  static startTurn(e, id) {
    this.init(e.s);
    const expired = e.s.effects.filter((x) => x.until <= e.s.elapsed);
    for (const x of expired)
      if (x.kind === "haste" && !x.noLethargy && x.concentration !== false)
        for (const id of x.targets)
          e.status(id, "incapacitated", { expiresAtEnd: id });
    const speeds = Object.fromEntries(e.s.order.map((id) => [id, e.speed(id)]));
    this.expireState(e.s, e.s.elapsed);
    for (const uid of e.s.order) e.adjustMovementForSpeed(uid, speeds[uid]);
    const u = e.unit(id);
    u.hasteAction = this.effects(e, id, "haste").length ? 1 : 0;
    if (e.incapacitated(id)) {
      u.action = 0;
      u.bonus = 0;
      u.move = 0;
    }
    for (const x of this.effects(e, id, "heroism")) this.heroTemp(e, id, x);
    for (const x of e.s.effects.filter(
      (x) => x.kind === "auraVitality" && x.owner === id,
    ))
      this.vitality(e, x);
    if (this.effects(e, id, "command").length) {
      u.action = 0;
      u.bonus = 0;
      u.move = 0;
      e.emit("command", id, "Приказ «Стой»: ход пропущен.");
    }
    for (const st of u.statuses.filter((z) => z.kind === "burning"))
      e.enqueue({
        kind: "roll",
        actor: e.s.units[st.source] ? st.source : id,
        label: "Горение",
        count: 1,
        sides: 4,
        bonus: 0,
        next: this.task(e.s.units[st.source] ? st.source : id, "extraDamage", {
          target: id,
          damageType: "fire",
        }),
      });
    for (const z of e.s.zones)
      if (e.zoneAt(u, z)) {
        if (z.kind === "web")
          e.enqueue(
            e.saveTask(
              id,
              "DEX",
              e.unit(z.owner).casting.dc,
              this.task(z.owner, "save", {
                frame: z.effect,
                target: id,
                condition: "web",
                effect: z.effect,
                dc: e.unit(z.owner).casting.dc,
              }),
            ),
          );
        if (z.kind === "zoneTruth") this.zoneTruth(e, z);
      }
  }
  static endTurn(e, t) {
    if (t.magicEndDone) return false;
    const jobs = [];
    for (const x of (e.s.effects || []).filter(
      (x) =>
        x.targets?.includes(t.actor) &&
        ["slow", "holdMonster"].includes(x.kind),
    ))
      jobs.push(
        e.saveTask(
          t.actor,
          "WIS",
          x.dc,
          this.task(x.owner, "repeat", { target: t.actor, effect: x.id }),
        ),
      );
    for (const z of e.s.zones)
      if (z.kind === "stormSphere" && e.zoneAt(e.unit(t.actor), z))
        jobs.push(
          this.task(z.owner, "stormTick", {
            target: t.actor,
            effect: z.effect,
          }),
        );
    const u = e.unit(t.actor);
    if (
      u.stealthAttackTurn === e.s.turnSerial &&
      (e.s.terrain.cover?.[u.x + "," + u.y] || 0) < 5
    ) {
      u.hidden = false;
      e.removeStatus(t.actor, "invisible");
    }
    for (const x of this.effects(e, t.actor, "command")) {
      x.remaining--;
      if (x.remaining <= 0) this.remove(e, [x.id]);
    }
    if (jobs.length) {
      e.enqueue(...jobs, { ...t, magicEndDone: true });
      return true;
    }
    return false;
  }
  static beforeCommand(e, c, u) {
    if (["policy", "endTurn", "endConcentration"].includes(c.kind)) return;
    const actionKinds = [
      "attack",
      "attackAt",
      "attackObject",
      "cast",
      "dash",
      "disengage",
      "dodge",
      "hide",
      "search",
      "check",
      "shove",
      "grapple",
      "ready",
      "helpAttack",
      "healPotion",
      "stabilize",
      "layOnHands",
      "secondWind",
      "hand",
      "stormStrike",
      "leafStep",
      "useItem",
      "abjure",
      "hasteAction",
    ];
    let kind =
      c.kind === "move"
        ? "move"
        : c.kind === "cast"
          ? this.SPELLS[c.spell]?.[2]
          : ["secondWind", "leafStep", "hand", "stormStrike"].includes(
                c.kind,
              ) ||
              c.mode === "bonus" ||
              (["dash", "disengage", "hide"].includes(c.kind) &&
                c.cost === "bonus")
            ? "bonus"
            : "action";
    if (c.kind === "useItem") {
      const k = u.equipment?.consumables?.[c.item];
      kind =
        !["acid", "alchemistFire"].includes(k) &&
        ([
          "heroismPotion",
          "speedPotion",
          "growthPotion",
          "climbingPotion",
          "giantStrength",
          "fireResistance",
        ].includes(k) ||
          (u.features.thiefHands && c.cost === "bonus"))
          ? "bonus"
          : "action";
    }
    if (this.effects(e, c.actor, "command").length)
      e.require(false, "Приказ «Стой»");
    if (
      this.effects(e, c.actor, "slow").length &&
      actionKinds.includes(c.kind)
    ) {
      if (u.slowChoice && u.slowChoice !== kind)
        e.require(false, "Замедление: действие или бонусное действие");
      if (["action", "bonus"].includes(kind)) u.slowChoice = kind;
      if (["attack", "attackAt"].includes(c.kind))
        e.require(
          u.slowAttacks !== e.s.turnSerial,
          "Замедление: только одна атака за ход",
        );
    }
    if (
      (actionKinds.includes(c.kind) || c.kind === "move") &&
      this.effects(e, c.actor, "abjure").length &&
      e.has(c.actor, "frightened")
    ) {
      if (u.abjureChoice && u.abjureChoice !== kind)
        e.require(false, "Изгнание: движение, действие или бонусное действие");
      u.abjureChoice = kind;
    }
    if (c.kind === "move" && e.has(c.actor, "frightened")) {
      const sources = [
        ...this.effects(e, c.actor, "abjure").map((x) => x.owner),
        ...u.statuses
          .filter((x) => x.kind === "frightened")
          .map((x) => x.source),
      ].filter(Boolean);
      for (const src of sources.filter((id) => e.s.units[id]))
        if (e.canSee(c.actor, src))
          e.require(
            c.path.every(
              (p) => e.distance(p, e.unit(src)) >= e.distance(u, e.unit(src)),
            ),
            "Нельзя приближаться к источнику страха",
          );
    }
  }
  static moved(e, id) {
    for (const z of e.s.zones)
      if (
        e.zoneAt(e.unit(id), z) &&
        z.kind === "web" &&
        !e.has(id, "restrained")
      )
        e.enqueue(
          e.saveTask(
            id,
            "DEX",
            e.unit(z.owner).casting.dc,
            this.task(z.owner, "save", {
              frame: z.effect,
              target: id,
              condition: "web",
              effect: z.effect,
              dc: e.unit(z.owner).casting.dc,
            }),
          ),
        );
  }
  static mitigate(e, t, amount) {
    if (t.finalTransfer) return amount;
    if (
      t.damageType === "fire" &&
      this.effects(e, t.target, "fireResistance").length &&
      !e.unit(t.target).resistances.includes("fire")
    )
      amount = Math.floor(amount / 2);
    if (
      this.effects(e, t.target, "wardingBond").some(
        (x) =>
          e.active(x.owner) &&
          e.distance(e.unit(x.owner), e.unit(t.target)) <= 60,
      ) &&
      !e.unit(t.target).resistances.includes(t.damageType)
    )
      amount = Math.floor(amount / 2);
    return amount;
  }
  static split(e, t, amount) {
    if (t.finalTransfer || t.leafResolved || amount <= 0) return false;
    const u = e.unit(t.target),
      id = u.equipment?.leafPartner;
    if (
      id &&
      e.s.units[id] &&
      e.active(id) &&
      !e.incapacitated(id) &&
      e.distance(u, e.unit(id)) <= 60 &&
      e.unit(id).equipment?.rootPartner === t.target
    ) {
      e.enqueue({
        kind: "roll",
        actor: t.target,
        label: "Кольца Корня и Листа",
        count: 1,
        sides: 6,
        bonus: 0,
        next: this.task(t.target, "leafSplit", {
          recipient: id,
          damage: { ...t, amount, mitigated: true },
        }),
      });
      return true;
    }
    return false;
  }
  static damaged(e, t, amount) {
    if (!amount) return;
    for (const x of this.effects(e, t.target, "abjure"))
      x.targets = x.targets.filter((id) => id !== t.target);
    if (!t.finalTransfer && !t.bondTransfer)
      for (const x of this.effects(e, t.target, "wardingBond"))
        if (
          e.active(x.owner) &&
          e.distance(e.unit(x.owner), e.unit(t.target)) <= 60
        )
          e.enqueue({
            kind: "damage",
            actor: t.target,
            target: x.owner,
            amount,
            damageType: t.damageType,
            bondTransfer: true,
            ...(t.components
              ? { components: structuredClone(t.components) }
              : {}),
          });
    for (const x of this.effects(e, t.target, "compelledDuel"))
      if (e.unit(t.actor)?.team === e.unit(x.owner).team && t.actor !== x.owner)
        this.remove(e, [x.id]);
  }
  // Class and item hooks are defined below, using the same continuation contract.
  static castShield(e, id, after) {
    const u = e.unit(id),
      f = {
        id: "spell-" + ++e.s.sequence,
        actor: id,
        spell: "shield",
        level: 1,
        targets: [id],
        offered: [],
        cancelled: false,
        after,
      };
    if (u.counters.shield_magic_initiate?.current > 0) {
      u.counters.shield_magic_initiate.current--;
      u.reaction--;
    } else {
      f.level = Object.keys(u.slots)
        .map(Number)
        .sort((a, b) => a - b)
        .find((n) => u.slots[n].current > 0);
      this.pay(e, f, "reaction");
    }
    e.s.spellFrames[f.id] = f;
    e.emit("cast", id, u.name + ": Щит.");
    e.enqueue(this.task(id, "window", { frame: f.id }));
  }
  static advancedDecision(e, c, p) {
    if (p.choice !== "shieldMaster") return false;
    if (c.choice === "yes") {
      e.require(e.unit(p.actor).reaction > 0, "Нет реакции");
      e.unit(p.actor).reaction--;
      e.emit("reaction", p.actor, "Мастер щита: урон предотвращён.");
    } else e.enqueue(p.damage);
    return true;
  }
  static advancedTask(e, t) {
    return false;
  }
}
if (typeof module !== "undefined") module.exports = { CombatMagic };
