"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const { CombatRulesEngine: E } = require("../core/rules_engine"),
  { CombatCampaignAdapter: A } = require("../core/campaign_adapter"),
  { CombatTacticalAI: AI } = require("../core/tactical_ai");
const runtime = JSON.parse(
  fs.readFileSync(__dirname + "/../config/rin_runtime.json"),
);
function battle(extra = {}) {
  const r = structuredClone(runtime);
  r.characters.rin.resources.unusual_metabolism.current = 0;
  r.characters.rin.resources.focus.current = 3;
  const scene = {
    name: "Проверка правил",
    battle_id: "rules-test",
    kind: "training",
    walls: [],
    rubble: [],
    heroes: { rin: { cell: "B4", initiative: 20 } },
    enemies: [
      {
        name: "Боец",
        cell: "C4",
        hp: 100,
        ac: 12,
        initiative: 10,
        attack: { bonus: 3, count: 1, die: 6, flat: 1, range: 5 },
        tactics: { canFlee: false },
      },
      {
        name: "Лучник",
        cell: "J4",
        hp: 100,
        ac: 12,
        initiative: 5,
        attack: { bonus: 3, count: 1, die: 6, flat: 1, range: 80 },
        tactics: { canFlee: false },
      },
    ],
    ...extra,
  };
  const e = new E(A.create(r, scene, 1234));
  e.initialize();
  e.unit("rin").policies.sneak = false;
  return e;
}
function decide(e, choice, more = {}) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice, ...more });
}
function damage(e, amount, more = {}) {
  e.enqueue({
    kind: "damage",
    actor: "enemy_1",
    target: "rin",
    amount,
    damageType: "piercing",
    attack: { kind: "melee" },
    ...more,
  });
  e.run();
}
function zone(e) {
  e.s.zones = [
    {
      id: "dark",
      owner: "rin",
      kind: "darkness",
      x: 2,
      y: 3,
      radius: 15,
      until: 600,
      concentration: true,
    },
  ];
}
function strike(e, key = "shortsword", more = {}) {
  e.dispatch({
    kind: "attack",
    actor: "rin",
    target: "enemy_1",
    weapon: key,
    ...more,
  });
}

test("declining Deflect applies damage exactly once and retains reaction", () => {
  const e = battle();
  damage(e, 8);
  const id = e.s.pending.id;
  decide(e, "no");
  assert.equal(e.unit("rin").hp, 23);
  assert.equal(e.unit("rin").reaction, 1);
  assert.equal(e.s.pending, null);
  assert.throws(() => e.dispatch({ kind: "decide", id, choice: "no" }));
  assert.equal(e.unit("rin").hp, 23);
});
test("Deflect spends one reaction; melee redirect targets only within 5 feet", () => {
  const e = battle();
  e.s.random.tape = [10];
  damage(e, 8);
  decide(e, "yes");
  assert.equal(e.unit("rin").reaction, 0);
  assert.equal(e.unit("rin").hp, 31);
  assert.equal(e.s.pending.kind, "redirect");
  assert.deepEqual(e.s.pending.targets, ["enemy_1"]);
  assert.equal(e.s.pending.range, 5);
  decide(e, "skip");
  assert.equal(e.unit("rin").focus, 3);
});
test("ranged redirect permits a visible distant target and spends focus once", () => {
  const e = battle();
  e.s.random.tape = [10];
  damage(e, 8, { attack: { kind: "ranged" } });
  decide(e, "yes");
  assert.ok(e.s.pending.targets.includes("enemy_2"));
  e.s.random.tape = [3, 4, 1];
  decide(e, "redirect", { target: "enemy_2" });
  assert.equal(e.unit("rin").focus, 2);
  assert.equal(e.unit("enemy_2").hp, 90);
  assert.equal(e.s.pending, null);
});
test("zero residual damage does not roll concentration", () => {
  const e = battle();
  zone(e);
  e.s.random.tape = [10];
  damage(e, 5);
  decide(e, "yes");
  if (e.s.pending) decide(e, "skip");
  assert.equal(e.s.zones.length, 1);
  assert.equal(e.s.random.draws, 1);
});
test("damage absorbed by temporary HP still checks concentration", () => {
  const e = battle();
  zone(e);
  e.unit("rin").reaction = 0;
  e.unit("rin").temp = 15;
  e.s.random.tape = [1];
  damage(e, 15);
  assert.equal(e.unit("rin").hp, 31);
  assert.equal(e.s.zones.length, 0);
  assert.ok(e.s.events.some((x) => x.type === "concentration"));
});
test("concentration DC is capped at 30 and uses the real CON save", () => {
  const e = battle();
  zone(e);
  Object.assign(e.unit("rin"), { reaction: 0, hp: 1000, max: 1000 });
  e.s.random.tape = [20];
  damage(e, 300);
  assert.equal(
    e.s.events.find((x) => x.type === "concentration").text.includes("СЛ 30"),
    true,
  );
  assert.equal(e.s.zones.length, 0);
});
test("incapacitation ends concentration without an extra saving throw", () => {
  const e = battle();
  zone(e);
  e.status("rin", "stunned");
  assert.equal(e.s.zones.length, 0);
  assert.equal(e.s.random.draws, 0);
});
test("invalid attack spends no action, ammo, RNG or event", () => {
  const e = battle(),
    before = structuredClone(e.s);
  assert.throws(() => strike(e, "shortsword", { target: "enemy_2" }));
  assert.deepEqual(e.s, before);
});
test("Nick requires another light weapon and omits positive ability damage modifier", () => {
  const e = battle();
  e.s.random.tape = [15, 1];
  strike(e);
  e.s.random.tape = [10, 10, 2];
  strike(e, "dagger", { mode: "nick" });
  assert.equal(e.unit("enemy_1").hp, 94);
  assert.equal(e.unit("rin").bonus, 1);
  assert.throws(() => strike(e, "dagger", { mode: "nick" }));
});
test("Nick cannot be used before a Light attack", () => {
  const e = battle();
  assert.throws(() => strike(e, "dagger", { mode: "nick" }));
  assert.equal(e.unit("rin").action, 1);
});
test("Martial Arts bonus strike works without taking Attack action", () => {
  const e = battle();
  e.s.random.tape = [15, 3];
  strike(e, "unarmed", { mode: "bonus" });
  assert.equal(e.unit("rin").action, 1);
  assert.equal(e.unit("rin").bonus, 0);
});
test("Flurry has two independently selected targets and one resource cost", () => {
  const e = battle();
  e.unit("enemy_2").x = 1;
  e.unit("enemy_2").y = 2;
  e.dispatch({ kind: "flurry" });
  e.s.random.tape = [15, 1, 15, 2];
  strike(e, "unarmed", { mode: "flurry" });
  strike(e, "unarmed", { mode: "flurry", target: "enemy_2" });
  assert.equal(e.unit("rin").focus, 2);
  assert.equal(e.unit("rin").bonus, 0);
  assert.equal(e.unit("rin").flurryLeft, 0);
  assert.equal(e.unit("enemy_1").hp, 96);
  assert.equal(e.unit("enemy_2").hp, 95);
  assert.throws(() => strike(e, "unarmed", { mode: "flurry" }));
});
test("Vex survives attacks against another target and expires after next own turn", () => {
  const e = battle();
  e.unit("rin").vex = { enemy_1: 2 };
  e.unit("rin").turnCount = 1;
  const spec = e.attackSpec("rin", "shortsword");
  assert.equal(e.attackModifiers("rin", "enemy_1", spec).adv, true);
  e.unit("rin").turnCount = 3;
  assert.equal(e.attackModifiers("rin", "enemy_1", spec).adv, false);
});
test("Sneak Attack once per turn, including a different participants turn", () => {
  const e = battle();
  e.unit("rin").policies.sneak = true;
  zone(e);
  e.s.random.tape = [15, 15, 1, 1];
  strike(e);
  assert.equal(e.unit("rin").sneakTurn, e.s.turnSerial);
  const once = e.unit("enemy_1").hp;
  e.unit("rin").action = 1;
  e.s.random.tape = [15, 15, 1];
  strike(e);
  assert.equal(once - e.unit("enemy_1").hp, 4);
  e.s.turnSerial++;
  e.unit("rin").action = 1;
  e.s.random.tape = [15, 15, 1, 1];
  strike(e);
  assert.equal(e.unit("rin").sneakTurn, e.s.turnSerial);
});
test("Darkness gives persistent asymmetric visibility; mutual blindness cancels", () => {
  const e = battle();
  zone(e);
  assert.deepEqual(e.visibility("rin", "enemy_1"), {
    adv: true,
    disadv: false,
  });
  assert.deepEqual(e.visibility("enemy_1", "rin"), {
    adv: false,
    disadv: true,
  });
  e.s.zones[0].owner = "enemy_2";
  assert.deepEqual(e.visibility("rin", "enemy_1"), { adv: true, disadv: true });
});
test("ordinary darkvision cannot see magical Darkness, blindsight can", () => {
  const e = battle();
  zone(e);
  e.unit("enemy_1").senses = { darkvision: 120 };
  assert.equal(e.canSee("enemy_1", "rin"), false);
  e.unit("enemy_1").senses.blindsight = 30;
  assert.equal(e.canSee("enemy_1", "rin"), true);
});
test("a sphere blocks an intersecting sightline even when both endpoints are outside", () => {
  const e = battle();
  e.unit("rin").x = 0;
  zone(e);
  e.s.zones[0].owner = "enemy_1";
  e.s.zones[0].x = 5;
  assert.equal(e.canSee("rin", "enemy_2"), false);
});
test("Darkness movement is only available at the beginning of own turn", () => {
  const e = battle();
  e.dispatch({ kind: "darkness", point: { x: 2, y: 3 } });
  assert.equal(e.unit("rin").focus, 2);
  assert.throws(() =>
    e.dispatch({ kind: "moveDarkness", point: { x: 3, y: 3 } }),
  );
  e.unit("rin").darkMoveWindow = true;
  e.dispatch({ kind: "moveDarkness", point: { x: 3, y: 3 } });
  assert.equal(e.unit("rin").focus, 2);
  assert.throws(() =>
    e.dispatch({ kind: "moveDarkness", point: { x: 2, y: 3 } }),
  );
});
test("paid Patient Defense combines Disengage and Dodge", () => {
  const e = battle();
  e.dispatch({ kind: "disengage", cost: "bonus", paid: true });
  assert.equal(e.unit("rin").disengaged, true);
  assert.equal(e.has("rin", "dodge"), true);
  assert.equal(e.unit("rin").focus, 2);
});
test("hidden observer cannot cause an opportunity attack it cannot see", () => {
  const e = battle();
  zone(e);
  e.dispatch({ kind: "move", path: [{ x: 0, y: 3 }] });
  assert.equal(e.unit("enemy_1").reaction, 1);
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("rin").x, 0);
});
test("opportunity attack interrupts movement before departure; pending reload is identical", () => {
  const e = battle();
  e.s.random.tape = [20, 3, 4];
  e.dispatch({ kind: "move", path: [{ x: 0, y: 3 }] });
  assert.equal(e.s.pending.kind, "deflect");
  assert.equal(e.unit("rin").x, 1);
  const copy = new E(JSON.parse(JSON.stringify(e.export())).session);
  decide(e, "no");
  decide(copy, "no");
  assert.deepEqual(copy.s, e.s);
  assert.equal(e.unit("rin").x, 0);
  assert.equal(e.unit("enemy_1").reaction, 0);
});
test("Disengage bypasses opportunity attacks for the whole move", () => {
  const e = battle();
  e.dispatch({ kind: "disengage" });
  e.dispatch({ kind: "move", path: [{ x: 0, y: 3 }] });
  assert.equal(e.unit("enemy_1").reaction, 1);
  assert.equal(e.unit("rin").hp, 31);
});
test("Heroic Inspiration rerolls a selected die and survives a save while pending", () => {
  const e = battle();
  e.unit("rin").policies.heroic = true;
  e.s.random.tape = [1, 20, 2, 3];
  strike(e);
  assert.equal(e.s.pending.kind, "roll");
  const copy = new E(JSON.parse(JSON.stringify(e.export())).session);
  decide(e, "heroic", { die: 0 });
  decide(copy, "heroic", { die: 0 });
  assert.deepEqual(e.s, copy.s);
  assert.equal(e.unit("rin").heroic, 0);
  assert.equal(e.unit("enemy_1").hp, 92);
});
test("Lucky advantage participates in Sneak eligibility", () => {
  const e = battle();
  e.unit("rin").policies.luck = true;
  e.unit("rin").policies.sneak = true;
  e.s.random.tape = [1, 15, 2, 3];
  strike(e);
  decide(e, "luck");
  decide(e, "accept");
  assert.equal(e.unit("rin").luck, 1);
  assert.equal(e.unit("enemy_1").hp, 92);
});
test("defensive Lucky is optional and cannot be spent twice for one window", () => {
  const e = battle();
  e.unit("rin").policies.defenseLuck = true;
  e.enqueue({
    kind: "attackRoll",
    actor: "enemy_1",
    target: "rin",
    spec: e.attackSpec("enemy_1", "main"),
    mode: "action",
  });
  e.run();
  const id = e.s.pending.id;
  decide(e, "yes");
  assert.equal(e.unit("rin").luck, 1);
  assert.throws(() => e.dispatch({ kind: "decide", id, choice: "yes" }));
  assert.equal(e.unit("rin").luck, 1);
});
test("nonlethal melee ends at 1 HP, unconscious and alive", () => {
  const e = battle();
  e.unit("enemy_1").hp = 1;
  e.s.random.tape = [15, 3];
  strike(e);
  assert.equal(e.s.pending.kind, "knockout");
  decide(e, "spare");
  assert.equal(e.unit("enemy_1").hp, 1);
  assert.equal(e.has("enemy_1", "unconscious"), true);
  assert.equal(Boolean(e.unit("enemy_1").dead), false);
});
test("ranged attack has no automatic knockout option", () => {
  const e = battle();
  e.unit("enemy_1").x = 4;
  e.unit("enemy_1").hp = 1;
  e.s.random.tape = [15, 3];
  strike(e, "bow");
  assert.equal(e.s.pending, null);
  assert.equal(e.unit("enemy_1").dead, true);
});
test("grapple uses target save and prevents movement; escape is an action", () => {
  const e = battle();
  e.s.random.tape = [1];
  e.dispatch({ kind: "grapple", target: "enemy_1" });
  assert.equal(e.has("enemy_1", "grappled"), true);
  assert.equal(e.speed("enemy_1"), 0);
  e.unit("enemy_1").x = 7;
  e.releaseGrapples();
  assert.equal(e.has("enemy_1", "grappled"), false);
});
test("death saves preserve unconsciousness and a natural 20 restores 1 HP", () => {
  const e = battle();
  e.unit("rin").reaction = 0;
  damage(e, 32);
  assert.equal(e.unit("rin").hp, 0);
  assert.equal(e.unit("rin").dead, undefined);
  e.s.random.tape = [20];
  e.enqueue({ kind: "startTurn" });
  e.run();
  assert.equal(e.unit("rin").hp, 1);
  assert.equal(e.has("rin", "unconscious"), false);
});
test("illusion requires an explicit ruling; cancelling spends nothing", () => {
  const e = battle();
  e.dispatch({ kind: "minorIllusion", description: "Шаги за повозкой" });
  assert.equal(e.s.pending.kind, "adjudication");
  assert.equal(e.unit("rin").action, 1);
  decide(e, "cancel");
  assert.equal(e.unit("rin").action, 1);
  e.dispatch({ kind: "minorIllusion", description: "Шаги за повозкой" });
  decide(e, "approve", {
    note: "Враг слышит шаги; его реакцию определит ведущий.",
  });
  assert.equal(e.unit("rin").action, 0);
  assert.ok(e.s.events.some((x) => x.type === "adjudication"));
});
test("AI decisions ignore the current coordinates of a hidden target", () => {
  const e = battle();
  const ai = new AI(e);
  ai.observe("enemy_1");
  e.s.zones = [
    {
      id: "fog1",
      kind: "fog",
      owner: "enemy_2",
      x: 1,
      y: 3,
      radius: 5,
      until: 600,
    },
    {
      id: "fog2",
      kind: "fog",
      owner: "enemy_2",
      x: 8,
      y: 7,
      radius: 5,
      until: 600,
    },
  ];
  e.unit("rin").hidden = true;
  e.status("rin", "invisible");
  e.s.index = e.s.order.indexOf("enemy_1");
  e.enqueue({ kind: "startTurn" });
  e.run();
  const first = ai.choose("enemy_1");
  e.unit("rin").x = 8;
  e.unit("rin").y = 7;
  assert.deepEqual(ai.choose("enemy_1"), first);
});
test("AI respects morale and exits rather than attacking when fleeing", () => {
  const e = battle();
  const u = e.unit("enemy_1");
  Object.assign(u, { hp: 1, x: 10 });
  u.tactics.canFlee = true;
  e.s.index = e.s.order.indexOf("enemy_1");
  e.enqueue({ kind: "startTurn" });
  e.run();
  assert.equal(new AI(e).choose("enemy_1").kind, "flee");
});
test("seeded random sequence continues exactly after JSON save/load", () => {
  const e = battle();
  const a = [e.roll(20), e.roll(6)],
    copy = new E(JSON.parse(JSON.stringify(e.export())).session);
  assert.equal(copy.roll(20), e.roll(20));
  assert.equal(copy.roll(10), e.roll(10));
  assert.equal(a.length, 2);
});
test("report rejects an unfinished battle", () => {
  const e = battle();
  assert.throws(() => A.outcome(e.s));
});
module.exports = { battle };

test("passing an ally is allowed, ending movement on the ally is rejected", () => {
  const e = battle();
  const a = structuredClone(e.unit("rin"));
  Object.assign(a, {
    id: "ally",
    name: "Союзник",
    controlled: false,
    x: 1,
    y: 4,
  });
  e.s.units.ally = a;
  e.s.order.push("ally");
  e.s.initiative.ally = 0;
  e.unit("rin").disengaged = true;
  assert.throws(() => e.dispatch({ kind: "move", path: [{ x: 1, y: 4 }] }));
  e.dispatch({
    kind: "move",
    path: [
      { x: 1, y: 4 },
      { x: 1, y: 5 },
    ],
  });
  assert.equal(e.unit("rin").y, 5);
  assert.equal(e.unit("rin").move, 30);
});
test("diagonals cannot cut a single wall corner", () => {
  const e = battle();
  e.s.terrain.walls = ["1,4"];
  assert.throws(() => e.dispatch({ kind: "move", path: [{ x: 0, y: 4 }] }));
  assert.equal(e.unit("rin").move, 40);
});
test("crawling through Difficult Terrain costs 15 feet per square, not 20", () => {
  const e = battle();
  e.status("rin", "prone");
  e.s.terrain.rubble = ["0,3"];
  assert.equal(e.stepCost("rin", { x: 0, y: 3 }), 15);
});
test("throwing a dagger consumes the actual carried item, and misses still consume it", () => {
  const e = battle();
  e.s.random.tape = [1, 1];
  strike(e, "daggerThrow");
  assert.equal(e.unit("rin").items.daggers, 3);
  assert.equal(e.unit("enemy_1").hp, 100);
});
test("a spellcaster can end concentration during another participants pending attack", () => {
  const e = battle();
  zone(e);
  e.s.index = 1;
  damage(e, 8);
  const pending = e.s.pending.id;
  e.dispatch({ kind: "endConcentration", actor: "rin" });
  assert.equal(e.s.zones.length, 0);
  assert.equal(e.s.pending.id, pending);
  decide(e, "no");
  assert.equal(e.unit("rin").hp, 23);
});
test("Inspiration can reroll the Deflect d10 before residual damage is applied", () => {
  const e = battle();
  e.unit("rin").policies.heroic = true;
  e.s.random.tape = [1, 10];
  damage(e, 12);
  decide(e, "yes");
  assert.equal(e.s.pending.kind, "roll");
  decide(e, "heroic", { die: 0 });
  assert.equal(e.unit("rin").heroic, 0);
  assert.equal(e.unit("rin").hp, 31);
  assert.equal(e.s.pending.kind, "redirect");
});
test("a new unnamed monk NPC uses the same Deflect mechanism", () => {
  const e = battle();
  const u = e.unit("enemy_1");
  u.features.deflectAttacks = 3;
  u.stats.DEX = 3;
  e.s.random.tape = [15, 4, 10];
  strike(e);
  assert.equal(u.hp, 100);
  assert.equal(u.reaction, 0);
  assert.ok(
    e.s.events.some((x) => x.type === "deflect" && x.actor === "enemy_1"),
  );
});
test("readied action waits for player consent and spends reaction, not another action", () => {
  const e = battle();
  e.unit("enemy_1").x = 4;
  e.dispatch({ kind: "ready", weapon: "shortsword", trigger: "approach" });
  e.s.index = 1;
  e.unit("enemy_1").move = 30;
  e.unit("enemy_1").disengaged = true;
  e.dispatch({
    kind: "move",
    actor: "enemy_1",
    path: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ],
  });
  assert.equal(e.s.pending.kind, "ready");
  assert.equal(e.unit("enemy_1").x, 2);
  e.s.random.tape = [15, 3];
  decide(e, "yes");
  assert.equal(e.unit("rin").reaction, 0);
  assert.equal(e.unit("rin").action, 0);
  assert.equal(e.unit("enemy_1").hp, 94);
});
test("Help benefits an ally and is consumed by their first attack", () => {
  const e = battle(),
    ally = structuredClone(e.unit("rin"));
  Object.assign(ally, { id: "ally", name: "Союзник", x: 2, y: 2 });
  e.s.units.ally = ally;
  e.s.order.push("ally");
  e.s.initiative.ally = 0;
  e.dispatch({ kind: "helpAttack", target: "enemy_1" });
  assert.equal(
    e.attackModifiers("rin", "enemy_1", e.attackSpec("rin", "shortsword")).adv,
    false,
  );
  assert.equal(
    e.attackModifiers("ally", "enemy_1", e.attackSpec("ally", "shortsword"))
      .adv,
    true,
  );
  e.s.index = e.s.order.indexOf("ally");
  e.s.random.tape = [10, 15, 2];
  e.dispatch({
    kind: "attack",
    actor: "ally",
    target: "enemy_1",
    weapon: "shortsword",
  });
  assert.equal(e.s.help.length, 0);
});
test("Alert swaps initiative before the first turn and consumes no action", () => {
  const e = battle();
  e.s.started = false;
  e.s.initiativeChoices = [];
  const a = structuredClone(e.unit("rin"));
  Object.assign(a, {
    id: "ally",
    name: "Союзник",
    controlled: false,
    x: 0,
    y: 0,
  });
  e.s.units.ally = a;
  e.s.order.push("ally");
  e.s.initiative.ally = 7;
  e.initialize();
  assert.equal(e.s.pending.kind, "initiativeSwap");
  decide(e, "swap", { target: "ally" });
  assert.equal(e.s.initiative.rin, 7);
  assert.equal(e.s.initiative.ally, 20);
  assert.equal(e.actorId, "ally");
  assert.equal(e.unit("ally").action, 1);
});
test("unimplemented NPC features are rejected before starting a battle", () => {
  const e = battle();
  e.unit("enemy_1").features = { unknownSpell: true };
  assert.throws(() => new E(e.s), /обработчика/);
});
test("Shadow Arts caster sees beyond their own Darkness; walls and foreign Darkness still block", () => {
  const e = battle();
  zone(e);
  assert.equal(e.canSee("rin", "enemy_2"), true);
  e.s.terrain.walls = ["5,3"];
  assert.equal(e.canSee("rin", "enemy_2"), false);
  e.s.terrain.walls = [];
  e.s.zones[0].owner = "enemy_1";
  assert.equal(e.canSee("rin", "enemy_2"), false);
});
test("blind attacks target a guessed cell and miss if the target is elsewhere", () => {
  const e = battle();
  e.s.random.tape = [20, 20];
  e.dispatch({ kind: "attackAt", weapon: "bow", point: { x: 8, y: 7 } });
  assert.equal(e.unit("rin").arrows, 19);
  assert.equal(e.unit("rin").items.arrows, 19);
  assert.equal(e.unit("enemy_1").hp, 100);
  assert.ok(e.s.events.some((x) => x.type === "attackMissed"));
});
test("leaving concealment ends Hide instead of granting permanent invisibility", () => {
  const e = battle();
  e.unit("rin").hidden = true;
  e.status("rin", "invisible");
  e.observeAll();
  assert.equal(e.unit("rin").hidden, false);
  assert.equal(e.has("rin", "invisible"), false);
});

test("AI forecasts ignore unseen threats and another creature's private senses", () => {
  const e = battle(),
    ai = new AI(e),
    archer = e.unit("enemy_2");
  e.unit("enemy_1").team = e.unit("rin").team;
  e.unit("enemy_1").hidden = true;
  e.status("enemy_1", "invisible");
  Object.assign(e.unit("enemy_1"), { x: 8, y: 3 });
  const known = ai.observe("enemy_2"),
    target = known.find((t) => t.id === "rin");
  const forecast = ai.estimateModifiers(
    "enemy_2",
    target,
    archer.attacks[0],
    archer,
    known,
  );
  assert.equal(forecast.disadv, false);
  assert.equal(
    e.attackModifiers("enemy_2", "rin", archer.attacks[0]).disadv,
    true,
  );
  const decision = ai.choose("enemy_2"),
    random = structuredClone(e.s.random);
  Object.assign(e.unit("enemy_1"), { x: 10, y: 7 });
  e.unit("rin").senses = { blindsight: 120, truesight: 120 };
  assert.deepEqual(
    ai.estimateModifiers("enemy_2", target, archer.attacks[0], archer, known),
    forecast,
  );
  assert.deepEqual(ai.choose("enemy_2"), decision);
  assert.deepEqual(e.s.random, random);
});

test("completed investigation visits new positions, survives reload and eventually holds", () => {
  let e = battle();
  const id = "enemy_1";
  e.s.index = e.s.order.indexOf(id);
  Object.assign(e.unit("rin"), { x: 10, y: 7 });
  e.status("rin", "invisible");
  e.unit(id).tactics.searchRadius = 5;
  e.s.memory[id] = { rin: { x: 2, y: 3, seenTurn: 0, name: "Рин" } };
  const locations = new Set();
  let held = false;
  for (let n = 0; n < 100; n++) {
    const c = new AI(e).choose(id);
    if (c.kind === "dodge") {
      held = true;
      break;
    }
    if (c.kind === "endTurn") {
      // Isolate repeated investigator turns; the complete encounter suite covers initiative.
      Object.assign(e.unit(id), { action: 1, move: 30 });
      e.s.turnSerial++;
      continue;
    }
    if (c.kind === "search") {
      const key = e.unit(id).x + "," + e.unit(id).y;
      assert.ok(!locations.has(key), "repeated an already completed search");
      locations.add(key);
    }
    e.dispatch(c);
    assert.equal(e.s.pending, null);
    e = new E(JSON.parse(JSON.stringify(e.export())).session);
  }
  assert.ok(held, "investigation must finish instead of circling forever");
  assert.ok(locations.size >= 5);
  assert.equal(e.s.memory[id].rin.searchedFrom.length, locations.size);
  assert.equal(e.unit("rin").x, 10);
  // A new sighting replaces the obsolete search history.
  e.removeStatus("rin", "invisible");
  e.observeAll();
  assert.equal(e.s.memory[id].rin.x, 10);
  assert.equal(e.s.memory[id].rin.searchedFrom, undefined);
});

test("proposing Search does not mark a location until the roll completes", () => {
  const e = battle(),
    id = "enemy_1";
  e.s.index = e.s.order.indexOf(id);
  Object.assign(e.unit("rin"), { x: 10, y: 7 });
  e.status("rin", "invisible");
  e.s.memory[id] = { rin: { x: 2, y: 3, seenTurn: 0 } };
  e.unit(id).action = 1;
  const c = new AI(e).choose(id);
  assert.equal(c.kind, "search");
  assert.equal(e.s.memory[id].rin.searchedFrom, undefined);
  e.unit(id).controlled = true;
  e.unit(id).heroic = 1;
  e.unit(id).policies.heroic = true;
  e.dispatch(c);
  assert.equal(e.s.pending.kind, "roll");
  assert.equal(e.s.memory[id].rin.searchedFrom, undefined);
  const copy = new E(JSON.parse(JSON.stringify(e.export())).session);
  decide(copy, "accept");
  assert.deepEqual(copy.s.memory[id].rin.searchedFrom, ["2,3"]);
});

test("an immobilized investigator does not endlessly Dash toward a memory", () => {
  const e = battle(),
    id = "enemy_1";
  e.s.index = e.s.order.indexOf(id);
  Object.assign(e.unit("rin"), { x: 10, y: 7 });
  e.status("rin", "invisible");
  e.status(id, "grappled", { source: "rin" });
  Object.assign(e.unit(id), { action: 1, move: 0 });
  e.s.memory[id] = { rin: { x: 7, y: 3, seenTurn: 0 } };
  const c = new AI(e).choose(id);
  assert.equal(c.kind, "dodge");
  e.dispatch(c);
  assert.equal(new AI(e).choose(id).kind, "endTurn");
});

test("observations forget a visible fallen target without learning an unseen defeat", () => {
  const e = battle(),
    ai = new AI(e),
    id = "enemy_1";
  ai.observe(id);
  assert.ok(e.s.memory[id].rin);
  e.status("rin", "invisible");
  Object.assign(e.unit("rin"), { hp: 0, dead: true });
  ai.observe(id);
  assert.ok(e.s.memory[id].rin, "unseen death must not update knowledge");
  e.removeStatus("rin", "invisible");
  ai.observe(id);
  assert.equal(e.s.memory[id].rin, undefined);
});
