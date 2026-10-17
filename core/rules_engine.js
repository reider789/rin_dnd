/* D&D 2024 combat domain. No DOM, network, character names or campaign IDs. */
"use strict";
class CombatRulesEngine {
  static VERSION = "30.0.0";
  static RULES = "dnd-2024-2026-10";
  static FEATURES = new Set([
    "martialArts",
    "monkFocus",
    "monkLevel",
    "martialDie",
    "flurryCount",
    "deflectAttacks",
    "shadowArts",
    "uncannyMetabolism",
    "sneakDice",
    "masteries",
    "alert",
    "extraAttack",
    "packTactics",
    "cunningAction",
  ]);
  constructor(state) {
    CombatRulesEngine.validate(state);
    this.state = structuredClone(state);
  }
  static validate(s) {
    if (!s || s.version !== 30 || s.rulesVersion !== this.RULES)
      throw Error("Несовместимая версия боя");
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
    const cells = new Map(),
      movingActor =
        s.queue.find((t) => t.kind === "moveStep")?.actor ||
        s.pending?.movement?.actor;
    for (const [id, u] of Object.entries(s.units)) {
      if (
        !Number.isInteger(u.hp) ||
        !Number.isInteger(u.max) ||
        u.max < 1 ||
        u.hp < 0 ||
        u.hp > u.max ||
        !Array.isArray(u.statuses) ||
        !u.attacks
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
      for (const feature of Object.keys(u.features || {}))
        if (!this.FEATURES.has(feature))
          throw Error("Нет проверенного обработчика способности: " + feature);
    }
    if (s.pending && (!s.pending.id || !s.pending.kind))
      throw Error("Повреждено решение игрока");
    return true;
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
    return this.unit(id).statuses.some((z) => z.kind === kind);
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
      b.size === 0 ||
      Math.abs((a.size ?? 2) - (b.size ?? 2)) >= 2
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
    return [2, 5].includes(c) ? c : 0;
  }
  ac(id, from = null) {
    const u = this.unit(id);
    return (
      u.ac +
      (from ? this.cover(from, id) : 0) +
      (this.has(id, "shield") ? 5 : 0)
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
      ...data,
    };
    this.s.events.push(e);
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
    this.s.queue.unshift(...tasks);
  }
  decision(kind, actor, data) {
    this.s.pending = {
      id: "decision-" + ++this.s.sequence,
      kind,
      actor,
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
    const before = structuredClone(this.s);
    try {
      if (!command || typeof command.kind !== "string")
        throw Error("Неверная команда");
      if (command.kind === "decide") this.resolveDecision(command);
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
      return this.s;
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
  command(c, u) {
    const id = c.actor;
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
        this.command({ ...c, kind: "attack", target }, u);
        return;
      }
      this.require(u.action > 0 || u.attacksLeft > 0, "Нет атаки");
      this.require(!spec.ammo || u[spec.ammo] > 0, "Нет боеприпасов");
      this.require(
        !spec.ammoItem || u.items[spec.ammoItem] > 0,
        "Нет метательного оружия",
      );
      if (u.attacksLeft > 0) u.attacksLeft--;
      else {
        u.action--;
        u.attacksLeft = (u.features.extraAttack || 1) - 1;
      }
      if (spec.ammo) {
        u[spec.ammo]--;
        if (spec.ammoInventoryId) u.items[spec.ammoInventoryId]--;
      }
      if (spec.ammoItem) u.items[spec.ammoItem]--;
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
        next: { kind: "emptyAttackResult", actor: id, point: p },
      });
      return;
    }
    if (c.kind === "attack") {
      const spec = this.attackSpec(id, c.weapon),
        mode = c.mode || "action";
      this.validateAttack(id, c.target, spec);
      if (mode === "bonus") {
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
          u.action > 0 || u.attacksLeft > 0,
          "Действие Атака потрачено",
        );
        if (u.attacksLeft > 0) u.attacksLeft--;
        else {
          u.action--;
          u.attacksLeft = (u.features.extraAttack || 1) - 1;
        }
        if (spec.light) u.lightWeaponUsed = spec.id;
      }
      u.darkMoveWindow = false;
      this.enqueue(
        { kind: "attackRoll", actor: id, target: c.target, spec, mode },
        { kind: "attackCompleted", actor: id, target: c.target },
      );
      return;
    }
    if (c.kind === "move") {
      this.require(Array.isArray(c.path) && c.path.length, "Нужен маршрут");
      let from = u,
        cost = 0;
      for (const [index, p] of c.path.entries()) {
        const occupant = this.occupied(p.x, p.y, id),
          known =
            occupant &&
            (this.unit(occupant).team === u.team ||
              (!this.unit(occupant).hidden && this.canSee(id, occupant)));
        this.require(
          this.inside(p) &&
            !this.wall(p) &&
            (!known ||
              (this.canPass(id, occupant) && index < c.path.length - 1)) &&
            this.distance(from, p) === 5,
          "Маршрут перекрыт",
        );
        if (from.x !== p.x && from.y !== p.y)
          this.require(
            !this.wall({ x: from.x, y: p.y }) &&
              !this.wall({ x: p.x, y: from.y }),
            "Закрытый угол",
          );
        cost += this.stepCost(id, p);
        from = p;
      }
      this.require(
        cost <= u.move && this.speed(id) > 0,
        "Недостаточно передвижения",
      );
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
      this.require((bonus ? u.bonus : u.action) > 0, "Действие потрачено");
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
      else u.action--;
      if (paid) u.focus--;
      u.darkMoveWindow = false;
      if (c.kind === "dash") u.move += this.speed(id);
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
      this.require(u.action > 0, "Нет действия");
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
      u.action--;
      u.darkMoveWindow = false;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Скрытность",
        count: 1,
        sides: 20,
        bonus: u.skills?.stealth || 0,
        next: { kind: "hideResult", actor: id },
      });
      return;
    }
    if (c.kind === "search") {
      this.require(u.action > 0, "Нет действия");
      u.action--;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Поиск",
        count: 1,
        sides: 20,
        bonus: u.skills?.perception || 0,
        next: { kind: "searchResult", actor: id },
      });
      return;
    }
    if (c.kind === "check") {
      this.require(
        u.action > 0 &&
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
      u.action--;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: String(c.label || "Проверка").slice(0, 100),
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
      this.require(u.action > 0 || u.attacksLeft > 0, "Нет атаки");
      const t = this.unit(c.target);
      this.require(
        t.team !== u.team &&
          this.active(c.target) &&
          this.distance(u, t) <= 5 &&
          this.wallLOS(u, t),
        "Цель недоступна",
      );
      this.require((t.size || 2) <= (u.size || 2) + 1, "Цель слишком велика");
      if (u.attacksLeft > 0) u.attacksLeft--;
      else {
        u.action--;
        u.attacksLeft = (u.features.extraAttack || 1) - 1;
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
      this.require(z && u.action > 0, "Нет захвата или действия");
      u.action--;
      const bonus = Math.max(
        u.skills?.athletics ?? u.stats.STR,
        u.skills?.acrobatics ?? u.stats.DEX,
      );
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Освобождение из захвата",
        count: 1,
        sides: 20,
        bonus,
        next: { kind: "escapeResult", actor: id, dc: z.dc },
      });
      return;
    }
    if (c.kind === "ready") {
      this.require(
        u.action > 0 && ["approach", "attackAlly"].includes(c.trigger),
        "Нужны действие и понятный триггер",
      );
      const spec = this.attackSpec(id, c.weapon);
      u.action--;
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
        u.action > 0 &&
          this.enemies(id).includes(c.target) &&
          this.distance(u, this.unit(c.target)) <= 5 &&
          this.wallLOS(u, this.unit(c.target)),
        "Для помощи нужна соседняя враждебная цель и действие",
      );
      u.action--;
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
      this.require(
        u.bonus > 0 &&
          u.itemTypes?.[item] === "healing" &&
          (u.items[item] || 0) > 0,
        "Нет зелья или бонусного действия",
      );
      u.bonus--;
      u.items[item]--;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Лечебное зелье",
        count: 2,
        sides: 4,
        bonus: 2,
        next: { kind: "healingResult", actor: id, target: id },
      });
      return;
    }
    if (c.kind === "stabilize") {
      const t = this.unit(c.target);
      this.require(
        u.action > 0 &&
          t.hp === 0 &&
          !t.dead &&
          !t.stable &&
          this.distance(u, t) <= 5,
        "Цель недоступна",
      );
      u.action--;
      this.enqueue({
        kind: "roll",
        actor: id,
        label: "Медицина",
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
  require(value, message) {
    if (!value) throw Error(message);
  }
  attackSpec(id, key) {
    const a = this.unit(id).attacks.find((x) => x.id === key);
    if (!a) throw Error("Неизвестное оружие");
    return structuredClone(a);
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
    this.require(
      !spec.ammo || (this.unit(id)[spec.ammo] || 0) > 0,
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
  attackModifiers(id, target, spec, from = null) {
    const u = this.unit(id),
      t = this.unit(target),
      p = from || u,
      d = this.distance(p, t),
      vis = {
        adv: !this.canSee(target, id),
        disadv: !this.canSee(id, target, from),
      };
    if (from) vis.adv = !this.canSee(target, from);
    const advantage = [],
      disadvantage = [];
    if (vis.adv) advantage.push("цель не видит атакующего");
    if (vis.disadv) disadvantage.push("атакующий не видит цель");
    if (
      this.has(target, "restrained") ||
      this.has(target, "stunned") ||
      this.has(target, "paralyzed") ||
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
      ["restrained", "poisoned", "prone", "frightened"].some((k) =>
        this.has(id, k),
      )
    )
      disadvantage.push("состояние атакующего");
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
      if (d > (spec.normalRange || spec.range))
        disadvantage.push("дальняя дистанция");
      if (
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
    };
  }
  saveTask(id, stat, dc, next) {
    const u = this.unit(id),
      auto =
        ["STR", "DEX"].includes(stat) &&
        ["paralyzed", "stunned", "unconscious"].some((k) => this.has(id, k));
    const adv =
        stat === "DEX" &&
        this.has(id, "dodge") &&
        this.speed(id) > 0 &&
        !this.incapacitated(id),
      disadv = stat === "DEX" && this.has(id, "restrained");
    return {
      kind: "roll",
      actor: id,
      label: "Спасбросок " + stat,
      count: 1,
      sides: 20,
      bonus: u.saves?.[stat] ?? u.stats?.[stat] ?? 0,
      mode: adv === disadv ? 0 : adv ? 1 : -1,
      autoFail: auto,
      dc,
      next,
    };
  }
  speed(id) {
    const u = this.unit(id);
    return [
      "grappled",
      "restrained",
      "paralyzed",
      "unconscious",
      "stunned",
    ].some((k) => this.has(id, k))
      ? 0
      : Math.max(0, u.speed - (this.has(id, "frost") ? 10 : 0));
  }
  stepCost(id, p) {
    const other = this.occupied(p.x, p.y, id),
      creatureDifficult =
        other &&
        this.unit(other).team !== this.unit(id).team &&
        this.unit(other).size !== 0 &&
        !this.unit(other).hidden &&
        this.canSee(id, other);
    return (
      5 +
      (this.s.terrain.rubble.includes(p.x + "," + p.y) || creatureDifficult
        ? 5
        : 0) +
      (this.has(id, "prone") ? 5 : 0)
    );
  }
  status(id, kind, extra = {}) {
    const u = this.unit(id);
    u.statuses = u.statuses.filter((z) => z.kind !== kind);
    u.statuses.push({ kind, ...extra });
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
  }
  removeStatus(id, kind) {
    this.unit(id).statuses = this.unit(id).statuses.filter(
      (z) => z.kind !== kind,
    );
  }
  endConcentration(id) {
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
    while (!this.s.pending && this.s.queue.length) {
      if (++n > 2000) throw Error("Слишком длинная последовательность");
      this.task(this.s.queue.shift());
      this.observeAll();
    }
  }
  observeAll() {
    for (const id of this.s.order) {
      const u = this.unit(id);
      if (!u.hidden) continue;
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
    for (const id of this.s.order) {
      if (!this.active(id)) continue;
      this.s.memory[id] ??= {};
      for (const foe of this.enemies(id)) {
        const t = this.unit(foe);
        if (!t.hidden && this.canSee(id, foe))
          this.s.memory[id][foe] = {
            x: t.x,
            y: t.y,
            name: t.name,
            seenTurn: this.s.turnSerial,
          };
      }
    }
  }
  task(t) {
    const s = this.s,
      u = t.actor ? this.unit(t.actor) : null;
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
      a.turnCount++;
      a.action = 1;
      a.bonus = 1;
      a.reaction = 1;
      a.move = a.speed;
      a.attacksLeft = 0;
      a.nickUsed = false;
      a.lightWeaponUsed = null;
      a.flurryLeft = 0;
      a.disengaged = false;
      a.jumpMultiplier = 1;
      a.darkMoveWindow = true;
      a.ready = null;
      a.statuses = a.statuses.filter(
        (z) =>
          z.expiresAtStart !== id &&
          (z.until === undefined || z.until > s.elapsed),
      );
      s.zones = s.zones.filter((z) => z.until > s.elapsed);
      s.help = (s.help || []).filter((h) => h.helper !== id);
      if (this.speed(id) === 0) a.move = 0;
      if (a.vex)
        for (const k of Object.keys(a.vex))
          if (a.vex[k] < a.turnCount) delete a.vex[k];
      this.releaseGrapples();
      this.emit("turnStarted", id, "Ход: " + a.name + ".");
      if (a.hp === 0 && !a.dead && !a.stable)
        this.enqueue({
          kind: "roll",
          actor: id,
          label: "Спасбросок от смерти",
          count: 1,
          sides: 20,
          bonus: 0,
          next: { kind: "deathSaveResult", actor: id },
        });
      return;
    }
    if (t.kind === "endTurn") {
      if (this.occupied(u.x, u.y, t.actor)) {
        u.involuntarySharedSpace = true;
        this.status(t.actor, "prone");
      }
      u.darkMoveWindow = false;
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
      const m = this.attackModifiers(t.actor, t.target, t.spec);
      s.help = (s.help || []).filter(
        (h) =>
          !(
            h.target === t.target &&
            h.helper !== t.actor &&
            this.unit(h.helper).team === u.team
          ),
      );
      if (t.luckDefense) m.disadv = true;
      const mode = m.adv === m.disadv ? 0 : m.adv ? 1 : -1;
      if (u.vex) delete u.vex[t.target];
      this.removeStatus(t.actor, "invisible");
      u.hidden = false;
      if (t.spec.ammo) {
        u[t.spec.ammo]--;
        if (t.spec.ammoInventoryId) u.items[t.spec.ammoInventoryId]--;
      }
      if (t.spec.ammoItem) u.items[t.spec.ammoItem]--;
      this.enqueue({
        kind: "roll",
        actor: t.actor,
        label: t.spec.name + " → " + this.name(t.target),
        count: 1,
        sides: 20,
        mode,
        bonus: t.spec.bonus,
        next: { ...t, kind: "attackResult", modifiers: m },
      });
      return;
    }
    if (t.kind === "attackResult") {
      if (t.result.lucky) {
        t.modifiers.adv = true;
        t.modifiers.advantage.push("Удача");
      }
      const d = t.result.kept,
        hit = d === 20 || (d !== 1 && t.result.total >= this.ac(t.target, u)),
        m = t.modifiers;
      const critical =
        d === 20 ||
        (this.distance(u, this.unit(t.target)) <= 5 &&
          ["paralyzed", "unconscious"].some((k) => this.has(t.target, k)));
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
          t.spec.bonus +
          " = " +
          t.result.total +
          " против КД " +
          this.ac(t.target, u) +
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
          hit,
          critical,
          rolls: t.result.rolls,
          modifiers: m,
        },
      );
      if (!hit) return;
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
      const count = t.spec.count * (critical ? 2 : 1),
        sneakCount = sneak ? u.features.sneakDice * (critical ? 2 : 1) : 0;
      this.enqueue({
        kind: "roll",
        actor: t.actor,
        label: "Урон " + t.spec.name,
        count,
        sides: t.spec.die,
        bonus: t.mode === "nick" ? Math.min(0, t.spec.flat) : t.spec.flat,
        next: { ...t, kind: "damageResult", critical, sneakCount },
      });
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
      const target = this.unit(t.target),
        physical = ["bludgeoning", "piercing", "slashing"].includes(
          t.damageType,
        );
      if (
        !t.deflectResolved &&
        t.attack &&
        physical &&
        target.features.deflectAttacks &&
        target.reaction > 0 &&
        !this.incapacitated(t.target)
      ) {
        if (target.controlled) {
          this.decision("deflect", t.target, { damage: t });
          return;
        }
        this.deflect(t, true);
        return;
      }
      let amount = t.amount;
      if (target.immunities?.includes(t.damageType)) amount = 0;
      else {
        if (target.resistances?.includes(t.damageType))
          amount = Math.floor(amount / 2);
        if (target.vulnerabilities?.includes(t.damageType)) amount *= 2;
      }
      if (
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
        { amount, lost, temp, damageType: t.damageType, source: t.actor },
      );
      if (target.hp === 0) {
        this.status(t.target, "unconscious");
        this.status(t.target, "prone");
        if (!target.deathSaves || lost - before >= target.max)
          target.dead = true;
        target.reaction = 0;
        this.releaseGrapples();
      } else if (
        amount > 0 &&
        s.zones.some((z) => z.owner === t.target && z.concentration)
      )
        this.enqueue(
          this.saveTask(
            t.target,
            "CON",
            Math.min(30, Math.max(10, Math.floor(amount / 2))),
            { kind: "concentrationResult", actor: t.target },
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
          ": концентрация Тьмы — " +
          t.result.total +
          " против СЛ " +
          t.result.dc +
          (t.result.success ? " (успех)." : " (провал)."),
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
    if (t.kind === "attackCompleted") {
      for (const id of s.order) {
        const a = this.unit(id);
        if (
          a.team !== u.team &&
          a.ready?.trigger === "attackAlly" &&
          a.reaction > 0 &&
          this.active(id) &&
          this.unit(t.target).team === a.team
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
              this.decision("ready", id, { attack });
              return;
            }
            a.ready = null;
            a.reaction--;
            this.enqueue(attack);
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
      if (
        occupant &&
        (!this.canPass(t.actor, occupant) || t.path.length === 1)
      ) {
        u.blockedCells ??= [];
        u.blockedCells.push({ ...p, turn: s.turnSerial });
        this.markSharedSpace(t.actor);
        this.emit(
          "movementBlocked",
          t.actor,
          u.name + ": движение остановлено, проход перекрыт.",
        );
        return;
      }
      if (
        this.wall(p) ||
        this.speed(t.actor) === 0 ||
        u.move < this.stepCost(t.actor, p)
      ) {
        this.markSharedSpace(t.actor);
        return;
      }
      if (!u.disengaged) {
        const enemy = this.enemies(t.actor).find(
          (e) =>
            !t.provoked.includes(e) &&
            this.unit(e).reaction > 0 &&
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
            { kind: "attackCompleted", actor: enemy, target: t.actor },
            t,
          );
          return;
        }
      }
      const from = { x: u.x, y: u.y },
        cost = this.stepCost(t.actor, p);
      u.move -= cost;
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
      this.enqueue({ ...t, path: t.path.slice(1), provoked: [] });
      for (const id of s.order) {
        const a = this.unit(id);
        if (
          a.team !== u.team &&
          a.ready?.trigger === "approach" &&
          a.reaction > 0 &&
          this.active(id)
        ) {
          try {
            this.validateAttack(id, t.actor, a.ready.spec);
            const spec = a.ready.spec;
            if (a.controlled) {
              this.decision("ready", id, {
                attack: {
                  kind: "attackRoll",
                  actor: id,
                  target: t.actor,
                  spec,
                  mode: "reaction",
                },
              });
              return;
            }
            a.ready = null;
            a.reaction--;
            this.enqueue({
              kind: "attackRoll",
              actor: id,
              target: t.actor,
              spec,
              mode: "reaction",
            });
          } catch {}
        }
      }
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
      for (const id of this.enemies(t.actor)) {
        const a = this.unit(id);
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
      this.heal(t.target, t.result.total);
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
      if (d >= 10) u.deathSuccesses = (u.deathSuccesses || 0) + 1;
      else u.deathFailures = (u.deathFailures || 0) + (d === 1 ? 2 : 1);
      if (u.deathFailures >= 3) u.dead = true;
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
    const kept =
      t.sides === 20 && t.mode
        ? t.mode > 0
          ? Math.max(...t.rolls)
          : Math.min(...t.rolls)
        : t.rolls[0];
    const total =
        (t.sides === 20 ? kept : t.rolls.reduce((a, b) => a + b, 0)) +
        (t.bonus || 0),
      success = !t.autoFail && total >= t.dc;
    this.emit(
      "roll",
      t.actor,
      this.name(t.actor) +
        ": " +
        t.label +
        " [" +
        t.rolls.join(", ") +
        "] " +
        (t.bonus >= 0 ? "+" : "") +
        (t.bonus || 0) +
        " = " +
        total +
        ".",
      {
        rolls: t.rolls,
        sides: t.sides,
        bonus: t.bonus || 0,
        mode: t.mode || 0,
      },
    );
    this.enqueue({
      ...t.next,
      result: {
        rolls: t.rolls,
        kept,
        total,
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
      kind: "damage",
      actor: t.actor,
      target: t.target,
      amount,
      damageType: t.spec.damageType,
      attack: t.spec,
      critical: t.critical,
    };
  }
  deflect(t, use) {
    const u = this.unit(t.target);
    if (!use) {
      this.enqueue({ ...t, deflectResolved: true });
      return;
    }
    this.require(u.reaction > 0, "Реакция потрачена");
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
    if (amount) this.enqueue({ ...t, amount, deflectResolved: true });
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
        this.require(u.reaction > 0, "Реакция потрачена");
        u.reaction--;
        this.enqueue(p.attack, p.movement);
      } else this.enqueue(p.movement);
      return;
    }
    if (p.kind === "ready") {
      this.require(["yes", "no"].includes(c.choice), "Неверный выбор");
      u.ready = null;
      if (c.choice === "yes") {
        this.require(u.reaction > 0, "Реакция потрачена");
        u.reaction--;
        this.enqueue(p.attack);
      }
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
    this.emit("heal", id, u.name + ": восстановлено " + real + " ПЗ.");
  }
  releaseGrapples() {
    for (const id of this.s.order)
      this.unit(id).statuses = this.unit(id).statuses.filter(
        (z) =>
          z.kind !== "grappled" ||
          (z.source &&
            this.active(z.source) &&
            !this.incapacitated(z.source) &&
            this.distance(this.unit(id), this.unit(z.source)) <= 5),
      );
  }
  checkEnd() {
    if (this.s.phase === "ended") return;
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
  export() {
    return {
      kind: "dnd-combat-session",
      version: 30,
      session: structuredClone(this.s),
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatRulesEngine };
