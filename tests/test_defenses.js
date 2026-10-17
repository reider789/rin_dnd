"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { createBattle, CombatRulesEngine: E } = require("../sdk");
const { CombatDefenses: D } = require("../core/defenses");
const source = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
function battle(features = {}, resources = {}) {
  const p = structuredClone(source);
  p.profiles.scout.features = { ...features };
  p.characters.tal.resources = { hp: { current: 27, max: 27 }, ...resources };
  const { engine: e } = createBattle(p);
  e.initialize();
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  return e;
}
function shoot(e, target = "ena", rolls = [15, 2]) {
  e.s.random.tape = rolls;
  e.enqueue({
    kind: "attackRoll",
    actor: "hunter_a",
    target,
    spec: e.attackSpec("hunter_a", "claws"),
    mode: "reaction",
  });
  e.run();
}
function decide(e, choice) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice });
}
function reload(e) {
  return new E(JSON.parse(JSON.stringify(e.export())).session);
}
test("auras add the strongest same-kind bonus plus the different guardian bonus", () => {
  const e = battle({ auraProtection: 2, guardianSaveBonus: 1 });
  assert.equal(D.saveBonus(e, "ena"), 3);
  assert.equal(D.saveBonus(e, "tal"), 2);
  e.unit("ena").features.auraProtection = 3;
  assert.equal(D.saveBonus(e, "ena"), 4);
  assert.equal(D.saveBonus(e, "tal"), 3);
  const t = e.saveTask("ena", "CON", 15, {
    kind: "concentrationResult",
    actor: "ena",
  });
  assert.equal(t.bonus, 6);
  Object.assign(e.unit("tal"), { x: 8, y: 7 });
  assert.equal(D.saveBonus(e, "ena"), 3);
});
test("fear and charm are suppressed in an active aura and return outside it", () => {
  const e = battle({
    auraProtection: 2,
    auraCourage: true,
    auraDevotion: true,
  });
  e.status("ena", "frightened");
  e.status("ena", "charmed");
  assert.equal(e.has("ena", "frightened"), false);
  assert.equal(e.has("ena", "charmed"), false);
  e.unit("tal").x = 8;
  assert.equal(e.has("ena", "frightened"), true);
  e.unit("tal").x = 2;
  e.status("tal", "unconscious");
  assert.equal(e.has("ena", "charmed"), true);
  assert.ok(e.unit("ena").statuses.some((z) => z.kind === "charmed"));
});
test("an aura does not reach through total cover or from an incapacitated owner", () => {
  const e = battle({ auraProtection: 2 });
  Object.assign(e.unit("tal"), { x: 4, y: 3 });
  e.s.terrain.walls = ["3,3"];
  assert.equal(D.saveBonus(e, "ena"), 0);
  e.s.terrain.walls = [];
  e.status("tal", "incapacitated");
  assert.equal(D.saveBonus(e, "ena"), 0);
});
test("Protection is offered before any attack die and persists while the protector stays adjacent", () => {
  let e = battle({ protection: true, shieldEquipped: true });
  const draws = e.s.random.draws;
  shoot(e, "ena", [15, 1]);
  assert.equal(e.s.pending.ability, "protection");
  assert.equal(e.s.random.draws, draws);
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("tal").reaction, 0);
  const attack = e.s.events.findLast((x) => x.type === "attack");
  assert.equal(attack.rolls.length, 2);
  assert.equal(attack.hit, false);
  assert.ok(D.protected(e, "ena"));
  e.unit("tal").x = 8;
  D.refresh(e);
  assert.equal(D.protected(e, "ena"), false);
  e.unit("tal").x = 2;
  D.refresh(e);
  assert.equal(D.protected(e, "ena"), false);
});
test("Protection expires at its owner's next start, not the protected ally's", () => {
  const e = battle({ protection: true, shieldEquipped: true });
  shoot(e, "ena", [1, 1]);
  decide(e, "yes");
  D.refresh(e, "ena");
  assert.ok(D.protected(e, "ena"));
  D.refresh(e, "tal");
  assert.equal(D.protected(e, "ena"), false);
});
test("a Shield can stop damage and concentration loss without spending two resources", () => {
  const e = battle(
    { shieldSpell: true, autoShield: true },
    {
      shield_magic_initiate: { current: 1, max: 1 },
      spell_slots: { 1: { current: 2, max: 2 } },
    },
  );
  e.s.zones = [
    {
      id: "z",
      kind: "darkness",
      owner: "tal",
      x: 8,
      y: 7,
      radius: 5,
      until: 600,
      concentration: true,
    },
  ];
  const hp = e.unit("tal").hp;
  shoot(e, "tal", [12]);
  assert.equal(e.unit("tal").hp, hp);
  assert.equal(e.unit("tal").reaction, 0);
  assert.equal(e.unit("tal").counters.shield_magic_initiate.current, 0);
  assert.equal(e.unit("tal").slots[1].current, 2);
  assert.ok(e.has("tal", "shield"));
  assert.equal(e.s.zones.length, 1);
});
test("Shield honors one spent spell slot per turn but a free use remains legal", () => {
  const e = battle(
    { shieldSpell: true },
    {
      shield_magic_initiate: { current: 0, max: 1 },
      spell_slots: { 1: { current: 1, max: 1 }, 2: { current: 1, max: 1 } },
    },
  );
  e.unit("tal").slotTurn = e.s.turnSerial;
  assert.equal(D.canShield(e, "tal"), false);
  e.unit("tal").counters.shield_magic_initiate.current = 1;
  assert.equal(D.canShield(e, "tal"), true);
  D.shield(e, "tal");
  assert.equal(e.unit("tal").slots[1].current, 1);
  assert.equal(e.unit("tal").slots[2].current, 1);
});
test("Shield spends the lowest available slot and a natural 20 cannot be prevented by AC", () => {
  const e = battle(
    { shieldSpell: true, autoShield: true },
    { spell_slots: { 2: { current: 1, max: 1 }, 3: { current: 1, max: 1 } } },
  );
  shoot(e, "tal", [12]);
  assert.equal(e.unit("tal").slots[2].current, 0);
  assert.equal(e.unit("tal").slots[3].current, 1);
  const other = battle(
    { shieldSpell: true, autoShield: true },
    { shield_magic_initiate: { current: 1, max: 1 } },
  );
  shoot(other, "tal", [20, 2, 2]);
  assert.equal(other.unit("tal").counters.shield_magic_initiate.current, 1);
  assert.equal(other.unit("tal").reaction, 1);
});
test("critical negation precedes damage dice and competes for the same reaction", () => {
  let e = battle(
    { critNegation: true },
    { guardian_mark: { current: 3, max: 3 } },
  );
  shoot(e, "ena", [20, 2]);
  assert.equal(e.s.pending.ability, "mark");
  assert.equal(e.s.random.tape.length, 1);
  e = reload(e);
  decide(e, "yes");
  const a = e.s.events.findLast((x) => x.type === "attack");
  assert.equal(a.hit, true);
  assert.equal(a.critical, false);
  assert.equal(e.unit("tal").counters.guardian_mark.current, 2);
  assert.equal(e.unit("tal").reaction, 0);
  assert.equal(e.unit("ena").hp, 34);
});
test("declining critical negation retains both reaction and charge", () => {
  const e = battle(
    { critNegation: true },
    { guardian_mark: { current: 3, max: 3 } },
  );
  shoot(e, "ena", [20, 2, 2]);
  decide(e, "no");
  assert.equal(e.s.events.findLast((x) => x.type === "attack").critical, true);
  assert.equal(e.unit("tal").reaction, 1);
  assert.equal(e.unit("tal").counters.guardian_mark.current, 3);
});
test("cloak AC applies to one attack only and the resolved choice is not replayed", () => {
  let e = battle({ acReaction: 3 }, { cloak_charges: { current: 2, max: 2 } });
  shoot(e, "tal", [12]);
  assert.equal(e.s.pending.ability, "cloak");
  const id = e.s.pending.id;
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("tal").hp, 27);
  assert.equal(e.unit("tal").ac, 14);
  assert.equal(e.unit("tal").counters.cloak_charges.current, 1);
  assert.throws(() => e.dispatch({ kind: "decide", id, choice: "yes" }));
});
test("flat armor reduction is applied before Uncanny Dodge and resistance", () => {
  const e = battle({
    heavyArmor: true,
    heavyArmorReduction: 4,
    uncannyDodge: true,
  });
  e.unit("tal").resistances = ["slashing"];
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target: "tal",
    amount: 15,
    damageType: "slashing",
    attack: { kind: "melee" },
  });
  e.run();
  assert.equal(e.s.pending.damage.amount, 11);
  decide(e, "yes");
  assert.equal(e.unit("tal").hp, 25);
});

test("aura bonus applies to death saves but natural one still causes two failures", () => {
  for (const [roll, success, failures] of [
    [8, 1, undefined],
    [1, undefined, 2],
  ]) {
    const e = battle({ auraProtection: 2 });
    Object.assign(e.unit("ena"), { hp: 0, deathSaves: true });
    e.status("ena", "unconscious");
    e.s.random.tape = [roll];
    e.enqueue({ kind: "startTurn" });
    e.run();
    assert.equal(e.unit("ena").deathSuccesses, success);
    assert.equal(e.unit("ena").deathFailures, failures);
  }
});
