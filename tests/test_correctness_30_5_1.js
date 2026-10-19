"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  createBattle,
  CombatRulesEngine: E,
  CombatMagic: M,
  CombatCampaignAdapter: A,
  CombatContinuity: C,
} = require("../sdk");
const base = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
const pool = (n) => ({ current: n, max: n });
function setup() {
  const p = structuredClone(base);
  p.profiles.caster = {
    name: "Caster",
    hp: 100,
    ac: 12,
    speed: 30,
    scores: { STR: 10, DEX: 14, CON: 14, INT: 20, WIS: 14, CHA: 14 },
    proficiency: 4,
    features: { empoweredEvocation: true },
    attacks: [
      {
        id: "staff",
        name: "Staff",
        kind: "melee",
        range: 5,
        bonus: 5,
        flat: 1,
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
      prepared: [
        "slow",
        "counterspell",
        "bigbyHand",
        "shield",
        "bless",
        "holdMonster",
        "findSteed",
        "lesserRestoration",
        "zoneTruth",
        "dimensionDoor",
        "heroism",
        "aid",
      ],
      cantrips: ["fireBolt"],
      components: {},
    },
    equipment: {},
  };
  p.characters.ena.profile = "caster";
  p.characters.ena.resources = {
    hp: pool(100),
    spell_slots: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [n, pool(5)]),
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
      sneak: true,
    };
  }
  e.unit("ena").controlled = true;
  e.s.terrain.walls = [];
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
function atomic(e, fn, pattern) {
  const before = e.export();
  assert.throws(fn, pattern);
  assert.deepEqual(e.export(), before);
}
function outcome(e) {
  e.s.phase = "ended";
  return A.outcome(e.s);
}

