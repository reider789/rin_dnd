"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {CombatVisualFX:F}=require("../core/visual_fx");
const {createBattle,CombatRulesEngine:E,CombatMagic:M}=require("../sdk");
const base=require("../examples/portable/border-watch.json");
const pool=n=>({current:n,max:n});
function setup(){
  const pack=structuredClone(base);
  pack.profiles.scout.features={};
  const {engine:e}=createBattle(pack); e.initialize();
  for(const id of e.s.order){const u=e.unit(id);u.controlled=false;u.features={};u.policies={heroic:false,luck:false,defenseLuck:false,sneak:false};}
  const u=e.unit("ena");u.controlled=true;
  u.casting={ability:"INT",level:10,attack:11,dc:19,prepared:Object.keys(M.SPELLS).filter(k=>M.SPELLS[k][1]>0),cantrips:["fireBolt","rayFrost","mindSliver"]};
  u.slots=Object.fromEntries([1,2,3,4,5].map(n=>[n,pool(5)]));
  Object.assign(u,{x:2,y:3,hp:100,max:100});
  Object.assign(e.unit("tal"),{x:2,y:4});
  Object.assign(e.unit("hunter_a"),{x:6,y:3,hp:200,max:200});
  Object.assign(e.unit("hunter_b"),{x:8,y:5,hp:200,max:200});
  e.s.terrain.walls=[];e.s.terrain.rubble=[];e.s.terrain.cover={};
  e.s.index=e.s.order.indexOf("ena");e.enqueue({kind:"startTurn"});e.run();
  e.s.random.tape=Array(200).fill(5);return e;
}
function cast(e,spell,extra={}){e.dispatch({kind:"cast",actor:"ena",spell,...extra});}

