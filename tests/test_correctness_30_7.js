"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {createBattle, CombatRulesEngine: E, CombatTacticalAI: AI, CombatMagic: M} = require("../sdk");
const {CombatBattlefield} = require("../core/battlefield");
const base = require("../examples/portable/border-watch.json");

function setup() {
  const {engine: e} = createBattle(base, undefined, 123);
  e.initialize();
  Object.assign(e.s, {pending: null, queue: [], effects: [], zones: [], objects: {},
    spellFrames: {}, phase: "active", turnSerial: 10});
  e.s.index = e.s.order.indexOf("ena");
  Object.assign(e.s.terrain, {walls: [], rubble: [], cover: {}});
  for (const u of Object.values(e.s.units)) {
    Object.assign(u, {features: {}, statuses: [], controlled: false, policies: {},
      action: 1, bonus: 1, reaction: 1, move: 30, hp: 100, max: 100, hidden: false,
      tactics: {canFlee: false}});
    u.attacks = u.attacks.map(a => ({...a, effects: []}));
  }
  e.unit("ena").controlled = true;
  Object.assign(e.unit("ena"), {x: 1, y: 3});
  Object.assign(e.unit("tal"), {x: 1, y: 6});
  Object.assign(e.unit("hunter_a"), {x: 6, y: 3});
  Object.assign(e.unit("hunter_b"), {x: 2, y: 3});
  e.s.random.tape = Array(100).fill(10);
  return e;
}
const modifiers = e => e.attackModifiers("ena", "hunter_b", e.unit("ena").attacks[0]);
const reload = e => new E(JSON.parse(JSON.stringify(e.export())).session);

test("movement cost matches an independent small-grid shortest-path oracle", () => {
  for (let mask=0;mask<8;mask++) {
    const e=setup(); Object.assign(e.s.terrain,{width:4,height:4,
      walls:mask&1?["2,1"]:[],rubble:mask&2?["1,1","2,2"]:[]});
    Object.assign(e.unit("ena"),{x:0,y:0,move:100});
    for(const id of ["tal","hunter_a","hunter_b"]) e.unit(id).fled=true;
    if(mask&4) e.status("ena","prone");
    const distance=new Map([["0,0",0]]), pending=[{x:0,y:0,cost:0}];
    while(pending.length) {
      pending.sort((a,b)=>a.cost-b.cost);const p=pending.shift();
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
        if(!dx&&!dy) continue; const x=p.x+dx,y=p.y+dy,k=x+","+y;
        if(x<0||x>=4||y<0||y>=4||e.s.terrain.walls.includes(k)) continue;
        if(dx&&dy&&(e.s.terrain.walls.includes((p.x+dx)+","+p.y)||
          e.s.terrain.walls.includes(p.x+","+(p.y+dy)))) continue;
        const cost=p.cost+5+(e.s.terrain.rubble.includes(k)?5:0)+(mask&4?5:0);
        if(cost<(distance.get(k)??Infinity)) {distance.set(k,cost);pending.push({x,y,cost});}
      }
    }
    const routes=new AI(e).reachable("ena",100);
    assert.equal(routes.length,distance.size);
    for(const p of routes) {
      assert.equal(p.cost,distance.get(p.x+","+p.y));
      if(p.path.length) assert.equal(e.validatePath("ena",p.path,100),p.cost);
    }
  }
});

test("fear planning never reads a hidden source's new position", () => {
  const e=setup(); e.status("ena","frightened",{source:"hunter_a"});
  e.unit("hunter_a").hidden=true;
  e.s.memory={ena:{hunter_a:{x:6,y:3,seenTurn:1}}};
  const routes=()=>new AI(e).reachable("ena").map(p=>[p.x,p.y,p.cost]);
  const before=routes(); e.unit("hunter_a").x=0; e.unit("hunter_a").y=0;
  assert.deepEqual(routes(),before);
  assert.equal(e.availableAction({kind:"move",actor:"ena",path:[{x:0,y:3}]}).enabled,true);
});

test("AI does not retry a step blocked by an unseen fear source indefinitely",()=>{
  const e=setup();e.s.index=e.s.order.indexOf("hunter_a");
  e.s.random.tape=[];
  Object.assign(e.unit("hunter_a"),{x:5,y:3});
  Object.assign(e.unit("ena"),{x:7,y:3,hidden:true});
  Object.assign(e.unit("tal"),{x:9,y:3});e.unit("hunter_b").fled=true;
  e.status("hunter_a","frightened",{source:"ena"});
  e.s.memory={hunter_a:{ena:{x:1,y:3,seenTurn:1}}};
  const ai=new AI(e);
  for(let n=0;n<25&&e.actorId==="hunter_a";n++) e.dispatch(ai.choose("hunter_a"));
  assert.notEqual(e.actorId,"hunter_a");
  assert.ok(e.s.events.some(v=>v.type==="movementBlocked"));
});

