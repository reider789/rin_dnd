"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createBattle,CombatRulesEngine:E}=require("../sdk");
const sample=require("../examples/portable/border-watch.json");

function arena() {
  const p=structuredClone(sample);
  const scene=p.encounters[p.default_encounter];
  scene.elevation={"C4":0,"D4":5,"E4":10,"F4":20};
  const {engine:e}=createBattle(p,undefined,777);
  e.initialize();
  e.s.pending=null;e.s.queue=[];e.s.phase="active";
  e.s.index=e.s.order.indexOf("ena");
  e.unit("ena").move=30;
  e.unit("ena").controlled=true;
  e.unit("ena").policies={heroic:false,luck:false,defenseLuck:false,sneak:true};
  return e;
}
test("height map is loaded and normal flat map remains compatible",()=>{
  const e=arena();
  assert.equal(e.elevationAt({x:3,y:3}),5);
  assert.equal(e.distance({x:2,y:3},{x:3,y:3}),5);
  assert.equal(e.distance({x:3,y:3},{x:5,y:3}),15);
});
test("elevated step charges the exact same cost on planning and execution",()=>{
  const e=arena(), u=e.unit("ena");
  const start={x:u.x,y:u.y},target={x:3,y:3};
  assert.deepEqual(start,{x:2,y:3});
  const step=e.movementStep("ena",start,target);
  assert.equal(step.allowed,true);
  assert.equal(step.cost,e.stepCost("ena",target)+5);
  e.dispatch({kind:"move",actor:"ena",path:[target]});
  assert.equal(u.x,3);assert.equal(u.y,3);
  assert.equal(u.move,30-step.cost);
  assert.ok(e.s.events.some(v=>v.type==="move" && v.cost===step.cost));
});
test("a sheer 10-foot ledge is denied while 5-foot climb passes",()=>{
  const e=arena();
  const ledge=e.movementStep("ena",{x:4,y:3},{x:5,y:3});
  assert.equal(ledge.allowed,false);
  assert.match(ledge.reason,/уступ/);
});
test("corrupt height maps never overwrite a valid session",()=>{
  const e=arena();
  const saved=structuredClone(e.export().session);
  const ok=new E(saved);
  assert.equal(ok.elevationAt({x:3,y:3}),5);
  const corrupted=structuredClone(saved);
  corrupted.terrain.elevation["-1,3"]=5;
  assert.throws(()=>new E(corrupted),/высот/);
});
