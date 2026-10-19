"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict"),path=require("node:path"),{performance}=require("node:perf_hooks");
if(!process.argv[2])throw Error("Usage: node tools/benchmark_path.js /path/to/baseline-checkout");
function load(root){const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,"core/battlefield.js"),"utf8")+"\nthis.Field=CombatBattlefield",context);return context.Field;}
const Old=load(process.argv[2]),New=load(path.join(__dirname,".."));
function options(w,h,walls=new Set(),rubble=new Set()){return{walls,rubble,key:(x,y)=>x+","+y,occupant:()=>null,actor:()=>({x:0,y:0}),webDifficult:()=>false,width:w,height:h,movementRisk:(a,b)=>b.x===4&&a.x===3?1:0};}
let seed=4242;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<60;i++){const walls=new Set(),rubble=new Set();for(let y=0;y<8;y++)for(let x=0;x<11;x++){if(!x&&!y||x===10&&y===7)continue;const v=random();if(v<.17)walls.add(x+","+y);else if(v<.38)rubble.add(x+","+y);}const o=options(11,8,walls,rubble),goal={x:10,y:7};assert.equal(JSON.stringify(new Old(o).findPath(goal)),JSON.stringify(new New(o).findPath(goal)));}
const rows=[];
for(const [w,h] of [[11,8],[20,20],[40,40]]){
 const before=new Old(options(w,h)),after=new New(options(w,h)),goal={x:w-1,y:h-1},row={size:w+"x"+h};
 for(const [label,field] of [["before",before],["after",after]]){for(let i=0;i<3;i++)field.findPath(goal);const times=[];for(let i=0;i<15;i++){const start=performance.now();field.findPath(goal);times.push(performance.now()-start);}row[label+"_ms"]=+times.sort((a,b)=>a-b)[7].toFixed(3);}
 rows.push(row);
}
console.log(JSON.stringify({node:process.version,equivalent_random_maps:60,rows},null,2));
