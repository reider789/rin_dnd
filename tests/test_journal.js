"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {createBattle,CombatRulesEngine:E,CombatMagic:M,CombatJournal:J} = require("../sdk");
const base=require("../examples/portable/border-watch.json");
function setup(actor="ena") {
  const {engine:e}=createBattle(base,undefined,417); e.initialize();
  Object.assign(e.s,{queue:[],pending:null,effects:[],spellFrames:{},events:[],zones:[],objects:{}});
  e.s.index=e.s.order.indexOf(actor); e.s.terrain.walls=[]; e.s.terrain.cover={};
  for(const u of Object.values(e.s.units)) Object.assign(u,{hp:100,max:100,features:{},
    statuses:[],controlled:false,policies:{},action:1,bonus:1,reaction:1,move:30,
    luck:0,heroic:0,temp:0,immunities:[],resistances:[],vulnerabilities:[],
    attacks:[{id:"blade",name:"Клинок",kind:"melee",range:5,bonus:5,flat:4,count:1,die:8,damageType:"piercing"}]});
  Object.assign(e.unit("ena"),{x:2,y:2,controlled:true});
  Object.assign(e.unit("tal"),{x:1,y:5});
  Object.assign(e.unit("hunter_a"),{x:3,y:2});
  Object.assign(e.unit("hunter_b"),{x:8,y:6});
  return e;
}
const reload=e=>new E(JSON.parse(JSON.stringify(e.export())).session);
const choose=(e,choice)=>e.dispatch({kind:"decide",id:e.s.pending.id,choice});
const attack=(e,actor="ena",target="hunter_a")=>e.dispatch({kind:"attack",actor,target,weapon:"blade"});
function caster(e,id) {
  Object.assign(e.unit(id),{casting:{ability:"INT",attack:9,dc:17,level:5,
    prepared:["counterspell"],cantrips:["fireBolt"],components:{}},
    slots:{3:{current:3,max:3}}});
}
test("journal explains the exact damage order across a saved defensive reaction",()=>{
  let e=setup("hunter_a"); Object.assign(e.unit("ena"),{temp:1,resistances:["piercing"],
    features:{heavyArmor:true,heavyArmorReduction:2,uncannyDodge:true}});
  e.s.random.tape=[15,8]; const draws=e.s.random.draws;
  attack(e,"hunter_a","ena"); assert.equal(e.s.pending.kind,"uncannyDodge");
  const root=e.s.pending.trace.actionId, saved=JSON.stringify(e.export());
  e=reload(e); assert.equal(JSON.stringify(e.export()),saved); choose(e,"yes");
  const damage=e.s.events.findLast(v=>v.type==="damage");
  assert.deepEqual(damage.breakdown.map(x=>[x.rule,x.before,x.after]),[
    ["damage.initial",12,12],["defense.heavyArmor",12,10],
    ["defense.uncannyDodge",10,5],["damage.resistance",5,2]]);
  assert.equal(damage.amount,2); assert.equal(damage.temp,1); assert.equal(damage.hpLost,1);
  assert.equal(e.unit("ena").hp,99); assert.equal(e.s.random.draws-draws,2);
  const decision=e.s.events.find(v=>v.type==="decision");
  assert.equal(decision.trace.parentActionId,root);
  assert.equal(damage.trace.actionId,root);
  assert.match(J.text(e.s.events),/Тяжёлый доспех: 12 → 10/);
});
test("counter-counterspell retains distinct parent actions and resumes the original spell after reload",()=>{
  let e=setup(); caster(e,"ena"); caster(e,"hunter_a");
  e.unit("hunter_a").x=6;
  e.s.random.tape=[5,15,3,3];
  e.dispatch({kind:"cast",actor:"ena",spell:"fireBolt",target:"hunter_a"});
  assert.equal(e.s.pending.choice,"counterspell"); assert.equal(e.s.pending.actor,"ena");
  const casts=e.s.events.filter(v=>v.type==="cast"), root=casts[0].trace.actionId;
  assert.equal(casts[1].trace.parentActionId,root);
  const second=casts[1].trace.actionId;
  e=reload(e); choose(e,"yes");
  const third=e.s.events.filter(v=>v.type==="cast")[2];
  assert.equal(third.trace.parentActionId,second);
  assert.equal(third.trace.rootActionId,root);
  assert.equal(e.s.events.find(v=>v.type==="spellResolved"&&v.spell==="fireBolt").trace.actionId,root);
  assert.ok(e.s.events.some(v=>v.type==="damage"&&v.actor==="hunter_a"));
  assert.equal(e.s.pending,null);
});
test("journal records existing Bless dice and all save modifiers without extra RNG",()=>{
  let e=setup();
  M.add(e,{actor:"ena",spell:"bless",level:1},"bless",["ena"],60);
  Object.assign(e.unit("ena"),{mindSliver:{until:99},heroic:1,policies:{heroic:true}});
  e.s.random.tape=[3,2,10]; const draws=e.s.random.draws;
  e.enqueue(e.saveTask("ena","WIS",14,{kind:"checkResult",actor:"ena",dc:14}));e.run();
  assert.equal(e.s.pending.kind,"roll"); e=reload(e); choose(e,"accept");
  const roll=e.s.events.findLast(v=>v.type==="roll");
  assert.equal(roll.bonusParts.reduce((n,b)=>n+b.amount,0),roll.bonus);
  assert.deepEqual(roll.bonusParts.filter(b=>b.rolls).map(b=>[b.rule,b.amount,b.rolls]),[
    ["spell.bless",3,[3]],["spell.mindSliver",-2,[2]]]);
  assert.equal(roll.dc,14); assert.equal(e.s.random.draws-draws,3);
  const before=JSON.stringify(e.s); J.text(e.s.events); J.details(roll);
  assert.equal(JSON.stringify(e.s),before);
});
test("a failed command or stale decision adds neither journal entries nor action IDs",()=>{
  const e=setup(); e.s.random.tape=[10];
  e.dispatch({kind:"check",actor:"ena",stat:"WIS",dc:12});
  const before=JSON.stringify(e.s);
  assert.throws(()=>e.dispatch({kind:"decide",id:"stale",choice:"yes"}));
  assert.equal(JSON.stringify(e.s),before);
  assert.throws(()=>e.dispatch({kind:"attack",actor:"ena",target:"hunter_b",weapon:"blade"}));
  assert.equal(JSON.stringify(e.s),before);
});
test("automatic opportunity attack has its own cause and movement resumes in the root action",()=>{
  const e=setup(); e.s.random.tape=[2];
  e.dispatch({kind:"move",actor:"ena",path:[{x:1,y:2},{x:0,y:2}]});
  const hit=e.s.events.find(v=>v.type==="attack");
  assert.equal(hit.trace.command,"reaction"); assert.equal(hit.trace.actor,"hunter_a");
  const move=e.s.events.findLast(v=>v.type==="move");
  assert.ok(move); assert.equal(move.trace.actionId,hit.trace.parentActionId);
});
test("concentration detail uses damage after resistance, including absorption by temporary HP",()=>{
  const e=setup("hunter_a");
  M.add(e,{actor:"ena",spell:"bless",level:1},"bless",["ena"],60);
  Object.assign(e.unit("ena"),{temp:50,resistances:["piercing"]});
  e.s.random.tape=[15,8,2,10]; attack(e,"hunter_a","ena");
  const c=e.s.events.find(v=>v.type==="concentration");
  assert.equal(c.damage,6); assert.equal(c.dc,10); assert.equal(e.unit("ena").hp,100);
  assert.match(J.details(c).join(" "),/Полученный урон: 6/);
});
test("uninterrupted play and checkpoint/reload produce exactly equal state and journal",()=>{
  const original=setup("hunter_a"); original.unit("ena").features.uncannyDodge=true;
  original.s.random.tape=[15,8]; attack(original,"hunter_a","ena");
  const resumed=reload(original); choose(original,"yes");choose(resumed,"yes");
  assert.deepEqual(resumed.export(),original.export());
});
test("legacy events remain readable, and malformed continuation traces fail before loading",()=>{
  assert.equal(J.text([{round:2,type:"roll",text:"Старый бросок"}]),"Раунд 2. Старый бросок");
  const e=setup("hunter_a");e.unit("ena").features.uncannyDodge=true;
  e.s.random.tape=[15,8]; attack(e,"hunter_a","ena");
  const state=structuredClone(e.s); state.pending.trace.actionId="invalid";
  const before=JSON.stringify(state); assert.throws(()=>new E(state),/связь событий/);
  assert.equal(JSON.stringify(state),before);
});