test("FX: every supported spell has an explicit visual mapping, independent of its translated name",()=>{
  for(const key of Object.keys(M.SPELLS)) assert(F.SPELLS[key],key);
  assert.equal(F.school("piercing","storm_thrower"),"storm");
  assert.equal(F.school("cold"),"ice");assert.equal(F.school("unknown"),"steel");
});
test("FX: event lookup supports sequence gaps and bounds even a 15000-event batch",()=>{
  const events=Array.from({length:15000},(_,i)=>({seq:i*3+1,type:"tactic"}));
  assert.equal(F.since(events,-1).length,F.MAX_EVENTS);
  assert.deepEqual(F.since(events,events.at(-1).seq),[]);
  assert.deepEqual(F.since(events,events.at(-2).seq),events.slice(-1));
  assert.deepEqual(F.since([],0),[]);
});
test("FX: IDs and typed payloads work with duplicate display names, arbitrary text and frozen events",()=>{
  const events=[{seq:1,type:"attack",actor:"first",target:"second",hit:false,
    text:"Совпадающее имя: ПОПАДАНИЕ fireball",attackKind:"ranged",weapon:"bow",damageType:"piercing"}];
  const original=structuredClone(events);Object.freeze(events);Object.freeze(events[0]);
  const [cue]=F.plan(events);assert.equal(cue.source,"first");assert.equal(cue.target,"second");
  assert.equal(cue.hit,false);assert.equal(cue.school,"steel");assert.deepEqual(events,original);
});
test("FX: contiguous movement preserves every actual waypoint without joining across an attack",()=>{
  const move=(seq,from,to)=>({seq,type:"move",actor:"a",from,to});
  const events=[move(1,{x:0,y:0},{x:1,y:0}),move(2,{x:1,y:0},{x:1,y:1}),
    {seq:3,type:"attack",actor:"a",target:"b",hit:true},move(4,{x:1,y:1},{x:2,y:1})];
  const copy=structuredClone(events),p=F.plan(events);
  assert.equal(p.length,3);assert.deepEqual(p[0].path,[{x:0,y:0},{x:1,y:0},{x:1,y:1}]);
  assert.equal(p[1].kind,"attack");assert.equal(p[2].path.length,2);assert.deepEqual(events,copy);
});
test("FX: a casting attempt cannot produce an area, projectile, hit or resolved spell",()=>{
  const p=F.plan([{seq:1,type:"cast",actor:"mage",spell:"fireball",point:{x:4,y:4}}]);
  assert.deepEqual(p.map(c=>c.kind),["cast"]);
});
test("FX: immediate Shadow Arts and non-caster Shield have explicit resolution",()=>{
  for(const event of [{spell:"darkness",point:{x:3,y:4}},{spell:"shield",resolved:true}]){
    const p=F.plan([{seq:1,type:"cast",actor:"a",...event}]);
    assert.deepEqual(p.map(c=>c.kind),["cast","spell"]);
  }
});
test("FX: failed Counterspell does not claim that a spell was interrupted",()=>{
  assert.deepEqual(F.plan([{seq:1,type:"counterspell",actor:"a",target:"b",cancelled:false}]),[]);
  assert.equal(F.plan([{seq:2,type:"counterspell",actor:"a",target:"b",cancelled:true}])[0].kind,"counter");
});
test("FX: passenger teleport preserves both independent origins and destinations",()=>{
  const p=F.plan([{seq:1,type:"teleport",actor:"a",from:{x:1,y:1},to:{x:8,y:1},
    passenger:"b",passengerFrom:{x:1,y:2},passengerTo:{x:8,y:2}}]);
  assert.equal(p.length,2);assert.equal(p[1].source,"b");
  assert.deepEqual(p[1].from,{x:1,y:2});assert.deepEqual(p[1].to,{x:8,y:2});
});
test("FX: mixed damage uses its elemental component; zero healing creates no false recovery",()=>{
  const p=F.plan([{seq:1,type:"damage",actor:"b",source:"a",amount:12,damageType:"slashing",
    components:[{damageType:"slashing",amount:8},{damageType:"fire",amount:4}]},
    {seq:2,type:"heal",actor:"b",amount:0}]);
  assert.equal(p.length,1);assert.equal(p[0].school,"fire");assert.equal(p[0].amount,12);
});
test("FX: actual attacks expose their resolved geometry, weapon kind and result",()=>{
  const e=setup();cast(e,"rayFrost",{target:"hunter_a"});
  const event=e.s.events.find(x=>x.type==="attack");
  assert.equal(event.attackKind,"rangedSpell");assert.equal(event.weapon,"rayFrost");
  assert.deepEqual(event.origin,{x:2,y:3});assert.deepEqual(event.point,{x:6,y:3});
  assert.equal(event.damageType,"cold");assert.equal(event.hit,true);
});
test("FX: actual counterable spell emits resolution once, only after all counter decisions",()=>{
  let e=setup();const v=e.unit("hunter_a");v.controlled=true;
  v.casting={ability:"INT",level:10,attack:8,dc:19,prepared:["counterspell"],cantrips:[]};
  v.slots={3:pool(2)};e.s.random.tape=Array(100).fill(1);
  cast(e,"fireball",{point:{x:6,y:3}});
  assert.equal(e.s.pending.choice,"counterspell");
  assert(!e.s.events.some(x=>x.type==="spellResolved"&&x.spell==="fireball"));
  e=new E(JSON.parse(JSON.stringify(e.export())).session);
  e.dispatch({kind:"decide",id:e.s.pending.id,choice:"yes"});
  assert(e.s.events.some(x=>x.type==="counterspell"&&x.cancelled===true&&x.target==="ena"));
  assert(!e.s.events.some(x=>x.type==="spellResolved"&&x.spell==="fireball"));
  assert(!F.plan(e.s.events).some(x=>x.kind==="spell"&&x.spell==="fireball"));
});
test("FX: actual area resolution contains its exact point and does not consume extra dice",()=>{
  const e=setup();cast(e,"fireball",{point:{x:6,y:3}});
  const events=e.s.events.filter(x=>x.type==="spellResolved"&&x.spell==="fireball");
  assert.equal(events.length,1);assert.deepEqual(events[0].point,{x:6,y:3});
  assert.deepEqual(events[0].origin,{x:2,y:3});assert.equal(events[0].level,3);
  const before=e.export();F.plan(e.s.events);assert.deepEqual(e.export(),before);
});
test("FX: actual healing reports the real capped amount, not rolled or missing HP",()=>{
  const e=setup();e.unit("tal").hp=25;e.heal("tal",100);
  const event=e.s.events.at(-1);assert.equal(event.type,"heal");assert.equal(event.amount,2);
});
test("FX: actual teleport records origin before changing the unit, and reload preserves it",()=>{
  const e=setup();cast(e,"mistyStep",{point:{x:4,y:3}});
  const event=e.s.events.find(x=>x.type==="teleport");
  assert.deepEqual(event.from,{x:2,y:3});assert.deepEqual(event.to,{x:4,y:3});
  assert.deepEqual(new E(e.export().session).s.events.find(x=>x.type==="teleport"),event);
});
test("FX: planner handles old event payloads without reading or interpreting their text",()=>{
  const old=[{seq:1,type:"heal",actor:"a",text:"восстановлено 999 ПЗ"},
    {seq:2,type:"attack",actor:"a",target:"b",hit:false,text:"hit"},
    {seq:3,type:"forcedMove",actor:"b"}];
  const p=F.plan(old);assert.equal(p[0].amount,undefined);assert.equal(p[1].hit,false);
  assert.equal(p.length,2);
});
test("FX: a native blind miss has an explicit point but never invents an occupant",()=>{
  const e=setup();e.unit("ena").attacks=[{id:"bow",name:"Лук",kind:"ranged",range:120,bonus:5,count:1,die:6,flat:1,damageType:"piercing"}];
  e.dispatch({kind:"attackAt",actor:"ena",weapon:"bow",point:{x:8,y:4}});
  const event=e.s.events.find(x=>x.type==="attackMissed");
  assert.deepEqual(event.point,{x:8,y:4});assert.equal(event.attackKind,"ranged");
  const cue=F.plan([event])[0];assert.equal(cue.hit,false);assert.equal(cue.target,undefined);
});
test("FX: native thrown weapons and unarmed attacks have different presentation metadata",()=>{
  for(const unarmed of [false,true]){
    const e=setup();Object.assign(e.unit("hunter_a"),{x:3,y:3});
    e.unit("ena").items.knives=1;
    e.unit("ena").attacks=[{id:"test",name:"Атака",kind:unarmed?"melee":"ranged",range:unarmed?5:60,
      bonus:11,count:1,die:6,flat:1,damageType:"bludgeoning",...(unarmed?{unarmed:true}:{ammoItem:"knives"})}];
    e.dispatch({kind:"attack",actor:"ena",weapon:"test",target:"hunter_a"});
    const event=e.s.events.find(x=>x.type==="attack");assert.equal(event.unarmed,unarmed);
    if(!unarmed){assert.equal(event.projectile,"thrown");assert.equal(e.unit("ena").items.knives,0);}
  }
});
