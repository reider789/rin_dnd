/* D&D 2024 combat domain. No DOM, network, character names or campaign IDs. */
"use strict";
const RulesCapabilities =
  typeof module !== "undefined"
    ? require("./capabilities").CombatCapabilities
    : CombatCapabilities;
const RulesClassFeatures =
  typeof module !== "undefined"
    ? require("./class_features").CombatClassFeatures
    : CombatClassFeatures;
const RulesDefenses =
  typeof module !== "undefined"
    ? require("./defenses").CombatDefenses
    : CombatDefenses;
const RulesMartial =
  typeof module !== "undefined"
    ? require("./martial_features").CombatMartialFeatures
    : CombatMartialFeatures;
const RulesMagic =
  typeof module !== "undefined" ? require("./magic").CombatMagic : CombatMagic;
const RulesAdvanced =
  typeof module !== "undefined"
    ? require("./advanced_features").CombatAdvancedFeatures
    : CombatAdvancedFeatures;
const RulesContinuity =
  typeof module !== "undefined"
    ? require("./continuity").CombatContinuity
    : CombatContinuity;
const RulesActivities = typeof module !== "undefined"
  ? require("./activities").CombatActivities : CombatActivities;
const RulesJournal = typeof module !== "undefined"
  ? require("./combat_journal").CombatJournal : CombatJournal;
