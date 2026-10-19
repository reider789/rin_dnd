"use strict";
// Same workload may be run against a separate checkout to compare releases.
const fs = require("node:fs"), path = require("node:path"), { performance } = require("node:perf_hooks");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const { createBattle } = require(path.join(root, "sdk"));
const pack = JSON.parse(fs.readFileSync(path.join(root, "examples/portable/class-defense-lab.json")));
function median(fn) {
  const samples = [];
  for (let i=0;i<35;i++) { const start=performance.now();fn();if(i>=5)samples.push(performance.now()-start); }
  return +samples.sort((a,b)=>a-b)[samples.length>>1].toFixed(3);
}
const rows = [];
for (const count of [100,1000,5000,15000]) {
  const { engine:e }=createBattle(pack);e.initialize();
  for(let i=e.s.events.length;i<count;i++) e.emit("benchmark","ena","Проверка журнала",{result:{rolls:[12,6],total:18}});
  rows.push({events:count,dispatch_ms:median(()=>e.dispatch({kind:"policy",policy:"sneak",enabled:true})),save_json_ms:median(()=>JSON.stringify(e.export({clone:false}))),bytes:JSON.stringify(e.export({clone:false})).length});
}
console.log(JSON.stringify({node:process.version,engine:require(path.join(root,"core/capabilities")).CombatCapabilities.ENGINE,rows},null,2));