for (const condition of ["poisoned", "frightened"]) {
  test(`D20: ${condition} affects a check, survives reload, does not affect saves`, () => {
    let e = setup();
    e.status("ena", condition, {source: "hunter_a"});
    e = reload(e);
    e.dispatch({kind: "check", actor: "ena", stat: "WIS", dc: 15});
    const roll = e.s.events.filter(v => v.type === "roll").at(-1);
    assert.equal(roll.mode, -1);
    assert.deepEqual(roll.rolls, [10, 10]);
    assert.equal(e.saveTask("ena", "WIS", 15, {kind: "checkResult", actor: "ena"}).mode, 0);
  });
}

test("fear: a solid wall removes D20 disadvantage but never the approach restriction", () => {
  const e = setup();
  e.s.terrain.walls = ["4,3"];
  e.status("ena", "frightened", {source: "hunter_a"});
  assert.equal(e.canSee("ena", "hunter_a"), false);
  assert.equal(modifiers(e).disadv, false);
  e.dispatch({kind: "check", actor: "ena", stat: "WIS", dc: 15});
  assert.equal(e.s.events.filter(v => v.type === "roll").at(-1).mode, 0);
  assert.equal(M.canApproach(e, "ena", e.unit("ena"), {x: 2, y: 2}), false);
});

test("fear: multiple sources and effective immunity are evaluated without mutating state", () => {
  const e = setup();
  e.s.terrain.walls = ["4,3"];
  e.status("ena", "frightened", {source: "hunter_a", stackBySource: true});
  e.status("ena", "frightened", {source: "hunter_b", stackBySource: true});
  const before = JSON.stringify(e.s);
  assert.equal(modifiers(e).disadv, true);
  assert.equal(JSON.stringify(e.s), before);
  e.unit("ena").conditionImmunities = ["frightened"];
  assert.equal(modifiers(e).disadv, false);
});

test("D20: advantage cancels poison once; reroll checkpoints do not apply modifiers twice", () => {
  let e = setup();
  e.status("ena", "poisoned");
  e.unit("ena").heroic = 1;
  e.unit("ena").policies.heroic = true;
  e.enqueue({kind: "roll", actor: "ena", check: true, stat: "WIS", label: "Проверка",
    sides: 20, count: 1, mode: 1, bonus: 1, next: {kind: "checkResult", actor: "ena", dc: 15}});
  e.run();
  assert.equal(e.s.pending.kind, "roll");
  assert.equal(e.s.pending.roll.mode, 0);
  const saved = JSON.stringify(e.export());
  e = reload(e);
  assert.equal(JSON.stringify(e.export()), saved);
  e.dispatch({kind: "decide", id: e.s.pending.id, choice: "accept"});
  assert.equal(e.s.events.filter(v => v.type === "roll").at(-1).mode, 0);
});

for (const condition of [null, "stunned", "incapacitated", "unconscious", "paralyzed", "petrified"]) {
  test(`pack tactics: ally ${condition || "able to act"}`, () => {
    const e = setup();
    Object.assign(e.unit("hunter_a"), {x: 2, y: 3});
    Object.assign(e.unit("hunter_b"), {x: 2, y: 4});
    e.unit("hunter_a").features.packTactics = true;
    if (condition) e.status("hunter_b", condition);
    const m = e.attackModifiers("hunter_a", "ena", e.unit("hunter_a").attacks[0]);
    assert.equal(m.advantage.includes("Стая"), condition === null);
  });
}

test("unsupported exhaustion is rejected on input and old-session loading, without erasing data", () => {
  const e = setup();
  const before = JSON.stringify(e.s);
  assert.throws(() => e.status("ena", "exhaustion", {level: 2}), /Истощение.*не поддерживается/);
  assert.equal(JSON.stringify(e.s), before);
  const legacy = structuredClone(e.s);
  legacy.units.ena.statuses.push({kind: "exhaustion", level: 2});
  legacy.engineVersion = "30.6.0";
  const original = JSON.stringify(legacy);
  assert.throws(() => new E(legacy), /Истощение.*не поддерживается/);
  assert.equal(JSON.stringify(legacy), original);
});

