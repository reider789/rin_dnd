"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createBattle,CombatTacticalAI,CombatRulesEngine}=require("../sdk");
const original=require("../examples/portable/border-watch.json");
function make(){
 const pack=structuredClone(original);
 pack.profiles.vine={name:"Нитяной удушитель",hp:91,ac:14,speed:10,proficiency:3,size:3,footprint:2,
   scores:{STR:18,DEX:10,CON:16,INT:1,WIS:12,CHA:3},
   conditionImmunities:["charmed","frightened"],senses:{blindsight:30},
   features:{extraAttack:2},attacks:[{id:"vines",name:"Лозы",kind:"melee",bonus:7,
     count:1,die:8,flat:4,damageType:"bludgeoning",range:15,
     grappleOnHit:{dc:15,maxTargets:2,reach:15,vineHP:12,vineAC:14},
     constrict:{count:2,die:8,flat:0,damageType:"bludgeoning"}}]};
 pack.encounters["marsh-road"].enemies[0].profile="vine";
 const {engine:e}=createBattle(pack);
 e.initialize();
 Object.assign(e.unit("hunter_a"),{x:4,y:3});
 Object.assign(e.unit("ena"),{x:3,y:3});
 Object.assign(e.unit("tal"),{x:2,y:4});
 e.s.index=e.s.order.indexOf("hunter_a");
 e.enqueue({kind:"startTurn"});e.run();return e;
}
test("Large strangler occupies four squares and uses nearest edge for reach",()=>{
 const e=make(),a=e.unit("hunter_a");
 assert.equal(e.occupied(a.x,a.y),"hunter_a");
 assert.equal(e.occupied(a.x+1,a.y),"hunter_a");
 assert.equal(e.occupied(a.x,a.y+1),"hunter_a");
 assert.equal(e.occupied(a.x+1,a.y+1),"hunter_a");
 assert.equal(e.distance(a,{x:a.x+2,y:a.y}),5);
 assert.equal(e.movementStep("hunter_a",{x:9,y:4},{x:10,y:4}).allowed,false,
   "cannot push 2x2 actor beyond east edge");
});
test("strangler attack +7 deals 1d8+4 and grapples target up to 15 ft",()=>{
 const e=make();e.s.random.tape=[19,6];
 e.dispatch({kind:"attack",actor:"hunter_a",target:"ena",weapon:"vines"});
 assert.ok(e.unit("ena").hp<38,"damage delivered");
 const z=e.unit("ena").statuses.find(x=>x.kind==="grappled");
 assert.equal(z?.source,"hunter_a");
 assert.equal(z?.dc,15);assert.equal(z?.reach,15);
 assert.equal(z?.vineHP,12);
 assert.equal(e.unit("hunter_a").attacksLeft,1,"second strike remains");
});
test("squeeze is a full separate action, with roll and no fresh strikes",()=>{
 const e=make();e.unit("ena").statuses.push({kind:"grappled",source:"hunter_a",dc:15,reach:15,vineHP:12,vineAC:14});
 e.s.random.tape=[3,4];const before=e.unit("ena").hp;
 e.dispatch({kind:"constrict",actor:"hunter_a"});
 assert.equal(e.unit("ena").hp,before-7);
 assert.equal(e.unit("hunter_a").action,0);
 assert.equal(e.unit("hunter_a").attacksLeft,0);
});
test("cutting a vine is independent of creature health, saving resumes",()=>{
 const e=make();e.unit("ena").statuses.push({kind:"grappled",source:"hunter_a",dc:15,reach:15,vineHP:12,vineAC:14});
 e.s.index=e.s.order.indexOf("ena");e.enqueue({kind:"startTurn"});e.run();
 const hp=e.unit("hunter_a").hp;
 e.s.random.tape=[19,6];e.dispatch({kind:"cutVine",actor:"ena",target:"ena",weapon:"sword"});
 assert.equal(e.unit("hunter_a").hp,hp);
 assert.ok(e.unit("ena").statuses.some(z=>z.kind==="grappled")===true,"6+2 does not sever 12 HP");
 e.s.random.tape=[19,6];e.dispatch({kind:"cutVine",actor:"ena",target:"ena",weapon:"sword"});
 assert.equal(e.unit("hunter_a").hp,hp);
 assert.ok(!e.unit("ena").statuses.some(z=>z.kind==="grappled"),"vine severed");
});
test("AI can choose separate squeeze after taking a victim",()=>{
 const e=make();e.unit("ena").statuses.push({kind:"grappled",source:"hunter_a",dc:15,reach:15,vineHP:12,vineAC:14});
 assert.equal(new CombatTacticalAI(e).choose("hunter_a").kind,"constrict");
});
test("vine mechanics survive session export and import",()=>{
 const e=make();e.unit("ena").statuses.push({kind:"grappled",source:"hunter_a",dc:15,reach:15,vineHP:12,vineAC:14});
 const restored=new CombatRulesEngine(JSON.parse(JSON.stringify(e.export())).session);
 assert.equal(restored.unit("ena").statuses.find(z=>z.kind==="grappled").vineHP,12);
});
