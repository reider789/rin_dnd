"use strict";
const AdapterCapabilities =
  typeof module !== "undefined"
    ? require("./capabilities").CombatCapabilities
    : CombatCapabilities;
const AdapterContinuity =
  typeof module !== "undefined"
    ? require("./continuity").CombatContinuity
    : CombatContinuity;
// The campaign translates its profiles here; the domain has no named hero branches.
class CombatCampaignAdapter {
  static unit(id, p, raw = {}, r = {}) {
    p = structuredClone(p);
    const stats = Object.fromEntries(
      Object.entries(p.scores || {}).map(([k, v]) => [
        k,
        Math.floor((v - 10) / 2),
      ]),
    );
    for (const k of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) stats[k] ??= 0;
    const saves = Object.fromEntries(
      Object.entries(stats).map(([k, v]) => [
        k,
        v + (p.saveProficiencies?.includes(k) ? p.proficiency : 0),
      ]),
    );
    Object.assign(saves, p.saves || {});
    const skills = Object.fromEntries(
      Object.entries(p.skillProficiencies || {}).map(([k, [stat, mult]]) => [
        k,
        stats[stat] + p.proficiency * mult,
      ]),
    );
    return {
      id,
      name: raw.name || p.name || id,
      team: raw.team || "party",
      controlled: Boolean(raw.controlled),
      tokenKey: raw.tokenKey || p.tokenKey || null,
      x: raw.x,
      y: raw.y,
      hp: r.hp?.current ?? p.initialHP ?? p.hp ?? 11,
      max: r.hp?.max ?? p.hp ?? 11,
      ac: p.ac ?? 12,
      speed: p.speed ?? 30,
      exhaustion: p.exhaustion ?? 0,
      size: p.size ?? 2,
      summoner: p.summoner || null,
      summonLevel: p.summonLevel || null,
      summonDC: p.summonDC || null,
      creatureType: p.creatureType || null,
      powerAvailable: p.powerAvailable ?? false,
      stats,
      saves,
      skills: { ...skills, ...p.skills },
      proficiency: p.proficiency || 0,
      features: p.features || {},
      ...(p.activities ? {activities: p.activities} : {}),
      senses: p.senses || {},
      casting: p.casting || null,
      equipment: p.equipment || {},
      reference: p.reference || [],
      attacks: (p.attacks || []).map((a) => ({
        ...a,
        bonus: a.bonus ?? stats[a.ability] + p.proficiency,
        flat: a.flat ?? stats[a.ability],
      })),
      statuses: [],
      items: {},
      proficientSkills: Object.keys(p.skillProficiencies || {}),
      counters: Object.fromEntries(
        AdapterCapabilities.COUNTERS.filter((k) => r[k] !== undefined).map(
          (k) => [k, { current: r[k].current, max: r[k].max }],
        ),
      ),
      slots: Object.fromEntries(
        Object.entries(r.spell_slots || {}).map(([k, v]) => [
          k,
          { current: v.current, max: v.max },
        ]),
      ),
      temp: r.temp_hp?.current || 0,
      turnCount: 0,
      action: 0,
      bonus: 0,
      reaction: 1,
      move: 0,
      attacksLeft: 0,
      focus: r.focus?.current ?? 0,
      focusMax: r.focus?.max ?? 0,
      luck: r.luck?.current ?? 0,
      heroic: r.heroic?.current ?? 0,
      arrows: r.arrows?.current ?? 0,
      metabolism: r.unusual_metabolism?.current ?? 0,
      policies: { heroic: false, luck: false, defenseLuck: false, sneak: true },
      deathSaves: Boolean(p.deathSaves),
      resistances: p.resistances || [],
      immunities: p.immunities || [],
      vulnerabilities: p.vulnerabilities || [],
      conditionImmunities: p.conditionImmunities || [],
      tactics: {
        role: "skirmisher",
        canFlee: false,
        ...p.tactics,
        ...raw.tactics,
      },
    };
  }
  static cell(v) {
    const m = /^([A-Z])([1-9][0-9]?)$/.exec(v || "");
    if (!m) throw Error("Неверная клетка: " + v);
    return { x: m[1].charCodeAt(0) - 65, y: Number(m[2]) - 1 };
  }
  static create(runtime, scene, seed = 123456789) {
    const continuity =
      runtime.content_pack?.continuity || runtime.continuity || {};
    if (runtime?.combat_schema_version !== 30 || !runtime.source_state_sha256)
      throw Error("Нет проверенного снимка кампании");
    if (
      !scene?.name ||
      !scene.heroes ||
      !Array.isArray(scene.enemies) ||
      !scene.enemies.length
    )
      throw Error("Неполный сценарий");
    if (
      scene.kind === "story" &&
      (!scene.battle_id ||
        scene.source_revision !== runtime.source_state_revision ||
        scene.source_state_sha256 !== runtime.source_state_sha256)
    )
      throw Error("Сюжетный сценарий не соответствует текущему канону");
    if (
      runtime.rules_version &&
      runtime.rules_version !== AdapterCapabilities.RULES
    )
      throw Error("Несовместимая версия правил снимка");
    const width = scene.width || 11,
      height = scene.height || 8,
      elevation = Object.fromEntries(Object.entries(scene.elevation || {}).map(([cell, feet]) => {
        const p = this.cell(cell);
        if (p.x >= width || p.y >= height || !Number.isInteger(feet) || feet < 0 || feet > 60 || feet % 5)
          throw Error("Некорректная высота клетки: " + cell);
        return [p.x + "," + p.y, feet];
      })),
      units = {},
      initiative = {},
      baseline = {},
      inventoryBaseline = {};
    if (
      continuity.scene &&
      ((continuity.objects || []).length || (continuity.zones || []).length)
    ) {
      const previous = continuity.scene;
      const cells = (list) =>
        (list || [])
          .map((c) => {
            const p = this.cell(c);
            return p.x + "," + p.y;
          })
          .sort();
      const cover = Object.fromEntries(
        Object.entries(scene.cover || {}).map(([key, value]) => {
          const p = this.cell(key);
          return [p.x + "," + p.y, value];
        }),
      );
      const sorted = (o) =>
        JSON.stringify(
          Object.entries(o).sort(([a], [b]) => a.localeCompare(b)),
        );
      const same =
        previous.width === width &&
        previous.height === height &&
        JSON.stringify([...previous.walls].sort()) ===
          JSON.stringify(cells(scene.walls)) &&
        JSON.stringify([...previous.rubble].sort()) ===
          JSON.stringify(cells(scene.rubble)) &&
        sorted(previous.cover) === sorted(cover) &&
        sorted(previous.elevation || {}) === sorted(elevation) &&
        (scene.scene_id || scene.id || scene.battle_id || scene.name) ===
          previous.id;
      if (!same)
        throw Error(
          "На прежнем поле остаётся магия. Продолжи ту же сцену либо явно заверши её эффекты перед сменой карты",
        );
    }
    let randomValue = seed >>> 0 || 1,
      draws = 0;
    const initiativeFor = (r, u) => {
      if (r.initiative !== undefined) return r.initiative;
      let x = randomValue;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      randomValue = x >>> 0 || 1;
      draws++;
      return (
        Math.floor((randomValue / 4294967296) * 20) +
        1 +
        u.stats.DEX +
        (u.features.alert ? u.proficiency : 0) - 2 * (u.exhaustion || 0)
      );
    };
    for (const [id, r] of Object.entries(scene.heroes)) {
      const c = runtime.characters[id],
        p = c?.combat_profile || runtime.npc_profiles[r.profile || "guard"];
      if (!p) throw Error("Нет проверенной карточки " + id);
      units[id] = this.unit(
        id,
        { ...p, deathSaves: p.deathSaves ?? Boolean(c) },
        {
          ...r,
          name: c?.name || r.name,
          ...this.cell(r.cell),
          controlled: c ? true : Boolean(r.controlled),
        },
        c?.resources || {},
      );
      const available = new Set(
        (c?.inventory || []).filter((v) => v.combat_available).map((v) => v.id),
      );
      if (c)
        units[id].attacks = units[id].attacks.filter(
          (a) => !a.inventoryId || available.has(a.inventoryId),
        );
      units[id].items = Object.fromEntries(
        (c?.inventory || [])
          .filter((v) => v.combat_available)
          .map((v) => [v.id, v.quantity]),
      );
      units[id].itemTypes = Object.fromEntries(
        (c?.inventory || [])
          .filter((v) => v.combat_available && v.consumable_type)
          .map((v) => [v.id, v.consumable_type]),
      );
      units[id].exhaustion = continuity.exhaustion?.[id] ?? units[id].exhaustion;
      units[id].temp = continuity.temporary_hp?.[id] || 0;
      units[id].tempSource = continuity.temp_sources?.[id] || null;
      units[id].statuses = structuredClone(continuity.statuses?.[id] || []);
      if (continuity.life?.[id]) {
        AdapterContinuity.validateLife(continuity.life[id], units[id].hp);
        Object.assign(units[id], continuity.life[id]);
      }
      units[id].itemHealing = Object.fromEntries(
        (c?.inventory || [])
          .filter((v) => v.consumable_type === "healing")
          .map((v) => [
            v.id,
            { count: v.healing_dice || 2, flat: v.healing_flat || 2 },
          ]),
      );
      inventoryBaseline[id] = structuredClone(units[id].items);
      initiative[id] = initiativeFor(r, units[id]);
      baseline[id] = structuredClone(c?.resources || {});
    }
    scene.enemies.forEach((r, n) => {
      const id = r.id || "enemy_" + (n + 1),
        a = r.attack || {};
      if (units[id]) throw Error("Повторный ID участника");
      if (r.abilities?.length)
        throw Error("Способности NPC требуют проверенную карточку features");
      const inline = {
        hp: r.hp,
        ac: r.ac,
        speed: r.speed || 30,
        scores: r.scores || {},
        saves: r.saves || {},
        features: r.features || {},
        senses: r.senses || {},
        proficiency: r.proficiency || 2,
        attacks: r.attacks || [
          {
            id: "main",
            name: a.name || ((a.range || 5) > 5 ? "Выстрел" : "Удар"),
            kind: a.kind || ((a.range || 5) > 5 ? "ranged" : "melee"),
            bonus: a.bonus ?? 3,
            flat: a.flat ?? 1,
            count: a.count || 1,
            die: a.die || 6,
            range: a.range || 5,
            normalRange: a.normalRange || a.range || 5,
            damageType: a.damageType || "piercing",
          },
        ],
        tactics: {
          role: (a.range || 5) > 5 ? "ranged" : "skirmisher",
          canFlee: true,
          morale: 0.2,
          ...r.tactics,
        },
        deathSaves: false,
      };
      const p = r.profile ? runtime.npc_profiles[r.profile] : inline;
      if (!p) throw Error("Нет профиля противника: " + r.profile);
      if (
        r.profile &&
        ["hp", "ac", "speed", "features", "attacks", "attack", "senses"].some(
          (k) => Object.hasOwn(r, k),
        )
      )
        throw Error(
          "Параметры противника задаются в профиле, а не поверх него",
        );
      units[id] = this.unit(
        id,
        p,
        { ...r, team: "enemies", ...this.cell(r.cell) },
        r.resources || {},
      );
      initiative[id] = initiativeFor(r, units[id]);
    });
    if (
      Object.values(initiative).some(
        (v) => !Number.isInteger(v) || v < -10 || v > 50,
      )
    )
      throw Error("Неверная инициатива");
    const order = Object.keys(units).sort(
      (a, b) => initiative[b] - initiative[a] || a.localeCompare(b),
    );
    return {
      version: 30,
      rulesVersion: "dnd-2024-2026-10",
      engineVersion: AdapterCapabilities.ENGINE,
      meta: {
        campaignId: runtime.campaign_id,
        battleId: scene.battle_id || "training-" + Date.now(),
        kind: scene.kind === "story" ? "story" : "training",
        name: scene.name,
        sceneId: scene.scene_id || scene.id || scene.battle_id || scene.name,
        theme: scene.theme || "forest",
        resultKind: runtime.result_kind || "rin-combat-result",
        contentPack: runtime.content_pack
          ? {
              id: runtime.content_pack.id,
              revision: runtime.content_pack.revision,
            }
          : null,
        sourceRevision: runtime.source_state_revision,
        sourceClock:
          runtime.source_clock ?? runtime.content_pack?.campaign_clock ?? 0,
        sourceHash: runtime.source_state_sha256,
      },
      terrain: {
        width,
        height,
        walls: (scene.walls || []).map((c) => {
          const p = this.cell(c);
          return p.x + "," + p.y;
        }),
        rubble: (scene.rubble || []).map((c) => {
          const p = this.cell(c);
          return p.x + "," + p.y;
        }),
        cover: Object.fromEntries(
          Object.entries(scene.cover || {}).map(([k, v]) => {
            const p = this.cell(k);
            return [p.x + "," + p.y, v];
          }),
        ),
        ...(Object.keys(elevation).length ? {elevation} : {}),
      },
      units,
      order,
      initiative,
      baseline,
      continuityBaseline: structuredClone(continuity),
      cauldronVials: structuredClone(continuity.cauldron_vials || []),
      inventoryBaseline,
      index: 0,
      round: 1,
      elapsed: 0,
      turnSerial: 0,
      sequence: Math.max(
        0,
        ...(continuity.effects || []).map((x) =>
          Number(/(\d+)$/.exec(x.id)?.[1] || 0),
        ),
        ...(continuity.cauldron_vials || []).map(v=>
          Number(/(\d+)$/.exec(v.id)?.[1] || 0)),
      ),
      phase: "active",
      started: false,
      random: { value: randomValue, draws },
      queue: [],
      pending: null,
      events: [],
      zones: structuredClone(continuity.zones || []),
      memory: {},
      effects: structuredClone(continuity.effects || []),
      spellFrames: Object.fromEntries(
        (continuity.effects || []).map((x) => [
          x.id,
          {
            id: x.id,
            actor: x.owner,
            spell:
              ["abjure", "sacredWeapon"].includes(x.kind) ||
              x.kind in
                (typeof module !== "undefined"
                  ? require("./magic").CombatMagic
                  : CombatMagic
                ).SPELLS
                ? x.kind
                : "item",
            level: x.level,
            castOrigin: x.castOrigin,
            targets: x.targets,
            offered: [],
          },
        ]),
      ),
      objects: Object.fromEntries(
        (continuity.objects || []).map((o) => [
          o.id,
          { ...structuredClone(o), createdTurn: -1 },
        ]),
      ),
    };
  }
  static outcome(s) {
    if (s.phase !== "ended" || s.pending || s.queue.length)
      throw Error("Сначала заверши бой и все решения");
    const M =
      typeof module !== "undefined"
        ? require("./magic").CombatMagic
        : CombatMagic;
    s = M.normalizedAt(s, s.elapsed + 6);
    const mapping = {
        hp: "hp",
        focus: "focus",
        luck: "luck",
        heroic: "heroic",
        arrows: "arrows",
        metabolism: "unusual_metabolism",
      },
      after = {};
    for (const [id, before] of Object.entries(s.baseline)) {
      if (!Object.keys(before).length) continue;
      const u = s.units[id];
      after[id] = {};
      for (const [resource, pool] of Object.entries(u.counters || {}))
        if (before[resource]) after[id][resource] = structuredClone(pool);
      if (before.spell_slots) after[id].spell_slots = structuredClone(u.slots);
      for (const [field, resource] of Object.entries(mapping))
        if (before[resource])
          after[id][resource] = {
            current: u[field],
            max: field === "hp" ? u.max : before[resource].max,
          };
    }
    const summons = s.order.filter(
      (id) =>
        s.units[id].summoner &&
        !s.units[s.units[id].summoner]?.dead &&
        Object.hasOwn(after, s.units[id].summoner) &&
        s.units[id].hp > 0 &&
        !s.units[id].dead &&
        !s.units[id].fled,
    );
    const retained = new Set([...Object.keys(after), ...summons]);
    return {
      kind: s.meta.resultKind || "rin-combat-result",
      version: 30,
      engine_version: s.engineVersion,
      rules_version: s.rulesVersion,
      campaign_id: s.meta.campaignId,
      battle_id: s.meta.battleId,
      session_kind: s.meta.kind,
      source_revision: s.meta.sourceRevision,
      source_clock: s.meta.sourceClock || 0,
      continuity_before: s.continuityBaseline || { effects: [] },
      source_state_sha256: s.meta.sourceHash,
      phase: s.phase,
      before: s.baseline,
      after,
      elapsed_seconds: s.elapsed,
      round: s.round,
      inventory_before: Object.fromEntries(
        Object.keys(after).map((id) => [id, s.inventoryBaseline[id]]),
      ),
      inventory_after: Object.fromEntries(
        Object.keys(after).map((id) => [id, s.units[id].items]),
      ),
      participants: Object.fromEntries(
        s.order.map((id) => [
          id,
          {
            name: s.units[id].name,
            hp: s.units[id].hp,
            dead: Boolean(s.units[id].dead),
            fled: Boolean(s.units[id].fled),
            unconscious: s.units[id].statuses.some(
              (z) => z.kind === "unconscious",
            ),
            ...AdapterContinuity.life(s.units[id]),
          },
        ]),
      ),
      continuity: {
        ...(retained.size && [...retained].some(id => (s.units[id].exhaustion || 0) > 0)
          ? {exhaustion: Object.fromEntries([...retained].map(id => [id, s.units[id].exhaustion || 0]))}
          : {}),
        cauldron_vials: (s.cauldronVials || []).filter(v =>
          retained.has(v.owner) && retained.has(v.holder)).map(v=>structuredClone(v)),
        scene: {
          id: s.meta.sceneId || s.meta.battleId,
          name: s.meta.name,
          ...structuredClone(s.terrain),
          positions: Object.fromEntries(
            [...retained].map((id) => [
              id,
              { x: s.units[id].x, y: s.units[id].y },
            ]),
          ),
        },
        effects: (s.effects || [])
          .filter((x) => retained.has(x.owner) && x.until > s.elapsed)
          .map((x) => ({
            ...structuredClone(x),
            targets: x.targets.filter((id) => retained.has(id)),
            remaining_seconds: x.until - s.elapsed,
          })),
        objects: Object.values(s.objects || {})
          .filter(
            (o) =>
              Object.hasOwn(after, o.owner) &&
              s.effects.some((x) => x.id === o.id && x.until > s.elapsed),
          )
          .map((o) => ({
            ...structuredClone(o),
            grappled: retained.has(o.grappled) ? o.grappled : null,
          })),
        zones: s.zones
          .filter((z) => Object.hasOwn(after, z.owner) && z.until > s.elapsed)
          .map((z) => ({
            ...structuredClone(z),
            remaining_seconds: z.until - s.elapsed,
          })),
        units: summons.map((id) => structuredClone(s.units[id])),
        life: Object.fromEntries(
          [...retained].map((id) => [id, AdapterContinuity.life(s.units[id])]),
        ),
        temp_sources: Object.fromEntries(
          [...retained].map((id) => [id, s.units[id].tempSource || null]),
        ),
        temporary_hp: Object.fromEntries(
          [...retained].map((id) => [id, s.units[id].temp || 0]),
        ),
        statuses: Object.fromEntries(
          [...retained].map((id) => [
            id,
            s.units[id].statuses.filter(
              (z) =>
                // Turn-scoped tactics finish within the final six seconds.
                !z.expiresAtStart &&
                !z.expiresAtEnd &&
                !z.expiresOnSourceStart &&
                !z.expiresOnSourceEnd &&
                ![
                  "shield",
                  "aim",
                  "dodge",
                  "protected",
                  "bait",
                  "sap",
                  "slow",
                  "frost",
                ].includes(z.kind) &&
                (!z.effect ||
                  s.effects.some(
                    (x) => x.id === z.effect && x.until > s.elapsed,
                  )) &&
                (z.kind !== "grappled" || retained.has(z.source)),
            ),
          ]),
        ),
      },
      events: s.events,
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatCampaignAdapter };
