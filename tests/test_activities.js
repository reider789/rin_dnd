"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {createBattle, CombatRulesEngine:E, CombatActivities:A, CombatMagic:M,
  CombatContentPack:P} = require("../sdk");
const base = require("../examples/portable/border-watch.json");
const definition = () => ({handler:"healing",version:1,name:"Полевая помощь",
  cost:"action",target:"ally",range:5,dice:{count:2,sides:6,flat:2},
  resource:{counter:"second_wind",amount:1},reference:"Тестовое согласованное действие"});
function pack(d = definition()) {
  const p = structuredClone(base);
  p.requires = [...(p.requires || []),"healing"];
  p.abilities.aid = d; p.profiles.sentinel.abilities.push("aid");
  p.characters.ena.resources = {hp:{current:p.profiles.sentinel.hp,max:p.profiles.sentinel.hp},
    second_wind:{current:2,max:2}};
  return p;
}
function setup(d) {
  const {engine:e} = createBattle(pack(d)); e.initialize();
  e.s.pending=null; e.s.queue=[]; e.s.index=e.s.order.indexOf("ena");
  e.s.terrain.walls=[]; e.s.terrain.cover={};
  Object.assign(e.unit("ena"),{x:2,y:2,action:1,bonus:1,heroic:0,policies:{}});
  Object.assign(e.unit("tal"),{x:2,y:3,hp:1});
  e.s.random.tape=[3,4]; return e;
}
const command = {kind:"activity",actor:"ena",activity:"aid",target:"tal"};
const reload = e => new E(JSON.parse(JSON.stringify(e.export())).session);

test("data-defined healing executes through the common queue and consumes resources once", () => {
  const e=setup(), before=JSON.stringify(e.s);
  assert.equal(e.availableAction(command).enabled,true);
  assert.equal(JSON.stringify(e.s),before);
  e.dispatch(command);
  assert.equal(e.unit("tal").hp,10);
  assert.equal(e.unit("ena").action,0);
  assert.equal(e.unit("ena").counters.second_wind.current,1);
  assert.equal(e.s.events.findLast(v=>v.type==="activity").reference,definition().reference);
  assert.equal(reload(e).unit("tal").hp,10);
});
test("healing resumes from a Heroic Inspiration checkpoint without double payment", () => {
  let e=setup(); Object.assign(e.unit("ena"),{heroic:1,policies:{heroic:true}});
  e.dispatch(command); assert.equal(e.s.pending.kind,"roll");
  const saved=JSON.stringify(e.export()); e=reload(e); assert.equal(JSON.stringify(e.export()),saved);
  e.s.random.tape=[6];
  e.dispatch({kind:"decide",id:e.s.pending.id,choice:"heroic",die:0});
  assert.equal(e.unit("tal").hp,13);
  assert.equal(e.unit("ena").counters.second_wind.current,1);
});
test("healing respects Beacon, bonus actions, self targets and unavailable resources", () => {
  const d={...definition(),cost:"bonus",target:"self",range:0},e=setup(d);
  e.unit("ena").hp=1;
  M.add(e,{actor:"ena",spell:"beaconHope",level:3},"beaconHope",["ena"],60);
  e.dispatch(command); assert.equal(e.unit("ena").hp,15);
  assert.equal(e.unit("ena").bonus,0); assert.equal(e.unit("ena").action,1);
  e.unit("ena").bonus=1; e.unit("ena").counters.second_wind.current=0;
  const before=JSON.stringify(e.s); assert.throws(()=>e.dispatch(command),/Недостаточно ресурса/);
  assert.equal(JSON.stringify(e.s),before);
});
test("a registry ability obeys Slow's action or bonus action restriction", () => {
  const e=setup({...definition(),cost:"bonus"});
  M.add(e,{actor:"hunter_a",spell:"slow",level:3},"slow",["ena"],60);
  e.dispatch({kind:"dodge",actor:"ena"});
  assert.equal(e.availableAction(command).enabled,false);
  const before=JSON.stringify(e.s); assert.throws(()=>e.dispatch(command),/Замедление/);
  assert.equal(JSON.stringify(e.s),before);
});
test("registry rejects out-of-range and hostile healing atomically", () => {
  for (const target of ["hunter_a","tal"]) {
    const e=setup(); if(target==="tal") e.unit(target).y=7;
    const before=JSON.stringify(e.s);
    assert.throws(()=>e.dispatch({...command,target}),/союзник/);
    assert.equal(JSON.stringify(e.s),before);
  }
});
for (const [name,mutate] of [
  ["script",d=>d.script="roll(20)"], ["unknown handler",d=>d.handler="arbitrary"],
  ["wrong version",d=>d.version=2], ["unknown dice",d=>d.dice.sides=100],
  ["unknown resource",d=>d.resource.counter="newPower"], ["missing reference",d=>delete d.reference],
]) test("registry fails closed: "+name,()=>{
  const d=definition(); mutate(d); assert.throws(()=>P.compile(pack(d)));
});
test("registry checks resources on load and never aliases definitions across actors",()=>{
  const p=pack(); p.characters.tal.profile="sentinel";
  p.characters.tal.resources=structuredClone(p.characters.ena.resources);
  const input=JSON.stringify(p),{engine:e}=createBattle(p);
  e.unit("ena").activities.aid.dice.count=4;
  assert.equal(e.unit("tal").activities.aid.dice.count,2); assert.equal(JSON.stringify(p),input);
  const s=structuredClone(e.s); delete s.units.ena.counters.second_wind;
  assert.throws(()=>new E(s),/Нет ресурса действия/);
});
test("named spell definitions preserve the public tuple catalogue and return isolated copies",()=>{
  for(const [id,d] of Object.entries(M.SPELLS)) {
    const item=A.spell(id); assert.equal(item.name,d[0]); assert.equal(item.level,d[1]);
    assert.equal(item.cost,d[2]); assert.equal(item.range,d[3]); assert.equal(item.target,d[4]);
    assert.equal(item.school,d[5]); assert.equal(item.concentrationSeconds,d[6]);
  }
  A.spell("cureWounds").name="changed";
  assert.equal(A.spell("cureWounds").name,"Лечение ран");
  assert.deepEqual(A.healing("cureWounds",{level:3,ability:5}),{count:6,sides:8,bonus:5});
});
