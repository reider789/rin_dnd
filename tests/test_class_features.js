"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  createBattle,
  CombatRulesEngine: E,
  CombatCampaignAdapter: A,
} = require("../sdk");
const source = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
function battle(features = {}, resources = {}) {
  const p = structuredClone(source);
  p.profiles.sentinel.features = { fighterLevel: 10, ...features };
  p.characters.ena.resources = { hp: { current: 10, max: 38 }, ...resources };
  const { engine: e } = createBattle(p);
  e.initialize();
  return e;
}
function decide(e, choice, extra = {}) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice, ...extra });
}
function reload(e) {
  return new E(JSON.parse(JSON.stringify(e.export())).session);
}
test("Second Wind spends exactly once, heals, and grants separate movement without OA", () => {
  let e = battle(
    { secondWind: true, tacticalShift: true },
    { second_wind: { current: 4, max: 4 } },
  );
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.s.random.tape = [7];
  e.dispatch({ kind: "secondWind", actor: "ena" });
  assert.equal(e.unit("ena").hp, 27);
  assert.equal(e.unit("ena").bonus, 0);
  assert.equal(e.unit("ena").counters.second_wind.current, 3);
  assert.equal(e.s.pending.kind, "freeMovement");
  e = reload(e);
  const move = e.unit("ena").move;
  decide(e, "move", {
    path: [
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ],
  });
  assert.equal(e.unit("ena").move, move);
  assert.equal(e.unit("hunter_a").reaction, 1);
  assert.equal(e.unit("ena").x, 0);
  assert.equal(reload(e).unit("ena").counters.second_wind.current, 3);
});
test("invalid granted movement rolls back the choice and all resources", () => {
  const e = battle(
    { secondWind: true, tacticalShift: true },
    { second_wind: { current: 1, max: 1 } },
  );
  e.dispatch({ kind: "secondWind" });
  const before = JSON.stringify(e.s);
  assert.throws(() => decide(e, "move", { path: [{ x: 10, y: 7 }] }));
  assert.equal(JSON.stringify(e.s), before);
  decide(e, "skip");
  assert.equal(e.s.pending, null);
});
for (const [extra, spent] of [
  [8, true],
  [1, false],
])
  test(
    "Tactical Mind spends a use only when it converts failure: " + extra,
    () => {
      let e = battle(
        { tacticalMind: true, secondWind: true, tacticalShift: true },
        { second_wind: { current: 4, max: 4 } },
      );
      e.s.random.tape = [6, extra];
      e.dispatch({ kind: "check", stat: "STR", dc: 15 });
      assert.equal(e.s.pending.kind, "classRoll");
      assert.equal(e.unit("ena").counters.second_wind.current, 4);
      e = reload(e);
      decide(e, "yes");
      assert.equal(e.unit("ena").counters.second_wind.current, spent ? 3 : 4);
      assert.equal(e.unit("ena").hp, 10);
      assert.equal(e.s.pending, null);
      assert.equal(e.unit("ena").bonus, 1);
    },
  );
