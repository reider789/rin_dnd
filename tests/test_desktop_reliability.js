"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { createBattle, CombatRulesEngine: E } = require("../sdk");
const { CombatBattlefield } = require("../core/battlefield");
const source = require("../examples/portable/class-defense-lab.json");
function battle() { const { engine } = createBattle(source); engine.initialize(); return engine; }
test("corrupt or newer sessions fail before replacing a playable battle", () => {
  const e = battle(), original = e.export().session;
  const corruptions = [
    s => s.engineVersion = "999.0.0",
    s => s.pending = { id: "unknown", actor: "ena", kind: "unknown" },
    s => s.pending = { id: "broken", actor: "ena", kind: "roll" },
    s => s.queue.push({ kind: "unknown", actor: "ena" }),
    s => s.units.ena.statuses.push({ kind: "unknown" }),
    s => s.units.ena.ac = "oops",
    s => s.queue.push({ kind: "roll", actor: "ena", count: 1, sides: 20, next: { kind: "unknown" } }),
  ];
  for (const change of corruptions) {
    const value = structuredClone(original); change(value);
    assert.throws(() => new E(value));
    assert.deepEqual(e.s, original);
  }
  const older = structuredClone(original); older.engineVersion = "30.3.0";
  assert.doesNotThrow(() => new E(older));
});
test("hidden target requires an explicit guessed cell; stale identity cannot track it", () => {
  const e = battle();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3, hidden: true });
  e.status("hunter_a", "invisible"); e.s.terrain.cover["3,3"] = 5;
  const before = e.export().session;
  assert.throws(() => e.dispatch({ kind: "attack", actor: "ena", target: "hunter_a", weapon: e.unit("ena").attacks[0].id }), /Позиция/);
  assert.deepEqual(e.s, before);
  assert.doesNotThrow(() => e.dispatch({ kind: "attackAt", actor: "ena", point: { x: 3, y: 3 }, weapon: e.unit("ena").attacks[0].id }));
});
test("failed command restores mutable state, random tape, queue and appended events", () => {
  const e = battle();
  e.s.events.push(...Array.from({ length: 15000 }, (_, i) => Object.freeze({ seq: i, text: "история" })));
  const events = e.s.events, prior = events[0], before = e.export().session;
  const command = e.command;
  e.command = function(c, u) { u.hp--; this.roll(20); this.emit("test", c.actor, "не сохранять"); this.enqueue({ kind: "endTurn", actor: c.actor }); throw Error("fail"); };
  assert.throws(() => e.dispatch({ kind: "test" }), /fail/);
  assert.deepEqual(e.s, before);
  assert.equal(e.s.events, events); assert.equal(events[0], prior);
  e.command = command;
  const external = e.export(); external.session.events[0].text = "изменено";
  assert.equal(events[0].text, prior.text);
});
test("action availability uses actual costs and never consumes state", () => {
  const e = battle(), before = e.export().session;
  assert.equal(e.availableAction({ kind: "secondWind" }).enabled, true);
  assert.deepEqual(e.s, before);
  for (const kind of ["attack", "move", "endTurn", "policy", "dash", "disengage", "dodge", "hide", "search", "stand", "grapple", "shove", "helpAttack", "stabilize", "bait", "layOnHands", "actionSurge", "knowEnemy"]) {
    e.availableAction({ kind, target: "tal", recipient: "tal", policy: "sneak", path: [{x:1,y:3}], amount: 1, weapon: e.unit("ena").attacks[0].id });
    assert.deepEqual(e.s, before, kind + " mutated the real battle");
  }
  e.unit("ena").bonus = 0;
  assert.equal(e.availableAction({ kind: "secondWind" }).enabled, false);
});
test("route preview and execution agree for prone movement and allied transit", () => {
  const e = battle(), id = "ena", u = e.unit(id);
  e.s.terrain.walls = []; e.s.terrain.rubble = [];
  e.status(id, "prone");
  Object.assign(e.unit("tal"), { x: u.x + 1, y: u.y });
  const field = new CombatBattlefield({ walls: new Set(), rubble: new Set(), key: (x,y) => x+","+y,
    actor: () => u, webDifficult: () => false, width: 11, height: 8,
    occupant: (x,y) => { const k = e.occupied(x,y,id); return k && !e.canPass(id,k) ? k : null; },
    canStop: p => !e.occupied(p.x,p.y,id), stepCost: p => e.stepCost(id,p) });
  assert.equal(field.findPath({ x: u.x + 1, y: u.y }), null);
  const path = field.findPath({ x: u.x + 3, y: u.y });
  assert.equal(field.pathCost(path), 30);
  assert.equal(e.validatePath(id,path,30),30);
  assert.throws(() => e.validatePath(id,field.findPath({ x: u.x + 4, y: u.y }),30));
});