test("R02: loading queued repeat saves is pure and preserves the unresolved dice", () => {
  let e = setup();
  M.add(e, { actor: "ena", spell: "slow", level: 3 }, "slow", ["hunter_a"], 60);
  M.add(
    e,
    { actor: "tal", spell: "holdMonster", level: 5 },
    "holdMonster",
    ["hunter_a"],
    60,
  );
  const u = e.unit("hunter_a");
  u.controlled = true;
  u.heroic = 1;
  u.policies.heroic = true;
  turn(e, "hunter_a");
  e.dispatch({ kind: "endTurn", actor: "hunter_a" });
  assert.equal(e.s.pending.kind, "roll");
  assert.ok(e.s.queue.some((t) => t.save));
  const saved = JSON.parse(JSON.stringify(e.export()));
  e = reload(e);
  assert.deepEqual(e.export(), saved);
  decide(e, "accept");
  while (e.s.pending) decide(e, "accept");
  assert.equal(e.s.queue.length, 0);
});
test("R02: grouped Zone of Truth saves reload with Bless without consuming RNG", () => {
  let e = setup();
  M.add(e, { actor: "ena", spell: "bless", level: 1 }, "bless", e.s.order, 60);
  for (const id of e.s.order) {
    e.unit(id).controlled = true;
    e.unit(id).heroic = 1;
    e.unit(id).policies.heroic = true;
  }
  e.s.random.tape = Array(300).fill(2);
  cast(e, "zoneTruth", { point: { x: 4, y: 3 } });
  assert.equal(e.s.pending.kind, "roll");
  const saved = JSON.parse(JSON.stringify(e.export()));
  e = reload(e);
  assert.deepEqual(e.export(), saved);
});
test("R05: countered replacement ends prior concentration and refunds only the new slot", () => {
  const e = setup();
  cast(e, "bless", { target: "ena" });
  const v = e.unit("hunter_a");
  v.casting = structuredClone(e.unit("ena").casting);
  v.casting.prepared = ["counterspell"];
  v.slots = { 3: pool(2) };
  v.controlled = true;
  turn(e, "ena");
  e.s.random.tape = [1];
  cast(e, "slow", { target: "hunter_b" });
  assert.equal(M.concentrating(e, "ena"), false);
  decide(e, "yes");
  assert.equal(M.effects(e, "ena", "bless").length, 0);
  assert.equal(e.unit("ena").slots[3].current, 5);
  assert.equal(e.unit("ena").action, 0);
});
test("R05: invalid replacement keeps the original concentration and all resources", () => {
  const e = setup();
  cast(e, "bless", { target: "ena" });
  turn(e, "ena");
  atomic(e, () => cast(e, "slow", { target: "missing" }));
  assert.equal(M.effects(e, "ena", "bless").length, 1);
});
test("R04: Bigby offers Shield, reloads the reaction and spends it exactly once", () => {
  let e = setup();
  const v = e.unit("hunter_a");
  v.ac = 24;
  v.features.shieldSpell = true;
  v.slots = { 1: pool(2) };
  v.controlled = true;
  e.s.random.tape = [15, 2, 2, 2, 2, 2];
  cast(e, "bigbyHand", {
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  assert.equal(e.s.pending.ability, "shield");
  assert.equal(v.hp, 200);
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("hunter_a").hp, 200);
  assert.equal(e.unit("hunter_a").reaction, 0);
  assert.equal(e.unit("hunter_a").slots[1].current, 1);
  assert.equal(Object.values(e.s.objects)[0].empoweredUsed, undefined);
});
test("R04: Protection applies to Bigby before rolling and is serialized", () => {
  let e = setup();
  const ally = e.unit("hunter_b");
  Object.assign(ally, { x: 6, y: 4, controlled: true });
  ally.features = { protection: true, shieldEquipped: true };
  e.s.random.tape = [18, 2, 2, 2, 2, 2];
  cast(e, "bigbyHand", {
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  assert.equal(e.s.pending.ability, "protection");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("hunter_b").reaction, 0);
  assert.equal(
    e.s.events.findLast((x) => x.type === "attack").modifiers.disadv,
    true,
  );
});
test("R04: Bigby uses conditions and distance from the hand for advantage and criticals", () => {
  const e = setup();
  e.status("hunter_a", "paralyzed");
  e.s.random.tape = [12, 12, ...Array(10).fill(2)];
  cast(e, "bigbyHand", {
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  const attack = e.s.events.findLast((x) => x.type === "attack");
  assert.equal(attack.modifiers.adv, true);
  assert.equal(attack.critical, true);
  assert.equal(e.unit("hunter_a").hp, 175);
});
test("R04: a missed fist retains Empowered Evocation for the next hit", () => {
  const e = setup();
  e.s.random.tape = [1];
  cast(e, "bigbyHand", {
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  assert.ok(!Object.values(e.s.objects)[0].empoweredUsed);
  turn(e, "ena");
  e.s.random.tape = [18, ...Array(5).fill(2)];
  e.dispatch({
    kind: "hand",
    actor: "ena",
    handMode: "fist",
    target: "hunter_a",
  });
  assert.equal(e.unit("hunter_a").hp, 185);
});
test("R04: legacy rolled fist resumes through defenses without rolling another d20", () => {
  const e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
  const o = Object.values(e.s.objects)[0];
  const v = e.unit("hunter_a");
  v.ac = 24;
  v.features.shieldSpell = true;
  v.slots = { 1: pool(2) };
  v.controlled = true;
  e.s.random.tape = [2, 2, 2, 2, 2];
  e.enqueue(
    M.task("ena", "handAttack", {
      object: o.id,
      target: "hunter_a",
      result: { kept: 15, total: 26, rolls: [15] },
    }),
  );
  e.run();
  assert.equal(e.s.pending.ability, "shield");
  assert.deepEqual(e.s.random.tape, [2, 2, 2, 2, 2]);
});
test("R08: new and legacy speed potions end without lethargy", () => {
  for (const legacy of [false, true]) {
    const e = setup(),
      u = e.unit("ena");
    u.items.speed = 1;
    u.equipment.consumables = { speed: "speedPotion" };
    e.dispatch({ kind: "useItem", actor: "ena", item: "speed" });
    if (legacy) delete e.s.effects[0].noLethargy;
    e.s.elapsed = 60;
    turn(e, "ena");
    assert.equal(e.incapacitated("ena"), false);
    assert.equal(u.action, 1);
    assert.equal(u.bonus, 1);
    assert.equal(u.hasteAction, 0);
    assert.equal(e.speed("ena"), 30);
  }
});
test("R09: restoration requires a single choice and leaves other conditions", () => {
  const e = setup();
  e.status("tal", "blinded");
  e.status("tal", "poisoned");
  atomic(
    e,
    () => cast(e, "lesserRestoration", { target: "tal" }),
    /одно состояние/,
  );
  cast(e, "lesserRestoration", { target: "tal", condition: "poisoned" });
  assert.equal(e.has("tal", "poisoned"), false);
  assert.equal(e.has("tal", "blinded"), true);
});
test("R09: restoring one held victim preserves paralysis on the other", () => {
  const e = setup();
  M.add(
    e,
    { actor: "hunter_a", spell: "holdMonster", level: 6 },
    "holdMonster",
    ["ena", "tal"],
    60,
  );
  e.s.effects[0].targets = ["tal", "hunter_b"];
  e.status("tal", "poisoned");
  cast(e, "lesserRestoration", { target: "tal", condition: "paralyzed" });
  assert.equal(e.has("tal", "paralyzed"), false);
  assert.equal(e.has("tal", "poisoned"), true);
  assert.equal(e.has("hunter_b", "paralyzed"), true);
  assert.deepEqual(e.s.effects[0].targets, ["hunter_b"]);
});
test("R10: free II, paid II and paid higher steed casts have distinct costs", () => {
  for (const [level, free, expectedSlot, expectedFree] of [
    [2, true, 5, 0],
    [2, false, 4, 1],
    [3, undefined, 4, 1],
  ]) {
    const e = setup();
    e.unit("ena").counters.faithful_steed = pool(1);
    cast(e, "findSteed", {
      level,
      free,
      steedType: "fey",
      point: { x: 3, y: 3 },
    });
    assert.equal(e.unit("ena").slots[level].current, expectedSlot);
    assert.equal(e.unit("ena").counters.faithful_steed.current, expectedFree);
    assert.equal(e.unit("ena-steed").summonLevel, level);
    assert.equal(e.unit("ena-steed").creatureType, "fey");
  }
});
test("R10: free upcasting and unknown steed type are rejected atomically", () => {
  const e = setup();
  e.unit("ena").counters.faithful_steed = pool(1);
  atomic(
    e,
    () => cast(e, "findSteed", { level: 3, free: true, point: { x: 3, y: 3 } }),
    /II круг/,
  );
  atomic(
    e,
    () => cast(e, "findSteed", { steedType: "dragon", point: { x: 3, y: 3 } }),
    /тип скакуна/,
  );
});
test("R01/R03/R07: report carries life and a blessed injured steed with temp HP and statuses", () => {
  const e = setup();
  cast(e, "findSteed", { point: { x: 3, y: 3 } });
  turn(e, "ena");
  cast(e, "bless", { target: "ena-steed" });
  const steed = e.unit("ena-steed");
  steed.hp = 17;
  steed.temp = 4;
  e.status("ena-steed", "poisoned", {
    source: "hunter_a",
    until: 60,
    repeatDC: 12,
    repeatStat: "CON",
  });
  const u = e.unit("tal");
  u.hp = 0;
  u.stable = true;
  u.deathSuccesses = 0;
  u.deathFailures = 0;
  e.status("tal", "unconscious");
  const report = outcome(e),
    valid = C.validateReport(report);
  assert.equal(valid.life.tal.stable, true);
  assert.equal(valid.units[0].hp, 17);
  assert.deepEqual(valid.effects.find((x) => x.kind === "bless").targets, [
    "ena-steed",
  ]);
  assert.equal(valid.temporary_hp["ena-steed"], 4);
  assert.equal(valid.statuses["ena-steed"][0].kind, "poisoned");
  for (const mutate of [
    (r) => (r.continuity.effects[0].kind = "unknown"),
    (r) => r.continuity.units.push({ summoner: "ena", hp: 5 }),
    (r) => r.continuity.statuses.tal.push({ kind: "invented" }),
    (r) => delete r.continuity.life.tal,
  ]) {
    const bad = structuredClone(report);
    mutate(bad);
    assert.throws(() => C.validateReport(bad));
  }
});
test("R03: an ended enemy grapple and nearly expired magic do not leave broken references", () => {
  const e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
  const o = Object.values(e.s.objects)[0];
  o.grappled = "hunter_a";
  e.status("tal", "grappled", { source: "hunter_a", dc: 12 });
  M.add(e, { actor: "ena", spell: "web", level: 2 }, "web", ["tal"], 3);
  e.status("tal", "restrained", {
    source: "ena",
    effect: e.s.effects[1].id,
    magic: true,
    dc: 19,
  });
  const r = outcome(e);
  assert.equal(r.continuity.objects[0].grappled, null);
  assert.deepEqual(r.continuity.statuses.tal, []);
  C.validateReport(r);
});
test("R11: Dimension Door moves the chosen passenger to a distinct adjacent destination", () => {
  const e = setup();
  atomic(e, () =>
    cast(e, "dimensionDoor", {
      point: { x: 8, y: 3 },
      passenger: "tal",
      passengerPoint: { x: 8, y: 3 },
    }),
  );
  cast(e, "dimensionDoor", {
    point: { x: 8, y: 3 },
    passenger: "tal",
    passengerPoint: { x: 8, y: 4 },
  });
  assert.equal(e.unit("ena").x, 8);
  assert.equal(e.unit("tal").x, 8);
  assert.equal(e.unit("tal").y, 4);
});
test("R11: object attacks consume real ammunition and apply Bless and critical damage", () => {
  const e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 } });
  turn(e, "tal");
  let u = e.unit("tal");
  const oid = Object.values(e.s.objects)[0].id;
  u.controlled = true;
  u.features = {};
  u.attacks = [
    {
      id: "bow",
      name: "Bow",
      kind: "ranged",
      range: 120,
      bonus: 5,
      count: 1,
      die: 8,
      flat: 0,
      damageType: "piercing",
      ammo: "arrows",
    },
  ];
  u.arrows = 0;
  atomic(
    e,
    () =>
      e.dispatch({
        kind: "attackObject",
        actor: "tal",
        object: oid,
        weapon: "bow",
      }),
    /Боеприпасы/,
  );
  u = e.unit("tal");
  u.arrows = 1;
  M.add(e, { actor: "ena", spell: "bless", level: 1 }, "bless", ["tal"], 60);
  e.s.random.tape = [4, 20, 2, 2];
  e.dispatch({
    kind: "attackObject",
    actor: "tal",
    object: oid,
    weapon: "bow",
  });
  assert.equal(u.arrows, 0);
  assert.equal(e.s.objects[oid].hp, 96);
  assert.ok(
    e.s.events.some((x) => x.type === "magicRollBonus" && x.amount === 4),
  );
});