test("Indomitable adds fighter level to the mandatory new save and survives reload", () => {
  let e = battle(
    { indomitable: true },
    { indomitable: { current: 1, max: 1 } },
  );
  e.s.random.tape = [5, 4];
  e.enqueue(
    e.saveTask("ena", "CON", 15, { kind: "concentrationResult", actor: "ena" }),
  );
  e.run();
  assert.equal(e.s.pending.ability, "indomitable");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("ena").counters.indomitable.current, 0);
  const r = e.s.events.findLast((x) => x.type === "roll");
  assert.equal(r.rolls[0], 4);
  assert.equal(r.bonus, 12);
});
test("declining a class reroll uses the original result once", () => {
  const e = battle(
    { indomitable: true },
    { indomitable: { current: 1, max: 1 } },
  );
  e.s.random.tape = [1];
  e.enqueue(
    e.saveTask("ena", "DEX", 20, { kind: "concentrationResult", actor: "ena" }),
  );
  e.run();
  const id = e.s.pending.id;
  decide(e, "no");
  assert.equal(e.unit("ena").counters.indomitable.current, 1);
  assert.throws(() => e.dispatch({ kind: "decide", id, choice: "no" }));
  assert.equal(e.s.events.filter((x) => x.type === "concentration").length, 1);
});
test("Surge gives an independent non-Magic action and cannot be used twice this turn", () => {
  const e = battle(
    { actionSurge: true },
    { action_surge: { current: 2, max: 2 } },
  );
  e.dispatch({ kind: "actionSurge" });
  assert.equal(e.unit("ena").action, 1);
  assert.equal(e.unit("ena").surgeAction, 1);
  assert.throws(() => e.dispatch({ kind: "actionSurge" }));
  e.dispatch({ kind: "dash" });
  assert.equal(e.unit("ena").action, 1);
  assert.equal(e.unit("ena").surgeAction, 0);
  e.unit("ena").action = 0;
  e.unit("ena").surgeAction = 1;
  assert.throws(() => e.spendAction("ena", true));
  assert.equal(e.unit("ena").surgeAction, 1);
});
test("Surge and Extra Attack produce two complete Attack actions", () => {
  const e = battle(
    { actionSurge: true },
    { action_surge: { current: 1, max: 1 } },
  );
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3, hp: 200, max: 200 });
  e.dispatch({ kind: "actionSurge" });
  e.s.random.tape = [1, 1, 1, 1];
  for (let n = 0; n < 4; n++)
    e.dispatch({
      kind: "attack",
      actor: "ena",
      target: "hunter_a",
      weapon: "sword",
    });
  assert.equal(e.unit("ena").action, 0);
  assert.equal(e.unit("ena").surgeAction, 0);
  assert.equal(e.unit("ena").attacksLeft, 0);
  assert.throws(() =>
    e.dispatch({
      kind: "attack",
      actor: "ena",
      target: "hunter_a",
      weapon: "sword",
    }),
  );
});
test("Steady Aim keeps speed zero after the attack and cannot be chosen after movement", () => {
  const e = battle(
    { steadyAim: true, actionSurge: true },
    { action_surge: { current: 1, max: 1 } },
  );
  e.dispatch({ kind: "actionSurge" });
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.dispatch({ kind: "steadyAim" });
  e.s.random.tape = [1, 1];
  e.dispatch({ kind: "attack", target: "hunter_a", weapon: "sword" });
  assert.equal(e.speed("ena"), 0);
  e.dispatch({ kind: "dash" });
  assert.equal(e.unit("ena").move, 0);
  const other = battle({ steadyAim: true });
  other.dispatch({ kind: "move", path: [{ x: 1, y: 3 }] });
  assert.throws(() => other.dispatch({ kind: "steadyAim" }));
});
test("Uncanny Dodge is optional, requires sight, halves damage and consumes one reaction", () => {
  let e = battle({ uncannyDodge: true });
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "ena",
    amount: 7,
    damageType: "piercing",
    attack: { kind: "melee" },
  });
  e.run();
  assert.equal(e.s.pending.kind, "uncannyDodge");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("ena").hp, 7);
  assert.equal(e.unit("ena").reaction, 0);
  const hidden = battle({ uncannyDodge: true });
  hidden.status("hunter_a", "invisible");
  hidden.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "ena",
    amount: 4,
    damageType: "fire",
    attack: { kind: "rangedSpell" },
  });
  hidden.run();
  assert.equal(hidden.s.pending, null);
  assert.equal(hidden.unit("ena").hp, 6);
  assert.equal(hidden.unit("ena").reaction, 1);
});
test("Evasion only modifies eligible Dexterity half-damage effects", () => {
  for (const [stat, success, incap, expected] of [
    ["DEX", true, false, 0],
    ["DEX", false, false, 4],
    ["CON", false, false, 9],
    ["DEX", false, true, 9],
  ]) {
    const e = battle({ evasion: true });
    if (incap) e.status("ena", "incapacitated");
    e.enqueue({
      kind: "saveDamage",
      actor: "hunter_a",
      target: "ena",
      stat,
      halfOnSuccess: true,
      amount: 9,
      damageType: "fire",
      result: { success },
    });
    e.run();
    assert.equal(e.unit("ena").hp, 10 - expected);
  }
});
test("Reliable Talent changes proficient checks but not unrelated checks", () => {
  const p = structuredClone(source);
  p.profiles.sentinel.features = { reliableTalent: true };
  p.profiles.sentinel.skillProficiencies = { athletics: ["STR", 1] };
  for (const [skill, expected] of [
    ["athletics", 14],
    [undefined, 3],
  ]) {
    const { engine: e } = createBattle(p);
    e.initialize();
    e.s.random.tape = [1];
    e.dispatch({ kind: "check", stat: "STR", skill, dc: 12 });
    const r = e.s.events.findLast((x) => x.type === "roll");
    assert.equal(r.total, expected);
    assert.equal(r.rolls[0], 1);
  }
});
test("counter bounds and unknown counters are rejected when loading a session", () => {
  const e = battle(
    { secondWind: true },
    { second_wind: { current: 4, max: 4 } },
  );
  e.unit("ena").counters.second_wind.current = 5;
  assert.throws(() => reload(e));
  e.unit("ena").counters = { spellAnything: { current: 1, max: 1 } };
  assert.throws(() => reload(e));
});

test("Indomitable can reroll a failed death save and its bonus changes success", () => {
  let e = battle(
    { indomitable: true },
    { indomitable: { current: 1, max: 1 } },
  );
  Object.assign(e.unit("ena"), { hp: 0, deathSaves: true });
  e.status("ena", "unconscious");
  e.s.random.tape = [2, 2];
  e.enqueue({ kind: "startTurn" });
  e.run();
  assert.equal(e.s.pending.ability, "indomitable");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("ena").deathSuccesses, 1);
  assert.equal(e.unit("ena").deathFailures, undefined);
});

test("costed features require explicit current counters rather than restoring defaults", () => {
  for (const feature of [
    "secondWind",
    "actionSurge",
    "indomitable",
    "knowEnemy",
    "layOnHands",
    "acReaction",
    "critNegation",
  ])
    assert.throws(() =>
      battle({ [feature]: feature === "acReaction" ? 3 : true }),
    );
});
test("Know Enemy spends its own use; restoring it spends exactly one superiority die", () => {
  const e = battle(
    { knowEnemy: true },
    { know_enemy: { current: 1, max: 1 }, superiority: { current: 2, max: 2 } },
  );
  Object.assign(e.unit("hunter_a"), {
    x: 3,
    y: 3,
    resistances: ["fire"],
    immunities: ["poison"],
    vulnerabilities: ["cold"],
  });
  e.dispatch({ kind: "knowEnemy", target: "hunter_a" });
  assert.equal(e.unit("ena").counters.know_enemy.current, 0);
  assert.deepEqual(
    e.s.events.findLast((x) => x.type === "enemyAnalyzed").resistances,
    ["fire"],
  );
  assert.equal(e.unit("ena").counters.superiority.current, 2);
  e.dispatch({ kind: "restoreKnowEnemy" });
  assert.equal(e.unit("ena").counters.superiority.current, 1);
  assert.equal(e.unit("ena").counters.know_enemy.current, 1);
  assert.throws(() => e.dispatch({ kind: "restoreKnowEnemy" }));
  assert.throws(() => e.dispatch({ kind: "knowEnemy", target: "hunter_a" }));
});
test("runtime counters normalize canonical annotations without dropping source metadata", () => {
  const r = {
    second_wind: { current: 2, max: 4, note: "already spent" },
    spell_slots: { 1: { current: 2, max: 4, note: "canonical annotation" } },
  };
  const u = A.unit("another-hero", source.profiles.sentinel, {}, r);
  assert.deepEqual(u.counters.second_wind, { current: 2, max: 4 });
  assert.deepEqual(u.slots, { 1: { current: 2, max: 4 } });
  assert.equal(r.spell_slots["1"].note, "canonical annotation");
});
