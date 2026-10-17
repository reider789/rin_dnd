"use strict";
// The campaign translates its profiles here; the domain has no named hero branches.
class CombatCampaignAdapter {
  static unit(id, p, raw = {}, r = {}) {
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
      tokenKey: raw.tokenKey || null,
      x: raw.x,
      y: raw.y,
      hp: r.hp?.current ?? p.hp ?? 11,
      max: r.hp?.max ?? p.hp ?? 11,
      ac: p.ac ?? 12,
      speed: p.speed ?? 30,
      stats,
      saves,
      skills: { ...skills, ...p.skills },
      proficiency: p.proficiency || 0,
      features: p.features || {},
      senses: p.senses || {},
      attacks: (p.attacks || []).map((a) => ({
        ...a,
        bonus: a.bonus ?? stats[a.ability] + p.proficiency,
        flat: a.flat ?? stats[a.ability],
      })),
      statuses: [],
      items: {},
      temp: 0,
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
    const width = scene.width || 11,
      height = scene.height || 8,
      units = {},
      initiative = {},
      baseline = {},
      inventoryBaseline = {};
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
        (u.features.alert ? u.proficiency : 0)
      );
    };
    for (const [id, r] of Object.entries(scene.heroes)) {
      const c = runtime.characters[id],
        p = c?.combat_profile || runtime.npc_profiles[r.profile || "guard"];
      if (!p) throw Error("Нет проверенной карточки " + id);
      units[id] = this.unit(
        id,
        p,
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
      const p = {
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
      engineVersion: "30.0.0",
      meta: {
        campaignId: runtime.campaign_id,
        battleId: scene.battle_id || "training-" + Date.now(),
        kind: scene.kind === "story" ? "story" : "training",
        name: scene.name,
        theme: scene.theme || "forest",
        sourceRevision: runtime.source_state_revision,
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
      },
      units,
      order,
      initiative,
      baseline,
      inventoryBaseline,
      index: 0,
      round: 1,
      elapsed: 0,
      turnSerial: 0,
      sequence: 0,
      phase: "active",
      started: false,
      random: { value: randomValue, draws },
      queue: [],
      pending: null,
      events: [],
      zones: [],
      memory: {},
    };
  }
  static outcome(s) {
    if (s.phase !== "ended" || s.pending || s.queue.length)
      throw Error("Сначала заверши бой и все решения");
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
      for (const [field, resource] of Object.entries(mapping))
        if (before[resource])
          after[id][resource] = {
            current: u[field],
            max: before[resource].max,
          };
    }
    return {
      kind: "rin-combat-result",
      version: 30,
      rules_version: s.rulesVersion,
      campaign_id: s.meta.campaignId,
      battle_id: s.meta.battleId,
      session_kind: s.meta.kind,
      source_revision: s.meta.sourceRevision,
      source_state_sha256: s.meta.sourceHash,
      phase: s.phase,
      before: s.baseline,
      after,
      elapsed_seconds: s.elapsed + 6,
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
          },
        ]),
      ),
      events: s.events,
    };
  }
}
if (typeof module !== "undefined") module.exports = { CombatCampaignAdapter };
