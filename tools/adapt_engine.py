"""Port Havengard v29 UI/combat source to Rin without deleting original modules.

The original monolithic engine is retained in upstream_snapshot/engine-v29.html.
Adapted engine keeps all v29 capabilities for future actors, hides inaccessible ones from Rin,
and uses Rin-specific handlers in rin_rules.js.
"""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'upstream_snapshot/engine-v29.html').read_text(encoding='utf-8')

def replace(old,new,n=1):
 global s
 count=s.count(old)
 if count!=n: raise RuntimeError(f'Expected {n} marker occurrence, found {count}: {old[:90]}')
 s=s.replace(old,new)

replace('ХЕЙВЕНГАРД · БОЕВОЙ ИНТЕРФЕЙС V29 · В ЧАТЕ','РИН ВЕЙР · БОЕВОЙ ИНТЕРФЕЙС V29 · В ЧАТЕ')
replace('<h2>Старый мост</h2>','<h2>Боевая сцена Рина</h2>')
replace("const $=x=>root.querySelector('#'+x),names={rada:'Рада',daphne:'Дафна',lyutobor:'Лютобор',yar:'Яр',guard:'Страж',archer:'Арбалетчик'},abbr={rada:'Р',daphne:'Д',lyutobor:'Л',yar:'Я',guard:'С',archer:'А'};",
"const $=x=>root.querySelector('#'+x),names={rin:'Рин Вейр',guard_a:'Охранник А',guard_b:'Охранник Б',guard_c:'Охранник В',rada:'Рада',daphne:'Дафна',lyutobor:'Лютобор',yar:'Яр',guard:'Страж',archer:'Арбалетчик'},abbr={rin:'Р',guard_a:'А',guard_b:'Б',guard_c:'В',rada:'Р',daphne:'Д',lyutobor:'Л',yar:'Я',guard:'С',archer:'А'};")
replace("const heroes=['rada','daphne','lyutobor','yar'],foes=['guard','archer'],order=[...heroes,...foes],init=[27,17,13,10,9,3];",
        "const heroes=['rin','guard_a','guard_b','guard_c'],foes=['guard','archer'],order=[...heroes,...foes],init=[18,13,9,8,5,3];")
replace("const fallbackStock={yar:","const fallbackStock={rin:{},guard_a:{},guard_b:{},guard_c:{},yar:")

