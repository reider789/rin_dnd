"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  createBattle,
  CombatRulesEngine: E,
  CombatMagic: M,
  CombatCampaignAdapter: A,
  CombatContinuity: C,
  CombatCapabilities: Cap,
} = require("../sdk");
const { CombatSessionStore: Store } = require("../web/session_store");
const base = require("../examples/portable/border-watch.json");
const pool = (n) => ({ current: n, max: n });
function setup() {
  const p = structuredClone(base);
  p.profiles.caster = {
    name: "Заклинатель",
    hp: 100,
    ac: 12,
    speed: 30,
    scores: { STR: 10, DEX: 14, CON: 14, INT: 20, WIS: 14, CHA: 14 },
    proficiency: 4,
    features: {},
    equipment: {},
    attacks: [
      {
        id: "staff",
        name: "Посох",
        kind: "melee",
        ability: "STR",
        range: 5,
        bonus: 5,
        flat: 0,
        count: 1,
        die: 6,
        damageType: "bludgeoning",
      },
    ],
    casting: {
      ability: "INT",
      attack: 11,
      dc: 19,
      level: 10,
      prepared: Object.keys(M.SPELLS).filter(
        (k) =>
          M.SPELLS[k][1] > 0 && !["stormSphere", "drainingWave"].includes(k),
      ),
      cantrips: ["fireBolt"],
      components: { wardingBond: true },
    },
  };
  p.characters.ena.profile = "caster";
  p.characters.ena.resources = {
    hp: pool(100),
    smite_free: pool(1),
    channel_divinity: pool(2),
    spell_slots: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [n, pool(9)]),
    ),
  };
  p.profiles.scout.features = {};
  const { engine: e } = createBattle(p);
  e.initialize();
  for (const id of e.s.order) {
    const u = e.unit(id);
    u.controlled = false;
    u.policies = {
      heroic: false,
      luck: false,
      defenseLuck: false,
      sneak: false,
    };
  }
  e.unit("ena").controlled = true;
  e.s.terrain.walls = [];
  e.s.terrain.rubble = [];
  e.s.terrain.cover = {};
  Object.assign(e.unit("ena"), { x: 2, y: 3 });
  Object.assign(e.unit("tal"), { x: 2, y: 4 });
  Object.assign(e.unit("hunter_a"), { x: 6, y: 3, hp: 200, max: 200 });
  Object.assign(e.unit("hunter_b"), { x: 7, y: 5, hp: 200, max: 200 });
  turn(e, "ena");
  e.s.random.tape = Array(300).fill(5);
  return e;
}
function turn(e, id) {
  e.s.index = e.s.order.indexOf(id);
  e.enqueue({ kind: "startTurn" });
  e.run();
}
function cast(e, spell, data = {}) {
  e.dispatch({ kind: "cast", actor: e.actorId, spell, ...data });
}
function decide(e, choice, data = {}) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice, ...data });
}
function reload(e) {
  return new E(JSON.parse(JSON.stringify(e.export())).session);
}
function outcome(e) {
  e.s.phase = "ended";
  e.emit("battleEnded", null, "Бой завершён.");
  return A.outcome(e.s);
}
function add(e, kind, targets, duration = 60, extra = {}) {
  return M.add(
    e,
    {
      actor: "ena",
      spell: kind in M.SPELLS ? kind : "item",
      level: kind === "aid" ? 2 : 3,
    },
    kind,
    targets,
    duration,
    extra,
  );
}
function attack(e, tape = [18, 6]) {
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.s.random.tape = tape;
  e.dispatch({
    kind: "attack",
    actor: "ena",
    weapon: "staff",
    target: "hunter_a",
  });
}