test("Indomitable's reroll records its level bonus and does not hide it in the total",()=>{
  const e=setup();e.unit("ena").features={indomitable:true,fighterLevel:10};
  e.unit("ena").counters.indomitable={current:1,max:1};e.s.random.tape=[1,10];
  e.enqueue(e.saveTask("ena","WIS",15,{kind:"checkResult",actor:"ena",dc:15}));e.run();
  assert.equal(e.s.pending.ability,"indomitable");choose(e,"yes");
  const r=e.s.events.findLast(v=>v.type==="roll");
  assert.equal(r.bonusParts.find(b=>b.rule==="feature.indomitable").amount,10);
  assert.equal(r.bonusParts.reduce((n,b)=>n+b.amount,0),r.bonus);
});
test("Precision Attack reports the added superiority die in the final attack",()=>{
  const e=setup();e.unit("ena").features={maneuvers:["precision"],superiorityDie:8};
  e.unit("ena").counters.superiority={current:1,max:1};
  e.unit("hunter_a").ac=17; e.s.random.tape=[10,3,4];attack(e);
  assert.equal(e.s.pending.kind,"precision");choose(e,"yes");
  const a=e.s.events.findLast(v=>v.type==="attack");
  assert.equal(a.hit,true);
  assert.deepEqual(a.bonusParts.find(b=>b.rule==="maneuver.precision").rolls,[3]);
  assert.match(J.details(a).join(" "),/Точная атака: \+3/);
});
test("Luck cancels disadvantage in the roll's displayed sources too",()=>{
  const e=setup();e.unit("ena").luck=1;e.unit("ena").policies.luck=true;
  e.status("ena","poisoned"); e.s.random.tape=[12,3];
  e.dispatch({kind:"check",actor:"ena",stat:"WIS",dc:12});choose(e,"luck");choose(e,"accept");
  const r=e.s.events.findLast(v=>v.type==="roll");
  assert.equal(r.mode,0);assert.ok(r.modifiers.advantage.includes("Удача"));
  assert.match(J.details(r).join(" "),/отменяют друг друга/);
});
