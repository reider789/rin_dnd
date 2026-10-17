"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  createBattle,
  CombatContentPack: P,
  CombatRulesEngine: E,
  CombatCampaignAdapter: A,
  CombatTacticalAI: AI,
  CombatCapabilities: C,
} = require("../sdk");
const source = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
const copy = () => structuredClone(source);
function effectBattle(extra = {}) {
  const { engine: e } = createBattle(source);
  e.initialize();
  e.s.index = e.s.order.indexOf("hunter_a");
  e.enqueue({ kind: "startTurn" });
  e.run();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  Object.assign(e.unit("ena"), extra);
  return e;
}
function hit(e, tape = [15, 2, 1]) {
  e.s.random.tape = tape;
  e.dispatch({
    kind: "attack",
    actor: "hunter_a",
    target: "ena",
    weapon: "claws",
  });
}
test("a separate party and profiled monster compile without character-specific branches", () => {
  const { engine: e } = createBattle(source);
  assert.deepEqual(Object.keys(e.s.units), [
    "ena",
    "tal",
    "hunter_a",
    "hunter_b",
  ]);
  assert.equal(e.unit("ena").features.extraAttack, 2);
  assert.equal(e.unit("tal").features.sneakDice, 2);
  assert.equal(e.unit("hunter_a").attacks[0].effects[0].condition, "poisoned");
  assert.equal(e.s.meta.resultKind, "dnd-combat-result");
  assert.equal(e.s.engineVersion, C.ENGINE);
});
test("content compilation is pure and returns independent actor data", () => {
  const input = copy(),
    before = JSON.stringify(input);
  const { engine: e } = createBattle(input);
  e.unit("hunter_a").attacks[0].effects[0].save.dc = 30;
  assert.equal(e.unit("hunter_b").attacks[0].effects[0].save.dc, 12);
  assert.equal(JSON.stringify(input), before);
});
for (const [name, mutate] of [
  [
    "unknown handler",
    (p) => (p.abilities["venom-claws"].handler = "castAnySpell"),
  ],
  [
    "unknown feature",
    (p) => (p.profiles.sentinel.features = { timeTravel: true }),
  ],
  [
    "wrong parameter",
    (p) => (p.abilities["trained-fighter"].features.extraAttack = "two"),
  ],
  [
    "unsupported spell list",
    (p) => (p.profiles.sentinel.spells = ["fireball"]),
  ],
  [
    "unknown ability reference",
    (p) => p.profiles.sentinel.abilities.push("unknown"),
  ],
  [
    "unknown enemy profile",
    (p) => (p.encounters["marsh-road"].enemies[0].profile = "unknown"),
  ],
  [
    "conflicting abilities",
    (p) => (p.profiles.sentinel.features = { extraAttack: 4 }),
  ],
  ["bad effect DC", (p) => (p.abilities["venom-claws"].save.dc = 99)],
  [
    "unhandled duration",
    (p) => (p.abilities["venom-claws"].duration = "until-source-next-turn"),
  ],
  ["wrong API", (p) => (p.api = 99)],
  ["wrong rules", (p) => (p.rules_version = "2014")],
  [
    "unknown resource",
    (p) =>
      (p.characters.ena.resources = {
        hp: { current: 38, max: 38 },
        spell_slots: { current: 2, max: 2 },
      }),
  ],
  ["wrong schema", (p) => (p.version = 2)],
])
  test("unsupported content fails before play: " + name, () => {
    const p = copy();
    mutate(p);
    assert.throws(() => createBattle(p));
  });
test("failed save applies a data-defined hit condition after damage and it expires", () => {
  const e = effectBattle();
  hit(e);
  assert.ok(e.has("ena", "poisoned"));
  const damage = e.s.events.findIndex((x) => x.type === "damage"),
    applied = e.s.events.findIndex((x) => x.type === "attackCondition");
  assert.ok(damage >= 0 && applied > damage);
  const restored = new E(JSON.parse(JSON.stringify(e.export())).session);
  restored.s.index = restored.s.order.indexOf("ena");
  restored.enqueue({ kind: "startTurn" });
  restored.run();
  assert.equal(restored.has("ena", "poisoned"), false);
});
test("successful save, miss and condition immunity suppress the data effect", () => {
  for (const setup of ["save", "miss", "immune"]) {
    const e = effectBattle(
      setup === "immune" ? { conditionImmunities: ["poisoned"] } : {},
    );
    hit(e, setup === "miss" ? [1] : setup === "save" ? [15, 2, 20] : [15, 2]);
    assert.equal(e.has("ena", "poisoned"), false, setup);
    if (setup === "immune")
      assert.ok(e.s.events.some((x) => x.type === "conditionImmune"));
  }
});
test("a content-defined save can pause for Inspiration and resume from JSON once", () => {
  const e = effectBattle({ heroic: 1 });
  e.unit("ena").policies.heroic = true;
  hit(e);
  assert.equal(e.s.pending.kind, "roll");
  assert.equal(e.has("ena", "poisoned"), false);
  const saved = JSON.stringify(e.export()),
    restored = new E(JSON.parse(saved).session);
  const c = { kind: "decide", id: e.s.pending.id, choice: "accept" };
  e.dispatch(c);
  restored.dispatch(c);
  assert.deepEqual(restored.s, e.s);
  assert.ok(restored.has("ena", "poisoned"));
  assert.throws(() => restored.dispatch(c));
});
test("tampered saved effects cannot bypass the registered handlers", () => {
  const { engine: e } = createBattle(source);
  e.unit("hunter_a").attacks[0].effects[0].handler = "eval";
  assert.throws(() => new E(e.s));
});
for (const seed of [3, 19, 87])
  test("independent campaign completes and reloads, seed " + seed, () => {
    let { engine: e } = createBattle(source, undefined, seed);
    e.initialize();
    for (
      let n = 0;
      e.s.phase !== "ended" || e.s.queue.length || e.s.pending;
      n++
    ) {
      assert.ok(n < 1000, "portable battle did not converge");
      if (e.s.pending) {
        const p = e.s.pending;
        assert.equal(p.kind, "knockout");
        e.dispatch({ kind: "decide", id: p.id, choice: "spare" });
      } else if (e.s.queue.length) e.run();
      else e.dispatch(new AI(e).choose(e.actorId));
      if (n % 7 === 0)
        e = new E(JSON.parse(JSON.stringify(e.export())).session);
    }
    assert.equal(A.outcome(e.s).campaign_id, source.id);
    assert.equal(A.outcome(e.s).kind, "dnd-combat-result");
  });