test("B01: the last enemy in an area is not the end if a later victim is dying; reload and stabilize", () => {
  let e = setup();
  Object.assign(e.unit("ena"), { x: 0, y: 0 });
  Object.assign(e.unit("tal"), { x: 6, y: 4, hp: 1 });
  Object.assign(e.unit("hunter_a"), { x: 6, y: 3, hp: 1 });
  Object.assign(e.unit("hunter_b"), { hp: 0, dead: true });
  e.s.order = ["hunter_a", "tal", "ena", "hunter_b"];
  e.s.index = 2;
  e.s.random.tape = [...Array(8).fill(1), 1, 1];
  cast(e, "fireball", { point: { x: 6, y: 3 } });
  assert.equal(e.s.phase, "active");
  assert.equal(e.unit("tal").hp, 0);
  assert.equal(e.s.events.filter((x) => x.type === "battleEnded").length, 0);
  assert.throws(() => A.outcome(e.s));
  e = reload(e);
  e.unit("tal").stable = true;
  e.run();
  e.run();
  const ended = e.s.events.filter((x) => x.type === "battleEnded");
  assert.equal(ended.length, 1);
  assert.ok(ended[0].seq > e.s.events.findLast((x) => x.type === "damage").seq);
  C.validateReport(A.outcome(e.s));
});
test("B01: a damage transfer can down a hero after the last enemy; no premature result", () => {
  const e = setup();
  Object.assign(e.unit("hunter_b"), { hp: 0, dead: true });
  e.enqueue(
    {
      kind: "damage",
      actor: "ena",
      target: "hunter_a",
      amount: 1000,
      damageType: "fire",
    },
    {
      kind: "damage",
      actor: "hunter_a",
      target: "tal",
      amount: 30,
      damageType: "radiant",
      bondTransfer: true,
    },
  );
  e.run();
  assert.equal(e.s.phase, "active");
  assert.equal(e.unit("tal").hp, 0);
  assert.equal(Boolean(e.unit("tal").dead), false);
});
for (const duration of [0, 1, 5, 6, 7])
  test(`B02: report normalizes Aid and Heroism at the same end time (${duration}s) without mutation`, () => {
    const e = setup(),
      u = e.unit("tal"),
      original = u.max;
    u.hp = original - 3;
    u.max += 5;
    u.hp += 5;
    add(e, "aid", ["tal"], duration, { amount: 5 });
    const hero = add(e, "heroism", ["tal"], duration, { amount: 3 });
    u.temp = 3;
    u.tempSource = hero.id;
    e.s.phase = "ended";
    const before = e.export(),
      r = A.outcome(e.s);
    C.validateReport(r);
    assert.deepEqual(e.export(), before);
    assert.equal(r.elapsed_seconds, 6);
    assert.equal(r.after.tal.hp.max, original + (duration > 6 ? 5 : 0));
    assert.equal(
      r.after.tal.hp.current,
      original + 2 - (duration <= 6 ? 5 : 0),
    );
    assert.equal(r.continuity.temporary_hp.tal, duration > 6 ? 3 : 0);
    assert.equal(r.continuity.effects.length, duration > 6 ? 2 : 0);
    assert.deepEqual(A.outcome(e.s), r);
  });
