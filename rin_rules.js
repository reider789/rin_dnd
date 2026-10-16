/* Rin Veir campaign adapter for full Havengard v29. Loaded inside the original IIFE. */
// Preserve old tactical engine, resolvers, reaction stack, journal, renderer, effects,
// nonlethal handler and pathfinder. Hide unrelated hero abilities from Rin.
const RIN_MONK=Object.freeze({attack:5,damage:3,focusMax:3,saveDC:13,speed:40,deflectReduction:6});
const rinRulesText={
 unarmed:'Боевые искусства: один безоружный удар +5, 1к6+3 бонусным действием; основная атака не обязательна.',
 flurry:'Шквал ударов: за 1 фокус сделать два отдельных безоружных удара бонусным действием. После каждого можно выбрать новую цель.',
 patientFree:'Терпеливая защита: Отход бонусным действием бесплатно — выход из зоны досягаемости не провоцирует атаки.',
 patientPaid:'Терпеливая защита: за 1 фокус Отход и Уклонение бонусным действием.',
 windFree:'Шаг ветра: Рывок бонусным действием без фокуса; дополнительное передвижение 40 футов.',
 windPaid:'Шаг ветра: за 1 фокус Рывок и Отход; прыжки вдвое дальше до конца хода.',
 darkness:'Искусства Тени: 1 фокус, основное действие, центр в пределах 60 футов, радиус 15 футов, концентрация до 10 минут. Рин видит в созданной им Тьме. Центр можно перемещать в начале своего хода.',
 moveDark:'Перенос своей Тьмы: бесплатно в начале хода, центр в пределах 60 футов.',
 nick:'Быстрота (Nick): дополнительная атака кинжалом как часть уже начатого действия Атака; бонусное действие остаётся свободным.',
 minor:'Малая иллюзия: бесплатный заговор (действие Магия), звук или изображение в пределах 30 футов. За пределами стандартного боя эффект согласуется с мастером.',
 lucky:'Удачливый: 2 использования — преимущество на собственный бросок d20 или помеха на атаку против себя; выбор до броска.',
 metabolism:'Необычный метаболизм: при инициативе один раз до долгого отдыха вернуть весь фокус и 1к6+3 ПЗ.',
};
const rinAbilities=[
 ['dashAction','Рывок','Основное действие · +40 футов'],
 ['disengageAction','Отход','Основное действие · без атак по возможности'],
 ['hideAction','Спрятаться','Основное действие · проверка Скрытности'],
 ['unarmed','Безоружный удар', 'Бонусное · 1к6+3'],
 ['flurry','Шквал ударов','Бонусное · 1 фокус · 2 удара'],
 ['nick','Быстрота — кинжал','В составе атаки · бонус свободен'],
 ['patientFree','Терпеливая защита','Бонусное · Отход бесплатно'],
 ['patientPaid','Защита + Уклонение','Бонусное · 1 фокус'],
 ['windFree','Шаг ветра','Бонусное · Рывок бесплатно'],
 ['windPaid','Шаг ветра + Отход','Бонусное · 1 фокус'],
 ['darkness','Искусства Тени: Тьма','Действие · 1 фокус'],
 ['moveDark','Перенести Тьму','Начало хода · бесплатно'],
 ['minor','Малая иллюзия','Действие Магия'],
 ['lucky','Удача: своя атака','1 заряд · преимущество до броска'],
 ['luckyDefense','Удача: защита','1 заряд · помеха следующей атаке по Рину'],
 ['metabolism','Необычный метаболизм','При инициативе · 1/долгий отдых']
];
const rinSourceAttack=attack;
const rinSourceHurt=hurt;
const rinSourceEnemyRoll=enemyRoll;
function rinWithinDark(p){const d=s.rinDarkness;if(!d)return false;return rad(p,d)<=15;}
function rinLineDark(a,b){const d=s.rinDarkness;if(!d)return false;
 for(let i=0;i<=12;i++){const f=i/12,p={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};if(rad(p,d)<=15)return true;}
 return false;
}
function rinRollAttack(target,weapon='unarmed',bonusAttack=false){
 const u=s.units.rin,t=s.units[target],w=weapons.rin.find(v=>v[0]===weapon);
 if(!t||t.hp<=0||!foes.includes(target)){s.info='Выбери живого противника';return false;}
 const distance=dist(u,t),reach=weapon==='bow'?320:weapon==='dagger'&&u.rinThrownDagger?60:5;
 if(distance>reach||!wallLOS(u,t)){s.info='Цель вне досягаемости или за препятствием';return false;}
 if(weapon==='bow'&&u.arrows<=0){s.info='Нет стрел';return false;}
 let adv=Boolean(u.hidden||u.vex===target||hasStatus(target,'restrained')||hasStatus(target,'prone')&&distance<=5||s.rinLuckNextAttack);
 let disadv=Boolean(hasStatus('rin','restrained')||hasStatus(target,'prone')&&distance>5||distance>(weapon==='bow'?80:5)&&weapon==='bow');
 if(s.rinDarkness){
   const selfDark=rinWithinDark(u),targetDark=rinWithinDark(t),lineDark=rinLineDark(u,t);
   // Rin sees in his own darkness. Enemies without special sight cannot see through it.
   if(selfDark||targetDark||lineDark)adv=true;
 }
 const rolled=[die(20)],second=adv!==disadv?die(20):null;
 if(second!==null)rolled.push(second);
 const d=second===null?rolled[0]:adv?Math.max(...rolled):Math.min(...rolled),total=d+5;
 const hit=d===20||(d!==1&&total>=AC(target));
 log('Рин: '+w[1]+' → '+names[target]+'; '+(adv&&disadv?'преимущество и помеха отменены':adv?'ПРЕИМУЩЕСТВО':disadv?'ПОМЕХА':'обычная атака')+'; к20 ['+rolled.join(', ')+'] → '+d+' +5 = '+total+' против КД '+AC(target)+(hit?' — ПОПАДАНИЕ'+(d===20?', КРИТИЧЕСКОЕ':'')+'.':' — ПРОМАХ.'));
 s.rinLuckNextAttack=false;u.hidden=false;
 if(weapon==='bow')u.arrows--;
 if(!hit){u.vex=null;return true;}
 const ds=dice(d===20?2:1,6),base=sum(ds)+3;
 let sneak=0;
 const allied=heroes.some(h=>h!=='rin'&&s.units[h]?.hp>0&&dist(s.units[h],t)<=5&&!hasStatus(h,'incapacitated'));
 if(!u.sneakUsed&&(weapon==='shortsword'||weapon==='dagger'||weapon==='bow')&&(adv&&!disadv||allied&&!disadv)){
   const sneaks=dice(d===20?2:1,6);sneak=sum(sneaks);u.sneakUsed=true;log('Рин: Скрытая атака 1к6'+(d===20?' (удвоение на критическом)':'')+' = '+sneak+'.');
 }
 if(weapon==='shortsword'){u.vex=target;log('Уязвимость: следующая атака Рина по '+names[target]+' с преимуществом.');}
 else if(weapon!=='shortsword')u.vex=null;
 log('Урон Рина: ['+ds.join(', ')+'] +3'+(sneak?' +'+sneak+' Скрытой атаки':'')+' = '+(base+sneak)+'.');
 // Allow native v28 melee knockout workflow to decide death or capture.
 s.nonlethalMeleeContext=weapon==='shortsword'||weapon==='unarmed'||weapon==='dagger'&&!u.rinThrownDagger?{attacker:'rin',target}:null;
 try{hurt(target,base+sneak,'оружие')}finally{delete s.nonlethalMeleeContext;}
 return true;
}
attack=function(target){if(turn()!=='rin')return rinSourceAttack(target);const u=s.units.rin;
 if(!u.action&&!u.attacks)return;
 const chosen=u.weapon;
 // Preserve useAttack's turn budget from the original combat engine.
 useAttack(u);
 if(['shortsword','dagger'].includes(chosen)&&!u.rinNickUsed)u.rinNickAvailable=true;
 rinRollAttack(target,chosen,false);
};
// A hit on Rin offers Deflect Attacks before subtracting damage, with real pending state.
hurt=function(target,amount,kind){
 const u=s.units.rin;
 const eligible=target==='rin'&&amount>0&&u?.reaction>0&&!s.pending&&['оружие','рубящий','колющий','дробящий'].includes(kind);
 if(eligible){s.pending={kind:'rinDeflect',target,raw:amount,damageKind:kind};log('Рин: доступна реакция «Отражение атак» (1к10+6 снижения).');return;}
 rinSourceHurt(target,amount,kind);
 if(target==='rin'&&amount>0&&s.rinDarkness){const dc=Math.max(10,Math.floor(amount/2)),roll=die(20)+2;
  log('Рин: концентрация Тьмы — '+roll+' против СЛ '+dc+(roll>=dc?' (успех).':' (провал, Тьма рассеивается).'));
  if(roll<dc)s.rinDarkness=null;
 }
};
enemyRoll=function(target,test,forced,disadvantage,attacker=turn()){
 const obscure=s.rinDarkness&&rinLineDark(s.units[attacker],s.units[target]);
 const luckD=target==='rin'&&s.rinLuckDefense;
 const outcome=rinSourceEnemyRoll(target,test,forced,Boolean(disadvantage||(target==='rin'&&(s.rinDodge||obscure||luckD))),attacker);
 if(luckD)s.rinLuckDefense=false;return outcome;
};
function rinResolveDeflect(use){const p=s.pending;if(p?.kind!=='rinDeflect')return;
 s.pending=null;const u=s.units.rin;
 if(use&&u.reaction>0){u.reaction--;const reduce=die(10)+RIN_MONK.deflectReduction;
  const remainder=Math.max(0,p.raw-reduce);log('Отражение атак: 1к10+6 = '+reduce+'; остаточный урон '+remainder+'.');
  if(remainder)hurt('rin',remainder,p.damageKind);
  if(!remainder&&u.focus>0){s.rinRedirectReady=true;log('Урон сведён к нулю. Можно потратить 1 фокус для перенаправления.');}
 }else hurt('rin',p.raw,p.damageKind);
 render();hostSave();if(!s.pending&&s.phase==='active'&&!isHero(turn()))advance();
}
function rinRedirect(target){const u=s.units.rin;if(!s.rinRedirectReady||u.focus<1||!foes.includes(target)||s.units[target]?.hp<=0){s.info='Перенаправление недоступно';render();return;}
 if(dist(u,s.units[target])>60||!wallLOS(u,s.units[target])){s.info='Цель слишком далеко либо закрыта';render();return;}
 u.focus--;s.rinRedirectReady=false;
 const dc=13,success=saving(target,'DEX',dc),dmg=sum(dice(2,6))+3;
 log('Отражение атак: перенаправление на '+names[target]+', '+(success?'цель спаслась.':'урон '+dmg+'.'));
 if(!success)hurt(target,dmg,'оружие');render();hostSave();
}
function rinPerform(key){
 if(turn()!=='rin'||s.phase!=='active'||s.pending||s.moving)return;
 const u=s.units.rin,target=s.target,foe=s.units[target];
 const fail=(reason)=>{s.info=reason;render();};
 const bonus=()=>{if(u.bonus<=0){fail('Бонусное действие уже потрачено.');return false;}return true;};
 const focus=()=>{if(u.focus<=0){fail('Нет очков фокуса.');return false;}return true;};
 const close=()=>{if(!foe||foe.hp<=0||!foes.includes(target)||dist(u,foe)>5){fail('Нужен живой противник в соседней клетке. Выбери его на карте.');return false;}return true;};
 if(key==='dashAction'){if(!u.action)return fail('Основное действие потрачено');u.action--;u.move+=RIN_MONK.speed;log('Рин: Рывок (основное действие), движение +40 футов.');}
 else if(key==='disengageAction'){if(!u.action)return fail('Основное действие потрачено');u.action--;u.disengaged=true;log('Рин: Отход (основное действие).');}
 else if(key==='hideAction'){if(!u.action)return fail('Основное действие потрачено');if(!rinWithinDark(u)&&!u.rinHasCover)return fail('Для Скрытности необходимо надёжное укрытие или непроглядная тьма.');u.action--;const roll=die(20)+7;u.hidden=roll>=15;log('Рин: Скрытность к20 +7 = '+roll+(u.hidden?' — спрятался.':' — недостаточно для скрытия.'));}
 else if(key==='unarmed'){if(!bonus()||!close())return;u.bonus=0;rinRollAttack(target,'unarmed',true);}
 else if(key==='flurry'){if(!bonus()||!focus())return;u.bonus=0;u.focus--;s.rinFlurryLeft=2;log('Рин: Шквал ударов, 1 фокус. Осталось два безоружных удара; цель каждого выбирается отдельно.');}
 else if(key==='flurryStrike'){if(!s.rinFlurryLeft||!close())return;rinRollAttack(target,'unarmed',true);s.rinFlurryLeft--;if(!s.rinFlurryLeft)delete s.rinFlurryLeft;}
 else if(key==='nick'){if(!u.rinNickAvailable||u.rinNickUsed){fail('Быстрота доступна после атаки лёгким оружием, один раз за ход.');return;}if(!close())return;u.rinNickUsed=true;u.rinNickAvailable=false;rinRollAttack(target,'dagger',true);}
 else if(key==='patientFree'||key==='patientPaid'){if(!bonus()||(key==='patientPaid'&&!focus()))return;u.bonus=0;u.disengaged=true;if(key==='patientPaid'){u.focus--;s.rinDodge=true;}log('Рин: '+(key==='patientPaid'?'Терпеливая защита — Отход и Уклонение (1 фокус).':'Терпеливая защита — Отход бесплатно.'));}
 else if(key==='windFree'||key==='windPaid'){if(!bonus()||(key==='windPaid'&&!focus()))return;u.bonus=0;u.move+=RIN_MONK.speed;if(key==='windPaid'){u.focus--;u.disengaged=true;u.rinJumpDouble=true;}log('Рин: Шаг ветра — '+(key==='windPaid'?'Рывок, Отход, удвоение прыжка (1 фокус).':'бесплатный Рывок +40 футов.'));}
 else if(key==='darkness'||key==='moveDark'){
  if(key==='darkness'&&(!u.action||!focus()))return;
  if(key==='moveDark'&&(!s.rinDarkness||u.rinDarkMoved)){fail('Перенос Тьмы сейчас недоступен.');return;}
  s.rinSelectingDark=key;s.info='Выбери центр сферы на карте в пределах 60 футов от Рина.';
 }
 else if(key==='minor'){if(!u.action)return fail('Основное действие потрачено.');u.action--;log('Рин применяет «Малую иллюзию». Конкретный звук или образ задаётся ведущему; иллюзия не наносит урона и не создаёт реальную преграду.');}
 else if(key==='lucky'){if(u.luck<=0)return fail('Удача закончилась');u.luck--;s.rinLuckNextAttack=true;log('Рин тратит Удачу: преимущество на следующую собственную атаку.');}
 else if(key==='luckyDefense'){if(u.luck<=0)return fail('Удача закончилась');u.luck--;s.rinLuckDefense=true;log('Рин тратит Удачу: следующая атака по нему совершается с помехой.');}
 else if(key==='metabolism'){if(!u.unusualMetabolism||s.round!==1)return fail('Необычный метаболизм возможен только при броске инициативы, 1 раз после долгого отдыха.');u.unusualMetabolism=0;u.focus=3;const n=die(6)+3;u.hp=Math.min(u.max,u.hp+n);log('Необычный метаболизм: фокус восстановлен, здоровье +'+n+' (не выше максимума).');}
 render();hostSave();
}
function rinPlaceDark(x,y){const mode=s.rinSelectingDark;if(!mode)return;const u=s.units.rin;
 const p={x,y};if(dist(u,p)>60||wall(x,y)){s.info='Центр Тьмы вне 60 футов или в непроходимой клетке.';render();return;}
 if(mode==='darkness'){
   if(!u.action||!u.focus){s.info='Не хватает действия или фокуса';render();return;}
   u.action--;u.focus--;s.rinDarkness={x,y,until:s.elapsed+600};
   log('Рин создаёт магическую Тьму: '+pos(x,y)+', радиус 15 футов, концентрация до 10 минут, фокус −1.');
 }else{u.rinDarkMoved=true;s.rinDarkness={...s.rinDarkness,x,y};log('Рин переносит Тьму на '+pos(x,y)+' в начале хода.');}
 s.rinSelectingDark=null;render();hostSave();
}
// Modify original UI after all v29 rendering wrappers, without replacing its map,
// hero inspector, journal, controls, reactions or option paging.
const rinFullOriginalRender=render;
render=function(){rinFullOriginalRender();
 let panel=$('rin-abilities');if(!panel){panel=document.createElement('div');panel.id='rin-abilities';panel.className='panel';$('tabs').insertAdjacentElement('afterend',panel);}
 const u=s.units.rin;
 const ourTurn=turn()==='rin'&&s.phase==='active';
 panel.style.display=ourTurn?'block':'none';
 if(ourTurn){
  const section=rinAbilities.map(([key,label,desc])=>{
    if(key==='nick'&&!u.rinNickAvailable)return '';
    if(key==='moveDark'&&!s.rinDarkness||key==='metabolism'&&!u.unusualMetabolism)return '';
    return '<button class="choice" type="button" data-rin-do="'+key+'"><b>'+label+'</b><small>'+desc+'</small></button>';}).join('');
  panel.innerHTML='<h3>Рин · Боевые искусства и Тень</h3><p>Действие '+u.action+' · Бонусное '+u.bonus+' · Реакция '+u.reaction+' · Движение '+u.move+' фт · Фокус '+u.focus+'/3 · Удача '+u.luck+'/2</p>'+
    (s.rinSelectingDark?'<p class="warning">Выбери центр Тьмы непосредственно на карте.</p>':'')+
    (s.rinRedirectReady?'<p class="warning">Перенаправление готово. Выбери противника на карте и нажми «Перенаправить».</p><button type="button" class="btn primary" data-rin-redirect>Перенаправить на цель</button>':'')+
    (s.rinFlurryLeft?'<p class="warning">Шквал ударов: осталось '+s.rinFlurryLeft+'. Выбери противника на карте для следующего удара.</p><button class="btn primary" type="button" data-rin-do="flurryStrike">Безоружный удар из Шквала</button>':'')+
    '<div class="choices">'+section+'</div>';
 }
 if(s.pending?.kind==='rinDeflect'){$('response').innerHTML='<div class="panel"><h3>⚡ Рин: Отражение атак</h3><p>Получен удар на '+s.pending.raw+' урона. Реакцией можешь уменьшить его на 1к10+6.</p><div class="buttons"><button class="btn primary" type="button" data-rin-deflect="yes">Отразить</button><button class="btn" type="button" data-rin-deflect="no">Принять удар</button></div></div>';}
 if(s.rinDarkness){for(const el of $('board').querySelectorAll('[data-tile]')){const xy=el.getAttribute('data-tile').split(',').map(Number);if(rinWithinDark({x:xy[0],y:xy[1]}))el.classList.add('rin-dark-tile');}}
 // Hide Havengard-only QA gadgets from the player; their resolver code remains intact.
 for(const q of root.querySelectorAll('[data-v19-mage], [data-v20-open], [data-v20-checkpoint]'))q.style.display='none';
 // Add portrait independently of CDN availability; other character images remain v29's skin.
 for(const tile of $('board').querySelectorAll('button[data-tile]')){
   if(tile.title?.startsWith('Рин Вейр ')){const icon=tile.querySelector('.unit');if(icon){icon.style.backgroundImage='url("__RIN_PORTRAIT_DATA__")';icon.style.backgroundSize='cover';icon.style.backgroundPosition='center';icon.style.borderRadius='50%';icon.style.color='transparent';}}
 }
};
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!root.contains(b))return;
 if(s.rinSelectingDark&&b.dataset.tile){e.preventDefault();e.stopImmediatePropagation();const [x,y]=b.dataset.tile.split(',').map(Number);rinPlaceDark(x,y);return;}
 if(b.dataset.rinDeflect){e.preventDefault();e.stopImmediatePropagation();rinResolveDeflect(b.dataset.rinDeflect==='yes');return;}
 if(b.hasAttribute('data-rin-do')){e.preventDefault();e.stopImmediatePropagation();rinPerform(b.dataset.rinDo);return;}
 if(b.hasAttribute('data-rin-redirect')){e.preventDefault();e.stopImmediatePropagation();rinRedirect(s.target);return;}
 if(b.dataset.op==='next'&&turn()==='rin'){s.rinFlurryLeft=0;s.units.rin.rinNickAvailable=false;}
},true);
// Seed a separate training battle; recorded caravan history is not replayed canonically.
if(!v21EmbeddedStory){
 const example=root.querySelector('script[data-rin-default-scene]')?.textContent;
 if(example&&!resumable){try{v21NewScenario(JSON.parse(example));}catch(err){s.info='Ошибка сцены Рина: '+String(err?.message||err);render();}}
}