test("AI: a frightened NPC selects an executable command and finishes its turn", () => {
  let e = setup();
  e.s.index = e.s.order.indexOf("hunter_a");
  Object.assign(e.unit("hunter_b"), {x: 9, y: 7});
  Object.assign(e.unit("tal"), {x: 0, y: 7});
  e.status("hunter_a", "frightened", {source: "ena"});
  e.observeAll();
  const initialDistance = e.distance(e.unit("hunter_a"), e.unit("ena"));
  let steps = 0;
  while (e.actorId === "hunter_a" && steps++ < 12) {
    assert.equal(e.s.pending, null);
    const command = new AI(e).choose("hunter_a");
    e.dispatch(command);
    assert.ok(e.distance(e.unit("hunter_a"), e.unit("ena")) >= initialDistance);
    e = reload(e);
  }
  assert.ok(steps < 12, "NPC must not endlessly replan");
});

test("AI: every observed reachable path obeys fear and difficult-terrain costs", () => {
  const e = setup();
  e.s.index = e.s.order.indexOf("hunter_a");
  e.s.terrain.rubble = ["6,2", "7,3"];
  e.status("hunter_a", "frightened", {source: "ena"});
  e.observeAll();
  for (const p of new AI(e).reachable("hunter_a")) {
    if (!p.path.length) continue;
    assert.equal(e.availableAction({kind: "move", actor: "hunter_a", path: p.path}).enabled, true);
    assert.equal(p.cost, e.validatePath("hunter_a", p.path, 30));
  }
});

test("player route: shared step policy cannot plot approach to a fear source", () => {
  const e = setup();
  e.status("ena", "frightened", {source: "hunter_a"});
  const field = new CombatBattlefield({walls: new Set(), rubble: new Set(),
    key: (x,y) => x+","+y, occupant: () => null, actor: () => e.unit("ena"),
    webDifficult: () => false, width: 11, height: 8,
    transition: (from,to,stop) => e.movementStep("ena",from,to,{stop})});
  assert.equal(field.findPath({x: 3, y: 3}), null);
  const route = field.findPath({x: 0, y: 3});
  assert.equal(e.validatePath("ena", route, 30), 5);
});

test("AI knowledge: a hidden enemy is not a planning obstacle; execution discovers it", () => {
  const e = setup();
  e.s.index = e.s.order.indexOf("hunter_a");
  Object.assign(e.unit("ena"), {x: 5, y: 3, hidden: true});
  const route = [{x: 5, y: 3}];
  assert.ok(new AI(e).reachable("hunter_a").some(p => p.x === 5 && p.y === 3));
  e.dispatch({kind: "move", actor: "hunter_a", path: route});
  assert.deepEqual([e.unit("hunter_a").x, e.unit("hunter_a").y], [6,3]);
  assert.ok(e.s.events.some(v => v.type === "movementBlocked"));
});

test("failed movement expires when fear ends, survives reload while unchanged",()=>{
  let e=setup();Object.assign(e.unit('ena'),{x:5,y:3});
  Object.assign(e.unit('hunter_a'),{x:7,y:3,hidden:true});
  e.s.memory={ena:{hunter_a:{x:1,y:3,seenTurn:1}}};
  e.status('ena','frightened',{source:'hunter_a'});
  const c={kind:'move',actor:'ena',path:[{x:6,y:3}]};
  e.dispatch(c);assert.equal(e.unit('ena').x,5);
  e=reload(e);assert.equal(e.availableAction(c).enabled,false);
  e.removeStatus('ena','frightened');assert.equal(e.availableAction(c).enabled,true);
  e.dispatch(c);assert.equal(e.unit('ena').x,6);
});
test("block memory uses observations, invalidates vacated visible cells, and clears each turn",()=>{
  const e=setup();e.rememberBlockedStep('ena',{x:2,y:3});
  const check=()=>e.movementStep('ena',e.unit('ena'),{x:2,y:3},{stop:true});
  assert.equal(check().allowed,false);
  e.unit('hunter_a').hidden=true;const context=e.movementKnowledge('ena');
  e.unit('hunter_a').x=8;assert.equal(e.movementKnowledge('ena'),context);
  e.unit('hunter_b').x=3;assert.equal(check().allowed,true);
  e.dispatch({kind:'endTurn',actor:'ena'});
  assert.ok(Object.values(e.s.units).every(u=>!u.blockedCells));
});
test("invalid movement cache is rejected, legacy cache migrates without mutating input",()=>{
  const e=setup();for(const bad of [{},[null],[{x:-1,y:0,turn:1}],[{x:1,y:1,turn:1,context:{}}]]) {
    const s=structuredClone(e.s);s.units.ena.blockedCells=bad;
    assert.throws(()=>new E(s),/память препятствий/);
  }
  e.unit('ena').blockedCells=[{x:2,y:2,turn:10}];
  const before=JSON.stringify(e.s),loaded=reload(e);
  assert.deepEqual(loaded.unit('ena').blockedCells,[]);assert.equal(JSON.stringify(e.s),before);
});
