"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createBattle,CombatTacticalAI}=require("../sdk");
const base=require("../examples/portable/border-watch.json");
function fight(){
  const {engine:e}=createBattle(structuredClone(base),undefined,901);
  e.initialize();
  e.s.pending=null;e.s.queue=[];e.s.phase="active";
  e.s.index=e.s.order.indexOf("ena");
  const caster=e.unit("ena");
  caster.controlled=false;
  caster.action=1;caster.bonus=1;
  caster.items={healing:2};caster.itemTypes={healing:"healing"};
  return e;
}
test("AI uses bonus-action potion on a nearby unconscious ally",()=>{
  const e=fight(), a=e.unit("ena"), b=e.unit("tal");
  Object.assign(b,{x:a.x,y:a.y+1,hp:0,dead:false,stable:false});
  const cmd=new CombatTacticalAI(e).plan("ena");
  assert.equal(cmd.kind,"healPotion");
  assert.equal(cmd.target,"tal");
  assert.equal(cmd.item,"healing");
});
test("AI uses healing potion on itself only at critical HP, without an ally in need",()=>{
  const e=fight(), a=e.unit("ena");
  Object.assign(a,{hp:Math.floor(a.max*0.3),max:a.max});
  const cmd=new CombatTacticalAI(e).plan("ena");
  assert.equal(cmd.kind,"healPotion");
  assert.equal(cmd.target,"ena");
});
test("AI does not use healing potion if ally is out of reach and self is healthy",()=>{
  const e=fight(), a=e.unit("ena"), b=e.unit("tal");
  Object.assign(b,{x:10,y:5,hp:0,dead:false,stable:false});
  a.hp=a.max;
  const cmd=new CombatTacticalAI(e).plan("ena");
  assert.notEqual(cmd.kind,"healPotion");
});
