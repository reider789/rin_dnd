"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBattle,CombatRulesEngine:E,CombatMagic:M,CombatCampaignAdapter:A,CombatContinuity:C}=require('../sdk');
const base=require('../examples/portable/border-watch.json');
const pool=n=>({current:n,max:n});
function turn(e,id){e.s.index=e.s.order.indexOf(id);e.enqueue({kind:'startTurn'});e.run();}
function setup(){
 const p=structuredClone(base);
 p.profiles.caster={name:'Заклинатель',hp:100,ac:12,speed:30,scores:{STR:10,DEX:14,CON:14,INT:20,WIS:14,CHA:14},proficiency:4,features:{},equipment:{},attacks:[{id:'staff',name:'Посох',kind:'melee',range:5,bonus:5,flat:1,count:1,die:6,damageType:'bludgeoning'}],casting:{ability:'INT',attack:11,dc:19,level:10,prepared:['web','aid','bless','wardingBond','dispelMagic','findSteed','bigbyHand'],cantrips:['fireBolt'],components:{wardingBond:true}}};
 p.characters.ena.profile='caster';p.characters.ena.resources={hp:pool(100),spell_slots:Object.fromEntries([1,2,3,4,5].map(n=>[n,pool(5)]))};p.profiles.scout.features={};
 const {engine:e}=createBattle(p);e.initialize();
 for(const id of e.s.order){const u=e.unit(id);u.controlled=false;u.policies={heroic:false,luck:false,defenseLuck:false,sneak:false};}
 e.unit('ena').controlled=true;e.s.terrain.walls=[];e.s.terrain.rubble=[];e.s.terrain.cover={};
 Object.assign(e.unit('ena'),{x:2,y:3});Object.assign(e.unit('tal'),{x:2,y:4});Object.assign(e.unit('hunter_a'),{x:6,y:3,hp:200,max:200});Object.assign(e.unit('hunter_b'),{x:7,y:5,hp:200,max:200});turn(e,'ena');e.s.random.tape=Array(300).fill(5);return e;
}
const reload=e=>new E(JSON.parse(JSON.stringify(e.export())).session);
function decide(e,choice){e.dispatch({kind:'decide',id:e.s.pending.id,choice});}
function cast(e,spell,data={}){e.dispatch({kind:'cast',actor:e.actorId,spell,...data});}
function add(e,kind,targets,duration=60,extra={}){return M.add(e,{actor:'ena',spell:kind in M.SPELLS?kind:'item',level:kind==='aid'?2:3},kind,targets,duration,extra);}
function ended(e){for(const u of Object.values(e.s.units))if(u.team==='enemies')u.fled=true;e.checkEnd();return A.outcome(e.s);}

