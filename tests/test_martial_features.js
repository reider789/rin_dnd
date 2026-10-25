"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { createBattle, CombatRulesEngine: E } = require("../sdk"),
  { CombatDefenses: D } = require("../core/defenses");
const source = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
function battle(features = {}) {
  const p = structuredClone(source);
  p.profiles.sentinel.scores.STR = 20;
  p.profiles.sentinel.proficiency = 4;
  p.profiles.sentinel.features = { ...features };
  Object.assign(p.profiles.sentinel.attacks[0], {
    ability: "STR",
    bonus: 12,
    flat: 6,
    count: 2,
    die: 6,
    heavy: true,
    twoHanded: true,
    mastery: "graze",
  });
  p.characters.ena.resources = {
    hp: { current: 38, max: 38 },
    superiority: { current: 5, max: 5 },
  };
  const { engine: e } = createBattle(p);
  e.initialize();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3, hp: 200, max: 200, ac: 16 });
  return e;
}
function attack(e, tape, extra = {}) {
  e.s.random.tape = tape;
  e.dispatch({
    kind: "attack",
    actor: "ena",
    target: "hunter_a",
    weapon: "sword",
    ...extra,
  });
}
function decide(e, choice, extra = {}) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice, ...extra });
}
function reload(e) {
  return new E(JSON.parse(JSON.stringify(e.export())).session);
}
const master = {
  maneuvers: [
    "precision",
    "trip",
    "push",
    "goad",
    "maneuvering",
    "riposte",
    "bait",
  ],
  superiorityDie: 10,
  maneuverDC: 17,
};
test("Precision can turn a miss into a hit and excludes a second maneuver", () => {
  let e = battle(master);
  attack(e, [3, 2, 1, 2]);
  assert.equal(e.s.pending.kind, "precision");
  assert.equal(e.s.events.filter((x) => x.type === "attack").length, 0);
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("ena").counters.superiority.current, 4);
  assert.equal(e.s.events.findLast((x) => x.type === "attack").hit, true);
  assert.equal(e.unit("hunter_a").hp, 191);
});
test("declining Precision gives only Graze's ability modifier on the miss", () => {
  const e = battle({
    ...master,
    masteries: ["graze"],
    greatWeaponMaster: 4,
    savageAttacker: true,
  });
  attack(e, [3]);
  decide(e, "no");
  assert.equal(e.unit("hunter_a").hp, 195);
  assert.equal(e.unit("ena").counters.superiority.current, 5);
  assert.equal(e.s.pending, null);
});
test("GWF treats low damage dice as three and GWM adds PB only to the Attack action", () => {
  const e = battle({ greatWeaponFighting: true, greatWeaponMaster: 4 });
  attack(e, [15, 1, 2]);
  assert.equal(e.unit("hunter_a").hp, 184);
});
test("on-hit maneuver choice is before damage dice and invalid choices are atomic", () => {
  let e = battle(master);
  attack(e, [15, 1, 2, 3, 1]);
  assert.equal(e.s.pending.kind, "strikeChoice");
  assert.equal(e.s.random.tape.length, 4);
  const before = JSON.stringify(e.s);
  assert.throws(() => decide(e, "use", { maneuver: "timeTravel" }));
  assert.equal(JSON.stringify(e.s), before);
  e = reload(e);
  decide(e, "use", { maneuver: "trip" });
  assert.equal(e.unit("hunter_a").hp, 188);
  assert.ok(e.has("hunter_a", "prone"));
  assert.equal(e.unit("ena").counters.superiority.current, 4);
});
test("critical hits double the selected superiority damage die", () => {
  const e = battle(master);
  attack(e, [20, 1, 2, 3, 4, 5, 6, 1]);
  decide(e, "use", { maneuver: "trip" });
  assert.equal(e.unit("hunter_a").hp, 173);
  assert.ok(
    e.s.events.some(
      (x) => x.type === "roll" && x.sides === 10 && x.rolls.length === 2,
    ),
  );
});
test("Savage Attacker compares two weapon rolls and is used once per turn", () => {
  const e = battle({ savageAttacker: true });
  attack(e, [15, 1, 1, 5, 5]);
  assert.equal(e.s.pending.kind, "strikeChoice");
  decide(e, "use", { savage: true });
  assert.equal(e.unit("hunter_a").hp, 184);
  attack(e, [15, 2, 2]);
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("hunter_a").hp, 174);
});
test("Hew uses the bonus action without adding GWM's Attack-action bonus", () => {
  const e = battle({ greatWeaponMaster: 4 });
  attack(e, [20, 1, 1, 1, 1]);
  assert.equal(e.unit("hunter_a").hp, 186);
  assert.equal(e.unit("ena").hewTurn, e.s.turnSerial);
  attack(e, [15, 1, 1], { mode: "hew" });
  assert.equal(e.unit("hunter_a").hp, 178);
  assert.equal(e.unit("ena").bonus, 0);
});
test("Tactical Master replaces rather than combines the original mastery", () => {
  const e = battle({ masteries: ["graze"], tacticalMaster: true });
  attack(e, [15, 1, 1], { mastery: "sap" });
  assert.ok(e.has("hunter_a", "sap"));
  assert.equal(e.unit("hunter_a").hp, 192);
  assert.throws(() => attack(e, [15], { mastery: "vex" }));
});
test("Sap is consumed by the target's next attack roll, including a miss", () => {
  const e = battle({ masteries: ["sap"] });
  e.unit("ena").attacks[0].mastery = "sap";
  attack(e, [15, 1, 1]);
  assert.ok(e.has("hunter_a", "sap"));
  e.s.random.tape = [15, 1];
  e.enqueue({
    kind: "attackRoll",
    actor: "hunter_a",
    target: "ena",
    spec: e.attackSpec("hunter_a", "claws"),
    mode: "reaction",
  });
  e.run();
  const a = e.s.events.findLast((x) => x.type === "attack");
  assert.equal(a.rolls.length, 2);
  assert.equal(a.hit, false);
  assert.equal(e.has("hunter_a", "sap"), false);
});
test("Slow adjusts remaining movement and multiple sources do not stack", () => {
  const e = battle({ masteries: ["slow"] });
  e.unit("ena").attacks[0].mastery = "slow";
  Object.assign(e.unit("hunter_a"), { move: 50, dashCount: 1 });
  attack(e, [15, 1, 1]);
  assert.equal(e.speed("hunter_a"), 20);
  assert.equal(e.unit("hunter_a").move, 30);
  const before = e.speed("hunter_a");
  e.status("hunter_a", "slow", {
    source: "tal",
    expiresOnSourceStart: "tal",
    stackBySource: true,
  });
  e.adjustMovementForSpeed("hunter_a", before);
  assert.equal(e.unit("hunter_a").move, 30);
  D.refresh(e, "ena");
  assert.equal(e.speed("hunter_a"), 20);
  D.refresh(e, "tal");
  assert.equal(e.speed("hunter_a"), 30);
  assert.equal(e.unit("hunter_a").move, 50);
});
test("Push is forced movement, works at speed zero, and never provokes opportunity attacks", () => {
  const e = battle({ masteries: ["push"] });
  e.unit("ena").attacks[0].mastery = "push";
  e.status("hunter_a", "grappled", { source: "ena", dc: 10 });
  const reaction = e.unit("ena").reaction;
  attack(e, [15, 1, 1]);
  assert.equal(e.unit("hunter_a").x, 5);
  assert.equal(e.unit("ena").reaction, reaction);
  assert.equal(e.has("hunter_a", "grappled"), false);
});
test("Goad lasts until the end of the source's next turn", () => {
  const e = battle(master);
  attack(e, [15, 1, 1, 2, 1]);
  decide(e, "use", { maneuver: "goad" });
  assert.ok(e.has("hunter_a", "goaded"));
  assert.equal(
    e.attackModifiers("hunter_a", "tal", e.attackSpec("hunter_a", "claws"))
      .disadv,
    true,
  );
  assert.equal(
    e.attackModifiers("hunter_a", "ena", e.attackSpec("hunter_a", "claws"))
      .disadv,
    false,
  );
  e.enqueue({ kind: "endTurn", actor: "ena" });
  e.run();
  assert.ok(e.has("hunter_a", "goaded"));
  e.s.index = e.s.order.indexOf("ena");
  e.enqueue({ kind: "startTurn" });
  e.run();
  e.enqueue({ kind: "endTurn", actor: "ena" });
  e.run();
  assert.equal(e.has("hunter_a", "goaded"), false);
});
test("Bait swaps places using five feet and grants chosen AC until the source's next start", () => {
  const e = battle(master),
    action = e.unit("ena").action;
  e.s.random.tape = [7];
  e.dispatch({ kind: "bait", target: "tal", recipient: "tal" });
  assert.equal(e.unit("ena").y, 4);
  assert.equal(e.unit("tal").y, 3);
  assert.equal(e.unit("ena").move, 25);
  assert.equal(e.unit("ena").action, action);
  assert.equal(e.ac("tal"), 21);
  assert.equal(e.unit("ena").counters.superiority.current, 4);
  D.refresh(e, "ena");
  assert.equal(e.ac("tal"), 14);
});
test("Riposte uses the same attack pipeline, spends one reaction and one die", () => {
  const e = battle(master);
  e.s.random.tape = [1, 15, 1, 1, 2];
  e.enqueue({
    kind: "attackRoll",
    actor: "hunter_a",
    target: "ena",
    spec: e.attackSpec("hunter_a", "claws"),
    mode: "reaction",
  });
  e.run();
  assert.equal(e.s.pending.kind, "riposte");
  decide(e, "yes");
  assert.equal(e.unit("ena").reaction, 0);
  assert.equal(e.unit("ena").counters.superiority.current, 4);
  assert.equal(e.unit("hunter_a").hp, 190);
});
test("Maneuvering spends the ally's reaction and exempts only the hit enemy from OA", () => {
  let e = battle(master);
  Object.assign(e.unit("hunter_b"), { x: 2, y: 5 });
  attack(e, [15, 1, 1, 2]);
  decide(e, "use", { maneuver: "maneuvering", ally: "tal" });
  assert.equal(e.s.pending.kind, "freeMovement");
  assert.equal(e.s.pending.actor, "tal");
  const move = e.unit("tal").move;
  e = reload(e);
  e.s.random.tape = [1];
  decide(e, "move", {
    path: [
      { x: 1, y: 4 },
      { x: 0, y: 4 },
    ],
  });
  assert.equal(e.unit("tal").reaction, 0);
  assert.equal(e.unit("hunter_a").reaction, 1);
  assert.equal(e.unit("hunter_b").reaction, 0);
  assert.equal(e.unit("tal").move, move);
});

test("Slow expiry and Dash preserve distance already spent beyond the reduced budget", () => {
  const e = battle();
  e.unit("ena").move = 5;
  e.status("ena", "slow", {
    source: "hunter_a",
    expiresOnSourceStart: "hunter_a",
  });
  assert.equal(e.unit("ena").move, 0);
  const resumed = reload(e);
  D.refresh(resumed, "hunter_a");
  assert.equal(resumed.unit("ena").move, 5);
  e.dispatch({ kind: "dash" });
  assert.equal(e.unit("ena").move, 15);
  D.refresh(e, "hunter_a");
  assert.equal(e.unit("ena").move, 35);
});

test("an automatic fighter selects Trip and Savage Attacker through the common damage pipeline", () => {
  const e = battle({ ...master, savageAttacker: true });
  e.unit("ena").controlled = false;
  attack(e, [15, 1, 1, 5, 5, 3, 1]);
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("hunter_a").hp, 181);
  assert.equal(e.unit("ena").counters.superiority.current, 4);
  assert.ok(e.has("hunter_a", "prone"));
  assert.equal(e.unit("ena").savageTurn, e.s.turnSerial);
});

test("Radiant Strikes add one independently typed d8 per melee hit and double it on crit", () => {
  const e = battle({ radiantStrikes: true });
  attack(e, [15, 1, 2, 3]);
  assert.equal(e.unit("hunter_a").hp, 188); // 1+2+6 sword and 3 radiant
  const hit = e.s.events.filter(x => x.type === "damage").findLast(x => x.target === "hunter_a");
  assert.ok(hit, "damage event exists");
  assert.ok(e.s.events.some(x => x.type === "roll" && x.text.includes("Сияющие удары")));
  const crit = battle({ radiantStrikes: true });
  attack(crit, [20, 1, 2, 3, 4, 5, 6]);
  assert.equal(crit.unit("hunter_a").hp, 173); // 4d6 1+2+3+4 + 6 and 2d8 5+6
  const radiantRoll = crit.s.events.find(x => x.type === "roll" && x.text.includes("Сияющие удары"));
  assert.equal(radiantRoll.rolls.length, 2);
});
test("Radiant Strikes do not trigger for Graze misses or for ranged-weapon attacks", () => {
  const missed = battle({ radiantStrikes: true, masteries: ["graze"] });
  attack(missed, [1]);
  assert.equal(missed.unit("hunter_a").hp, 195); // 5 graze, no radiant
  assert.equal(missed.s.events.some(x => x.type === "roll" && x.text.includes("Сияющие удары")), false);
  const shot = battle({ radiantStrikes: true });
  Object.assign(shot.unit("ena").attacks[0], {kind: "ranged",range: 120,normalRange: 60});
  shot.unit("hunter_a").x = shot.unit("ena").x + 4;
  shot.unit("hunter_a").y = shot.unit("ena").y;
  attack(shot, [15, 1, 2, 3]);
  assert.equal(shot.s.events.some(x => x.type === "roll" && x.text.includes("Сияющие удары")), false);
});
test("Radiant Strikes work for thrown melee-category weapons even with ranged attack kind", () => {
  const thrown = battle({ radiantStrikes: true });
  Object.assign(thrown.unit("ena").attacks[0], {
    kind: "ranged",meleeWeapon: true,range: 120,normalRange: 60,
  });
  thrown.unit("hunter_a").x = thrown.unit("ena").x + 4;
  thrown.unit("hunter_a").y = thrown.unit("ena").y;
  attack(thrown, [15, 1, 2, 3]);
  assert.ok(thrown.s.events.some(x => x.type === "roll" && x.text.includes("Сияющие удары")));
  assert.equal(thrown.unit("hunter_a").hp, 188);
});
test("Radiant Strikes resistance applies only to radiant component", () => {
  const e = battle({ radiantStrikes: true });
  e.unit("hunter_a").resistances = ["radiant"];
  attack(e,[15,1,2,4]);
  assert.equal(e.unit("hunter_a").hp, 189); // 9 physical + 2 radiant
});