class CombatRulesEngine {
  static VERSION = RulesCapabilities.ENGINE;
  static RULES = RulesCapabilities.RULES;
  static FEATURES = new Set(Object.keys(RulesCapabilities.FEATURES));
  constructor(state) {
    CombatRulesEngine.validate(state);
    this.state = structuredClone(state);
    RulesMagic.init(this.state);
    for (const u of Object.values(this.state.units))
      if (u.blockedCells) u.blockedCells = u.blockedCells.filter(p =>
        p.turn === this.state.turnSerial && p.context !== undefined);
    this.revision = 0;
    const resume = RulesMartial.restoreLegacyHits(this);
    this.state.engineVersion = CombatRulesEngine.VERSION;
    if (resume) this.run();
  }
  static validate(s) {
    if (!s || s.version !== 30 || s.rulesVersion !== this.RULES)
      throw Error("Несовместимая версия боя");
    if (s.actionSerial !== undefined && (!Number.isSafeInteger(s.actionSerial) ||
        s.actionSerial < 0 || s.actionSerial >= 1e13)) throw Error("Повреждён счётчик действий");
    const version = String(s.engineVersion || "")
        .split(".")
        .map(Number),
      current = this.VERSION.split(".").map(Number);
    if (
      version.length !== 3 ||
      version.some((n) => !Number.isInteger(n) || n < 0) ||
      version[0] !== current[0] ||
      version[1] > current[1] ||
      (version[1] === current[1] && version[2] > current[2])
    )
      throw Error("Сохранение требует другой версии движка");
    if (
      !s.meta?.battleId ||
      !Array.isArray(s.order) ||
      !s.order.length ||
      new Set(s.order).size !== s.order.length
    )
      throw Error("Неполная очередь боя");
    if (!s.units || s.order.some((id) => !s.units[id]))
      throw Error("Нет карточки участника");
    if (
      !Number.isInteger(s.index) ||
      s.index < 0 ||
      s.index >= s.order.length ||
      !Number.isInteger(s.turnSerial)
    )
      throw Error("Повреждён номер хода");
    if (
      !Number.isInteger(s.random?.value) ||
      !Array.isArray(s.queue) ||
      !Array.isArray(s.events)
    )
      throw Error("Неполное сохранение");
    if (
      !Number.isInteger(s.terrain?.width) ||
      !Number.isInteger(s.terrain?.height) ||
      s.terrain.width < 1 ||
      s.terrain.height < 1 ||
      s.terrain.width > 40 ||
      s.terrain.height > 40
    )
      throw Error("Неверный размер поля");
    s.events.forEach(event => RulesJournal.validateEvent(event));
    const cells = new Map(),
      movingActor =
        s.queue.find((t) => t.kind === "moveStep")?.actor ||
        s.pending?.movement?.actor;
    for (const [id, u] of Object.entries(s.units)) {
      for (const flag of ["stable", "dead"])
        if (u[flag] !== undefined && typeof u[flag] !== "boolean")
          throw Error("Неверное состояние жизни");
      if (u.diedAtSeconds !== undefined &&
          (!u.dead || !Number.isInteger(u.diedAtSeconds) ||
            u.diedAtSeconds < 0 || u.diedAtSeconds > s.elapsed))
        throw Error("Неверное время смерти");
      RulesContinuity.validateLife(RulesContinuity.life(u), u.hp);
      if (u.exhaustion !== undefined && (!Number.isInteger(u.exhaustion) || u.exhaustion < 0 || u.exhaustion > 5))
        throw Error("Недопустимый уровень истощения: нужен сюжетный разбор шестого уровня");
      if (u.blockedCells !== undefined && (!Array.isArray(u.blockedCells) ||
          !u.blockedCells.every(p => p && Number.isInteger(p.x) && Number.isInteger(p.y) &&
            p.x >= 0 && p.y >= 0 && p.x < s.terrain.width && p.y < s.terrain.height &&
            Number.isSafeInteger(p.turn) && p.turn >= 0 &&
            (p.context === undefined || typeof p.context === "string"))))
        throw Error("Повреждена память препятствий");
      if (
        !Number.isInteger(u.hp) ||
        !Number.isInteger(u.max) ||
        u.max < 1 ||
        u.hp < 0 ||
        u.hp > u.max ||
        !Array.isArray(u.statuses) ||
        !Array.isArray(u.attacks) ||
        !u.attacks.length ||
        !Number.isFinite(u.ac) ||
        !Number.isFinite(u.speed) ||
        typeof u.name !== "string" ||
        !u.team
      )
        throw Error("Повреждена карточка: " + id);
      if (
        !Number.isInteger(u.x) ||
        !Number.isInteger(u.y) ||
        u.x < 0 ||
        u.y < 0 ||
        u.x >= s.terrain.width ||
        u.y >= s.terrain.height
      )
        throw Error("Участник вне поля");
      if (u.hp > 0 && !u.fled) {
        const k = u.x + "," + u.y,
          other = cells.get(k);
        if (
          (other &&
            other !== movingActor &&
            id !== movingActor &&
            !u.involuntarySharedSpace &&
            !s.units[other].involuntarySharedSpace) ||
          s.terrain.walls.includes(k)
        )
          throw Error("Участники или стены пересекаются");
        cells.set(k, id);
      }
      for (const k of [
        "focus",
        "luck",
        "heroic",
        "arrows",
        "metabolism",
        "action",
        "bonus",
        "reaction",
        "move",
      ])
        if (u[k] !== undefined && (!Number.isInteger(u[k]) || u[k] < 0))
          throw Error("Неверный ресурс: " + k);
      for (const a of u.attacks)
        if (
          !a.id ||
          !["melee", "ranged", "meleeSpell", "rangedSpell"].includes(a.kind) ||
          !Number.isInteger(a.count) ||
          a.count < 1 ||
          a.count > 12 ||
          ![4, 6, 8, 10, 12, 20].includes(a.die) ||
          !Number.isFinite(a.bonus) ||
          !Number.isFinite(a.flat) ||
          !Number.isInteger(a.range) ||
          a.range < 5 ||
          a.range > 600
        )
          throw Error("Неверная атака: " + id);
      RulesCapabilities.features(u.features);
      RulesClassFeatures.validateUnit(u);
      RulesActivities.validateUnit(u);
      RulesMagic.validateCasting(u.casting);
      for (const [key, value] of Object.entries(u.counters || {})) {
        RulesCapabilities.require(
          RulesCapabilities.COUNTERS.includes(key),
          "Неизвестный ресурс " + key,
        );
        RulesCapabilities.counter(value);
      }
      for (const [level, value] of Object.entries(u.slots || {})) {
        RulesCapabilities.require(
          /^[1-9]$/.test(level),
          "Неверный круг ячейки",
        );
        RulesCapabilities.counter(value);
      }
      for (const attack of u.attacks) RulesCapabilities.attack(attack);
      for (const z of u.statuses) RulesCapabilities.validateStatus(z?.kind);
    }
    RulesMagic.validateState(s);
    this.validateContinuations(s);
    return true;
  }
  static validateContinuations(s) {
    const require = (ok, text = "Повреждена последовательность боя") => {
      if (!ok) throw Error(text);
    };
    require(["active", "ended"].includes(s.phase));
    require(
      Number.isInteger(s.round) && s.round >= 1 && Number.isInteger(s.sequence),
    );
    require(s.meta.campaignId && Array.isArray(s.zones));
    require(Array.isArray(s.terrain.walls) && Array.isArray(s.terrain.rubble));
    const kinds = new Set([
      "initiativeSetup",
      "startTurn",
      "endTurn",
      "roll",
      "attackRoll",
      "attackResult",
      "attackEffects",
      "applyAttackCondition",
      "damageResult",
      "sneakResult",
      "damage",
      "concentrationResult",
      "deflectResult",
      "redirectRollResult",
      "attackCompleted",
      "moveCompleted",
      "checkResult",
      "emptyAttackResult",
      "redirectDamage",
      "moveStep",
      "hideResult",
      "searchResult",
      "contestResult",
      "escapeResult",
      "healingResult",
      "stabilizeResult",
      "deathSaveResult",
      "saveDamage",
      "secondWindResult",
      "tacticalMindResult",
      "baitResult",
      "martialMiss",
      "precisionResult",
      "weaponDamageRoll",
      "savageFirst",
      "savageSecond",
      "weaponDamage",
      "maneuverDamageResult",
      "weaponHitEffects",
      "maneuverEffect",
    ]);
    kinds.add("magicTask");
    kinds.add("advancedTask");
    const visit = (t, depth = 0) => {
      RulesJournal.validateTrace(t?.trace);
      require(t &&
        depth < 80 &&
        kinds.has(t.kind), "Неизвестный или повреждённый шаг боя");
      if (t.kind === "magicTask")
        require(RulesMagic.OPS.has(t.op), "Неизвестный магический шаг");
      if (t.kind === "advancedTask")
        require(RulesAdvanced.OPS.has(t.op), "Неизвестный классовый шаг");
      for (const k of ["actor", "target", "ally", "recipient"])
        if (t[k] != null)
          require(Boolean(s.units[t[k]]), "В шаге боя неизвестный участник");
      const fields =
        {
          attackRoll: ["actor", "target", "spec"],
          attackResult: ["actor", "target", "spec"],
          damage: ["actor", "target", "amount"],
          weaponDamage: ["actor", "target", "frame", "amount"],
          moveStep: ["actor", "path", "provoked"],
          moveCompleted: ["actor"],
          attackCompleted: ["actor", "target"],
        }[t.kind] || [];
      require(fields.every((k) => t[k] != null));
      if (t.amount != null) require(Number.isFinite(t.amount) && t.amount >= 0);
      if (t.components) {
        const types = new Set([
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
        ]);
        require(Array.isArray(t.components) &&
          t.components.length > 0 &&
          t.components.length <= 16 &&
          t.components.every(
            (p) =>
              Number.isInteger(p.amount) &&
              p.amount >= 0 &&
              p.amount <= 1000000 &&
              types.has(p.damageType),
          ), "Повреждены части урона");
        if (t.kind === "damage")
          require(t.amount ===
            t.components.reduce(
              (n, p) => n + p.amount,
              0,
            ), "Части урона расходятся с суммой");
      }
      if (t.path)
        require(
          Array.isArray(t.path) &&
            t.path.every(
              (p) =>
                Number.isInteger(p.x) &&
                Number.isInteger(p.y) &&
                p.x >= 0 &&
                p.y >= 0 &&
                p.x < s.terrain.width &&
                p.y < s.terrain.height,
            ),
        );
      if (t.origin)
        require(Number.isInteger(t.origin.x) &&
          Number.isInteger(t.origin.y) &&
          t.origin.x >= 0 &&
          t.origin.y >= 0 &&
          t.origin.x < s.terrain.width &&
          t.origin.y < s.terrain.height, "Повреждён источник атаки");
      if (t.magicObject)
        require(typeof t.magicObject === "string" &&
          /^effect-\d+$/.test(t.magicObject), "Повреждён предмет атаки");
      if (t.kind === "roll") {
        require(
          Number.isInteger(t.count) &&
            t.count > 0 &&
            t.count <= 100 &&
            Number.isInteger(t.sides) &&
            t.sides >= 2 &&
            t.sides <= 100 &&
            t.next,
        );
      }
      for (const k of [
        "next",
        "attack",
        "damage",
        "movement",
        "original",
        "frame",
        "resume",
      ])
        if (
          t[k]?.kind &&
          !(
            k === "attack" &&
            ["melee", "ranged", "meleeSpell", "rangedSpell"].includes(t[k].kind)
          )
        )
          visit(t[k], depth + 1);
    };
    s.queue.forEach((t) => visit(t));
    for (const f of Object.values(s.spellFrames || {})) {
      RulesJournal.validateTrace(f.trace);
      if (f.hitContinue) visit(f.hitContinue);
    }
    const p = s.pending;
    RulesJournal.validateTrace(p?.trace);
    if (!p) return;
    const required = {
      magicChoice: ["choice", "options"],
      initiativeSwap: ["targets"],
      metabolism: [],
      deflect: ["damage"],
      redirect: ["targets", "range"],
      knockout: ["damage"],
      opportunity: ["attack", "movement"],
      ready: ["attack"],
      defenseLuck: ["attack"],
      roll: ["roll"],
      adjudication: ["description", "cost"],
      classRoll: ["roll", "ability"],
      freeMovement: ["budget", "label"],
      uncannyDodge: ["damage"],
      precision: ["attack"],
      riposte: ["target", "spec"],
      strikeChoice: ["attack", "maneuvers"],
      defensiveReaction: ["attack", "ability"],
    };
    require(typeof p.id === "string" &&
      Boolean(s.units[p.actor]) &&
      Object.hasOwn(
        required,
        p.kind,
      ), "Неизвестное или повреждённое решение игрока");
    require(required[p.kind].every(
      (k) => p[k] != null,
    ), "В решении отсутствуют необходимые данные");
    for (const k of ["attack", "damage", "movement", "roll", "resume"])
      if (p[k]) visit(p[k]);
    if (p.targets)
      require(Array.isArray(p.targets) && p.targets.every((id) => s.units[id]));
    if (["roll", "classRoll"].includes(p.kind))
      require(Array.isArray(p.roll.rolls) && p.roll.rolls.length > 0);
    if (p.kind === "magicChoice")
      require(
        RulesAdvanced.CHOICES.has(p.choice) ||
          [
            "counterspell",
            "missileShield",
            "vitality",
            "shieldMaster",
          ].includes(p.choice),
      );
    if (p.kind === "strikeChoice") require(Array.isArray(p.maneuvers));
    if (p.kind === "freeMovement")
      require(Number.isFinite(p.budget) && p.budget >= 0);
    if (p.kind === "defensiveReaction")
      require(["shield", "protection", "cloak", "mark"].includes(p.ability));
    if (p.kind === "classRoll")
      require(["indomitable", "tacticalMind"].includes(p.ability));
  }
  get s() {
    return this.state;
  }
  get actorId() {
    return this.s.order[this.s.index];
  }
  unit(id) {
    const u = this.s.units[id];
    if (!u) throw Error("Неизвестный участник");
    return u;
  }
  distance(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 5;
  }
  has(id, kind) {
    return (
      !this.conditionImmune(id, kind) &&
      (this.unit(id).statuses.some((z) => z.kind === kind) ||
        RulesMagic.has(this, id, kind)) &&
      !RulesDefenses.suppresses(this, id, kind)
    );
  }
  conditionImmune(id, kind) {
    const u = this.unit(id);
    return Boolean(u.conditionImmunities?.includes(kind) ||
      (kind === "poisoned" && u.statuses.some(z => z.kind === "petrified")));
  }
  size(id) {
    return Math.min(5, (this.unit(id).size ?? 2) +
      (RulesMagic.effects(this, id, "enlarge").length ? 1 : 0));
  }
  incapacitated(id) {
    return (
      this.unit(id).hp <= 0 ||
      [
        "incapacitated",
        "unconscious",
        "paralyzed",
        "stunned",
        "petrified",
      ].some((k) => this.has(id, k))
    );
  }
  active(id) {
    const u = this.unit(id);
    return !u.dead && !u.fled && u.hp > 0 && !this.has(id, "unconscious");
  }
  fearSources(id) {
    return [...new Set([
      ...RulesMagic.effects(this, id, "abjure").map(x => x.owner),
      ...this.unit(id).statuses.filter(z => z.kind === "frightened").map(z => z.source),
    ])].filter(source => this.s.units[source]);
  }
  conditionD20Modifiers(id, kind, from = null) {
    const advantage = [], disadvantage = [], sources = [];
    if (!["attack", "check"].includes(kind)) return {advantage, disadvantage, sources};
    if (this.has(id, "poisoned")) {
      disadvantage.push("Отравление");
      sources.push({rule: "condition.poisoned", source: id, mode: -1, label: "Отравление"});
    }
    if (this.has(id, "frightened")) {
      for (const source of this.fearSources(id)) {
        if (!this.canSee(id, source, from)) continue;
        const label = "Страх: " + this.name(source) + " в поле зрения";
        disadvantage.push(label);
        sources.push({rule: "condition.frightened", source, mode: -1, label});
      }
    }
    return {advantage, disadvantage, sources};
  }
  enemies(id) {
    const u = this.unit(id);
    return this.s.order.filter(
      (k) => this.unit(k).team !== u.team && this.active(k),
    );
  }
  occupied(x, y, except = null) {
    return this.s.order.find(
      (id) =>
        id !== except &&
        this.unit(id).hp > 0 &&
        !this.unit(id).fled &&
        this.unit(id).x === x &&
        this.unit(id).y === y,
    );
  }
  canPass(id, other) {
    if (!other) return true;
    const a = this.unit(id),
      b = this.unit(other);
    return (
      a.team === b.team ||
      this.incapacitated(other) ||
      this.size(other) === 0 ||
      Math.abs(this.size(id) - this.size(other)) >= 2
    );
  }
  inside(p) {
    return (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x < this.s.terrain.width &&
      p.y < this.s.terrain.height
    );
  }
  wall(p) {
    return !this.inside(p) || this.s.terrain.walls.includes(p.x + "," + p.y);
  }
  wallLOS(a, b) {
    const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * 8;
    for (let i = 1; i < steps; i++)
      if (
        this.wall({
          x: Math.round(a.x + ((b.x - a.x) * i) / steps),
          y: Math.round(a.y + ((b.y - a.y) * i) / steps),
        })
      )
        return false;
    return true;
  }
  zoneAt(p, z) {
    if (z.shape === "cube")
      return (
        p.x >= z.x && p.x < z.x + z.cells && p.y >= z.y && p.y < z.y + z.cells
      );
    return Math.hypot(p.x - z.x, p.y - z.y) * 5 <= z.radius;
  }
  crosses(a, b, z) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      l = dx * dx + dy * dy,
      t = l
        ? Math.max(0, Math.min(1, ((z.x - a.x) * dx + (z.y - a.y) * dy) / l))
        : 0;
    return this.zoneAt({ x: a.x + dx * t, y: a.y + dy * t }, z);
  }
  canSee(observer, target, from = null) {
    const a = from || this.unit(observer),
      b = typeof target === "string" ? this.unit(target) : target,
      u = this.unit(observer),
      range = this.distance(a, b);
    if (!this.wallLOS(a, b)) return false;
    if ((u.senses?.blindsight || 0) >= range) return true;
    if (this.has(observer, "blinded")) return false;
    if (
      typeof target === "string" &&
      this.has(target, "invisible") &&
      !(u.senses?.truesight >= range)
    )
      return false;
    for (const z of this.s.zones) {
      if (!this.crosses(a, b, z)) continue;
      if (
        z.kind === "darkness" &&
        ((u.senses?.truesight || 0) >= range ||
          (u.senses?.magicalDarkvision || 0) >= range)
      )
        continue;
      // Shadow Arts lets its caster see through their own Darkness; ordinary surroundings remain visible.
      if (
        z.kind === "darkness" &&
        z.owner === observer &&
        u.features.shadowArts
      )
        continue;
      if (["darkness", "fog", "smoke"].includes(z.kind)) return false;
    }
    return true;
  }
  visibility(attacker, target) {
    return {
      adv: !this.canSee(target, attacker),
      disadv: !this.canSee(attacker, target),
    };
  }
  cover(from, target) {
    const p = this.unit(target),
      k = p.x + "," + p.y,
      c = this.s.terrain.cover?.[k] || 0;
    return Math.max(
      [2, 5].includes(c) ? c : 0,
      RulesMagic.cover(this, from, target),
    );
  }
  ac(id, from = null, spec = null) {
    const u = this.unit(id);
    return (
      u.ac +
      RulesMagic.ac(this, id, from) +
      (from && !(from.features?.sharpshooter && spec?.kind === "ranged")
        ? this.cover(from, id)
        : 0) +
      (this.has(id, "shield") ? 5 : 0) +
      Math.max(
        0,
        ...u.statuses
          .filter((z) => z.kind === "bait")
          .map((z) => z.amount || 0),
      )
    );
  }
  emit(type, actor, text, data = {}) {
    const e = {
      seq: ++this.s.sequence,
      turn: this.s.turnSerial,
      round: this.s.round,
      type,
      actor,
      text,
      ...(this.trace ? {trace: structuredClone(this.trace), phase: this.tracePhase || "command"} : {}),
      ...Object.fromEntries(
        Object.entries(structuredClone(data)).filter(
          ([, value]) => value !== undefined,
        ),
      ),
    };
    this.s.events.push(e);
    this.revision++;
    return e;
  }
  name(id) {
    return this.unit(id).name;
  }
  roll(sides) {
    const r = this.s.random;
    let n;
    if (r.tape?.length) {
      n = r.tape.shift();
      if (!Number.isInteger(n) || n < 1 || n > sides)
        throw Error("Неверная тестовая кость");
    } else {
      let x = r.value >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      r.value = x >>> 0 || 1;
      n = Math.floor((r.value / 4294967296) * sides) + 1;
    }
    r.draws++;
    return n;
  }
  enqueue(...tasks) {
    this.s.queue.unshift(...tasks.map(task => {
      const frame = typeof task.frame === "string" ? this.s.spellFrames?.[task.frame] : task.frame;
      const trace = task.trace || frame?.trace ||
        (task.kind === "attackRoll" && task.mode === "reaction" && this.trace?.actor !== task.actor
          ? this.newTrace("reaction",task.actor,this.trace) : this.trace);
      return trace && !task.trace ? {...task, trace: structuredClone(trace)} : task;
    }));
  }
  decision(kind, actor, data) {
    this.s.pending = {
      id: "decision-" + ++this.s.sequence,
      kind,
      actor,
      ...(this.trace ? {trace: structuredClone(this.trace)} : {}),
      ...data,
    };
  }
  initialize() {
    if (this.s.started) return;
    this.s.started = true;
    this.enqueue({ kind: "initiativeSetup" });
    this.run();
  }
  dispatch(command) {
    // Events are append-only. Copy mutable combat state, retain the journal.
    const events = this.s.events,
      length = events.length,
      revision = this.revision;
    const before = structuredClone({ ...this.s, events: [] });
    const previousTrace = this.trace, previousPhase = this.tracePhase;
    try {
      if (!command || typeof command.kind !== "string")
        throw Error("Неверная команда");
      const parent = command.kind === "decide" ? this.s.pending?.trace : null;
      this.trace = this.newTrace(command.kind,
        command.kind === "decide" ? this.s.pending?.actor || this.actorId : command.actor || this.actorId, parent);
      this.tracePhase = command.kind;
      if (command.kind === "decide") {
        const p = this.s.pending;
        if (p) this.emit("decision", p.actor, this.name(p.actor) + ": " +
          ({yes:"использовать",no:"отказаться",skip:"пропустить",accept:"принять бросок",
            heroic:"героическое вдохновение",luck:"удача",spare:"оглушить",lethal:"обычный урон"}[command.choice] || "выбор сделан") + ".",
          {decisionId:p.id, window:p.choice || p.kind, choice:command.choice});
        this.resolveDecision(command);
      }
      else if (command.kind === "endConcentration") {
        const id = command.actor || this.actorId;
        this.require(
          this.unit(id).controlled || id === this.actorId,
          "Нельзя управлять чужой концентрацией",
        );
        this.endConcentration(id);
      } else {
        if (this.s.pending) throw Error("Сначала заверши текущее решение");
        if (this.s.phase !== "active") throw Error("Бой завершён");
        const id = command.actor || this.actorId,
          u = this.unit(id);
        if (id !== this.actorId) throw Error("Сейчас ход другого участника");
        if (command.kind !== "endTurn" && this.incapacitated(id))
          throw Error("Участник не может действовать");
        this.command({ ...command, actor: id }, u);
      }
      this.run();
      this.revision++;
      return this.s;
    } catch (error) {
      events.length = length;
      before.events = events;
      this.state = before;
      this.revision = revision;
      throw error;
    } finally {
      this.trace = previousTrace;
      this.tracePhase = previousPhase;
    }
  }
  newTrace(command, actor, parent = null) {
    this.s.actionSerial = (this.s.actionSerial || 0) + 1;
    const actionId = "action-" + this.s.actionSerial;
    return {actionId, rootActionId: parent?.rootActionId || actionId,
      parentActionId: parent?.actionId || null, command, actor};
  }
  command(c, u) {
    const id = c.actor;
    if (
      ["attack", "grapple", "shove", "helpAttack", "knowEnemy"].includes(
        c.kind,
      ) &&
      c.target
    ) {
      const target = this.unit(c.target);
      this.require(
        this.knowsPosition(id, c.target) ||
          (c.kind === "attack" &&
            c.guessedCell &&
            c.guessedCell.x === target.x &&
            c.guessedCell.y === target.y),
        "Позиция цели неизвестна: выбери клетку для атаки",
      );
    }
    RulesMagic.beforeCommand(this, c, u);
    if (
      RulesActivities.command(this, c, u) ||
      RulesMagic.command(this, c, u) ||
      RulesAdvanced.command(this, c, u) ||
      RulesClassFeatures.command(this, c, u) ||
      RulesMartial.command(this, c, u)
    )
      return;
    if (!["policy", "moveDarkness", "endConcentration"].includes(c.kind))
      u.darkMoveWindow = false;
    if (c.kind === "attackAt") {
      const spec = this.attackSpec(id, c.weapon || u.attacks[0].id),
        p = c.point;
      this.require(
        this.inside(p) &&
          this.distance(u, p) <= spec.range &&
          this.wallLOS(u, p),
        "Клетка вне досягаемости",
      );
      const target = this.s.order.find(
        (k) =>
          this.unit(k).team !== u.team &&
          this.active(k) &&
          this.unit(k).x === p.x &&
          this.unit(k).y === p.y,
      );
      if (target) {
        this.command({ ...c, kind: "attack", target, guessedCell: p }, u);
        return;
      }
      this.require(
        u.action > 0 || u.surgeAction > 0 || u.attacksLeft > 0,
        "Нет атаки",
      );
      this.require(
        !(spec.ammo || spec.ammoCounter) || this.ammoCount(u, spec) > 0,
        "Нет боеприпасов",
      );
      this.require(
        !spec.ammoItem || u.items[spec.ammoItem] > 0,
        "Нет метательного оружия",
      );
      if (u.attacksLeft > 0) u.attacksLeft--;
      else {
        this.spendAction(id);
        u.attacksLeft = RulesMagic.effects(this, id, "slow").length
          ? 0
          : (u.features.extraAttack || 1) - 1;
      }
      this.spendAmmo(u, spec);
      this.removeStatus(id, "invisible");
      u.hidden = false;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Атака клетки " + this.cell(p),
        count: 1,
        sides: 20,
        mode: -1,
        bonus: spec.bonus,
        next: { kind: "emptyAttackResult", actor: id, point: p, spec },
      });
      return;
    }
    if (c.kind === "attack") {
      if (RulesMagic.effects(this, id, "slow").length)
        u.slowAttacks = this.s.turnSerial;
      const spec = this.attackSpec(id, c.weapon),
        mode = c.mode || "action";
      this.validateAttack(id, c.target, spec);
      RulesMartial.prepareAttack(this, c, spec);
      RulesAdvanced.prepareAttack(this, c, spec);
      if (mode === "hew") {
        this.require(
          u.features.greatWeaponMaster &&
            u.hewTurn === this.s.turnSerial &&
            u.bonus > 0 &&
            spec.kind === "melee" &&
            !spec.unarmed,
          "Нет добивающей атаки",
        );
        u.bonus--;
        u.hewTurn = null;
      } else if (mode === "bonus") {
        this.require(
          u.features.martialArts && u.bonus > 0 && spec.unarmed,
          "Нет бонусного безоружного удара",
        );
        u.bonus--;
      } else if (mode === "flurry") {
        this.require(u.flurryLeft > 0 && spec.unarmed, "Нет удара Шквала");
        u.flurryLeft--;
      } else if (mode === "nick") {
        this.require(
          u.features.masteries?.includes("nick") &&
            spec.mastery === "nick" &&
            u.lightWeaponUsed &&
            u.lightWeaponUsed !== spec.id &&
            !u.nickUsed,
          "Нужна атака другим лёгким оружием; Быстрота один раз за ход",
        );
        u.nickUsed = true;
      } else {
        this.require(
          u.action > 0 || u.surgeAction > 0 || u.attacksLeft > 0,
          "Действие Атака потрачено",
        );
        if (u.attacksLeft > 0) u.attacksLeft--;
        else {
          this.spendAction(id);
          u.attacksLeft = RulesMagic.effects(this, id, "slow").length
            ? 0
            : (u.features.extraAttack || 1) - 1;
        }
        if (spec.light) u.lightWeaponUsed = spec.id;
      }
      u.darkMoveWindow = false;
      this.enqueue(
        { kind: "attackRoll", actor: id, target: c.target, spec, mode },
      );
      return;
    }
    if (c.kind === "move") {
      this.validatePath(id, c.path, u.move);
      u.darkMoveWindow = false;
      this.enqueue({
        kind: "moveStep",
        actor: id,
        path: structuredClone(c.path),
        provoked: [],
      });
      return;
    }
    if (c.kind === "endTurn") {
      this.enqueue({ kind: "endTurn", actor: id });
      return;
    }
    if (c.kind === "policy") {
      this.require(
        ["heroic", "luck", "defenseLuck", "sneak"].includes(c.policy),
        "Неизвестная настройка",
      );
      u.policies[c.policy] = Boolean(c.enabled);
      return;
    }
    if (c.kind === "darkness") {
      this.require(
        u.features.shadowArts && u.action > 0 && u.focus > 0,
        "Нет действия, фокуса или Искусств Тени",
      );
      this.require(
        this.inside(c.point) &&
          this.distance(u, c.point) <= 60 &&
          this.wallLOS(u, c.point),
        "Тьма: центр недоступен",
      );
      u.action--;
      u.focus--;
      u.darkMoveWindow = false;
      this.endConcentration(id);
      this.s.zones.push({
        id: "zone-" + ++this.s.sequence,
        kind: "darkness",
        owner: id,
        ...c.point,
        radius: 15,
        until: this.s.elapsed + 600,
        concentration: true,
      });
      this.emit(
        "cast",
        id,
        this.name(id) + " создаёт Тьму: 1 фокус, радиус 15 футов.",
        { spell: "darkness", point: c.point },
      );
      return;
    }
    if (c.kind === "moveDarkness") {
      const z = this.s.zones.find(
        (z) => z.kind === "darkness" && z.owner === id,
      );
      this.require(
        z && u.darkMoveWindow,
        "Перенос Тьмы доступен в начале своего хода",
      );
      this.require(
        this.inside(c.point) &&
          this.distance(u, c.point) <= 60 &&
          this.wallLOS(u, c.point),
        "Центр вне досягаемости",
      );
      Object.assign(z, c.point);
      u.darkMoveWindow = false;
      this.emit("zoneMoved", id, this.name(id) + " переносит свою Тьму.", {
        zone: z.id,
        point: c.point,
      });
      return;
    }
    if (c.kind === "endConcentration") {
      this.endConcentration(id);
      return;
    }
    if (c.kind === "flurry") {
      this.require(
        u.features.martialArts && u.bonus > 0 && u.focus > 0,
        "Нет бонусного действия или фокуса",
      );
      u.bonus--;
      u.focus--;
      u.flurryLeft = u.features.flurryCount || 2;
      u.darkMoveWindow = false;
      this.emit(
        "ability",
        id,
        this.name(id) +
          " использует Шквал ударов; цель каждого удара выбирается отдельно.",
      );
      return;
    }
    if (["dash", "disengage", "dodge"].includes(c.kind)) {
      const bonus = c.cost === "bonus",
        paid = Boolean(c.paid);
      this.require(
        (bonus ? u.bonus : u.action + (u.surgeAction || 0)) > 0,
        "Действие потрачено",
      );
      this.require(
        !bonus || u.features.monkFocus || u.features.cunningAction,
        "Нет подходящего бонусного действия",
      );
      this.require(
        !paid || (u.features.monkFocus && u.focus > 0),
        "Нет фокуса",
      );
      this.require(
        !(bonus && c.kind === "dodge" && !paid),
        "Бонусное Уклонение требует фокус",
      );
      if (bonus) u.bonus--;
      else this.spendAction(id);
      if (paid) u.focus--;
      u.darkMoveWindow = false;
      if (c.kind === "dash") {
        this.adjustMovementBudget(id, this.speed(id));
        u.dashCount = (u.dashCount || 0) + 1;
      }
      if (c.kind === "disengage" || paid) u.disengaged = true;
      if (c.kind === "dodge" || (paid && c.kind === "disengage"))
        this.status(id, "dodge", { expiresAtStart: id });
      if (paid && c.kind === "dash") u.jumpMultiplier = 2;
      this.emit(
        "ability",
        id,
        this.name(id) +
          ": " +
          { dash: "Рывок", disengage: "Отход", dodge: "Уклонение" }[c.kind] +
          (paid ? " · 1 фокус." : "."),
      );
      return;
    }
    if (c.kind === "hide") {
      const bonus = c.cost === "bonus";
      this.require(!bonus || u.features.cunningAction, "Нет бонусного Скрытия");
      this.require(
        bonus ? u.bonus > 0 : u.action > 0 || u.surgeAction > 0,
        "Нет действия",
      );
      const cover = this.s.terrain.cover?.[u.x + "," + u.y] || 0,
        obscured = this.s.zones.some(
          (z) =>
            ["darkness", "fog", "smoke"].includes(z.kind) && this.zoneAt(u, z),
        );
      this.require(
        (cover >= 5 || obscured) &&
          !this.enemies(id).some((e) => this.canSee(e, id)),
        "Для скрытия нужны укрытие или непроглядная область и отсутствие наблюдателя",
      );
      if (bonus) u.bonus--;
      else this.spendAction(id);
      u.darkMoveWindow = false;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Скрытность",
        mode: u.features.silentShadow ? 1 : 0,
        check: true,
        dc: 15,
        minimum:
          u.features.reliableTalent && u.proficientSkills?.includes("stealth")
            ? 10
            : 0,
        count: 1,
        sides: 20,
        bonus: u.skills?.stealth || 0,
        next: { kind: "hideResult", actor: id },
      });
      return;
    }
    if (c.kind === "search") {
      this.require(u.action > 0 || u.surgeAction > 0, "Нет действия");
      this.spendAction(id);
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Поиск",
        check: true,
        minimum:
          u.features.reliableTalent &&
          u.proficientSkills?.includes("perception")
            ? 10
            : 0,
        count: 1,
        sides: 20,
        bonus: u.skills?.perception || 0,
        next: { kind: "searchResult", actor: id },
      });
      return;
    }
    if (c.kind === "check") {
      this.require(
        (u.action > 0 || u.surgeAction > 0) &&
          typeof c.stat === "string" &&
          Object.hasOwn(u.stats, c.stat),
        "Нужны действие и характеристика",
      );
      this.require(
        Number.isInteger(c.dc) && c.dc >= 0 && c.dc <= 40,
        "Нужна согласованная сложность",
      );
      const bonus =
        c.skill && Object.hasOwn(u.skills, c.skill)
          ? u.skills[c.skill]
          : u.stats[c.stat];
      this.spendAction(id);
      this.enqueue({
        kind: "roll",
        actor: id,
        label: String(c.label || "Проверка").slice(0, 100),
        stat: c.stat,
        check: true,
        minimum:
          u.features.reliableTalent && u.proficientSkills?.includes(c.skill)
            ? 10
            : 0,
        count: 1,
        sides: 20,
        bonus,
        next: { kind: "checkResult", actor: id, dc: c.dc },
      });
      return;
    }
    if (c.kind === "stand") {
      const n = Math.floor(this.speed(id) / 2);
      this.require(
        this.has(id, "prone") && n > 0 && u.move >= n,
        "Нельзя встать",
      );
      u.move -= n;
      this.removeStatus(id, "prone");
      return;
    }
    if (c.kind === "grapple" || c.kind === "shove") {
      this.require(
        u.action > 0 || u.surgeAction > 0 || u.attacksLeft > 0,
        "Нет атаки",
      );
      const t = this.unit(c.target);
      this.require(
        t.team !== u.team &&
          this.active(c.target) &&
          this.distance(u, t) <= 5 &&
          this.wallLOS(u, t),
        "Цель недоступна",
      );
      this.require(this.size(c.target) <= this.size(id) + 1, "Цель слишком велика");
      this.require(!this.conditionImmune(c.target, c.kind === "grapple" ? "grappled" : c.push ? "" : "prone"),
        "Цель невосприимчива к этому состоянию");
      if (u.attacksLeft > 0) u.attacksLeft--;
      else {
        this.spendAction(id);
        u.attacksLeft = RulesMagic.effects(this, id, "slow").length
          ? 0
          : (u.features.extraAttack || 1) - 1;
      }
      const dc =
          8 +
          (u.proficiency || 0) +
          Math.max(u.stats.STR, u.features.martialArts ? u.stats.DEX : -99),
        stat = (t.saves.STR || 0) >= (t.saves.DEX || 0) ? "STR" : "DEX";
      this.enqueue(
        this.saveTask(c.target, stat, dc, {
          kind: "contestResult",
          actor: id,
          target: c.target,
          contest: c.kind,
          push: Boolean(c.push),
        }),
      );
      return;
    }
    if (c.kind === "escape") {
      const z = u.statuses.find((z) => z.kind === "grappled");
      this.require(
        z && (u.action > 0 || u.surgeAction > 0),
        "Нет захвата или действия",
      );
      this.spendAction(id);
      const bonus = Math.max(
        u.skills?.athletics ?? u.stats.STR,
        u.skills?.acrobatics ?? u.stats.DEX,
      );
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Освобождение из захвата",
        check: true,
        minimum:
          u.features.reliableTalent &&
          u.proficientSkills?.includes(
            (u.skills?.athletics ?? u.stats.STR) >=
              (u.skills?.acrobatics ?? u.stats.DEX)
              ? "athletics"
              : "acrobatics",
          )
            ? 10
            : 0,
        count: 1,
        sides: 20,
        bonus,
        next: { kind: "escapeResult", actor: id, dc: z.dc },
      });
      return;
    }
    if (c.kind === "ready") {
      this.require(
        (u.action > 0 || u.surgeAction > 0) &&
          ["approach", "attackAlly"].includes(c.trigger),
        "Нужны действие и понятный триггер",
      );
      const spec = this.attackSpec(id, c.weapon);
      this.spendAction(id);
      u.ready = { trigger: c.trigger, spec };
      this.emit(
        "ready",
        id,
        this.name(id) +
          " готовит атаку: " +
          (c.trigger === "approach"
            ? "враг приблизится."
            : "враг атакует союзника."),
      );
      return;
    }
    if (c.kind === "helpAttack") {
      this.require(
        (u.action > 0 || u.surgeAction > 0) &&
          this.enemies(id).includes(c.target) &&
          this.distance(u, this.unit(c.target)) <= 5 &&
          this.wallLOS(u, this.unit(c.target)),
        "Для помощи нужна соседняя враждебная цель и действие",
      );
      this.spendAction(id);
      this.s.help ??= [];
      this.s.help.push({ helper: id, target: c.target });
      this.emit(
        "help",
        id,
        u.name +
          " отвлекает " +
          this.name(c.target) +
          " для следующей атаки союзника.",
      );
      return;
    }
    if (c.kind === "healPotion") {
      const item = c.item || "healing";
      const recipient = c.target || id;
      const patient = this.unit(recipient);
      this.require(this.distance(u, patient) <= 5 && !patient.dead,
        "Для передачи зелья нужна живая цель в пределах 5 футов");
      this.require(
        u.bonus > 0 &&
          u.itemTypes?.[item] === "healing" &&
          (u.items[item] || 0) > 0,
        "Нет зелья или бонусного действия",
      );
      u.bonus--;
      u.items[item]--;
      const healing = RulesActivities.healing("healingPotion", u.itemHealing?.[item] || {});
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Лечебное зелье",
        ...healing,
        next: {
          kind: "healingResult",
          actor: id,
          target: recipient,
          maxHealing:
            healing.count * healing.sides + healing.bonus,
        },
      });
      return;
    }
    if (c.kind === "stabilize") {
      const t = this.unit(c.target);
      this.require(
        (u.action > 0 || u.surgeAction > 0) &&
          t.hp === 0 &&
          !t.dead &&
          !t.stable &&
          this.distance(u, t) <= 5,
        "Цель недоступна",
      );
      this.spendAction(id);
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Медицина",
        check: true,
        dc: 10,
        minimum:
          u.features.reliableTalent && u.proficientSkills?.includes("medicine")
            ? 10
            : 0,
        count: 1,
        sides: 20,
        bonus: u.skills?.medicine ?? u.stats.WIS,
        next: { kind: "stabilizeResult", target: c.target, actor: id },
      });
      return;
    }
    if (c.kind === "flee") {
      this.require(
        u.x === 0 ||
          u.y === 0 ||
          u.x === this.s.terrain.width - 1 ||
          u.y === this.s.terrain.height - 1,
        "Для отхода нужно достичь края поля",
      );
      u.fled = true;
      this.emit("fled", id, this.name(id) + " покидает поле боя.");
      this.checkEnd();
      return;
    }
    if (c.kind === "minorIllusion") {
      this.require(
        u.features.shadowArts &&
          u.action > 0 &&
          String(c.description || "").trim(),
        "Нужны действие и описание иллюзии",
      );
      this.decision("adjudication", id, {
        description: String(c.description).slice(0, 1000),
        cost: { action: 1 },
        effect: null,
      });
      return;
    }
    throw Error("Для этого действия ещё нет проверенного обработчика");
  }
  spendAction(id, magic = false) {
    const u = this.unit(id);
    if (!magic && (u.surgeAction || 0) > 0) {
      u.surgeAction--;
      return;
    }
    this.require(
      u.action > 0,
      magic ? "Нет обычного действия для Магии" : "Нет действия",
    );
    u.action--;
  }
  validatePath(id, path, budget) {
    const u = this.unit(id);
    this.require(Array.isArray(path) && path.length, "Нужен маршрут");
    let from = u,
      cost = 0;
    for (const [index, p] of path.entries()) {
      const step = this.movementStep(id, from, p, {stop: index === path.length - 1});
      this.require(step.allowed, step.reason);
      cost += step.cost;
      from = p;
    }
    this.require(
      cost <= budget && this.speed(id) > 0,
      "Недостаточно передвижения",
    );
    return cost;
  }
  movementStep(id, from, to, {stop = false, knowledge = "observed", forced = false} = {}) {
    const fail = reason => ({allowed: false, canStop: false, cost: 0, reason});
    if (!to || !this.inside(to) || this.wall(to) || this.distance(from, to) !== 5)
      return fail("Маршрут перекрыт");
    if (from.x !== to.x && from.y !== to.y &&
        (this.wall({x: from.x, y: to.y}) || this.wall({x: to.x, y: from.y})))
      return fail("Закрытый угол");
    if (!forced && !RulesMagic.canApproach(this, id, from, to, {observed: knowledge === "observed"}))
      return fail("Нельзя приближаться к источнику страха");
    const occupant = this.occupied(to.x, to.y, id);
    const known = occupant && (knowledge === "actual" ||
      this.unit(occupant).team === this.unit(id).team ||
      (!this.unit(occupant).hidden && this.canSee(id, occupant)));
    if (known && (stop || forced || !this.canPass(id, occupant)))
      return fail("Маршрут перекрыт");
    if (knowledge === "observed" && !forced && (this.unit(id).blockedCells || []).some(p =>
      p.x === to.x && p.y === to.y && p.turn === this.s.turnSerial &&
      p.context === this.movementKnowledge(id)))
      return fail("Маршрут перекрыт");
    return {allowed: true, canStop: !known, cost: this.stepCost(id, to), reason: ""};
  }
  movementKnowledge(id) {
    const u = this.unit(id);
    const visible = other => this.unit(other).team === u.team ||
      (!this.unit(other).hidden && this.canSee(id,other));
    // Only observations invalidate a failed attempt; unseen movement is not an AI oracle.
    return JSON.stringify([u.x,u.y,this.has(id,"frightened"),
      this.fearSources(id).map(other => [other, visible(other)
        ? [this.unit(other).x,this.unit(other).y]
        : [this.s.memory?.[id]?.[other]?.x,this.s.memory?.[id]?.[other]?.y]]),
      this.s.order.filter(other => other !== id && visible(other) &&
        this.unit(other).hp > 0 && !this.unit(other).fled)
        .map(other => [other,this.unit(other).x,this.unit(other).y,this.canPass(id,other)]),
      this.s.terrain.walls]);
  }
  rememberBlockedStep(id, point) {
    const u = this.unit(id), context = this.movementKnowledge(id);
    u.blockedCells = (u.blockedCells || []).filter(p =>
      p.turn === this.s.turnSerial && p.context === context &&
      (p.x !== point.x || p.y !== point.y));
    u.blockedCells.push({x:point.x,y:point.y,turn:this.s.turnSerial,context});
  }
  require(value, message) {
    if (!value) throw Error(message);
  }
  attackSpec(id, key) {
    const a = this.unit(id).attacks.find((x) => x.id === key);
    if (!a) throw Error("Неизвестное оружие");
    return { ...structuredClone(a), dynamicWeaponBase: true };
  }
  knowsPosition(id, target) {
    const t = this.unit(target);
    return this.unit(id).team === t.team || !t.hidden;
  }
  displayedAt(x, y) {
    return (
      this.occupied(x, y) ||
      this.s.order.find((id) => {
        const u = this.unit(id);
        return !u.fled && u.x === x && u.y === y;
      })
    );
  }
  availableAction(command) {
    // Use the real handler on a small detached state, never advance its queue.
    // Validation, costs and target rules therefore cannot drift from execution.
    const id = command.actor || this.actorId;
    const preview = Object.create(CombatRulesEngine.prototype);
    // These commands mutate only their declared actors and enqueue continuations.
    // Global handlers (notably Bait/releaseGrapples) retain full isolation.
    const local = new Set([
      "attack",
      "attackAt",
      "move",
      "endTurn",
      "policy",
      "flurry",
      "dash",
      "disengage",
      "dodge",
      "hide",
      "search",
      "check",
      "stand",
      "grapple",
      "shove",
      "escape",
      "ready",
      "helpAttack",
      "healPotion",
      "stabilize",
      "flee",
      "minorIllusion",
      "secondWind",
      "actionSurge",
      "steadyAim",
      "layOnHands",
      "knowEnemy",
      "restoreKnowEnemy",
    ]);
    if (
      local.has(command.kind) &&
      !(command.kind === "attack" && command.sacred)
    ) {
      const units = { ...this.s.units };
      for (const key of new Set([
        id,
        ...(command.kind === "layOnHands" ? [command.target] : []),
      ]))
        if (units[key]) units[key] = structuredClone(units[key]);
      preview.state = {
        ...this.s,
        units,
        events: [],
        queue: [],
        help: structuredClone(this.s.help || []),
        zones: structuredClone(this.s.zones),
        random: structuredClone(this.s.random),
        effects: structuredClone(this.s.effects),
        spellFrames: structuredClone(this.s.spellFrames),
        objects: structuredClone(this.s.objects),
      };
    } else preview.state = structuredClone({ ...this.s, events: [] });
    preview.revision = 0;
    try {
      if (command.kind === "endConcentration") {
        preview.require(
          this.s.phase === "active" &&
            this.unit(id).controlled &&
            RulesMagic.concentrating(this, id),
          "Нет своей концентрации",
        );
        return { enabled: true, reason: "" };
      }
      preview.require(!this.s.pending, "Сначала заверши текущее решение");
      preview.require(this.s.phase === "active", "Бой завершён");
      preview.require(
        id === this.actorId && !this.incapacitated(id),
        "Сейчас нельзя действовать",
      );
      if (
        [
          "attack",
          "grapple",
          "shove",
          "helpAttack",
          "knowEnemy",
          "bait",
          "stabilize",
          "layOnHands",
        ].includes(command.kind)
      )
        preview.require(command.target, "Выбери цель на карте");
      preview.command({ ...command, actor: id }, preview.unit(id));
      return { enabled: true, reason: "" };
    } catch (error) {
      return { enabled: false, reason: error.message };
    }
  }
  ammoCount(u, spec) {
    return spec.ammoCounter
      ? u.counters[spec.ammoCounter]?.current || 0
      : u[spec.ammo] || 0;
  }
  spendAmmo(u, spec) {
    if (spec.ammoCounter) u.counters[spec.ammoCounter].current--;
    else if (spec.ammo) u[spec.ammo]--;
    if (spec.ammoInventoryId) u.items[spec.ammoInventoryId]--;
    if (spec.ammoItem) u.items[spec.ammoItem]--;
  }
  validateAttack(id, target, spec, from = null) {
    const u = from || this.unit(id),
      t = this.unit(target),
      d = this.distance(u, t);
    this.require(
      t.team !== this.unit(id).team && !t.fled && !t.dead && t.hp > 0,
      "Нужна живая враждебная цель",
    );
    this.require(
      d <= (spec.range || 5) && this.wallLOS(u, t),
      "Цель вне досягаемости или за стеной",
    );
    this.validateAmmunition(id, spec);
  }
  validateAmmunition(id, spec) {
    this.require(
      !(spec.ammo || spec.ammoCounter) ||
        this.ammoCount(this.unit(id), spec) > 0,
      "Боеприпасы закончились",
    );
    this.require(
      !spec.ammoItem || (this.unit(id).items[spec.ammoItem] || 0) > 0,
      "Метательное оружие закончилось",
    );
    this.require(
      !spec.inventoryId || (this.unit(id).items[spec.inventoryId] || 0) > 0,
      "Оружия больше нет при себе",
    );
  }
  attackOrigin(t) {
    return t.origin
      ? { ...this.unit(t.actor), ...t.origin }
      : this.unit(t.actor);
  }
  attackModifiers(id, target, spec, from = null, origin = null) {
    const u = this.unit(id),
      t = this.unit(target),
      p = origin || from || u,
      d = this.distance(p, t),
      vis = {
        adv: !this.canSee(target, id),
        disadv: !this.canSee(id, target, from),
      };
    if (from) vis.adv = !this.canSee(target, from);
    const advantage = [],
      disadvantage = [];
    if (this.has(id, "aim")) advantage.push("Точный прицел");
    if (spec.magicAdvantage) advantage.push("Внутри сферы");
    if (
      RulesMagic.effects(this, id, "compelledDuel").some(
        (x) => x.owner !== target,
      )
    )
      disadvantage.push("Вынужденная дуэль");
    if (
      RulesMagic.effects(this, target, "protectionEvil").length &&
      [
        "aberration",
        "celestial",
        "elemental",
        "fey",
        "fiend",
        "undead",
      ].includes(this.unit(id).creatureType)
    )
      disadvantage.push("Защита от зла и добра");
    if (vis.adv) advantage.push("цель не видит атакующего");
    if (RulesDefenses.protected(this, target))
      disadvantage.push("Защита союзника");
    if (this.has(id, "sap")) disadvantage.push("Ослабление");
    if (u.statuses.some((z) => z.kind === "goaded" && z.source !== target))
      disadvantage.push("Провоцирующая атака");
    if (vis.disadv) disadvantage.push("атакующий не видит цель");
    if (
      this.has(target, "restrained") ||
      this.has(target, "stunned") ||
      this.has(target, "paralyzed") ||
      this.has(target, "petrified") ||
      this.has(target, "unconscious")
    )
      advantage.push("состояние цели");
    if (this.has(target, "prone"))
      (d <= 5 ? advantage : disadvantage).push("цель лежит");
    if (u.vex?.[target] !== undefined && u.vex[target] >= u.turnCount)
      advantage.push("Уязвимость");
    if (
      u.features.packTactics &&
      this.s.order.some(
        (a) =>
          a !== id &&
          this.unit(a).team === u.team &&
          this.active(a) &&
          !this.incapacitated(a) &&
          this.distance(this.unit(a), t) <= 5,
      )
    )
      advantage.push("Стая");
    if (
      this.s.help?.some(
        (h) =>
          h.target === target &&
          h.helper !== id &&
          this.unit(h.helper).team === u.team,
      )
    )
      advantage.push("Помощь союзника");
    if (
      ["restrained", "prone"].some((k) =>
        this.has(id, k),
      )
    )
      disadvantage.push("состояние атакующего");
    const conditions = this.conditionD20Modifiers(id, "attack", from);
    disadvantage.push(...conditions.disadvantage);
    if (
      this.has(target, "dodge") &&
      this.speed(target) > 0 &&
      !this.incapacitated(target) &&
      this.canSee(target, id)
    )
      disadvantage.push("Уклонение");
    if (u.statuses.some((z) => z.kind === "grappled" && z.source !== target))
      disadvantage.push("захват");
    if (spec.kind !== "melee" && spec.kind !== "meleeSpell") {
      if (
        d > (spec.normalRange || spec.range) &&
        !(u.features.sharpshooter && spec.kind === "ranged")
      )
        disadvantage.push("дальняя дистанция");
      if (
        !(u.features.sharpshooter && spec.kind === "ranged") &&
        this.enemies(id).some(
          (e) =>
            this.distance(p, this.unit(e)) <= 5 &&
            !this.incapacitated(e) &&
            this.canSee(e, id),
        )
      )
        disadvantage.push("враг рядом со стрелком");
    }
    return {
      advantage,
      disadvantage,
      adv: advantage.length > 0,
      disadv: disadvantage.length > 0,
      sources: conditions.sources,
    };
  }
  saveTask(id, stat, dc, next, context = {}) {
    const u = this.unit(id),
      auto =
        ["STR", "DEX"].includes(stat) &&
        ["paralyzed", "stunned", "unconscious", "petrified"].some((k) => this.has(id, k));
    const adv =
        RulesMagic.saveAdv(this, id, stat, next) ||
        (stat === "DEX" &&
          this.has(id, "dodge") &&
          this.speed(id) > 0 &&
          !this.incapacitated(id)),
      disadv = stat === "DEX" && this.has(id, "restrained");
    const bonusParts = [
      {rule:"save.base",label:"Спасбросок " + stat,amount:u.saves?.[stat] ?? u.stats?.[stat] ?? 0},
      {rule:"save.aura",label:"Защитные ауры",amount:RulesDefenses.saveBonus(this,id)},
      {rule:"save.magic",label:"Магические эффекты",amount:RulesMagic.saveBonus(this,id,stat)},
      {rule:"save.cover",label:"Укрытие",amount:stat === "DEX" && context.origin ? this.cover(context.origin,id) : 0},
    ].filter((part,index) => index === 0 || part.amount);
    return {
      kind: "roll",
      actor: id,
      label: "Спасбросок " + stat,
      count: 1,
      sides: 20,
      bonus: bonusParts.reduce((total,part) => total + part.amount,0),
      bonusParts,
      modifiers: {advantage: [
        ...(RulesMagic.saveAdv(this,id,stat,next) ? ["Магический эффект"] : []),
        ...(stat === "DEX" && this.has(id,"dodge") && this.speed(id)>0 && !this.incapacitated(id) ? ["Уклонение"] : []),
      ], disadvantage: disadv ? ["Опутан"] : []},
      mode: adv === disadv ? 0 : adv ? 1 : -1,
      autoFail: auto,
      save: true,
      dc,
      next,
      ...(context.origin
        ? { saveOrigin: { x: context.origin.x, y: context.origin.y } }
        : {}),
    };
  }
  speed(id) {
    const u = this.unit(id);
    if (u.aimTurn === this.s.turnSerial) return 0;
    return [
      "grappled",
      "rooted",
      "restrained",
      "paralyzed",
      "unconscious",
      "stunned",
      "petrified",
    ].some((k) => this.has(id, k))
      ? 0
      : Math.max(0, RulesMagic.speed(
          this,
          id,
          Math.max(0, u.speed - (this.has(id, "frost") || this.has(id, "slow") ? 10 : 0),
        ) - 5 * (u.exhaustion || 0));
  }
  adjustMovementBudget(id, delta) {
    const u = this.unit(id),
      budget = u.move + (u.movementDebt || 0) + delta;
    // Preserve overspent movement: removing Slow must not refund spent distance.
    u.move = Math.max(0, budget);
    u.movementDebt = Math.min(0, budget);
  }
  adjustMovementForSpeed(id, previous) {
    this.adjustMovementBudget(
      id,
      (this.speed(id) - previous) * (1 + (this.unit(id).dashCount || 0)),
    );
  }
  stepCost(id, p) {
    const other = this.occupied(p.x, p.y, id),
      creatureDifficult =
        other &&
        this.unit(other).team !== this.unit(id).team &&
        this.size(other) !== 0 &&
        !this.unit(other).hidden &&
        this.canSee(id, other);
    return (
      5 +
      (this.s.terrain.rubble.includes(p.x + "," + p.y) ||
      creatureDifficult ||
      RulesMagic.difficult(this, id, p)
        ? 5
        : 0) +
      (this.has(id, "prone") ? 5 : 0)
    );
  }
  status(id, kind, extra = {}) {
    RulesCapabilities.validateStatus(kind);
    if (this.conditionImmune(id, kind)) return false;
    const u = this.unit(id),
      previous = this.speed(id);
    u.statuses = u.statuses.filter(
      (z) =>
        z.kind !== kind || (extra.stackBySource && z.source !== extra.source),
    );
    const { stackBySource, ...stored } = extra;
    u.statuses.push({ kind, ...stored });
    if (
      [
        "incapacitated",
        "unconscious",
        "paralyzed",
        "stunned",
        "petrified",
      ].includes(kind)
    )
      this.endConcentration(id);
    this.adjustMovementForSpeed(id, previous);
  }
  removeStatus(id, kind) {
    const previous = this.speed(id);
    this.unit(id).statuses = this.unit(id).statuses.filter(
      (z) => z.kind !== kind,
    );
    this.adjustMovementForSpeed(id, previous);
  }
  endConcentration(id) {
    RulesMagic.endConcentration(this, id);
    const old = this.s.zones.filter((z) => z.owner === id && z.concentration);
    this.s.zones = this.s.zones.filter(
      (z) => z.owner !== id || !z.concentration,
    );
    if (old.length)
      this.emit(
        "concentrationEnded",
        id,
        this.name(id) + ": концентрация прекращена.",
      );
  }
  run() {
    let n = 0;
    const previousTrace = this.trace, previousPhase = this.tracePhase;
    this.running = true;
    try {
      while (!this.s.pending && this.s.queue.length) {
        if (++n > 2000) throw Error("Слишком длинная последовательность");
        const task = this.s.queue.shift();
        this.trace = task.trace || previousTrace;
        this.tracePhase = task.op || task.kind;
        this.task(task);
        RulesMagic.maintain(this);
        RulesDefenses.refresh(this);

        this.observeAll();
      }
      if (!this.s.pending && !this.s.queue.length) {
        const live = new Set(this.s.effects.map((x) => x.id));
        for (const id of Object.keys(this.s.spellFrames))
          if (!live.has(id)) delete this.s.spellFrames[id];
      }
    } finally {
      this.running = false;
      this.trace = previousTrace;
      this.tracePhase = previousPhase;
    }
    this.checkEnd();
  }
  observeAll() {
    for (const id of this.s.order) {
      const u = this.unit(id);
      if (!u.hidden) continue;
      if (u.stealthAttackTurn === this.s.turnSerial) continue;
      const cover = this.s.terrain.cover?.[u.x + "," + u.y] || 0,
        concealed =
          cover >= 5 ||
          this.s.zones.some(
            (z) =>
              ["darkness", "fog", "smoke"].includes(z.kind) &&
              this.zoneAt(u, z),
          );
      if (
        this.enemies(id).some(
          (e) =>
            this.canSee(e, { x: u.x, y: u.y }) &&
            (!concealed ||
              (this.unit(e).senses.blindsight || 0) >=
                this.distance(u, this.unit(e))),
        )
      ) {
        u.hidden = false;
        this.removeStatus(id, "invisible");
        this.emit(
          "revealed",
          id,
          u.name + ": скрытие прекращено, враг обнаружил его.",
        );
      }
    }
    for (const id of this.s.order)
      if (this.active(id)) this.recordObservations(id);
  }
  recordObservations(id) {
    const memory = (this.s.memory[id] ??= {});
    for (const foe of this.s.order) {
      const t = this.unit(foe);
      if (t.team === this.unit(id).team || t.hidden || !this.canSee(id, foe))
        continue;
      // A visible fallen opponent is no longer a missing combatant. An unseen
      // defeat does not erase the observer's memory or reveal its outcome.
      if (!this.active(foe)) delete memory[foe];
      else
        memory[foe] = {
          x: t.x,
          y: t.y,
          name: t.name,
          seenTurn: this.s.turnSerial,
        };
    }
  }
  task(t) {
    const s = this.s,
      u = t.actor ? this.unit(t.actor) : null;
    const magicObject = t.magicObject || t.frame?.magicObject;
    if (magicObject && !s.objects[magicObject]) return;
    if (
      RulesAdvanced.task(this, t) ||
      RulesMagic.taskRun(this, t) ||
      RulesClassFeatures.task(this, t) ||
      RulesMartial.task(this, t)
    )
      return;
    if (t.kind === "initiativeSetup") {
      const alert = s.order.find(
        (id) =>
          this.unit(id).controlled &&
          this.unit(id).features.alert &&
          !s.initiativeChoices?.includes(id),
      );
      if (alert) {
        const targets = s.order.filter(
          (id) =>
            id !== alert &&
            this.unit(id).team === this.unit(alert).team &&
            !this.incapacitated(id),
        );
        if (targets.length) {
          this.decision("initiativeSwap", alert, { targets });
          return;
        }
        s.initiativeChoices ??= [];
        s.initiativeChoices.push(alert);
        this.enqueue(t);
        return;
      }
      const id = s.order.find(
        (id) =>
          this.unit(id).controlled &&
          this.unit(id).features.uncannyMetabolism &&
          this.unit(id).metabolism > 0,
      );
      if (id) this.decision("metabolism", id, {});
      else this.enqueue({ kind: "startTurn" });
      return;
    }
    if (t.kind === "startTurn") {
      const id = this.actorId,
        a = this.unit(id);
      s.turnSerial++;
      for (const unit of Object.values(s.units)) delete unit.blockedCells;
      a.turnCount++;
      a.action = 1;
      a.dashCount = 0;
      a.movementDebt = 0;
      a.surgeAction = 0;
      a.movedThisTurn = 0;
      a.bonus = 1;
      a.reaction = 1;
      a.slowChoice = null;
      a.abjureChoice = null;
      a.shieldBashTurn = null;
      a.move = a.speed;
      a.attacksLeft = 0;
      a.nickUsed = false;
      a.lightWeaponUsed = null;
      a.flurryLeft = 0;
      a.disengaged = false;
      a.jumpMultiplier = 1;
      a.darkMoveWindow = true;

      a.ready = null;
      RulesDefenses.refresh(this, id);
      a.statuses = a.statuses.filter(
        (z) =>
          z.expiresAtStart !== id &&
          (z.until === undefined || z.until > s.elapsed),
      );
      s.zones = s.zones.filter((z) => z.until > s.elapsed);
      s.help = (s.help || []).filter((h) => h.helper !== id);
      a.move = this.speed(id);
      if (a.vex)
        for (const k of Object.keys(a.vex))
          if (a.vex[k] < a.turnCount) delete a.vex[k];
      this.releaseGrapples();
      this.emit("turnStarted", id, "Ход: " + a.name + ".");
      RulesMagic.startTurn(this, id);
      if (a.hp === 0 && !a.dead && !a.stable)
        this.enqueue({
          kind: "roll",
          actor: id,
          label: "Спасбросок от смерти",
          save: true,
          deathSave: true,
          dc: 10,
          count: 1,
          sides: 20,
          mode: RulesMagic.effects(this, id, "beaconHope").length ? 1 : 0,
          bonus: RulesDefenses.saveBonus(this, id),
          next: { kind: "deathSaveResult", actor: id },
        });
      return;
    }
    if (t.kind === "endTurn") {
      if (RulesMagic.endTurn(this, t) || RulesAdvanced.endTurn(this, t)) return;
      if (this.occupied(u.x, u.y, t.actor)) {
        u.involuntarySharedSpace = true;
        this.status(t.actor, "prone");
      }
      u.darkMoveWindow = false;
      u.surgeAction = 0;
      u.statuses = u.statuses.filter((z) => z.expiresAtEnd !== t.actor);
      for (const other of s.order) {
        const previous = this.speed(other);
        this.unit(other).statuses = this.unit(other).statuses.filter(
          (z) =>
            z.expiresOnSourceEnd !== t.actor ||
            u.turnCount < (z.expiresOnSourceEndTurn || 0),
        );
        this.adjustMovementForSpeed(other, previous);
      }
      u.flurryLeft = 0;
      this.emit("turnEnded", t.actor, this.name(t.actor) + " завершает ход.");
      for (let n = 0; n < s.order.length; n++) {
        s.index++;
        if (s.index >= s.order.length) {
          s.index = 0;
          s.round++;
          s.elapsed += 6;
        }
        const a = this.unit(this.actorId);
        if (
          !a.dead &&
          !a.fled &&
          !(this.has(this.actorId, "unconscious") && a.hp > 0)
        )
          break;
      }
      this.enqueue({ kind: "startTurn" });
      return;
    }
    if (t.kind === "roll") {
      if (t.sides === 20 && t.check && !t.conditionsApplied) {
        const modifiers = this.conditionD20Modifiers(t.actor, "check");
        if (t.mode > 0) modifiers.advantage.unshift("Условия проверки");
        if (t.mode < 0) modifiers.disadvantage.unshift("Условия проверки");
        const adv = t.mode > 0 || modifiers.advantage.length > 0;
        const disadv = t.mode < 0 || modifiers.disadvantage.length > 0;
        t = {...t, mode: adv === disadv ? 0 : adv ? 1 : -1,
          conditionsApplied: true, modifiers};
      }
      if (!t.magicBonusDone) {
        const baseBonus = t.bonus || 0;
        const added = RulesMagic.rollBonus(this, t);
        t = {
          ...t,
          bonus: baseBonus + added,
          bonusParts: [...(t.bonusParts || [{rule:"base",label:"Основной модификатор",amount:baseBonus}]),
            ...(t.magicModifiers || [])],
          magicBonusDone: true,
        };
      }
      if (t.autoFail) {
        this.emit(
          "automaticFailure",
          t.actor,
          this.name(t.actor) +
            ": " +
            t.label +
            " — автоматический провал из-за состояния.",
        );
        this.enqueue({
          ...t.next,
          result: { rolls: [], kept: 0, total: 0, dc: t.dc, success: false },
        });
        return;
      }
      const rolls = Array.from(
        { length: t.sides === 20 && t.mode ? 2 : t.count },
        () => this.roll(t.sides),
      );
      if (
        u.controlled &&
        ((u.policies.heroic && u.heroic > 0) ||
          (t.sides === 20 && u.policies.luck && u.luck > 0)) &&
        !t.autoFail
      ) {
        this.decision("roll", t.actor, {
          roll: { ...t, rolls },
          heroic: u.heroic > 0,
          lucky: t.sides === 20 && u.luck > 0,
        });
        return;
      }
      this.finishRoll({ ...t, rolls });
      return;
    }
    if (t.kind === "attackRoll") {
      if (!this.active(t.actor) || !this.active(t.target)) return;
      if (!t.completionQueued) {
        // Every attack path, including spells and reactions, has one trigger
        // continuation. The flag survives Shield/Protection/reload retries.
        t = {...t, completionQueued:true};
        if (!s.queue.some(next => next.kind === "attackCompleted" &&
            next.actor === t.actor && next.target === t.target && !next.considered))
          this.enqueue({kind:"attackCompleted",actor:t.actor,target:t.target});
      }
      if (!t.weaponPrepared) {
        const legacy =
          ["30.5.1", "30.5.0"].includes(s.engineVersion) &&
          !t.spec.dynamicWeaponBase &&
          !["reaction", "haste"].includes(t.mode);
        t = {
          ...t,
          spec: legacy
            ? t.spec
            : RulesAdvanced.weaponSpec(this, t.actor, t.spec),
          weaponPrepared: true,
        };
      }
      if (RulesDefenses.beforeAttack(this, t)) return;
      const target = this.unit(t.target);
      if (
        target.controlled &&
        target.policies.defenseLuck &&
        target.luck > 0 &&
        !t.luckConsidered
      ) {
        this.decision("defenseLuck", t.target, { attack: t });
        return;
      }
      const m = this.attackModifiers(t.actor, t.target, t.spec, null, t.origin);
      s.help = (s.help || []).filter(
        (h) =>
          !(
            h.target === t.target &&
            h.helper !== t.actor &&
            this.unit(h.helper).team === u.team
          ),
      );
      if (t.luckDefense) { m.disadv = true; m.disadvantage.push("Удача цели"); }
      const mode = m.adv === m.disadv ? 0 : m.adv ? 1 : -1;
      this.removeStatus(t.actor, "aim");
      this.removeStatus(t.actor, "sap");
      if (u.vex) delete u.vex[t.target];
      t.hiddenBefore = !!u.hidden;
      this.removeStatus(t.actor, "invisible");
      u.hidden = false;
      this.spendAmmo(u, t.spec);
      this.enqueue({
        kind: "roll",
        actor: t.actor,
        label: t.spec.name + " → " + this.name(t.target),
        count: 1,
        sides: 20,
        mode,
        bonus: t.spec.bonus,
        attackRoll: true,
        modifiers: m,
        next: { ...t, kind: "attackResult", modifiers: m },
      });
      return;
    }
    if (t.kind === "attackResult") {
      if (
        RulesMartial.beforeResult(this, t) ||
        RulesDefenses.beforeResult(this, t)
      )
        return;
      if (t.result.lucky) {
        t.modifiers.adv = true;
        t.modifiers.advantage.push("Удача");
      }
      const origin = this.attackOrigin(t);
      const d = t.result.kept,
        hit =
          d === 20 ||
          (d !== 1 &&
            t.result.total >=
              this.ac(t.target, origin, t.spec) + (t.acBonus || 0)),
        m = t.modifiers;
      const critical =
        !t.cancelCritical &&
        (d === 20 ||
          (this.distance(origin, this.unit(t.target)) <= 5 &&
            ["paralyzed", "unconscious"].some((k) => this.has(t.target, k))));
      this.emit(
        "attack",
        t.actor,
        this.name(t.actor) +
          ": " +
          t.spec.name +
          " → " +
          this.name(t.target) +
          "; " +
          (m.adv && m.disadv
            ? "ПРЕИМУЩЕСТВО И ПОМЕХА ВЗАИМНО ОТМЕНЕНЫ"
            : m.adv
              ? "ПРЕИМУЩЕСТВО"
              : m.disadv
                ? "ПОМЕХА"
                : "обычный бросок") +
          "; " +
          t.result.rolls.join(", ") +
          " +" +
          (t.result.total - t.result.kept) +
          " = " +
          t.result.total +
          " против КД " +
          (this.ac(t.target, origin, t.spec) + (t.acBonus || 0)) +
          (hit
            ? critical
              ? " — КРИТИЧЕСКОЕ ПОПАДАНИЕ."
              : " — попадание."
            : " — промах.") +
          (this.s.zones.some((z) => z.kind === "darkness")
            ? " Тьма: учтена видимость."
            : ""),
        {
          target: t.target,
          modifiers: m,
          targetAC: this.ac(t.target, origin, t.spec) + (t.acBonus || 0),
          acBonus: t.acBonus || 0,
          bonusParts: t.result.bonusParts,
          hit,
          critical,
          attackKind: t.spec.kind,
          object: t.magicObject,
          weapon: t.spec.id,
          unarmed: Boolean(t.spec.unarmed),
          projectile: t.spec.ammoItem ? "thrown" : t.spec.kind === "rangedSpell" ? "spell" : "arrow",
          damageType: t.spec.damageType,
          origin: { x: origin.x, y: origin.y },
          point: { x: this.unit(t.target).x, y: this.unit(t.target).y },
          rolls: t.result.rolls,
        },
      );
      if (!hit) {
        if (RulesMagic.afterMiss(this, t)) return;
        RulesMartial.afterMiss(this, t);
        return;
      }
      if (t.magicObject) this.s.objects[t.magicObject].empoweredUsed = true;
      if (t.spec.effects?.length)
        this.enqueue({
          kind: "attackEffects",
          actor: t.actor,
          target: t.target,
          effects: structuredClone(t.spec.effects),
        });
      const allied = this.s.order.some(
        (id) =>
          id !== t.actor &&
          this.unit(id).team === u.team &&
          !this.incapacitated(id) &&
          this.unit(id).hp > 0 &&
          this.distance(this.unit(id), this.unit(t.target)) <= 5,
      );
      const sneak = Boolean(
        u.features.sneakDice &&
          t.spec.sneakEligible &&
          u.sneakTurn !== s.turnSerial &&
          u.policies.sneak !== false &&
          (!m.disadv || m.adv) &&
          ((m.adv && !m.disadv) || allied),
      );
      if (sneak) u.sneakTurn = s.turnSerial;

      const sneakCount = sneak ? u.features.sneakDice * (critical ? 2 : 1) : 0;
      this.enqueue({
        ...t,
        kind: "weaponDamageRoll",
        critical,
        sneakCount,
        strikeId: "strike-" + ++s.sequence,
      });
      return;
    }
    if (t.kind === "attackEffects") {
      for (const effect of t.effects) RulesCapabilities.effect(effect);
      if (!this.active(t.target)) return;
      const [effect, ...rest] = t.effects;
      if (!effect) return;
      if (rest.length) this.enqueue({ ...t, effects: rest });
      const next = {
        kind: "applyAttackCondition",
        actor: t.actor,
        target: t.target,
        effect,
      };
      if (this.unit(t.target).conditionImmunities?.includes(effect.condition)) {
        this.emit(
          "conditionImmune",
          t.target,
          this.name(t.target) +
            ": иммунитет к эффекту «" +
            (effect.name || effect.condition) +
            "».",
        );
      } else if (effect.save)
        this.enqueue(
          this.saveTask(t.target, effect.save.stat, effect.save.dc, next),
        );
      else this.enqueue(next);
      return;
    }
    if (t.kind === "applyAttackCondition") {
      RulesCapabilities.effect(t.effect);
      if (!this.active(t.target) || t.result?.success) return;
      this.status(t.target, t.effect.condition, {
        source: t.actor,
        ...(t.effect.duration === "source-next-start"
          ? { expiresOnSourceStart: t.actor }
          : {}),
        ...(t.effect.duration === "target-next-start"
          ? { expiresAtStart: t.target }
          : {}),
      });
      this.emit(
        "attackCondition",
        t.target,
        this.name(t.target) +
          ": " +
          (t.effect.name || t.effect.condition) +
          ".",
        { condition: t.effect.condition, source: t.actor },
      );
      return;
    }
    if (t.kind === "damageResult") {
      if (t.sneakCount) {
        this.enqueue({
          kind: "roll",
          actor: t.actor,
          label: "Скрытая атака",
          count: t.sneakCount,
          sides: 6,
          minimumDie: t.minimumDie,
          bonus: 0,
          next: {
            ...t,
            kind: "sneakResult",
            baseDamage: Math.max(0, t.result.total),
          },
        });
        return;
      }
      this.enqueue(this.damageTask(t, Math.max(0, t.result.total)));
      return;
    }
    if (t.kind === "sneakResult") {
      this.enqueue(this.damageTask(t, t.baseDamage + t.result.total));
      return;
    }
    if (t.kind === "damage") {
      if (t.amount <= 0) return;
      if (!t.breakdown) t = {...t, breakdown: [{rule:"damage.initial",label:"Урон до защит",
        before:t.amount,after:t.amount}]};
      else t = {...t, breakdown: structuredClone(t.breakdown)};
      const target = this.unit(t.target),
        physicalTypes = ["bludgeoning", "piercing", "slashing"],
        physical = this.damageParts(t).some((p) =>
          physicalTypes.includes(p.damageType),
        );
      if (
        !t.finalTransfer &&
        !t.mitigated &&
        !t.deflectResolved &&
        t.attackHit !== false &&
        t.attack &&
        physical &&
        target.features.deflectAttacks &&
        target.reaction > 0 &&
        RulesMagic.canReact(this, t.target) &&
        !this.incapacitated(t.target)
      ) {
        if (target.controlled) {
          this.decision("deflect", t.target, { damage: t });
          return;
        }
        this.deflect(t, true);
        return;
      }
      if (
        !t.finalTransfer &&
        !t.mitigated &&
        !t.armorReduced &&
        t.attack &&
        physical &&
        target.features.heavyArmor &&
        target.features.heavyArmorReduction
      ) {
        t = {
          ...this.reduceDamage(
            t,
            target.features.heavyArmorReduction,
            physicalTypes,
            "defense.heavyArmor", "Тяжёлый доспех",
          ),
          armorReduced: true,
        };
      }
      if (
        !t.finalTransfer &&
        !t.mitigated &&
        RulesClassFeatures.beforeDamage(this, t)
      )
        return;
      let amount = t.amount;
      if (!t.mitigated && !t.finalTransfer) {
        const components = this.damageParts(t).map((p) => {
          let n = target.immunities?.includes(p.damageType) ? 0 : p.amount;
          if (n !== p.amount) t.breakdown.push({rule:"damage.immunity",label:"Иммунитет",
            damageType:p.damageType,before:p.amount,after:n});
          const reduced = RulesMagic.mitigate(this, {...t,damageType:p.damageType}, n);
          if (reduced !== n) t.breakdown.push({rule:"damage.resistance",label:"Сопротивление",
            damageType:p.damageType,before:n,after:reduced});
          n = reduced;
          if (target.vulnerabilities?.includes(p.damageType)) {
            t.breakdown.push({rule:"damage.vulnerability",label:"Уязвимость",
              damageType:p.damageType,before:n,after:n*2}); n *= 2;
          }
          return {
            ...p,
            amount: n,
          };
        });
        amount = components.reduce((n, p) => n + p.amount, 0);
        t = { ...t, components };
      }
      if (RulesMagic.split(this, t, amount)) return;
      if (
        !t.finalTransfer &&
        !t.knockoutResolved &&
        t.attack &&
        ["melee", "meleeSpell"].includes(t.attack.kind) &&
        u?.controlled &&
        target.hp > 0 &&
        amount - (target.temp || 0) >= target.hp
      ) {
        this.decision("knockout", t.actor, {
          damage: { ...t, amount, mitigated: true },
        });
        return;
      }
      if (t.mitigated) amount = t.amount;
      const temp = Math.min(target.temp || 0, amount);
      target.temp = (target.temp || 0) - temp;
      const lost = amount - temp,
        before = target.hp;
      if (before === 0 && amount > 0) {
        target.deathFailures =
          (target.deathFailures || 0) + (t.critical ? 2 : 1);
        target.stable = false;
        if (target.deathFailures >= 3 || lost >= target.max) target.dead = true;
      }
      target.hp = Math.max(0, before - lost);
      this.emit(
        "damage",
        t.target,
        target.name +
          ": " +
          amount +
          " урона" +
          (temp ? " (временные ПЗ поглотили " + temp + ")" : "") +
          ", осталось " +
          target.hp +
          "/" +
          target.max +
          ".",
        {
          amount,
          lost,
          hpLost: before - target.hp,
          temp,
          breakdown: t.breakdown,
          damageType: t.damageType,
          ...(t.components ? { components: t.components } : {}),
          source: t.actor,
          strikeId: t.strikeId,
        },
      );
      RulesMagic.damaged(this, t, amount);
      if (target.hp === 0) {
        this.status(t.target, "unconscious");
        this.status(t.target, "prone");
        if (!target.deathSaves || lost - before >= target.max)
          target.dead = true;
        target.reaction = 0;
        this.releaseGrapples();
      }
      if (target.dead && target.diedAtSeconds === undefined)
        target.diedAtSeconds = s.elapsed;
      if (target.hp !== 0 && amount > 0 && RulesMagic.concentrating(this, t.target))
        this.enqueue(
          this.saveTask(
            t.target,
            "CON",
            Math.min(30, Math.max(10, Math.floor(amount / 2))),
            { kind: "concentrationResult", actor: t.target, damage: amount },
          ),
        );
      this.checkEnd();
      return;
    }
    if (t.kind === "concentrationResult") {
      this.emit(
        "concentration",
        t.actor,
        this.name(t.actor) +
          ": концентрация — " +
          t.result.total +
          " против СЛ " +
          t.result.dc +
          (t.result.success ? " (успех)." : " (провал)."),
        {damage: t.damage, dc: t.result.dc, total: t.result.total, success: t.result.success},
      );
      if (!t.result.success) this.endConcentration(t.actor);
      return;
    }
    if (t.kind === "deflectResult") {
      this.finishDeflect(t.damage, t.result.total);
      return;
    }
    if (t.kind === "redirectRollResult") {
      const dc = 8 + (u.proficiency || 0) + u.stats.DEX;
      this.enqueue(
        this.saveTask(t.target, "DEX", dc, {
          kind: "redirectDamage",
          actor: t.actor,
          target: t.target,
          damageType: t.damageType,
          amount: t.result.total,
        }),
      );
      return;
    }
    if (t.kind === "attackCompleted" || t.kind === "moveCompleted") {
      for (const id of s.order) {
        const a = this.unit(id);
        if (
          !t.considered?.includes(id) &&
          a.team !== u.team &&
          this.active(t.actor) &&
          a.ready?.trigger === (t.kind === "moveCompleted" ? "approach" : "attackAlly") &&
          a.reaction > 0 &&
          RulesMagic.canReact(this, id) &&
          this.active(id) &&
          !this.incapacitated(id) &&
          (t.kind === "moveCompleted" || this.unit(t.target).team === a.team)
        ) {
          try {
            this.validateAttack(id, t.actor, a.ready.spec);
            const attack = {
              kind: "attackRoll",
              actor: id,
              target: t.actor,
              spec: a.ready.spec,
              mode: "reaction",
            };
            if (a.controlled) {
              this.decision("ready", id, {
                attack,
                resume: { ...t, considered: [...(t.considered || []), id] },
              });
              return;
            }
            a.ready = null;
            a.reaction--;
            this.enqueue(attack, {
              ...t,
              considered: [...(t.considered || []), id],
            });
            return;
          } catch {}
        }
      }
      return;
    }
    if (t.kind === "checkResult") {
      this.emit(
        "check",
        t.actor,
        u.name +
          ": результат " +
          t.result.total +
          " против СЛ " +
          t.dc +
          (t.result.total >= t.dc ? " — успех." : " — провал."),
      );
      return;
    }
    if (t.kind === "emptyAttackResult") {
      this.emit(
        "attackMissed",
        t.actor,
        u.name + ": атака клетки " + this.cell(t.point) + " — промах.",
        { point: t.point, origin: {x:u.x,y:u.y}, attackKind:t.spec?.kind,
          weapon:t.spec?.id, unarmed:Boolean(t.spec?.unarmed),
          projectile:t.spec?.ammoItem ? "thrown" : "arrow" },
      );
      return;
    }
    if (t.kind === "redirectDamage") {
      if (!t.result.success)
        this.enqueue({
          kind: "damage",
          actor: t.actor,
          target: t.target,
          amount: t.amount,
          damageType: t.damageType,
          attack: null,
        });
      return;
    }
    if (t.kind === "moveStep") {
      if (!this.active(t.actor) || !t.path.length) {
        this.markSharedSpace(t.actor);
        return;
      }
      const p = t.path[0],
        occupant = this.occupied(p.x, p.y, t.actor);
      const step = this.movementStep(t.actor, u, p,
        {stop: t.path.length === 1, knowledge: "actual", forced: Boolean(t.forced)});
      if (!step.allowed && !occupant) {
        if (!t.forced) {
          this.rememberBlockedStep(t.actor,p);
        }
        this.markSharedSpace(t.actor);
        this.emit("movementBlocked",t.actor,
          "Маршрут изменился после реакции: выбери путь заново.");
        return;
      }
      if (
        occupant &&
        !step.allowed
      ) {
        if (!t.forced) this.rememberBlockedStep(t.actor,p);
        this.markSharedSpace(t.actor);
        this.emit(
          "movementBlocked",
          t.actor,
          u.name + ": движение остановлено, проход перекрыт.",
        );
        return;
      }
      if (
        !step.allowed ||
        (!t.forced && this.speed(t.actor) === 0) ||
        (t.freeBudget ?? u.move) < step.cost
      ) {
        this.markSharedSpace(t.actor);
        return;
      }
      if (!u.disengaged && !t.noOA) {
        const enemy = this.enemies(t.actor).find(
          (e) =>
            !t.provoked.includes(e) &&
            !(t.oaExempt || []).includes(e) &&
            this.unit(e).reaction > 0 &&
            RulesMagic.canReact(this, e) &&
            !this.incapacitated(e) &&
            this.canSee(e, t.actor) &&
            this.unit(e).attacks.some(
              (a) =>
                a.kind === "melee" &&
                this.distance(u, this.unit(e)) <= a.range &&
                this.distance(p, this.unit(e)) > a.range,
            ),
        );
        if (enemy) {
          const reactor = this.unit(enemy),
            spec = reactor.attacks.find(
              (a) =>
                a.kind === "melee" &&
                this.distance(u, reactor) <= a.range &&
                this.distance(p, reactor) > a.range,
            );
          t.provoked.push(enemy);
          if (reactor.controlled) {
            this.decision("opportunity", enemy, {
              attack: {
                kind: "attackRoll",
                actor: enemy,
                target: t.actor,
                spec,
                mode: "reaction",
              },
              movement: t,
            });
            return;
          }
          reactor.reaction--;
          this.enqueue(
            {
              kind: "attackRoll",
              actor: enemy,
              target: t.actor,
              spec,
              mode: "reaction",
            },
            t,
          );
          return;
        }
      }
      const from = { x: u.x, y: u.y },
        cost = this.stepCost(t.actor, p);
      if (t.freeBudget !== undefined) t.freeBudget -= cost;
      else u.move -= cost;
      if (!t.forced && this.actorId === t.actor)
        u.movedThisTurn = (u.movedThisTurn || 0) + cost;
      u.x = p.x;
      u.y = p.y;
      u.involuntarySharedSpace = false;
      this.releaseGrapples();
      this.emit(
        "move",
        t.actor,
        u.name +
          ": " +
          this.cell(from) +
          " → " +
          this.cell(p) +
          " (" +
          cost +
          " фт).",
        { from, to: p, cost },
      );
      this.enqueue({kind:"moveCompleted",actor:t.actor},
        { ...t, path: t.path.slice(1), provoked: [] });
      RulesMagic.moved(this, t.actor);
      return;
    }
    if (t.kind === "hideResult") {
      if (t.result.total >= 15) {
        u.hidden = true;
        u.hideDC = t.result.total;
        this.status(t.actor, "invisible");
      }
      this.emit(
        "hide",
        t.actor,
        u.name +
          ": Скрытность " +
          t.result.total +
          (u.hidden ? " — спрятался." : " — недостаточно."),
      );
      return;
    }
    if (t.kind === "searchResult") {
      // Record completed searches, not proposed AI commands. This survives a
      // checkpoint during the perception roll and also works for player Search.
      for (const [id, memory] of Object.entries(s.memory[t.actor] || {})) {
        if (this.canSee(t.actor, id) && !this.unit(id).hidden) continue;
        memory.searchedFrom ??= [];
        const cell = u.x + "," + u.y;
        if (!memory.searchedFrom.includes(cell)) memory.searchedFrom.push(cell);
      }
      for (const id of this.enemies(t.actor)) {
        const a = this.unit(id);
        if (a.hidden && a.features.silentShadow && this.wallLOS(u, a)) {
          this.enqueue({
            kind: "roll",
            actor: t.actor,
            label: "Визуальный поиск · Плащ Тихой Тени",
            count: 1,
            sides: 20,
            mode: -1,
            check: true,
            dc: a.hideDC,
            bonus: u.skills?.perception || 0,
            next: RulesMagic.task(t.actor, "shadowSearch", { target: id }),
          });
          continue;
        }
        if (a.hidden && t.result.total >= a.hideDC && this.wallLOS(u, a)) {
          a.hidden = false;
          this.removeStatus(id, "invisible");
          this.emit(
            "found",
            t.actor,
            u.name + " обнаруживает " + a.name + ".",
            { target: id },
          );
        }
      }
      return;
    }
    if (t.kind === "contestResult") {
      if (!t.result.success) {
        if (t.contest === "grapple")
          this.status(t.target, "grappled", {
            source: t.actor,
            dc: t.result.dc,
          });
        else if (t.push) {
          const a = this.unit(t.target),
            p = {
              x: a.x + Math.sign(a.x - u.x),
              y: a.y + Math.sign(a.y - u.y),
            };
          if (!this.wall(p) && !this.occupied(p.x, p.y)) {
            a.x = p.x;
            a.y = p.y;
            this.releaseGrapples();
          }
        } else this.status(t.target, "prone");
      }
      this.emit(
        "contest",
        t.actor,
        u.name +
          ": " +
          (t.contest === "grapple" ? "захват" : "толчок") +
          (t.result.success ? " — цель спаслась." : " — успех."),
      );
      return;
    }
    if (t.kind === "escapeResult") {
      if (t.result.total >= t.dc) this.removeStatus(t.actor, "grappled");
      return;
    }
    if (t.kind === "healingResult") {
      this.heal(
        t.target,
        RulesMagic.effects(this, t.target, "beaconHope").length
          ? t.maxHealing || 10
          : t.result.total,
      );
      return;
    }
    if (t.kind === "stabilizeResult") {
      if (t.result.total >= 10) {
        const a = this.unit(t.target);
        a.stable = true;
        a.deathSuccesses = 0;
        a.deathFailures = 0;
      }
      this.checkEnd();
      return;
    }
    if (t.kind === "deathSaveResult") {
      const d = t.result.kept;
      if (d === 20) {
        this.heal(t.actor, 1);
        return;
      }
      if (d !== 1 && t.result.total >= 10)
        u.deathSuccesses = (u.deathSuccesses || 0) + 1;
      else u.deathFailures = (u.deathFailures || 0) + (d === 1 ? 2 : 1);
      if (u.deathFailures >= 3) {
        u.dead = true;
        u.diedAtSeconds ??= s.elapsed;
      }
      if (u.deathSuccesses >= 3) u.stable = true;
      this.emit(
        "deathSave",
        t.actor,
        u.name + ": спасбросок от смерти " + d + ".",
      );
      this.checkEnd();
      return;
    }
    throw Error("Неизвестный этап: " + t.kind);
  }
  cell(p) {
    return String.fromCharCode(65 + p.x) + (p.y + 1);
  }
  markSharedSpace(id) {
    const u = this.unit(id);
    if (this.occupied(u.x, u.y, id)) u.involuntarySharedSpace = true;
  }
  finishRoll(t) {
    if (RulesClassFeatures.afterRoll(this, t)) return;
    const rawKept =
      t.sides === 20 && t.mode
        ? t.mode > 0
          ? Math.max(...t.rolls)
          : Math.min(...t.rolls)
        : t.rolls[0];
    const kept = t.sides === 20 ? Math.max(rawKept, t.minimum || 0) : rawKept;
    // The 2024 exhaustion penalty affects every D20 Test, never damage dice.
    const exhaustionPenalty = t.sides === 20 ? -2 * (this.unit(t.actor).exhaustion || 0) : 0;
    const rollBonus = (t.bonus || 0) + exhaustionPenalty;
    const total =
        (t.sides === 20
          ? kept
          : t.rolls.reduce((a, b) => a + Math.max(b, t.minimumDie || 0), 0)) +
        rollBonus,
      success = !t.autoFail && total >= t.dc;
    const modifiers = t.modifiers ? structuredClone(t.modifiers) : undefined;
    const bonusParts = [...(t.bonusParts || []), ...(exhaustionPenalty ? [{rule:"condition.exhaustion", label:"Истощение", amount:exhaustionPenalty}] : [])];
    if (modifiers && t.luckyUsed) modifiers.advantage.push("Удача");
    this.emit(
      "roll",
      t.actor,
      this.name(t.actor) +
        ": " +
        t.label +
        " [" +
        t.rolls.join(", ") +
        "] " +
        (rollBonus >= 0 ? "+" : "") +
        rollBonus +
        " = " +
        total +
        ".",
      {
        rolls: t.rolls,
        sides: t.sides,
        bonus: rollBonus,
        total,
        mode: t.mode || 0,
        kept, rawKept, minimum: t.minimum || 0,
        ...(Number.isFinite(t.dc) ? {dc: t.dc} : {}),
        modifiers,
        bonusParts,
      },
    );
    this.enqueue({
      ...t.next,
      result: {
        rolls: t.rolls,
        kept,
        total,
        bonusParts,
        dc: t.dc,
        success,
        lucky: Boolean(t.luckyUsed),
      },
    });
  }
  damageTask(t, amount) {
    const u = this.unit(t.actor);
    if (t.spec.mastery === "vex" && u.features.masteries?.includes("vex")) {
      u.vex ??= {};
      u.vex[t.target] = u.turnCount + 1;
    }
    return {
      kind: "weaponDamage",
      actor: t.actor,
      target: t.target,
      frame: t,
      amount,
    };
  }
  damageParts(t) {
    const parts = t.components || [
      { amount: t.amount, damageType: t.damageType },
    ];
    const grouped = new Map();
    for (const p of parts)
      grouped.set(p.damageType, (grouped.get(p.damageType) || 0) + p.amount);
    return [...grouped].map(([damageType, amount]) => ({ damageType, amount }));
  }
  reduceDamage(t, reduction, types = null, rule = "damage.reduction", label = "Снижение урона") {
    const components = this.damageParts(t).map((p) => {
      const n =
        types && !types.includes(p.damageType)
          ? 0
          : Math.min(reduction, p.amount);
      reduction -= n;
      return { ...p, amount: p.amount - n };
    });
    return {
      ...t,
      components,
      amount: components.reduce((n, p) => n + p.amount, 0),
      breakdown: [...(t.breakdown || []), {rule,label,before:t.amount,
        after:components.reduce((n,p) => n+p.amount,0)}],
    };
  }
  halfDamage(t, rule = "damage.half", label = "Половина урона") {
    let total = 0,
      allocated = 0;
    const components = this.damageParts(t).map((p) => {
      total += p.amount;
      const amount = Math.floor(total / 2) - allocated;
      allocated += amount;
      return { ...p, amount };
    });
    return { ...t, components, amount: allocated,
      breakdown: [...(t.breakdown || []), {rule,label,before:t.amount,after:allocated}] };
  }
  deflect(t, use) {
    const u = this.unit(t.target);
    if (!use) {
      this.enqueue({ ...t, deflectResolved: true });
      return;
    }
    this.require(
      u.reaction > 0 && RulesMagic.canReact(this, u.id),
      "Реакция потрачена",
    );
    u.reaction--;
    this.enqueue({
      kind: "roll",
      actor: t.target,
      label: "Отражение атак",
      count: 1,
      sides: 10,
      bonus: u.stats.DEX + (u.features.deflectAttacks || 0),
      next: { kind: "deflectResult", actor: t.target, damage: t },
    });
  }
  finishDeflect(t, reduction) {
    const u = this.unit(t.target),
      amount = Math.max(0, t.amount - reduction);
    this.emit(
      "deflect",
      t.target,
      u.name +
        ": Отражение атак, снижение " +
        reduction +
        ", остаток " +
        amount +
        ".",
      { reduction, amount },
    );
    if (amount)
      this.enqueue({
        ...this.reduceDamage(t, reduction, null, "monk.deflectAttacks", "Отражение атак"),
        deflectResolved: true,
      });
    else if (u.focus > 0) {
      const range =
          t.attack.kind === "melee" || t.attack.kind === "meleeSpell" ? 5 : 60,
        targets = this.s.order.filter(
          (id) =>
            id !== t.target &&
            this.active(id) &&
            this.distance(u, this.unit(id)) <= range &&
            this.canSee(t.target, id),
        );
      if (targets.length && u.controlled)
        this.decision("redirect", t.target, {
          range,
          targets,
          damageType: t.damageType,
        });
      else if (targets.length) {
        const target = targets.find((id) => this.unit(id).team !== u.team);
        if (target) this.redirect(t.target, target, range, t.damageType);
      }
    }
  }
  redirect(actor, target, range, damageType) {
    const u = this.unit(actor);
    this.require(
      u.focus > 0 &&
        this.active(target) &&
        this.distance(u, this.unit(target)) <= range &&
        this.canSee(actor, target),
      "Цель перенаправления недоступна",
    );
    u.focus--;
    this.enqueue({
      kind: "roll",
      actor,
      label: "Перенаправление",
      count: 2,
      sides: u.features.martialDie || 6,
      bonus: u.stats.DEX,
      next: { kind: "redirectRollResult", actor, target, damageType },
    });
  }
  resolveDecision(c) {
    const p = this.s.pending;
    this.require(p && p.id === c.id, "Это решение уже завершено или устарело");
    const u = this.unit(p.actor);
    this.s.pending = null;
    if (
      RulesAdvanced.decision(this, c, p) ||
      RulesMagic.decision(this, c, p) ||
      RulesClassFeatures.decision(this, c, p) ||
      RulesMartial.decision(this, c, p) ||
      RulesDefenses.decision(this, c, p)
    )
      return;
    if (p.kind === "initiativeSwap") {
      this.require(
        c.choice === "skip" || p.targets.includes(c.target),
        "Выбери согласного союзника",
      );
      if (c.choice !== "skip") {
        const values = this.s.initiative,
          temp = values[p.actor];
        values[p.actor] = values[c.target];
        values[c.target] = temp;
        this.s.order.sort(
          (a, b) => values[b] - values[a] || a.localeCompare(b),
        );
        this.s.index = 0;
        this.emit(
          "initiativeSwap",
          p.actor,
          u.name + " меняется инициативой с " + this.name(c.target) + ".",
        );
      }
      this.s.initiativeChoices ??= [];
      this.s.initiativeChoices.push(p.actor);
      this.enqueue({ kind: "initiativeSetup" });
      return;
    }
    if (p.kind === "metabolism") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      if (c.choice === "yes") {
        u.metabolism--;
        u.focus = u.focusMax;
        this.emit(
          "metabolism",
          p.actor,
          u.name + ": Необычный метаболизм, фокус восстановлен.",
        );
        this.enqueue(
          {
            kind: "roll",
            actor: p.actor,
            label: "Необычный метаболизм",
            count: 1,
            sides: u.features.martialDie || 6,
            bonus: u.features.monkLevel,
            next: { kind: "healingResult", actor: p.actor, target: p.actor },
          },
          { kind: "startTurn" },
        );
      } else this.enqueue({ kind: "startTurn" });
      return;
    }
    if (p.kind === "deflect") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      this.deflect(p.damage, c.choice === "yes");
      return;
    }
    if (p.kind === "redirect") {
      if (c.choice === "skip") return;
      this.require(p.targets.includes(c.target), "Выбери цель");
      this.redirect(p.actor, c.target, p.range, p.damageType);
      return;
    }
    if (p.kind === "knockout") {
      this.require(["spare", "lethal"].includes(c.choice), "Неверный исход");
      if (c.choice === "lethal")
        this.enqueue({ ...p.damage, knockoutResolved: true });
      else {
        const target = this.unit(p.damage.target);
        target.hp = 1;
        target.temp = 0;
        target.reaction = 0;
        this.status(p.damage.target, "unconscious", {
          until: this.s.elapsed + 3600,
        });
        this.status(p.damage.target, "prone");
        this.emit(
          "knockout",
          p.actor,
          u.name + " оставляет " + target.name + " без сознания; цель жива.",
          { target: p.damage.target },
        );
        this.checkEnd();
      }
      return;
    }
    if (p.kind === "opportunity") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      if (c.choice === "yes") {
        this.require(
          u.reaction > 0 && RulesMagic.canReact(this, u.id),
          "Реакция потрачена",
        );
        u.reaction--;
        this.enqueue(p.attack, p.movement);
      } else this.enqueue(p.movement);
      return;
    }
    if (p.kind === "ready") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      u.ready = null;
      if (c.choice === "yes") {
        this.require(
          u.reaction > 0 && RulesMagic.canReact(this, u.id),
          "Реакция потрачена",
        );
        u.reaction--;
        this.enqueue(p.attack, ...(p.resume ? [p.resume] : []));
      } else if (p.resume) this.enqueue(p.resume);
      return;
    }
    if (p.kind === "defenseLuck") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      if (c.choice === "yes") {
        this.require(u.luck > 0, "Удача закончилась");
        u.luck--;
      }
      this.enqueue({
        ...p.attack,
        luckConsidered: true,
        luckDefense: c.choice === "yes",
      });
      return;
    }
    if (p.kind === "roll") {
      const r = p.roll;
      if (c.choice === "heroic") {
        this.require(
          u.heroic > 0 &&
            Number.isInteger(c.die) &&
            c.die >= 0 &&
            c.die < r.rolls.length,
          "Выбери кость",
        );
        u.heroic--;
        r.rolls[c.die] = this.roll(r.sides);
      } else if (c.choice === "luck") {
        this.require(u.luck > 0 && r.sides === 20 && !r.luckyUsed, "Нет Удачи");
        u.luck--;
        r.luckyUsed = true;
        if (r.mode === -1) {
          r.mode = 0;
          r.rolls = [r.rolls[0]];
        } else if (!r.mode) {
          r.mode = 1;
          r.rolls.push(this.roll(20));
        }
        this.decision("roll", p.actor, {
          roll: r,
          heroic: u.heroic > 0,
          lucky: false,
        });
        return;
      } else this.require(c.choice === "accept", "Неверный выбор");
      this.finishRoll(r);
      return;
    }
    if (p.kind === "adjudication") {
      this.require(["approve", "cancel"].includes(c.choice), "Неверный выбор");
      if (c.choice === "approve") {
        this.require(
          u.action >= p.cost.action && String(c.note || "").trim(),
          "Нужны действие и решение ведущего",
        );
        u.action -= p.cost.action;
        this.emit(
          "adjudication",
          p.actor,
          u.name +
            ": " +
            p.description +
            " Решение ведущего: " +
            String(c.note).slice(0, 1500),
          { description: p.description, ruling: String(c.note).slice(0, 1500) },
        );
      }
      return;
    }
    throw Error("Неизвестное решение");
  }
  heal(id, n) {
    const u = this.unit(id);
    if (u.dead) throw Error("Обычное лечение не воскрешает");
    const real = Math.min(n, u.max - u.hp);
    u.hp += real;
    if (u.hp > 0) {
      u.stable = false;
      u.deathFailures = 0;
      u.deathSuccesses = 0;
      this.removeStatus(id, "unconscious");
    }
    this.emit("heal", id, u.name + ": восстановлено " + real + " ПЗ.", {
      amount: real,
    });
  }
  releaseGrapples() {
    for (const id of this.s.order) {
      const previous = this.speed(id);
      this.unit(id).statuses = this.unit(id).statuses.filter(
        (z) =>
          z.kind !== "grappled" ||
          (z.source &&
            this.active(z.source) &&
            !this.incapacitated(z.source) &&
            this.distance(this.unit(id), this.unit(z.source)) <= 5),
      );
      this.adjustMovementForSpeed(id, previous);
    }
  }
  checkEnd() {
    // A hit can still have riders, transfers, saves and decisions in flight.
    if (
      this.running ||
      this.s.pending ||
      this.s.queue.length ||
      this.s.phase === "ended"
    )
      return;
    if (
      this.s.order.some((id) => {
        const u = this.unit(id);
        return u.hp === 0 && u.deathSaves && !u.dead && !u.stable;
      })
    )
      return;
    const teams = new Set(
      this.s.order
        .filter((id) => this.active(id))
        .map((id) => this.unit(id).team),
    );
    if (teams.size <= 1) {
      this.s.phase = "ended";
      this.s.winner = [...teams][0] || null;
      this.emit("battleEnded", null, "Бой завершён.");
    }
  }
  export({ clone = true } = {}) {
    return {
      kind: "dnd-combat-session",
      version: Object.values(this.s.units).some(
        (u) =>
          Object.keys(u.counters || {}).length ||
          Object.keys(u.slots || {}).length ||
          u.features.masteries?.some((k) => !["vex", "nick"].includes(k)) ||
          u.attacks.some(
            (a) => a.mastery && !["vex", "nick"].includes(a.mastery),
          ) ||
          Object.keys(u.features || {}).some((k) =>
            [
              "greatWeaponFighting",
              "greatWeaponMaster",
              "savageAttacker",
              "tacticalMaster",
              "superiorityDie",
              "maneuverDC",
              "maneuvers",
              "secondWind",
              "actionSurge",
              "tacticalMind",
              "tacticalShift",
              "indomitable",
              "layOnHands",
              "knowEnemy",
              "auraDevotion",
              "auraCourage",
              "auraRadius",
              "guardianSaveBonus",
              "heavyArmor",
              "heavyArmorReduction",
              "shieldEquipped",
              "autoShield",
              "fighterLevel",
              "uncannyDodge",
              "evasion",
              "reliableTalent",
              "steadyAim",
              "sharpshooter",
              "auraProtection",
              "protection",
              "shieldSpell",
              "acReaction",
              "critNegation",
            ].includes(k),
          ),
      )
        ? 32
        : this.s.meta.contentPack
          ? 31
          : 30,
      session: clone ? structuredClone(this.s) : this.s,
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatRulesEngine };
