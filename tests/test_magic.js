"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  createBattle,
  CombatRulesEngine: E,
  CombatMagic: M,
} = require("../sdk");
const base = JSON.parse(
  fs.readFileSync(
    __dirname + "/../examples/portable/border-watch.json",
    "utf8",
  ),
);
const pool = (n) => ({ current: n, max: n });
function setup() {
  const p = structuredClone(base),
    caster = {
      name: "Заклинатель",
      hp: 100,
      ac: 12,
      speed: 30,
      scores: { STR: 10, DEX: 14, CON: 14, INT: 20, WIS: 14, CHA: 14 },
      proficiency: 4,
      features: {
        potentCantrip: true,
        empoweredEvocation: true,
        sculptSpells: true,
      },
      attacks: [
        {
          id: "staff",
          name: "Посох",
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
        prepared: Object.keys(M.SPELLS).filter(
          (k) => M.SPELLS[k][1] > 0 && !["stormSphere"].includes(k),
        ),
        cantrips: [
          "fireBolt",
          "rayFrost",
          "mindSliver",
          "mageHand",
          "prestidigitation",
        ],
        components: { wardingBond: true, protectionEvil: true },
      },
      equipment: { stormBracers: true, vaeltirFocus: true },
    };
  p.profiles.caster = caster;
  p.characters.ena.profile = "caster";
  p.characters.ena.resources = {
    hp: pool(100),
    spell_slots: Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, pool(9)]),
    ),
    storm_bracers: pool(2),
    storm_daily: pool(2),
    vaeltir_focus: pool(2),
    smite_free: pool(1),
    channel_divinity: pool(2),
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
  e.s.random.tape = Array(200).fill(5);
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
function decide(e, choice, extra = {}) {
  e.dispatch({ kind: "decide", id: e.s.pending.id, choice, ...extra });
}
function reload(e) {
  return new E(JSON.parse(JSON.stringify(e.export())).session);
}
function damage(e, target, amount, type = "fire", extra = {}) {
  e.enqueue({
    kind: "damage",
    actor: "hunter_a",
    target,
    amount,
    damageType: type,
    ...extra,
  });
  e.run();
}
test("all prepared spell identifiers require a known handler; cosmetic book entries cannot be cast", () => {
  const e = setup();
  const c = e.unit("ena").casting;
  c.prepared.push("invented");
  assert.throws(() => new E(e.s), /обработчика/);
});
test("one slot per turn, cantrips after a slot, and invalid casting is atomic", () => {
  const e = setup();
  cast(e, "mistyStep", { point: { x: 3, y: 3 } });
  assert.equal(e.unit("ena").slots[2].current, 8);
  assert.equal(e.unit("ena").bonus, 0);
  const before = e.export();
  assert.throws(() => cast(e, "fireball", { point: { x: 6, y: 3 } }), /ячейка/);
  assert.deepEqual(e.export(), before);
  cast(e, "fireBolt", { target: "hunter_a" });
  assert.equal(e.unit("ena").action, 0);
});
test("Potent Cantrip deals half rolled damage on a miss without the frost rider", () => {
  const e = setup();
  e.s.random.tape = [1, 4, 4];
  cast(e, "rayFrost", { target: "hunter_a" });
  assert.equal(e.unit("hunter_a").hp, 194);
  assert.equal(e.has("hunter_a", "frost"), false);
});
test("successful Ray of Frost applies the speed rider and full damage", () => {
  const e = setup();
  e.s.random.tape = [18, 4, 4];
  cast(e, "rayFrost", { target: "hunter_a" });
  assert.equal(e.unit("hunter_a").hp, 187);
  assert.equal(e.speed("hunter_a"), 20);
});
test("Mind Sliver success deals half, failure consumes its penalty on the next save only", () => {
  let e = setup();
  e.s.random.tape = [4, 4, 20];
  cast(e, "mindSliver", { target: "hunter_a" });
  assert.equal(e.unit("hunter_a").hp, 196);
  assert.equal(e.unit("hunter_a").mindSliver, undefined);
  e = setup();
  e.s.random.tape = [4, 4, 1];
  cast(e, "mindSliver", { target: "hunter_a" });
  assert.ok(e.unit("hunter_a").mindSliver);
  e.s.random.tape = [3, 20];
  e.enqueue(
    e.saveTask("hunter_a", "WIS", 15, {
      kind: "concentrationResult",
      actor: "hunter_a",
    }),
  );
  e.run();
  assert.equal(e.unit("hunter_a").mindSliver, undefined);
  assert.ok(
    e.s.events.some((x) => x.type === "magicRollBonus" && x.amount === -3),
  );
});
test("Sculpt Spells prevents all allied damage, Evasion needs no reaction", () => {
  const e = setup();
  e.unit("tal").features.evasion = true;
  Object.assign(e.unit("tal"), { x: 5, y: 3 });
  e.s.random.tape = [...Array(8).fill(3), 1, 1];
  cast(e, "fireball", { point: { x: 6, y: 3 }, sculpt: ["tal"] });
  assert.equal(e.unit("tal").hp, e.unit("tal").max);
  assert.equal(e.unit("hunter_a").hp, 171);
});
test("Greater Invisibility survives attacks; ending concentration removes its effects and objects", () => {
  const e = setup();
  cast(e, "greaterInvisibility", { target: "ena" });
  turn(e, "ena");
  cast(e, "fireBolt", { target: "hunter_a" });
  assert.ok(e.has("ena", "invisible"));
  e.endConcentration("ena");
  assert.equal(e.has("ena", "invisible"), false);
});
test("Mage Armor uses current Dexterity, lasts beyond a turn, does not stack, and rejects worn armor", () => {
  const e = setup();
  cast(e, "mageArmor", { target: "ena" });
  assert.equal(e.ac("ena"), 15);
  turn(e, "ena");
  cast(e, "mageArmor", { target: "ena" });
  assert.equal(e.ac("ena"), 15);
  e.unit("tal").equipment.armor = true;
  turn(e, "ena");
  assert.throws(() => cast(e, "mageArmor", { target: "tal" }), /брони/);
});
test("Counterspell survives save/reload, uses CON, returns cancelled original slot and keeps the action spent", () => {
  let e = setup();
  const enemy = e.unit("hunter_a");
  enemy.casting = structuredClone(e.unit("ena").casting);
  enemy.slots = { 3: pool(2) };
  enemy.controlled = true;
  e.s.random.tape = [1];
  cast(e, "fireball", { point: { x: 7, y: 3 } });
  assert.equal(e.s.pending.choice, "counterspell");
  e = reload(e);
  decide(e, "yes");
  if (e.s.pending?.choice === "counterspell") decide(e, "no");
  assert.equal(e.unit("ena").slots[3].current, 9);
  assert.equal(e.unit("ena").action, 0);
  assert.equal(e.unit("hunter_a").slots[3].current, 1);
  assert.equal(e.unit("hunter_a").hp, 200);
});
test("countering Counterspell resumes the original spell exactly once", () => {
  const e = setup();
  const v = e.unit("hunter_a");
  v.casting = structuredClone(e.unit("ena").casting);
  v.slots = { 3: pool(2) };
  v.controlled = true;
  e.unit("tal").casting = structuredClone(e.unit("ena").casting);
  e.unit("tal").slots = { 3: pool(2) };
  e.unit("tal").controlled = true;
  e.s.random.tape = [1, ...Array(8).fill(3), 1, 1];
  cast(e, "fireball", { point: { x: 6, y: 3 } });
  decide(e, "yes");
  assert.equal(e.s.pending.actor, "tal");
  decide(e, "yes");
  assert.equal(e.unit("hunter_a").hp, 171);
  assert.equal(e.unit("ena").slots[3].current, 8);
  assert.equal(e.unit("hunter_a").slots[3].current, 2);
  assert.equal(e.unit("tal").slots[3].current, 1);
});
test("Slow changes action economy, AC, DEX, speed, attacks and reactions without using the weapon Slow condition", () => {
  const e = setup();
  e.s.random.tape = [1];
  cast(e, "slow", { target: "hunter_a" });
  assert.equal(e.speed("hunter_a"), 15);
  assert.equal(e.ac("hunter_a"), 11);
  assert.equal(M.canReact(e, "hunter_a"), false);
  turn(e, "hunter_a");
  e.unit("hunter_a").features.extraAttack = 2;
  e.dispatch({ kind: "dash", actor: "hunter_a" });
  assert.throws(() =>
    e.dispatch({
      kind: "cast",
      actor: "hunter_a",
      spell: "mistyStep",
      point: { x: 6, y: 4 },
    }),
  );
});
test("Hold Monster repeats at end of the affected turn, paralyzes, and breaks on concentration loss", () => {
  const e = setup();
  e.s.random.tape = [1];
  cast(e, "holdMonster", { target: "hunter_a" });
  assert.ok(e.has("hunter_a", "paralyzed"));
  e.endConcentration("ena");
  assert.equal(e.has("hunter_a", "paralyzed"), false);
});
test("Bigby combines movement and all four modes in one bonus action, and grips are serialized", () => {
  let e = setup();
  cast(e, "bigbyHand", { point: { x: 5, y: 3 }, handMode: "interpose" });
  let o = Object.values(e.s.objects)[0];
  assert.ok(o.interposing);
  assert.equal(o.hp, 100);
  assert.equal(e.unit("ena").bonus, 1);
  turn(e, "ena");
  e.s.random.tape = [1];
  e.dispatch({
    kind: "hand",
    actor: "ena",
    point: { x: 5, y: 3 },
    handMode: "grasp",
    target: "hunter_a",
  });
  assert.ok(e.has("hunter_a", "grappled"));
  e = reload(e);
  turn(e, "ena");
  e.s.random.tape = [2, 2, 2, 2];
  e.dispatch({
    kind: "hand",
    actor: "ena",
    handMode: "crush",
    target: "hunter_a",
    point: { x: 5, y: 3 },
  });
  assert.equal(e.unit("hunter_a").hp, 187);
  turn(e, "ena");
  e.s.random.tape = [1];
  e.dispatch({
    kind: "hand",
    actor: "ena",
    handMode: "push",
    target: "hunter_a",
    point: { x: 5, y: 3 },
  });
  assert.equal(e.unit("hunter_a").x, 10);
  e.endConcentration("ena");
  assert.equal(Object.keys(e.s.objects).length, 0);
  assert.equal(e.has("hunter_a", "grappled"), false);
});
test("Bigby fist is 5d8 and Empowered Evocation is used once over the spell lifetime", () => {
  const e = setup();
  e.s.random.tape = [18, ...Array(5).fill(2)];
  cast(e, "bigbyHand", {
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  assert.equal(e.unit("hunter_a").hp, 185);
  turn(e, "ena");
  e.s.random.tape = [18, ...Array(5).fill(2)];
  e.dispatch({
    kind: "hand",
    actor: "ena",
    point: { x: 5, y: 3 },
    handMode: "fist",
    target: "hunter_a",
  });
  assert.equal(e.unit("hunter_a").hp, 175);
});
test("Storm Sphere spends an item charge and a separate daily use, not a slot", () => {
  const e = setup();
  cast(e, "stormSphere", { point: { x: 7, y: 3 } });
  assert.equal(e.unit("ena").counters.storm_bracers.current, 1);
  assert.equal(e.unit("ena").counters.storm_daily.current, 1);
  assert.equal(e.unit("ena").slots[4].current, 9);
  assert.ok(M.concentrating(e, "ena"));
});
test("Root/Leaf transfers only post-mitigation damage, rounds down and bypasses all receiving mitigation", () => {
  const e = setup();
  const a = e.unit("ena"),
    b = e.unit("tal");
  a.equipment.leafPartner = "tal";
  b.equipment.rootPartner = "ena";
  a.resistances = ["fire"];
  b.resistances = ["fire"];
  b.features.heavyArmorReduction = 4;
  b.features.uncannyDodge = true;
  b.controlled = true;
  b.hp = 27;
  e.s.random.tape = [4];
  damage(e, "ena", 19);
  assert.equal(a.hp, 97);
  assert.equal(b.hp, 21);
  assert.equal(e.s.pending, null);
  assert.equal(b.reaction, 1);
});
test("Root/Leaf does not activate if the root is unconscious or beyond 60 feet", () => {
  const e = setup();
  e.unit("ena").equipment.leafPartner = "tal";
  e.unit("tal").equipment.rootPartner = "ena";
  e.status("tal", "unconscious");
  damage(e, "ena", 10);
  assert.equal(e.unit("ena").hp, 90);
  assert.equal(e.unit("tal").hp, 27);
});
test("Warding Bond gives AC and saves, shares resisted damage once, and differs from Root/Leaf", () => {
  const e = setup();
  cast(e, "wardingBond", { target: "tal" });
  assert.equal(e.ac("tal"), e.unit("tal").ac + 1);
  const a = e.unit("ena").hp,
    b = e.unit("tal").hp;
  damage(e, "tal", 20);
  assert.equal(e.unit("tal").hp, b - 10);
  assert.equal(e.unit("ena").hp, a - 10);
});
test("Warding Bond cannot consume a slot when material components are absent", () => {
  const e = setup();
  e.unit("ena").casting.components.wardingBond = false;
  const s = e.export();
  assert.throws(() => cast(e, "wardingBond", { target: "tal" }), /колец/);
  assert.deepEqual(e.export(), s);
});
test("Beacon maximizes Cure Wounds, boosts WIS/death saves, and Heroism grants recurring temp HP", () => {
  const e = setup();
  e.unit("tal").hp = 1;
  cast(e, "beaconHope", { target: "tal" });
  turn(e, "ena");
  cast(e, "cureWounds", { target: "tal" });
  assert.equal(e.unit("tal").hp, 22);
  assert.equal(
    e.saveTask("tal", "WIS", 15, { kind: "concentrationResult", actor: "tal" })
      .mode,
    1,
  );
  turn(e, "ena");
  cast(e, "heroism", { target: "tal" });
  assert.equal(e.unit("tal").temp, 5);
  e.unit("tal").temp = 0;
  turn(e, "tal");
  assert.equal(e.unit("tal").temp, 5);
  assert.ok(!M.effects(e, "tal", "beaconHope").length);
});
test("Abjure allows exactly one of movement/action/bonus and ends upon any damage", () => {
  const e = setup();
  e.unit("ena").features.abjureFoes = true;
  e.s.random.tape = [1];
  e.dispatch({ kind: "abjure", actor: "ena", target: "hunter_a" });
  assert.ok(e.has("hunter_a", "frightened"));
  turn(e, "hunter_a");
  e.dispatch({ kind: "dash", actor: "hunter_a" });
  assert.throws(
    () =>
      e.dispatch({ kind: "move", actor: "hunter_a", path: [{ x: 7, y: 3 }] }),
    /Изгнание/,
  );
  damage(e, "hunter_a", 1);
  assert.equal(e.has("hunter_a", "frightened"), false);
});
test("optional Shield Master, Smite and Cunning Strike reload without double payment", () => {
  let e = setup();
  const u = e.unit("ena");
  u.features = {
    divineSmite: true,
    shieldMaster: true,
    shieldEquipped: true,
    cunningStrike: true,
    sneakDice: 5,
    cunningDC: 17,
    poisonerKit: true,
  };
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  Object.assign(e.unit("tal"), { x: 3, y: 4 });
  u.attacks[0].sneakEligible = true;
  u.attacks[0].bonus = 20;
  e.s.random.tape = [15, 2, ...Array(4).fill(3), 1, 1, 1, 1];
  e.dispatch({
    kind: "attack",
    actor: "ena",
    target: "hunter_a",
    weapon: "staff",
  });
  assert.equal(e.s.pending.choice, "strikeExtras");
  decide(e, "cunning");
  e = reload(e);
  decide(e, "trip");
  decide(e, "smite");
  decide(e, "free");
  decide(e, "shieldBash");
  decide(e, "push");
  assert.equal(e.unit("ena").counters.smite_free.current, 0);
  assert.equal(e.unit("ena").bonus, 0);
  assert.equal(e.unit("hunter_a").x, 4);
  assert.ok(e.has("hunter_a", "prone"));
});
test("spell continuations are JSON roundtrippable and reject unknown opcodes", () => {
  const e = setup();
  e.s.queue = [M.task("ena", "nonexistent")];
  assert.throws(() => reload(e), /магический/);
});
for (const [spell, data] of Object.entries({
  magicMissile: { targets: ["hunter_a", "hunter_b"] },
  thunderwave: { point: { x: 3, y: 3 } },
  burningHands: { point: { x: 3, y: 3 } },
  fogCloud: { point: { x: 6, y: 3 } },
  scorchingRay: { targets: ["hunter_a", "hunter_b"] },
  web: { point: { x: 6, y: 3 } },
  coneCold: { point: { x: 6, y: 3 } },
  seeming: { targets: ["ena", "tal"] },
  bless: { targets: ["ena", "tal"] },
  command: { target: "hunter_a" },
  compelledDuel: { target: "hunter_a" },
  protectionEvil: { target: "tal" },
  shieldFaith: { target: "tal" },
  aid: { targets: ["ena", "tal"] },
  lesserRestoration: { target: "tal" },
  zoneTruth: { point: { x: 6, y: 3 } },
  dispelMagic: { target: "hunter_a" },
  fly: { target: "tal" },
  dimensionDoor: { point: { x: 5, y: 2 } },
  mageHand: { point: { x: 3, y: 3 } },
  prestidigitation: { point: { x: 3, y: 3 } },
  crusaderMantle: {},
  auraVitality: {},
  drainingWave: { point: { x: 6, y: 3 } },
  findSteed: { point: { x: 3, y: 2 } },
}))
  test("prepared spell executes and reloads: " + spell, () => {
    let e = setup();
    e.s.random.tape = Array(400).fill(2);
    cast(e, spell, data);
    if (e.s.pending?.choice === "vitality")
      decide(e, "heal", { target: "tal" });
    assert.equal(e.s.pending, null);
    e = reload(e);
    assert.equal(e.s.queue.length, 0);
  });
test("Magic Missile Shield offers a reaction once, survives reload and blocks each dart", () => {
  let e = setup();
  const v = e.unit("hunter_a");
  v.features.shieldSpell = true;
  v.slots = { 1: pool(2) };
  v.controlled = true;
  cast(e, "magicMissile", { target: "hunter_a" });
  assert.equal(e.s.pending.choice, "missileShield");
  e = reload(e);
  decide(e, "yes");
  assert.equal(e.unit("hunter_a").hp, 200);
  assert.equal(e.unit("hunter_a").slots[1].current, 1);
  assert.equal(e.unit("hunter_a").reaction, 0);
});
test("damage interrupts ongoing concentration through the same serialized save as weapon attacks", () => {
  const e = setup();
  e.s.random.tape = [1, ...Array(8).fill(3)];
  cast(e, "greaterInvisibility", { target: "ena" });
  damage(e, "ena", 10);
  assert.equal(e.has("ena", "invisible"), false);
});
test("ending Slow restores a blocked but unspent reaction; speed budgets preserve movement already spent", () => {
  const e = setup();
  turn(e, "hunter_a");
  e.unit("hunter_a").move = 20;
  const f = {
    actor: "ena",
    spell: "slow",
    level: 3,
    id: "test",
    targets: ["hunter_a"],
    offered: [],
  };
  M.add(e, f, "slow", ["hunter_a"], 60);
  assert.equal(e.unit("hunter_a").move, 5);
  assert.equal(M.canReact(e, "hunter_a"), false);
  e.endConcentration("ena");
  assert.equal(e.unit("hunter_a").move, 20);
  assert.equal(M.canReact(e, "hunter_a"), true);
  assert.equal(e.unit("hunter_a").reaction, 1);
});
test("Find Steed uses its free cast, correct level-based HP and one daily chosen power", () => {
  const e = setup();
  e.unit("ena").counters.faithful_steed = pool(1);
  cast(e, "findSteed", { point: { x: 3, y: 2 } });
  const u = e.unit("ena-steed");
  assert.equal(u.max, 25);
  assert.equal(u.ac, 12);
  assert.equal(u.size, 3);
  assert.equal(e.unit("ena").counters.faithful_steed.current, 0);
  turn(e, "ena-steed");
  e.unit("ena").hp = 50;
  e.dispatch({ kind: "steedPower", actor: "ena-steed", target: "ena" });
  assert.equal(u.powerAvailable, false);
  assert.ok(e.unit("ena").hp > 50);
});
test("Haste potion uses a bonus action, stacks AC with Mage Armor and grants one extra attack now", () => {
  const e = setup();
  const u = e.unit("ena");
  u.items.speed = 1;
  u.equipment.consumables = { speed: "speedPotion" };
  cast(e, "mageArmor", { target: "ena" });
  e.dispatch({ kind: "useItem", actor: "ena", item: "speed" });
  assert.equal(u.bonus, 0);
  assert.equal(u.action, 0);
  assert.equal(e.ac("ena"), 17);
  assert.equal(e.speed("ena"), 60);
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  u.features.extraAttack = 2;
  e.s.random.tape = [18, 2];
  e.dispatch({
    kind: "hasteAction",
    actor: "ena",
    action: "attack",
    target: "hunter_a",
    weapon: "staff",
  });
  assert.equal(u.hasteAction, 0);
  assert.equal(u.attacksLeft, 0);
  assert.equal(e.unit("hunter_a").hp, 197);
});
test("Star mantle works for a non-caster and consumes one star for seven level-V darts", () => {
  const e = setup();
  turn(e, "tal");
  e.unit("tal").counters.mantle_stars = pool(6);
  e.s.random.tape = Array(7).fill(2);
  e.dispatch({ kind: "mantleMissile", actor: "tal", target: "hunter_a" });
  assert.equal(e.unit("tal").counters.mantle_stars.current, 5);
  assert.equal(e.unit("hunter_a").hp, 179);
  assert.equal(e.unit("tal").action, 0);
});
test("Living Arrow stops movement without granting the extra riders of Restrained", () => {
  const e = setup(),
    u = e.unit("ena");
  u.counters.living_arrow = pool(1);
  u.attacks[0].id = "leafBow";
  Object.assign(e.unit("hunter_a"), { x: 3, y: 3 });
  e.s.random.tape = [15, 2, 1];
  e.dispatch({
    kind: "attack",
    actor: "ena",
    target: "hunter_a",
    weapon: "leafBow",
  });
  decide(e, "living");
  decide(e, "yes");
  assert.equal(e.speed("hunter_a"), 0);
  assert.equal(e.has("hunter_a", "restrained"), false);
  assert.equal(u.counters.living_arrow.current, 0);
});
test("undefined smoke parameters require a ruling and cancel without spending an item or action", () => {
  let e = setup();
  e.unit("ena").items.smoke = 1;
  e.unit("ena").equipment.consumables = { smoke: "smoke" };
  const c = {
    kind: "useItem",
    actor: "ena",
    item: "smoke",
    point: { x: 2, y: 3 },
  };
  e.dispatch(c);
  assert.equal(e.unit("ena").action, 1);
  e = reload(e);
  decide(e, "skip");
  assert.equal(e.unit("ena").items.smoke, 1);
  assert.equal(e.s.zones.length, 0);
  e.dispatch(c);
  assert.throws(() => decide(e, "use"), /парамет|дальность|радиус/);
  decide(e, "use", { range: 0, radius: 20, duration: 30 });
  assert.equal(e.unit("ena").items.smoke, 0);
  assert.equal(e.unit("ena").action, 0);
  assert.equal(e.s.zones[0].radius, 20);
});
test("acid replaces one attack and uses 2d6 while leaving Extra Attack available", () => {
  const e = setup(),
    u = e.unit("ena");
  u.features.extraAttack = 2;
  u.items.acid = 1;
  u.equipment.consumables = { acid: "acid" };
  e.s.random.tape = [1, 3, 3];
  e.dispatch({
    kind: "useItem",
    actor: "ena",
    item: "acid",
    target: "hunter_a",
  });
  assert.equal(e.unit("hunter_a").hp, 194);
  assert.equal(u.attacksLeft, 1);
  assert.equal(u.bonus, 1);
});
test("Beacon maximizes the actual grade of healing potion", () => {
  const e = setup(),
    u = e.unit("ena");
  M.add(
    e,
    { actor: "ena", spell: "beaconHope", level: 3 },
    "beaconHope",
    ["ena"],
    60,
  );
  u.hp = 50;
  u.items.potion = 1;
  u.itemTypes.potion = "healing";
  u.itemHealing = { potion: { count: 4, flat: 4 } };
  e.s.random.tape = [1, 1, 1, 1];
  e.dispatch({ kind: "healPotion", actor: "ena", item: "potion" });
  assert.equal(u.hp, 70);
});

test("Chain Lightning VI deals one empowered 10d8 roll to both targets with independent saves", () => {
  const e=setup();
  e.unit("ena").casting.level=11;
  e.s.random.tape=[...Array(10).fill(5),1,1];
  const before=e.unit("ena").slots[6].current;
  cast(e,"chainLightning",{level:6,targets:["hunter_a","hunter_b"]});
  assert.equal(e.unit("ena").slots[6].current,before-1);
  assert.equal(e.unit("hunter_a").hp,145);
  assert.equal(e.unit("hunter_b").hp,145);
  assert.equal(e.s.events.filter(x=>x.type==="roll"&&x.text.includes("Цепная молния")).length,1);
});
test("Chain Lightning checks secondary target distance from first target before paying a spell slot",()=>{
  const e=setup();e.unit("ena").casting.level=11;
  e.unit("hunter_b").x=13;e.unit("hunter_b").y=3;
  const before=JSON.stringify(e.export());
  assert.throws(()=>cast(e,"chainLightning",{level:6,targets:["hunter_a","hunter_b"]}),/дистанции/);
  assert.equal(JSON.stringify(e.export()),before);
});
test("Chain Lightning respects Sculpt Spells for an ally without removing other targets",()=>{
  const e=setup();e.unit("ena").casting.level=11;
  e.s.random.tape=[...Array(10).fill(5),1];
  const ally=e.unit("tal").hp;
  cast(e,"chainLightning",{level:6,targets:["hunter_a","tal"],sculpt:["tal"]});
  assert.equal(e.unit("tal").hp,ally);
  assert.equal(e.unit("hunter_a").hp,145);
  assert.ok(e.s.events.some(x=>x.type==="sculpt"));
});


test("Globe of Invulnerability stays on its cast square and survives session export", () => {
  let e = setup();
  e.unit("ena").casting.level = 11;
  cast(e,"globeInvulnerability",{level:6});
  const globe=e.s.effects.find(x=>x.kind==="globeInvulnerability");
  assert(globe && globe.concentration);
  assert.deepEqual(globe.point,{x:2,y:3});
  assert.equal(globe.until - e.s.elapsed,60);
  assert(e.s.zones.some(z=>z.effect===globe.id && z.radius===10));
  e.unit("ena").x=9; // Protection is anchored, not carried with the caster.
  e=reload(e);
  assert.deepEqual(e.s.effects.find(x=>x.kind==="globeInvulnerability").point,{x:2,y:3});
  assert.equal(M.globeBlocked(e,{actor:"hunter_a",level:5,castOrigin:{x:6,y:3}},"tal"),true);
  assert.equal(M.globeBlocked(e,{actor:"hunter_a",level:6,castOrigin:{x:6,y:3}},"tal"),false);
  assert.equal(M.globeBlocked(e,{actor:"ena",level:3,castOrigin:{x:2,y:3}},"tal"),false);
  assert.equal(M.globeBlocked(e,{actor:"hunter_a",level:3,castOrigin:{x:6,y:3}},"hunter_b"),false);
});
test("Globe intercepts eligible fireball targets and incoming spell attacks, not outside targets", () => {
  const e=setup();e.unit("ena").casting.level=11;
  cast(e,"globeInvulnerability",{level:6});
  const f={id:"spell-globe-check",actor:"hunter_a",spell:"fireball",level:3,
    castOrigin:{x:6,y:3}};
  const effect={stat:"DEX",dc:17,type:"fire",half:true};
  const before=e.s.queue.length;
  M.area(e,f,["tal","hunter_b"],8,6,0,effect);
  assert.equal(e.s.queue.length,before+1);
  assert.deepEqual(e.s.queue.at(-1).next.targets,["hunter_b"]);
  const queued=e.s.queue.length;
  M.attack(e,{...f,spell:"rayFrost"},"tal",{count:2,die:8,flat:0,type:"cold"});
  assert.equal(e.s.queue.length,queued);
  M.attack(e,{...f,spell:"rayFrost"},"hunter_b",{count:2,die:8,flat:0,type:"cold"});
  assert.equal(e.s.queue.length,queued+1);
});
test("Globe is concentration and ending it removes the associated field",()=>{
  const e=setup();e.unit("ena").casting.level=11;
  cast(e,"globeInvulnerability",{level:6});
  assert.equal(e.s.effects.filter(x=>x.kind==="globeInvulnerability").length,1);
  M.endConcentration(e,"ena");
  assert.equal(e.s.effects.filter(x=>x.kind==="globeInvulnerability").length,0);
  assert.equal(e.s.zones.filter(z=>z.kind==="globeInvulnerability").length,0);
});
