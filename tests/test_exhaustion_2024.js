"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createBattle,CombatRulesEngine:E}=require("../sdk");
const base=require("../examples/portable/border-watch.json");

function battle(exhaustion=0) {
  const pack=structuredClone(base);
  if (exhaustion) pack.continuity={exhaustion:{ena:exhaustion}};
  const {engine:e}=createBattle(pack,undefined,123);
  e.initialize();
  e.s.queue=[];e.s.pending=null;e.s.phase="active";
  e.s.index=e.s.order.indexOf("ena");
  for(const u of Object.values(e.s.units)) {
    u.policies={heroic:false,luck:false,defenseLuck:false,sneak:true};
    u.controlled=false;
  }
  e.unit("ena").controlled=true;
  e.unit("ena").bonus=1;e.unit("ena").action=1;
  e.s.random.tape=Array(60).fill(4);
  return e;
}

test("2024 exhaustion: -2 per level on attacks, saves and checks, not damage dice",()=>{
  const e=battle(2);
  assert.equal(e.unit("ena").exhaustion,2);
  assert.equal(e.speed("ena"),Math.max(0,e.unit("ena").speed-10));
  for (const kind of ["attack","save","check"]) {
    const n=e.s.events.length;
    e.finishRoll({kind:"roll",actor:"ena",label:kind,count:1,sides:20,rolls:[12],bonus:7,
      ...(kind==="save"?{save:true}:{}),next:{kind:"dummy-roll-result",actor:"ena"}});
    assert.equal(e.s.queue.at(-1).result.total,15);
    const event=e.s.events.slice(n).find(x=>x.type==="roll");
    assert.ok(event,"journal must record a roll");
    assert.equal(event.bonus,3);
    assert.ok(event.bonusParts.some(x=>x.rule==="condition.exhaustion" && x.amount===-4));
    e.s.queue.pop();
  }
  e.finishRoll({kind:"roll",actor:"ena",label:"Урон",count:2,sides:6,rolls:[3,5],bonus:4,
    next:{kind:"dummy-roll-result",actor:"ena"}});
  assert.equal(e.s.queue.at(-1).result.total,12);
  assert.equal(e.s.queue.at(-1).result.bonusParts?.some(x=>x.rule==="condition.exhaustion")||false,false);
});

test("healing potion can be given to adjacent injured ally and is paid once",()=>{
  const e=battle();
  const giver=e.unit("ena"),patient=e.unit("tal");
  Object.assign(giver,{x:2,y:3});Object.assign(patient,{x:2,y:4,hp:3,max:30});
  Object.assign(giver,{itemTypes:{healing:"healing"},items:{healing:1},itemHealing:{healing:{count:2,flat:2}},bonus:1});
  const before=patient.hp;
  e.dispatch({kind:"healPotion",actor:"ena",item:"healing",target:"tal"});
  assert.equal(patient.hp>before,true);
  assert.equal(giver.items.healing,0);
  assert.equal(giver.bonus,0);
});
test("invalid potion target preserves turn and item",()=>{
  const e=battle();
  const giver=e.unit("ena");
  Object.assign(giver,{itemTypes:{healing:"healing"},items:{healing:1},bonus:1});
  const before=JSON.stringify(e.s);
  assert.throws(()=>e.dispatch({kind:"healPotion",actor:"ena",item:"healing",target:"hunter_a"}),/5 футов/);
  assert.equal(JSON.stringify(e.s),before);
});
test("exhaustion level survives save/load; corrupted level is rejected",()=>{
  const e=battle(3);
  const copy=JSON.parse(JSON.stringify(e.export())).session;
  assert.equal(new E(copy).unit("ena").exhaustion,3);
  copy.units.ena.exhaustion=6;
  assert.throws(()=>new E(copy),/истощения/);
});

test("authored elevations affect steps, reject sheer cliffs and survive reload",()=>{
  const pack=structuredClone(base);
  pack.encounters["marsh-road"].elevation={"D4":5,"E4":15};
  const {engine:e}=createBattle(pack,undefined,123);
  e.initialize();
  const ground={x:2,y:3}, step={x:3,y:3},cliff={x:4,y:3};
  assert.equal(e.s.terrain.elevation["3,3"],5);
  const climb=e.movementStep("ena",ground,step);
  assert.equal(climb.allowed,true);
  assert.equal(climb.cost,10);
  const blocked=e.movementStep("ena",step,cliff);
  assert.equal(blocked.allowed,false);
  assert.match(blocked.reason,/уступ/);
  const saved=JSON.parse(JSON.stringify(e.export())).session;
  assert.equal(new E(saved).elevationAt(step),5);
  saved.terrain.elevation["3,3"]=7;
  assert.throws(()=>new E(saved),/высот/);
});

test("NPCs use a healing potion on a dying adjacent ally",()=>{
  const {CombatTacticalAI:AI}=require("../sdk");
  const e=battle();
  const u=e.unit("ena"),ally=e.unit("tal");
  Object.assign(u,{x:2,y:3,bonus:1,itemTypes:{healing:"healing"},items:{healing:1}});
  Object.assign(ally,{x:2,y:4,hp:0,dead:false,stable:false});
  const chosen=new AI(e).choose("ena");
  assert.equal(chosen.kind,"healPotion");
  assert.equal(chosen.target,"tal");
  assert.equal(chosen.item,"healing");
});
