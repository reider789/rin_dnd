"use strict";
const ContinuityCapabilities =
  typeof module !== "undefined"
    ? require("./capabilities").CombatCapabilities
    : CombatCapabilities;

// One domain validator is used by the SDK and both campaign import adapters.
// It validates a detached payload and never rolls dice or changes campaign data.
class CombatContinuity {
  static require(ok, message) {
    if (!ok) throw Error(message);
  }
  static object(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }
  static integer(value, low, high) {
    return Number.isInteger(value) && value >= low && value <= high;
  }
  static id(value) {
    return (
      typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value) &&
      !["__proto__", "constructor", "prototype"].includes(value)
    );
  }
  static life(unit) {
    return {
      dead: Boolean(unit.dead),
      stable: Boolean(unit.stable),
      deathSuccesses: unit.deathSuccesses || 0,
      deathFailures: unit.deathFailures || 0,
    };
  }
  static validateLife(life, hp) {
    const ok =
      this.object(life) &&
      Object.keys(life).every((k) =>
        ["dead", "stable", "deathSuccesses", "deathFailures"].includes(k),
      ) &&
      typeof life.dead === "boolean" &&
      typeof life.stable === "boolean" &&
      this.integer(life.deathSuccesses, 0, 3) &&
      this.integer(life.deathFailures, 0, 4) &&
      !(life.dead && life.stable) &&
      (hp === 0 ||
        (!life.dead &&
          !life.stable &&
          !life.deathSuccesses &&
          !life.deathFailures)) &&
      (life.deathFailures < 3 || life.dead);
    this.require(ok, "Неверное состояние жизни героя");
  }
  static validateReport(report) {
    const M =
      typeof module !== "undefined"
        ? require("./magic").CombatMagic
        : CombatMagic;
    const C = ContinuityCapabilities;
    this.require(
      this.object(report.after) && Object.keys(report.after).length,
      "Нет участников продолжения",
    );
    const party = new Set(Object.keys(report.after));
    this.require(
      [...party].every((id) => this.id(id)),
      "Неверный ID героя",
    );
    const c = structuredClone(report.continuity);
    this.require(
      this.object(c) &&
        Object.keys(c).every((k) =>
          [
            "effects",
            "units",
            "temporary_hp",
            "temp_sources",
            "statuses",
            "objects",
            "zones",
            "cauldron_vials",
            "life",
            "scene",
          ].includes(k),
        ),
      "Неверное продолжение эффектов",
    );
    for (const key of ["effects", "units", "objects", "zones", "cauldron_vials"])
      this.require(
        c[key] === undefined || Array.isArray(c[key]),
        "Повреждён список продолжения: " + key,
      );
    for (const key of ["temporary_hp", "temp_sources", "statuses", "life"])
      this.require(
        c[key] === undefined || this.object(c[key]),
        "Повреждена карта продолжения: " + key,
      );
    const actors = new Set(party),
      summonIds = new Set();
    for (const u of c.units || []) {
      this.require(
        this.object(u) &&
          this.id(u.id) &&
          !actors.has(u.id) &&
          party.has(u.summoner) &&
          typeof u.name === "string" &&
          u.name.trim() &&
          this.integer(u.hp, 1, 1000) &&
          this.integer(u.max, u.hp, 1000) &&
          this.integer(u.ac, 0, 40) &&
          this.integer(u.speed, 0, 200) &&
          this.integer(u.size, 0, 5) &&
          this.integer(u.proficiency, 0, 9) &&
          this.integer(u.summonLevel, 2, 9) &&
          this.integer(u.summonDC, 1, 30) &&
          ["celestial", "fey", "fiend"].includes(u.creatureType) &&
          typeof u.powerAvailable === "boolean",
        "Неверная карточка призыва",
      );
      for (const key of ["stats", "saves"])
        this.require(
          this.object(u[key]) &&
            Object.keys(u[key]).every((k) =>
              ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(k),
            ) &&
            ["STR", "DEX", "CON", "INT", "WIS", "CHA"].every((k) =>
              this.integer(
                u[key][k],
                key === "stats" ? -4 : -20,
                key === "stats" ? 10 : 50,
              ),
            ),
          "Неверные характеристики призыва",
        );
      C.features(u.features);
      this.require(
        Array.isArray(u.attacks) &&
          u.attacks.length > 0 &&
          u.attacks.length <= 12,
        "Нет атак призыва",
      );
      for (const a of u.attacks) {
        C.attack(a);
        this.require(
          this.id(a.id) &&
            typeof a.name === "string" &&
            ["melee", "ranged", "meleeSpell", "rangedSpell"].includes(a.kind) &&
            this.integer(a.count, 1, 12) &&
            [4, 6, 8, 10, 12, 20].includes(a.die) &&
            this.integer(a.range, 5, 600) &&
            this.integer(a.bonus, -30, 50) &&
            this.integer(a.flat, -30, 100),
          "Неверная атака призыва",
        );
      }
      actors.add(u.id);
      summonIds.add(u.id);
    }
    const effects = new Map(),
      kinds = new Set([
        ...Object.keys(M.SPELLS),
        "abjure",
        "sacredWeapon",
        "fireResistance",
        "antitoxin",
        "haste",
        "enlarge",
        "giantStrength",
        "climbing",
      ]);
    const effectFields = new Set([
      "id",
      "kind",
      "owner",
      "targets",
      "level",
      "dc",
      "until",
      "concentration",
      "aura",
      "amount",
      "weapon",
      "point",
      "remaining",
      "remaining_seconds",
      "expires_at",
      "noLethargy",
      "castOrigin",
      "potionKind",
    ]);
    const point = (p, outside = false) =>
      this.object(p) &&
      this.integer(p.x, outside ? -40 : 0, outside ? 79 : 39) &&
      this.integer(p.y, outside ? -40 : 0, outside ? 79 : 39);
    if (c.scene !== undefined) {
      const s = c.scene;
      this.require(
        this.object(s) &&
          typeof s.id === "string" &&
          s.id.length > 0 &&
          s.id.length <= 200 &&
          typeof s.name === "string" &&
          s.name.length <= 300 &&
          this.integer(s.width, 1, 40) &&
          this.integer(s.height, 1, 40) &&
          ["walls", "rubble"].every(
            (k) =>
              Array.isArray(s[k]) &&
              s[k].every(
                (v) =>
                  typeof v === "string" &&
                  /^\d+,\d+$/.test(v) &&
                  v
                    .split(",")
                    .every((n, i) => Number(n) < (i ? s.height : s.width)),
              ),
          ) &&
          this.object(s.cover) &&
          Object.entries(s.cover).every(
            ([k, v]) =>
              /^\d+,\d+$/.test(k) &&
              k
                .split(",")
                .every((n, i) => Number(n) < (i ? s.height : s.width)) &&
              [0, 2, 5].includes(v),
          ) &&
          this.object(s.positions) &&
          Object.entries(s.positions).every(
            ([id, p]) =>
              actors.has(id) && point(p) && p.x < s.width && p.y < s.height,
          ),
        "Повреждена сцена продолжения",
      );
    }
    for (const x of c.effects || []) {
      this.require(
        this.object(x) &&
          Object.keys(x).every((k) => effectFields.has(k)) &&
          this.id(x.id) &&
          !effects.has(x.id) &&
          kinds.has(x.kind) &&
          actors.has(x.owner) &&
          Array.isArray(x.targets) &&
          new Set(x.targets).size === x.targets.length &&
          x.targets.every((id) => actors.has(id)) &&
          this.integer(x.level, 0, 9) &&
          this.integer(x.dc, 1, 30) &&
          typeof x.concentration === "boolean" &&
          this.integer(x.remaining_seconds, 1, 86400),
        "Неверный действующий эффект",
      );
      for (const k of ["until", "expires_at"])
        this.require(
          x[k] === undefined || this.integer(x[k], 0, Number.MAX_SAFE_INTEGER),
          "Неверные часы эффекта",
        );
      if (x.aura !== undefined)
        this.require(this.integer(x.aura, 5, 600), "Неверный радиус ауры");
      if (x.amount !== undefined)
        this.require(
          this.integer(x.amount, 0, 100),
          "Неверная величина эффекта",
        );
      if (x.point !== undefined)
        this.require(point(x.point), "Неверная точка эффекта");
      if (x.kind === "tashasBubblingCauldron")
        this.require(["healing","greaterHealing"].includes(x.potionKind) &&
          this.integer(x.remaining,1,10) && x.point && x.concentration===false,
          "Повреждены свойства котла");
      if (x.castOrigin !== undefined)
        this.require(point(x.castOrigin), "Неверная исходная точка заклинания");
      if (x.weapon !== undefined)
        this.require(this.id(x.weapon), "Неверное оружие эффекта");
      if (x.remaining !== undefined)
        this.require(
          this.integer(x.remaining, 0, 10),
          "Неверный счётчик эффекта",
        );
      if (x.noLethargy !== undefined)
        this.require(
          typeof x.noLethargy === "boolean",
          "Неверное окончание Ускорения",
        );
      if (x.kind === "aid")
        this.require(
          this.integer(x.amount, 5, 40) && x.amount === 5 * (x.level - 1),
          "Неверная Помощь",
        );
      effects.set(x.id, x);
    }
    for (const key of ["temporary_hp", "temp_sources", "statuses", "life"])
      this.require(
        Object.keys(c[key] || {}).every((id) => actors.has(id)),
        "Неизвестный участник продолжения",
      );
    for (const id of actors) {
      const hp = party.has(id)
        ? report.after[id].hp?.current
        : (c.units || []).find((u) => u.id === id).hp;
      this.require(this.integer(hp, 0, 1000), "Нет ПЗ участника продолжения");
      const life = c.life?.[id];
      // A v30.5 report with a fallen hero is ambiguous: never guess alive/stable/dead.
      this.require(
        life !== undefined || hp > 0,
        "Нет состояния жизни героя с нулём ПЗ; нужен разбор старого отчёта",
      );
      if (life !== undefined) this.validateLife(life, hp);
      if (summonIds.has(id))
        this.require(
          !c.life?.[(c.units || []).find((u) => u.id === id).summoner]?.dead,
          "Призыв не может сохраняться после смерти хозяина",
        );
      this.require(
        c.temporary_hp?.[id] === undefined ||
          this.integer(c.temporary_hp[id], 0, 1000),
        "Неверные временные ПЗ",
      );
      this.require(
        c.temp_sources?.[id] == null || this.id(c.temp_sources[id]),
        "Неверный источник временных ПЗ",
      );
      const statuses = c.statuses?.[id] || [];
      this.require(Array.isArray(statuses), "Неверные состояния участника");
      for (const z of statuses) {
        this.require(
          this.object(z) &&
            C.STATUSES.has(z.kind) &&
            Object.keys(z).every((k) =>
              [
                "kind",
                "source",
                "effect",
                "until",
                "expires_at",
                "expiresAtStart",
                "expiresAtEnd",
                "expiresOnSourceStart",
                "expiresOnSourceEnd",
                "expiresOnSourceEndTurn",
                "amount",
                "dc",
                "repeatDC",
                "repeatStat",
                "magic",
              ].includes(k),
            ),
          "Неизвестное состояние участника",
        );
        for (const key of [
          "source",
          "expiresAtStart",
          "expiresAtEnd",
          "expiresOnSourceStart",
          "expiresOnSourceEnd",
        ])
          this.require(
            z[key] === undefined || this.id(z[key]),
            "Неверный источник состояния",
          );
        for (const key of [
          "until",
          "expires_at",
          "expiresOnSourceEndTurn",
          "amount",
          "dc",
          "repeatDC",
        ])
          this.require(
            z[key] === undefined ||
              this.integer(z[key], 0, Number.MAX_SAFE_INTEGER),
            "Неверный параметр состояния",
          );
        if (z.repeatDC !== undefined)
          this.require(
            this.integer(z.repeatDC, 1, 30) &&
              ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(z.repeatStat),
            "Неверный повторный спасбросок",
          );
        if (z.magic !== undefined)
          this.require(typeof z.magic === "boolean", "Неверный тип состояния");
        if (z.kind === "grappled")
          this.require(actors.has(z.source), "Нет участника захвата");
        this.require(
          !z.expiresAtStart &&
            !z.expiresAtEnd &&
            !z.expiresOnSourceStart &&
            !z.expiresOnSourceEnd,
          "Перед переносом заверши состояния до следующего хода",
        );
        if (z.effect !== undefined)
          this.require(
            effects.has(z.effect) && (
              effects.get(z.effect).targets.includes(id) ||
              (z.kind === "restrained" && z.magic === true &&
                effects.get(z.effect).kind === "web" &&
                z.source === effects.get(z.effect).owner &&
                z.dc === effects.get(z.effect).dc &&
                z.until === effects.get(z.effect).until &&
                (c.zones || []).some(zone => zone.effect === z.effect &&
                  zone.kind === "web" && zone.owner === z.source &&
                  zone.until === z.until))
            ),
            "Нет эффекта состояния",
          );
      }
    }
    const vialIds=new Set();
    for(const v of c.cauldron_vials || []) {
      this.require(this.object(v) && this.id(v.id) && !vialIds.has(v.id) &&
        actors.has(v.owner) && actors.has(v.holder) &&
        this.id(v.sourceSpellId) &&
        ["healing","greaterHealing"].includes(v.potionKind),
        "Повреждено перенесённое зелье котла");
      vialIds.add(v.id);
    }
    const objectIds = new Set();
    for (const o of c.objects || []) {
      this.require(
        this.object(o) &&
          this.id(o.id) &&
          !objectIds.has(o.id) &&
          point(o) &&
          (!c.scene || (o.x < c.scene.width && o.y < c.scene.height)) &&
          actors.has(o.owner) &&
          effects.get(o.id)?.kind === "bigbyHand" &&
          effects.get(o.id).owner === o.owner &&
          this.integer(o.hp, 1, 1000) &&
          this.integer(o.max, o.hp, 1000) &&
          o.ac === 20 &&
          this.integer(o.dc, 1, 30) &&
          (o.empoweredUsed === undefined ||
            typeof o.empoweredUsed === "boolean") &&
          (o.grappled == null || actors.has(o.grappled)) &&
          typeof o.interposing === "boolean",
        "Неверный объект на поле",
      );
      objectIds.add(o.id);
    }
    for (const x of effects.values())
      if (x.kind === "bigbyHand")
        this.require(objectIds.has(x.id), "Нет объекта Руки Бигби");
    const zoneIds = new Set();
    for (const z of c.zones || []) {
      this.require(
        this.object(z) &&
          this.id(z.id) &&
          !zoneIds.has(z.id) &&
          point(z, true) &&
          actors.has(z.owner) &&
          [
            "darkness",
            "fog",
            "smoke",
            "web",
            "zoneTruth",
            "stormSphere",
            "globeInvulnerability",
          ].includes(z.kind) &&
          this.integer(z.radius, 0, 600) &&
          this.integer(z.remaining_seconds, 1, 86400) &&
          typeof z.concentration === "boolean" &&
          (z.effect === undefined || effects.has(z.effect)),
        "Неверная зона продолжения",
      );
      if (z.shape !== undefined)
        this.require(
          z.shape === "cube" && this.integer(z.cells, 1, 40),
          "Неверная форма зоны",
        );
      if (z.until !== undefined)
        this.require(
          this.integer(z.until, 0, Number.MAX_SAFE_INTEGER),
          "Неверные часы зоны",
        );
      zoneIds.add(z.id);
    }
    return c;
  }
}
if (typeof module !== "undefined") module.exports = { CombatContinuity };