test("B02: expiry preserves unrelated temporary HP and the prebattle Aid baseline", () => {
  const e = setup(),
    u = e.unit("ena");
  u.max = 105;
  u.hp = 50;
  e.s.baseline.ena.hp = pool(105);
  const aid = add(e, "aid", ["ena"], 6, { amount: 5 });
  e.s.continuityBaseline = { effects: [structuredClone(aid)] };
  add(e, "heroism", ["ena"], 6, { amount: 3 });
  u.temp = 7;
  u.tempSource = "another-source";
  const r = outcome(e);
  assert.equal(r.before.ena.hp.max, 105);
  assert.deepEqual(r.after.ena.hp, { current: 45, max: 100 });
  assert.equal(r.continuity.temporary_hp.ena, 7);
  assert.equal(r.continuity.temp_sources.ena, "another-source");
});
test("B03: source stacking remains runtime policy; turn-relative NPC conditions finish before handoff", () => {
  const e = setup();
  for (const source of ["hunter_a", "hunter_b"])
    e.status("tal", "goaded", {
      source,
      stackBySource: true,
      expiresOnSourceEnd: source,
      expiresOnSourceEndTurn: 1,
    });
  assert.equal(e.unit("tal").statuses.length, 2);
  assert.ok(
    e.unit("tal").statuses.every((z) => !Object.hasOwn(z, "stackBySource")),
  );
  const r = outcome(e);
  C.validateReport(r);
  assert.deepEqual(r.continuity.statuses.tal, []);
});
test("B03: spatial continuation is bound to its exact field and cannot silently move to a new map", () => {
  const e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
  const r = outcome(e);
  C.validateReport(r);
  const runtime = {
    combat_schema_version: 30,
    campaign_id: "x",
    source_state_sha256: "a".repeat(64),
    characters: {},
    npc_profiles: { guard: { hp: 20, attacks: e.unit("tal").attacks } },
    continuity: r.continuity,
  };
  const scene = {
    name: "Другая сцена",
    kind: "training",
    width: 14,
    height: 10,
    heroes: { ena: { cell: "C4", profile: "guard" } },
    enemies: [{ id: "enemy", cell: "J4", profile: "guard" }],
  };
  assert.throws(() => A.create(runtime, scene, 1), /прежнем поле/);
  const bad = structuredClone(r);
  bad.continuity.objects[0].x = 39;
  assert.throws(() => C.validateReport(bad), /объект/);
});
test("B04: dynamic weapon bonuses match ordinary, Haste, readied and opportunity attacks", () => {
  const e = setup();
  add(e, "sacredWeapon", ["ena"], 600, {
    weapon: "staff",
    amount: 2,
    concentration: false,
  });
  add(e, "giantStrength", ["ena"], 600, { concentration: false });
  attack(e);
  add(e, "haste", ["ena"], 60, { concentration: false, noLethargy: true });
  e.unit("ena").hasteAction = 1;
  e.s.random.tape = [18, 1];
  e.dispatch({
    kind: "hasteAction",
    actor: "ena",
    action: "attack",
    weapon: "staff",
    target: "hunter_a",
  });
  for (const mode of ["reaction", "reaction"]) {
    e.s.random.tape = [18, 1];
    e.enqueue({
      kind: "attackRoll",
      actor: "ena",
      target: "hunter_a",
      spec: e.attackSpec("ena", "staff"),
      mode,
    });
    e.run();
  }
  assert.deepEqual(
    e.s.events
      .filter((x) => x.type === "roll" && x.actor === "ena" && x.sides === 20)
      .map((x) => x.bonus),
    [12, 12, 12, 12],
  );
  assert.equal(e.unit("ena").attacks[0].bonus, 5);
  assert.equal(e.unit("ena").attacks[0].flat, 0);
});
test("B04: a defensive pause reloads without applying weapon buffs twice", () => {
  let e = setup();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3, controlled: true, luck: 1 });
  e.unit("hunter_a").policies.defenseLuck = true;
  add(e, "sacredWeapon", ["ena"], 600, {
    weapon: "staff",
    amount: 2,
    concentration: false,
  });
  attack(e, [18, 1]);
  assert.equal(e.s.pending.kind, "defenseLuck");
  e = reload(e);
  decide(e, "no");
  assert.equal(
    e.s.events.findLast((x) => x.type === "roll" && x.sides === 20).bonus,
    7,
  );
});
test("B04: legacy prebuffed ordinary attack resumes without double Sacred Weapon", () => {
  const e = setup();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  add(e, "sacredWeapon", ["ena"], 600, {
    weapon: "staff",
    amount: 2,
    concentration: false,
  });
  e.s.engineVersion = "30.5.1";
  const spec = structuredClone(e.unit("ena").attacks[0]);
  spec.bonus += 2;
  e.enqueue({
    kind: "attackRoll",
    actor: "ena",
    target: "hunter_a",
    spec,
    mode: "action",
  });
  const resumed = reload(e);
  resumed.s.random.tape = [18, 1];
  resumed.run();
  assert.equal(
    resumed.s.events.findLast((x) => x.type === "roll" && x.sides === 20).bonus,
    7,
  );
});
test("B04: two ready allies both get one decision, including after reload and first refusal", () => {
  let e = setup();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.unit("tal").controlled = true;
  e.s.units.friend = {
    ...structuredClone(e.unit("tal")),
    id: "friend",
    name: "Союзник",
    x: 3,
    y: 4,
  };
  e.s.order.push("friend");
  e.s.initiative.friend = 0;
  for (const id of ["ena", "tal"])
    e.unit(id).ready = {
      trigger: "attackAlly",
      spec: e.attackSpec(id, e.unit(id).attacks[0].id),
    };
  e.enqueue({ kind: "attackCompleted", actor: "hunter_a", target: "friend" });
  e.run();
  assert.equal(e.s.pending.actor, "ena");
  e = reload(e);
  decide(e, "no");
  assert.equal(e.s.pending.actor, "tal");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("ena").reaction, 1);
  assert.equal(e.unit("tal").reaction, 0);
});
test("B05: Uncanny Dodge halves all typed parts, applies resistance by type and reloads one reaction", () => {
  let e = setup(),
    v = e.unit("hunter_a");
  v.controlled = true;
  v.features.uncannyDodge = true;
  v.resistances = ["radiant"];
  add(e, "crusaderMantle", [], 60, { aura: 30 });
  attack(e, [18, 6, 4]);
  assert.equal(e.s.pending.kind, "uncannyDodge");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("hunter_a").hp, 196);
  assert.equal(e.unit("hunter_a").reaction, 0);
  assert.equal(e.s.events.filter((x) => x.type === "damage").length, 1);
  const damage = e.s.events.findLast((x) => x.type === "damage");
  assert.equal(damage.amount, 4);
  assert.deepEqual(damage.components, [
    { damageType: "bludgeoning", amount: 3 },
    { damageType: "radiant", amount: 1 },
  ]);
});
test("B05: a critical doubles rider dice before one Dodge and one concentration save", () => {
  const e = setup(),
    v = e.unit("hunter_a");
  v.controlled = true;
  v.features.uncannyDodge = true;
  M.add(
    e,
    { actor: "hunter_a", spell: "shieldFaith", level: 1 },
    "shieldFaith",
    ["hunter_a"],
    60,
  );
  add(e, "crusaderMantle", [], 60, { aura: 30 });
  attack(e, [20, 6, 6, 4, 4]);
  decide(e, "yes");
  assert.equal(v.hp, 190);
  assert.equal(v.reaction, 0);
  assert.equal(e.s.events.filter((x) => x.type === "concentration").length, 1);
});
test("B05: Smite joins the hit before Dodge, preserves its counterspell window and charges once", () => {
  const e = setup();
  e.unit("ena").features.divineSmite = true;
  Object.assign(e.unit("hunter_a"), { controlled: true });
  e.unit("hunter_a").features.uncannyDodge = true;
  attack(e, [18, 6, 4, 4]);
  decide(e, "smite");
  decide(e, "free");
  assert.equal(e.s.pending.kind, "uncannyDodge");
  decide(e, "yes");
  assert.equal(e.unit("hunter_a").hp, 193);
  assert.equal(e.unit("ena").counters.smite_free.current, 0);
  assert.equal(e.s.events.filter((x) => x.type === "damage").length, 1);
});
test("B05: Dexterity cover uses spell origin; other saves and context-free checks get no cover", () => {
  const e = setup();
  e.s.terrain.cover["2,4"] = 5;
  assert.equal(
    e.saveTask("tal", "DEX", 19, { kind: "checkResult", actor: "tal" }).bonus,
    2,
  );
  assert.equal(
    e.saveTask(
      "tal",
      "CON",
      19,
      { kind: "checkResult", actor: "tal" },
      { origin: e.unit("ena") },
    ).bonus,
    e.unit("tal").saves.CON,
  );
  e.s.order = ["ena", "tal", "hunter_a", "hunter_b"];
  e.s.index = 0;
  e.s.random.tape = [...Array(8).fill(1), 20, 12, 20, 20];
  cast(e, "fireball", { point: { x: 4, y: 4 } });
  assert.equal(
    e.s.events.findLast(
      (x) => x.type === "roll" && x.actor === "tal" && x.sides === 20,
    ).bonus,
    7,
  );
  assert.equal(e.unit("tal").hp, 23);
});
test("B05: countered Smite resumes the base hit once after reload and refunds its slot", () => {
  let e = setup();
  e.unit("ena").features.divineSmite = true;
  Object.assign(e.unit("hunter_a"), { controlled: true });
  e.unit("hunter_a").features.uncannyDodge = true;
  const counter = e.unit("hunter_b");
  counter.controlled = true;
  counter.casting = structuredClone(e.unit("ena").casting);
  counter.casting.prepared = ["counterspell"];
  counter.slots = { 3: pool(2) };
  attack(e, [18, 6, 1]);
  decide(e, "smite");
  decide(e, "slot1");
  assert.equal(e.s.pending.choice, "counterspell");
  assert.equal(e.unit("ena").slots[1].current, 8);
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.s.pending.kind, "uncannyDodge");
  decide(e, "yes");
  assert.equal(e.unit("ena").slots[1].current, 9);
  assert.equal(e.unit("ena").bonus, 0);
  assert.equal(e.unit("hunter_a").hp, 197);
  assert.equal(e.unit("hunter_b").slots[3].current, 1);
});
for (const spent of [0, 10, 25])
  test(`B06: removing a speed-zero condition restores only unspent movement (${spent}ft spent)`, () => {
    const e = setup(),
      u = e.unit("ena");
    u.move = 30 - spent;
    e.status("ena", "grappled", { source: "hunter_a", dc: 10 });
    assert.equal(u.move, 0);
    e.removeStatus("ena", "grappled");
    assert.equal(u.move, 30 - spent);
  });