# Keep historical catalogues and resolver implementations intact, but add Rin's actual weapons.
insert="""
weapons.rin=[['shortsword','«Черта»','+5 · 1к6+3 · Уязвимость',5,1,6,3,5],['dagger','Кинжал','+5 · 1к6+3 · Быстрота',5,1,6,3,20],['unarmed','Безоружный удар','+5 · 1к6+3',5,1,6,3,5],['bow','Короткий лук','+5 · 1к6+3 · 80/320 фт',5,1,6,3,320]];
for(const id of ['guard_a','guard_b','guard_c'])weapons[id]=[['spear','Копьё','+3 · 1к6+1',3,1,6,1,5]];
"""
replace('const featureNames={yar:',insert+'\nconst featureNames={yar:')
replace("for(const id of heroes){if(sourceDetails[id]?.length)featureNames[id]", "featureNames.rin=['Скрытая атака','Уязвимость','Быстрота','Боевые искусства','Шквал ударов','Терпеливая защита','Шаг ветра','Отражение атак','Искусства Тени: Тьма','Малая иллюзия','Удачливый','Бдительный'];\nfor(const id of heroes){if(sourceDetails[id]?.length)featureNames[id]")
start=s.index('function newState(){')
end=s.index('\nlet storedSession=',start)
orig=s[start:end]
# Initialize dummy legacy heroes as inactive so all untouched historical resolvers remain type-safe.
new="""function newState(){
 const u=(x,y,hp,more={})=>({x,y,hp,max:hp,action:0,bonus:0,reaction:1,move:0,attacks:0,interaction:false,temp:0,status:[],vex:null,sneakUsed:false,coated:false,...more});
 return {version:12,sourceRevision:runtime?.source_state_revision??'offline',phase:'active',round:1,index:0,elapsed:0,inspected:'rin',target:'guard',tab:'actions',showAll:false,draft:null,path:[],manual:false,moving:false,shift:0,pending:null,smoke:[],effects:[],inv:JSON.parse(JSON.stringify(stock)),info:'Ход Рина. Выбери действие, способность или предмет.',history:[],units:{
 rin:u(1,5,31,{ac:16,weapon:'shortsword',arrows:20,focus:0,focusMax:3,luck:2,heroic:1,baseSpeed:40,unusualMetabolism:1}),
 guard_a:u(2,5,11,{ac:16,weapon:'spear',baseSpeed:30}),
 guard_b:u(3,5,11,{ac:16,weapon:'spear',baseSpeed:30}),
 guard_c:u(4,5,11,{ac:16,weapon:'spear',baseSpeed:30}),
 // Inert compatibility shells for full Havengard-specific feature resolvers.
 rada:u(0,0,0,{ac:17,weapon:'bow',arrows:0,hidden:true,leaf:0,living:0}),
 daphne:u(0,0,0,{ac:12,weapon:'focus',slots:[0,0,0,0,0,0],shieldFree:0}),
 lyutobor:u(0,0,0,{ac:20,weapon:'longsword',slots:[0,0,0,0],lay:0,channel:0,mark:0,smiteFree:0}),
 yar:u(0,0,0,{ac:11,weapon:'sword',storm:0,cloak:0,wind:0,surge:0,superiority:0}),
 guard:u(7,3,0,{ac:16}),archer:u(9,2,0,{ac:14})
 }};
}
"""
s=s[:start]+new+s[end:]
replace("'havengard-combat-session-v12'","'rin-veir-combat-session-v12'",2)
replace("const v20BaseOrder=['rada','daphne','lyutobor','yar','guard','archer'];", "const v20BaseOrder=['rin','guard_a','guard_b','guard_c','guard','archer'];")
replace("const v20BaseInit=[27,17,13,10,9,3];", "const v20BaseInit=[18,13,9,8,5,3];")
replace("const v21Party=['rada','daphne','lyutobor','yar'];", "const v21Party=['rin','guard_a','guard_b','guard_c'];")
replace("s.index=0;s.target=s.extraEnemies[0].id;s.inspected='rada';", "s.index=0;s.target=s.extraEnemies[0].id;s.inspected='rin';")
replace("const prior=order[s.index]||'daphne';", "const prior=order[s.index]||'rin';")
# Original advanced catalogue has entries only for Yar/Daphne/Lyutobor/Rada.
replace("v18Catalogue[id].filter(z=>!['passive','reaction','trigger','special'].includes(z[3]))", "(v18Catalogue[id]||[]).filter(z=>!['passive','reaction','trigger','special'].includes(z[3]))")
replace("v18Catalogue[id].map(z=>", "(v18Catalogue[id]||[]).map(z=>", 1)
# Link action menus to this campaign rather than other characters' skill trees.
replace("if(id==='rada')skills.push(['dash','Рывок','Бонус · +30 фт'],['disengage','Отход','Бонус · без атак по возможности'],['hide','Спрятаться','Бонус · проверка Скрытности']);", "")
# In the original v29, first ability pane was seeded with the prior campaign's hero.
replace("s.index=order.indexOf('daphne');", "s.index=order.indexOf('rin');")
# Change a stale example map to the actual roster, no inaccessible hero abilities shown.
replace("heroes:{rada:{cell:'E6',initiative:20},daphne:{cell:'B7',initiative:16},lyutobor:{cell:'D6',initiative:14},yar:{cell:'C6',initiative:12}}",
"heroes:{rin:{cell:'B6',initiative:20},guard_a:{cell:'C5',initiative:16},guard_b:{cell:'D6',initiative:14},guard_c:{cell:'C7',initiative:12}}")
replace("root.querySelector('header h2').textContent=s.battleName||'Старый мост';","root.querySelector('header h2').textContent=s.battleName||'Боевая сцена Рина';")
# The original reaction renderer must tolerate campaign-specific pending types;
# Rin's own overlay renders the appropriate buttons later.
replace("p.opt.map(k=>[k,k==='cloak'", "(p.opt||[]).map(k=>[k,k==='cloak'")
# Canonical Rin resources are seeded into the combat snapshot, never reset mid-battle.
replace("return state;\n }", "return state;\n }", 0) if False else None
replace("state.units.lyutobor.lay=initialResource('lyutobor','lay_on_hands',state.units.lyutobor.lay);", "state.units.lyutobor.lay=initialResource('lyutobor','lay_on_hands',state.units.lyutobor.lay);\nfor(const k of ['focus','luck','heroic','arrows'])state.units.rin[k]=initialResource('rin',k,state.units.rin[k]);")
replace("'living','smiteFree'].map(k=>[k,u[k]])", "'living','smiteFree','focus','luck','heroic','unusualMetabolism'].map(k=>[k,u[k]])")
# Initiative and speed must reflect Rin's 40-ft movement.
replace("u.move=hasStatus(id,'frost')?20:30;", "u.move=hasStatus(id,'frost')?20:(u.baseSpeed??30);")
# Reset Monk turn-limited properties at the start of Rin's turn, not at the end.
replace("u.spellSlotThisTurn=false;startTurnStatus(id);", "u.spellSlotThisTurn=false;if(id==='rin'){u.rinDarkMoved=false;s.rinDodge=false;u.rinNickUsed=false;u.rinNickAvailable=false;u.sneakUsed=false;}if(s.rinDarkness&&s.elapsed>=s.rinDarkness.until){s.rinDarkness=null;log('Срок магической Тьмы истёк.');}startTurnStatus(id);")
# Extra guard actions are automatic, never described as user-controlled.
replace("if(isHero(id)){s.info='Ход '+names[id]+'. Можно выбрать предмет, передачу или действие.';return}",
"if(isHero(id)){if(id!=='rin'){rinGuardTurn(id);continue} s.info='Ход '+names[id]+'. Можно выбрать предмет, передачу или действие.';return}")
# Define NPC behavior in generic tactical engine; do not count against the legacy feature catalog.
replace('function enemyTurn(id){',"""function rinGuardTurn(id){
 const u=s.units[id];if(!u||u.hp<=0)return;
 const targets=foes.filter(k=>s.units[k]?.hp>0).sort((a,b)=>dist(u,s.units[a])-dist(u,s.units[b]));
 if(!targets.length)return;
 let target=targets.find(k=>dist(u,s.units[k])<=5&&wallLOS(u,s.units[k]));
 if(!target){const candidate=targets[0],t=s.units[candidate],around=[];
  for(let y=0;y<8;y++)for(let x=0;x<11;x++)if(!wall(x,y)&&!at(x,y)&&dist({x,y},t)<=5){
   const path=nearestPath({x,y});if(path&&pathCost(path)<=u.move)around.push({path,cost:pathCost(path),x,y});}
  around.sort((a,b)=>a.cost-b.cost||a.path.length-b.path.length);
  if(around.length){const q=around[0];u.x=q.x;u.y=q.y;log(names[id]+': проходит '+q.cost+' фт к '+names[candidate]+' ('+pos(u.x,u.y)+').');}
  target=targets.find(k=>dist(u,s.units[k])<=5&&wallLOS(u,s.units[k]));
 }
 if(target){const d=die(20),total=d+3,hit=d===20||(d!==1&&total>=AC(target));log(names[id]+': копьё → '+names[target]+'; к20 ['+d+'] +3 = '+total+' против КД '+AC(target)+(hit?' — попадание.':' — промах.'));if(hit){const dmg=die(6)+1;log(names[id]+': урон копьём '+dmg+'.');hurt(target,dmg,'оружие');}}else log(names[id]+': удерживает оборону каравана.');
}
function enemyTurn(id){""",1)
# Independent persistence/export names (consistent across save and restore).
s=s.replace('havengard-combat-session','rin-veir-combat-session')
s=s.replace('havengard-battle-v16.json','rin-veir-battle-v29R.json')
s=s.replace('havengard-chat-battle-v20.json','rin-veir-chat-battle-v29R.json')
s=s.replace('havengard-combat-outcome-draft','rin-veir-combat-outcome-draft')
s=s.replace('havengard-outcome-v21.json','rin-veir-outcome-v29R.json')
# The source already has the complete attacks/spells/reactions; Rin hooks run after that initialization.
replace("if(v21EmbeddedStory)v21StartEmbeddedStory();", "/*__RIN_ADAPTER__*/\nif(v21EmbeddedStory)v21StartEmbeddedStory();")
(ROOT/'engine-v29.html').write_text(s,encoding='utf-8')
print('Rin-adapted v29 engine',len(s),'characters')