test('C02: native Web restraint round-trips through the strict report contract',()=>{
 let e=setup();cast(e,'web',{point:{x:3,y:4}});e.s.random.tape=[1];turn(e,'tal');assert(e.has('tal','restrained'));
 const r=ended(e);C.validateReport(r);
 // Report validation must not alter its original payload.
 const copy=structuredClone(r);C.validateReport(r);assert.deepEqual(r,copy);
 for(const change of [z=>z.source='tal',z=>z.dc++,z=>z.until--,z=>z.kind='poisoned']){
  const bad=structuredClone(r);change(bad.continuity.statuses.tal[0]);assert.throws(()=>C.validateReport(bad),/Нет эффекта состояния/);
 }
 const absent=structuredClone(r);absent.continuity.zones=[];assert.throws(()=>C.validateReport(absent),/Нет эффекта состояния/);
});
for(const choice of ['no','yes'])test(`C04: both approach reactions resume after ${choice}, including last step and reload`,()=>{
 let e=setup();Object.assign(e.unit('hunter_a'),{x:4,y:3});e.unit('tal').controlled=true;
 for(const id of ['ena','tal']){turn(e,id);e.dispatch({kind:'ready',actor:id,trigger:'approach',weapon:e.unit(id).attacks[0].id});}
 turn(e,'hunter_a');e.dispatch({kind:'move',actor:'hunter_a',path:[{x:3,y:3}]});
 assert.equal(e.s.pending.kind,'ready');const first=e.s.pending.actor;e=reload(e);decide(e,choice);
 assert.equal(e.s.pending.kind,'ready');assert.notEqual(e.s.pending.actor,first);e=reload(e);decide(e,'no');
 assert.equal(e.s.pending,null);assert.equal(e.unit(first).reaction,choice==='yes'?0:1);
 assert.equal(e.s.events.filter(x=>x.type==='move').length,1);
});
for(const mode of ['ordinary','haste','spell','opportunity'])test(`C04: ${mode} attacks all offer attackAlly once`,()=>{
 let e=setup();Object.assign(e.unit('hunter_a'),{x:3,y:3});const v=e.unit('hunter_b');Object.assign(v,{x:3,y:2,controlled:true});
 v.ready={trigger:'attackAlly',spec:e.attackSpec('hunter_b',v.attacks[0].id)};e.s.random.tape=[18,5,4];
 if(mode==='haste'){add(e,'haste',['ena'],60,{concentration:false,noLethargy:true});e.unit('ena').hasteAction=1;e.dispatch({kind:'hasteAction',actor:'ena',action:'attack',weapon:'staff',target:'hunter_a'});}
 else if(mode==='spell')cast(e,'fireBolt',{target:'hunter_a'});
 else if(mode==='opportunity'){e.unit('ena').controlled=false;turn(e,'hunter_a');e.dispatch({kind:'move',actor:'hunter_a',path:[{x:4,y:3}]});}
 else e.dispatch({kind:'attack',actor:'ena',weapon:'staff',target:'hunter_a'});
 assert.equal(e.s.pending?.kind,'ready');e=reload(e);decide(e,'no');assert.equal(e.s.pending,null);assert.equal(e.unit('hunter_b').reaction,1);assert.equal(e.unit('hunter_b').ready,null);
});
for(const first of [true,false])test(`C05: Leaf Step preserves all Dash movement (${first?'before':'after'} Dash)`,()=>{
 const e=setup();e.unit('ena').counters.leaf_charges=pool(2);
 if(first)e.dispatch({kind:'leafStep',actor:'ena'});e.dispatch({kind:'dash',actor:'ena'});if(!first)e.dispatch({kind:'leafStep',actor:'ena'});
 assert.equal(e.unit('ena').move,70);assert.equal(e.unit('ena').counters.leaf_charges.current,1);
});
test('C05: Leaf Step cannot grant movement while grappled, and slow debt is preserved',()=>{
 const e=setup();e.unit('ena').counters.leaf_charges=pool(2);Object.assign(e.unit('hunter_a'),{x:3,y:3});e.status('ena','grappled',{source:'hunter_a'});
 e.dispatch({kind:'leafStep',actor:'ena'});assert.equal(e.unit('ena').move,0);assert.equal(e.speed('ena'),0);
});
for(const innate of [false,true])test(`C06: Bond and fire potion apply one resistance, innate=${innate}`,()=>{
 const e=setup();cast(e,'wardingBond',{target:'tal'});add(e,'fireResistance',['tal'],3600,{concentration:false});if(innate)e.unit('tal').resistances=['fire'];
 e.enqueue({kind:'damage',actor:'hunter_a',target:'tal',amount:20,damageType:'fire'});e.run();assert.equal(e.unit('tal').hp,17);assert.equal(e.unit('ena').hp,90);
});
test('C06: mixed types and vulnerability keep their order, one reflection packet',()=>{
 const e=setup();cast(e,'wardingBond',{target:'tal'});add(e,'fireResistance',['tal'],3600,{concentration:false});e.unit('tal').vulnerabilities=['fire'];
 e.enqueue({kind:'damage',actor:'hunter_a',target:'tal',amount:21,damageType:'fire',components:[{amount:11,damageType:'fire'},{amount:10,damageType:'cold'}]});e.run();
 assert.equal(e.unit('tal').hp,12);assert.equal(e.unit('ena').hp,85);assert.equal(e.s.events.filter(x=>x.type==='damage').length,2);
});
for(const way of ['expire','remove','report'])test(`C07: wounded Aid loses current and maximum HP on ${way}`,()=>{
 const e=setup();e.unit('tal').hp=10;cast(e,'aid',{target:'tal'});assert.equal(e.unit('tal').hp,15);const x=M.effects(e,'tal','aid')[0];
 if(way==='remove')M.remove(e,[x.id]);else if(way==='expire'){e.s.elapsed=28800;turn(e,'ena');}
 else {e.s.elapsed=28794;const r=ended(e);assert.deepEqual(r.after.tal.hp,{current:10,max:27});C.validateReport(r);return;}
 assert.deepEqual([e.unit('tal').hp,e.unit('tal').max],[10,27]);M.remove(e,[x.id]);assert.equal(e.unit('tal').hp,10);
});
test('C07: stronger Aid adds only its difference without an intermediate collapse',()=>{
 const e=setup();e.unit('tal').hp=10;cast(e,'aid',{targets:['ena','tal']});e.unit('tal').hp=3;
 e.unit('tal').casting=structuredClone(e.unit('ena').casting);add(e,'bless',['tal']);const before=e.s.effects.find(x=>x.kind==='bless').id;
 turn(e,'ena');cast(e,'aid',{target:'tal',level:3});assert.equal(e.unit('tal').hp,8);assert.equal(e.unit('tal').max,37);assert(!e.has('tal','unconscious'));assert(e.s.effects.some(x=>x.id===before));assert.equal(e.unit('ena').max,105);
});
test('C07: expiry at zero ends concentration and grapples but causes no damage/death failure',()=>{
 const e=setup();cast(e,'aid',{target:'ena'});e.unit('ena').hp=3;e.unit('ena').deathSaves=true;add(e,'bless',['tal']);e.status('tal','grappled',{source:'ena'});
 e.s.elapsed=28800;turn(e,'tal');assert.equal(e.unit('ena').hp,0);assert(e.has('ena','unconscious'));assert(e.has('ena','prone'));assert.equal(Boolean(e.unit('ena').dead),false);assert.equal(e.unit('ena').deathFailures||0,0);assert(!M.concentrating(e,'ena'));assert(!e.has('tal','grappled'));E.validate(e.s);
});
test('C08: actual 30.5.1 defensive checkpoint migrates the whole hit once',()=>{
 let e=new E(structuredClone(require('./fixtures/legacy-30.5.1-damage.json').session));assert.equal(e.s.pending.kind,'uncannyDodge');assert.equal(e.s.pending.damage.amount,10);
 e=reload(e);decide(e,'yes');assert.equal(e.unit('hunter_a').hp,195);assert.equal(e.s.events.filter(x=>x.type==='damage').length,1);assert.equal(e.s.engineVersion,E.VERSION);
});
test('C08: already-applied legacy base is never repeated during a rider roll',()=>{
 let e=new E(structuredClone(require('./fixtures/legacy-30.5.1-mantle-roll.json').session));assert.equal(e.unit('hunter_a').hp,194);assert.equal(e.s.pending.kind,'roll');e=reload(e);decide(e,'accept');assert.equal(e.unit('hunter_a').hp,190);assert.equal(e.s.events.filter(x=>x.type==='damage').length,2);
});
test('C08: legacy armor reduction is reconstructed from the already-rolled base, not applied twice',()=>{
 const s=structuredClone(require('./fixtures/legacy-30.5.1-damage.json').session);
 Object.assign(s.units.hunter_a.features,{heavyArmor:true,heavyArmorReduction:4});
 // 30.5.1 reduced the base before Dodge without retaining an armor flag.
 s.pending.damage.amount=2;
 let e=new E(s);assert.equal(e.s.pending.damage.amount,6);e=reload(e);decide(e,'yes');assert.equal(e.unit('hunter_a').hp,197);
});
test('C09: immune grapples/prone are rejected atomically; generic statuses also respect immunity',()=>{
 const e=setup();Object.assign(e.unit('hunter_a'),{x:3,y:3,conditionImmunities:['grappled','prone']});const before=e.export();
 for(const kind of ['grapple','shove'])assert.throws(()=>e.dispatch({kind,actor:'ena',target:'hunter_a'}),/невосприимчива/);
 assert.deepEqual(e.export(),before);e.status('hunter_a','grappled',{source:'ena'});assert(!e.has('hunter_a','grappled'));
 assert(e.availableAction({kind:'shove',actor:'ena',target:'hunter_a',push:true}).enabled);
});
test('C09: fear checks every leg and still applies without line of sight',()=>{
 const e=setup();e.status('ena','frightened',{source:'hunter_a'});const before=e.export();
 for(const path of [[{x:1,y:3},{x:2,y:3}],[{x:3,y:3}]])assert.throws(()=>e.dispatch({kind:'move',actor:'ena',path}),/источнику страха/);
 assert.deepEqual(e.export(),before);e.unit('hunter_a').hidden=true;assert.throws(()=>e.dispatch({kind:'move',actor:'ena',path:[{x:3,y:3}]}),/источнику страха/);
});
test('C09: petrification zeros speed, fails physical saves, resists once, prevents poison and grants attack advantage',()=>{
 const e=setup();e.status('ena','petrified');assert.equal(e.speed('ena'),0);assert.equal(e.unit('ena').move,0);
 for(const stat of ['STR','DEX'])assert(e.saveTask('ena',stat,15,{kind:'checkResult',actor:'ena'}).autoFail);
 assert.equal(e.attackModifiers('hunter_a','ena',e.unit('hunter_a').attacks[0]).adv,true);e.status('ena','poisoned');assert(!e.has('ena','poisoned'));
 e.unit('ena').resistances=['fire'];e.enqueue({kind:'damage',actor:'hunter_a',target:'ena',amount:20,damageType:'fire'});e.run();assert.equal(e.unit('ena').hp,90);
});
test('C10: growth changes effective size, grapple limits and expires at 600 seconds after reload',()=>{
 let e=setup();e.unit('ena').items.growth=1;e.unit('ena').equipment.consumables={growth:'growthPotion'};Object.assign(e.unit('hunter_a'),{x:3,y:3,size:4});
 assert(!e.availableAction({kind:'grapple',actor:'ena',target:'hunter_a'}).enabled);e.dispatch({kind:'useItem',actor:'ena',item:'growth'});assert.equal(e.size('ena'),3);assert(e.availableAction({kind:'grapple',actor:'ena',target:'hunter_a'}).enabled);
 e=reload(e);e.s.elapsed=599;turn(e,'ena');assert.equal(e.size('ena'),3);e.s.elapsed=600;turn(e,'ena');assert.equal(e.size('ena'),2);assert.equal(e.unit('ena').items.growth,0);
});
test('C10: enlarged Huge targets become Gargantuan and Tiny grapplers retain their true limit',()=>{
 const e=setup();Object.assign(e.unit('hunter_a'),{x:3,y:3,size:4});add(e,'enlarge',['hunter_a']);assert.equal(e.size('hunter_a'),5);e.unit('ena').size=0;assert(!e.availableAction({kind:'grapple',actor:'ena',target:'hunter_a'}).enabled);
});
test('C04/C09: resumed movement stops when a reaction changes position or creates fear',()=>{
 for(const mode of ['position','fear']){
  let e=setup();const watcher=e.unit('hunter_a');watcher.controlled=true;watcher.ready={trigger:'approach',spec:{...watcher.attacks[0],kind:'ranged',range:60}};
  e.dispatch({kind:'move',actor:'ena',path:[{x:3,y:3},{x:4,y:3}]});assert.equal(e.s.pending.kind,'ready');
  if(mode==='position')Object.assign(e.unit('ena'),{x:1,y:3});else e.status('ena','frightened',{source:'hunter_a'});
  e=reload(e);decide(e,'no');assert.equal(e.s.pending,null);assert.equal(e.unit('ena').x,mode==='position'?1:3);assert(e.s.events.some(x=>x.type==='movementBlocked'));
 }
});
test('C01: unreadable recovery copies remain exportable and explicitly removable',()=>{
 const {CombatSessionStore:Store}=require('../web/session_store'),data=new Map();
 const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const store=new Store(storage),key='dnd-combat-session:audit:old-unreadable';storage.setItem(key,'{broken');
 assert.deepEqual(store.archive('current'),[[key,'{broken']]);assert.equal(store.stats('current').count,1);store.remove(key,'current');assert.equal(data.size,0);
});