test("B06: escape at start of turn, ally release and Dash preserve the movement budget", () => {
  const e = setup();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.status("ena", "grappled", { source: "hunter_a", dc: 10 });
  turn(e, "ena");
  assert.equal(e.unit("ena").move, 0);
  e.s.random.tape = [18];
  e.dispatch({ kind: "escape", actor: "ena" });
  assert.equal(e.unit("ena").move, 30);
  turn(e, "ena");
  e.dispatch({ kind: "dash", actor: "ena" });
  e.unit("ena").move -= 10;
  e.status("ena", "grappled", { source: "hunter_a", dc: 10 });
  assert.equal(e.unit("ena").move, 0);
  e.unit("hunter_a").dead = true;
  e.releaseGrapples();
  assert.equal(e.unit("ena").move, 50);
});
test("B07: replacing a steed detaches old Aid and statuses but keeps shared targets", () => {
  const e = setup();
  cast(e, "findSteed", { point: { x: 3, y: 3 } });
  turn(e, "ena");
  cast(e, "aid", { targets: ["ena-steed", "tal"] });
  const talMax = e.unit("tal").max;
  e.status("ena-steed", "poisoned");
  e.unit("ena-steed").temp = 4;
  turn(e, "ena");
  cast(e, "findSteed", { point: { x: 3, y: 2 } });
  assert.equal(e.unit("ena-steed").max, 25);
  assert.equal(e.unit("ena-steed").temp, 0);
  assert.deepEqual(e.unit("ena-steed").statuses, []);
  assert.equal(e.unit("tal").max, talMax);
  assert.equal(M.effects(e, "tal", "aid").length, 1);
  e.s.elapsed = 28800;
  turn(e, "ena");
  assert.equal(e.unit("ena-steed").max, 25);
  assert.equal(e.unit("tal").max, talMax - 5);
});
test("B07: steed remains when its owner is dying but disappears on death and is omitted from reports", () => {
  const e = setup();
  cast(e, "findSteed", { point: { x: 3, y: 3 } });
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "ena",
    amount: 100,
    damageType: "fire",
  });
  e.run();
  assert.equal(Boolean(e.unit("ena").dead), false);
  assert.equal(e.active("ena-steed"), true);
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "ena",
    amount: 1000,
    damageType: "fire",
  });
  e.run();
  assert.equal(e.unit("ena").dead, true);
  assert.equal(e.active("ena-steed"), false);
  const r = outcome(e);
  C.validateReport(r);
  assert.equal(r.continuity.units.length, 0);
  reload(e);
});
for (const kind of ["object", "effect"])
  test(`B08: Dispel Magic explicitly selects a ${kind} and removes Bigby after a higher-level check`, () => {
    let e = setup();
    cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
    const id = Object.keys(e.s.objects)[0];
    turn(e, "ena");
    e.unit("ena").heroic = 1;
    e.unit("ena").policies.heroic = true;
    e.s.random.tape = [10];
    cast(e, "dispelMagic", { level: 3, dispelTarget: { kind, id } });
    assert.equal(e.s.pending.kind, "roll");
    e = reload(e);
    decide(e, "accept");
    assert.equal(e.s.objects[id], undefined);
    assert.equal(e.unit("ena").slots[3].current, 8);
  });
test("B08: dispelling a creature does not silently erase its separately placed hand; invalid target is atomic", () => {
  const e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
  const id = Object.keys(e.s.objects)[0];
  turn(e, "ena");
  const before = e.export();
  assert.throws(() =>
    cast(e, "dispelMagic", { dispelTarget: { kind: "object", id: "missing" } }),
  );
  assert.deepEqual(e.export(), before);
  cast(e, "dispelMagic", { level: 5, target: "ena" });
  assert.ok(e.s.objects[id]);
});
test("B08: Warding Bond ends permanently beyond 60ft, on 0HP, or recasting on a connected creature", () => {
  const e = setup();
  e.s.terrain.width = 20;
  cast(e, "wardingBond", { target: "tal" });
  Object.assign(e.unit("ena"), { x: 14, y: 4 });
  M.maintain(e);
  assert.equal(M.effects(e, "tal", "wardingBond").length, 1);
  turn(e, "ena");
  cast(e, "dimensionDoor", { point: { x: 15, y: 4 } });
  assert.equal(M.effects(e, "tal", "wardingBond").length, 0);
  turn(e, "ena");
  cast(e, "dimensionDoor", { point: { x: 2, y: 3 } });
  assert.equal(M.effects(e, "tal", "wardingBond").length, 0);
  turn(e, "ena");
  const before = e.export();
  assert.throws(() => cast(e, "wardingBond", { target: "ena" }), /другого/);
  assert.deepEqual(e.export(), before);
  cast(e, "wardingBond", { target: "tal" });
  e.unit("tal").casting = structuredClone(e.unit("ena").casting);
  e.unit("tal").slots = { 2: pool(2) };
  turn(e, "tal");
  cast(e, "wardingBond", { target: "ena" });
  assert.equal(e.s.effects.filter((x) => x.kind === "wardingBond").length, 1);
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "tal",
    amount: 27,
    damageType: "fire",
  });
  e.run();
  assert.equal(M.effects(e, "ena", "wardingBond").length, 0);
});
class MemoryStorage {
  constructor(quota = 100000) {
    this.data = new Map();
    this.quota = quota;
  }
  get length() {
    return this.data.size;
  }
  key(i) {
    return [...this.data.keys()][i];
  }
  getItem(k) {
    return this.data.get(k) ?? null;
  }
  removeItem(k) {
    this.data.delete(k);
  }
  setItem(k, v) {
    const n =
      [...this.data].reduce(
        (n, [key, raw]) => n + (key === k ? 0 : raw.length),
        0,
      ) + v.length;
    if (n > this.quota) throw Error("QuotaExceededError");
    this.data.set(k, v);
  }
}
test("B09: backup copies are bounded and yield to current save under real quota errors; history stays intact", () => {
  const storage = new MemoryStorage(1000),
    store = new Store(storage, { archive: 400, backup: 200, total: 900 }),
    key = "dnd-combat-session:campaign:current",
    old = "dnd-combat-session:campaign:old";
  storage.setItem(old, "a".repeat(300));
  store.write(key, "b".repeat(400));
  store.checkpoint(key, "c".repeat(150));
  store.write(key, "d".repeat(650));
  assert.equal(storage.getItem(key), "d".repeat(650));
  assert.equal(storage.getItem(old), "a".repeat(300));
  assert.equal(storage.getItem(key + ":previous"), null);
  assert.equal(store.checkpoint(key, "x".repeat(201)), false);
  assert.throws(() => store.remove(key, key), /защищён/);
});
test("B09: full archive blocks switching rather than deleting a battle or sacrificing the current reserve", () => {
  const storage = new MemoryStorage(),
    store = new Store(storage, { archive: 200 }),
    a = "dnd-combat-session:a:1",
    b = "dnd-combat-session:a:2";
  store.write(a, "x".repeat(300));
  assert.throws(() => store.allowSwitch(b), /Архив боёв заполнен/);
  assert.equal(storage.getItem(a), "x".repeat(300));
  store.allowSwitch(a);
});
test("B10: all supported conditions and item effects have Russian labels", () => {
  for (const kind of [
    ...Cap.STATUSES,
    "abjure",
    "sacredWeapon",
    "fireResistance",
    "antitoxin",
    "haste",
    "enlarge",
    "giantStrength",
    "climbing",
  ])
    assert.match(M.label(kind), /[А-Яа-яЁё]/, kind);
  const e = setup();
  add(e, "haste", ["ena"], 60, { concentration: false, noLethargy: true });
  assert.equal(
    e.s.events.findLast((x) => x.type === "effect").text,
    "Ускорение",
  );
});
