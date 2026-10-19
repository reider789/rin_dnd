#!/usr/bin/env python3
"""Read-only migration audit. A supported primitive is not a fully migrated character."""
from pathlib import Path
import argparse,hashlib,json,re
SUPPORTED={'Extra Attack':'extraAttack','Vex':'masteries:vex','Nick':'masteries:nick','Скрытая атака — 5к6':'sneakDice'}
from combat_resources import RESOURCES
SUPPORTED.update({
 'Second Wind — 4/4':'secondWind','Tactical Mind':'tacticalMind','Tactical Shift':'tacticalShift','Action Surge — 1/1':'actionSurge','Know Your Enemy':'knowEnemy',
 'Precision Attack':'maneuver:precision','Trip Attack':'maneuver:trip','Riposte':'maneuver:riposte','Maneuvering Attack':'maneuver:maneuvering','Pushing Attack':'maneuver:push','Провоцирующая атака':'maneuver:goad','Приманка и смена':'maneuver:bait','Несгибаемость — 1/1':'indomitable','Тактическое мастерство':'tacticalMaster',
 'Хитрое действие':'cunningAction','Точный прицел':'steadyAim','Невероятное уклонение':'uncannyDodge','Уклонение':'evasion','Надёжный талант':'reliableTalent','Меткий стрелок':'sharpshooter',
 'Наложение рук — 50/50 ПЗ':'layOnHands','Aura of Protection':'auraProtection','Aura of Devotion':'auraDevotion','Аура отваги':'auraCourage','Protection':'protection','Знак Непоколебимого Стража':'critNegation','Мастер тяжёлых доспехов':'heavyArmorReduction'
})
COUNTER_SOURCES={
 'yar':{'second_wind':r'Second Wind','superiority':r'Кости превосходства','indomitable':r'Несгибаемость','know_enemy':r'Know Your Enemy','cloak_charges':r'Проводящий плащ Ваэльтира'},
 'daphne':{'storm_bracers':r'Наручи Грозового Контура','vaeltir_focus':r'Магический фокус Ваэльтира'},
 'lyutobor':{'channel_divinity':r'Божественный канал','smite_free':r'Божественная кара','guardian_mark':r'Знак Непоколебимого Стража'},
 'rada':{'leaf_charges':r'Лук Последнего Листа','living_arrow':r'Лук Последнего Листа'},
}
def counter_sources(char,cid):
    """A capacity such as '3 charges' is never promoted to a current balance."""
    sources=[]
    for row in char['character_sheet'].get('combat_reference',[]):
        cells=row.get('cells') or []
        if cells:sources.append((str(cells[0]),' · '.join(str(c) for c in cells if c is not None),'character_sheet.combat_reference:'+str(row.get('source_row'))))
    for iid,item in char.get('inventory_catalog',{}).items():
        sources.append((item.get('name',''),str(item.get('description','')),'inventory_catalog.'+iid))
    result={}
    for key,pattern in COUNTER_SOURCES.get(cid,{}).items():
        resource=char['resources'].get(key)
        if isinstance(resource,dict) and isinstance(resource.get('current'),int) and isinstance(resource.get('max'),int):
            result[key]={'status':'canonical_current','value':resource,'source':'resources.'+key};continue
        evidence=[(text,path) for label,text,path in sources if re.search(pattern,label,re.I)]
        explicit=[(re.search(r'(?<!\d)(\d+)\s*/\s*(\d+)(?!\d)',text),path) for text,path in evidence]
        explicit=[({'current':int(m[1]),'max':int(m[2])},path) for m,path in explicit if m]
        # A single bow has two different counters; a fraction must name its effect.
        if key in ('leaf_charges','living_arrow'):explicit=[]
        values={json.dumps(value,sort_keys=True) for value,path in explicit}
        if len(values)==1:
            result[key]={'status':'explicit_sheet_current_needs_normalization','value':explicit[0][0],'source':explicit[0][1]}
        else:result[key]={'status':'current_not_recorded' if not values else 'source_conflict','sources':[path for text,path in evidence]}
    return result
def audit(state,registry=None):
    result={'schema_version':1,'kind':'combat-migration-audit','canonical':False,'campaign_id':state['campaign']['id'],
      'source_state_revision':state['state_revision'],
      'source_state_sha256':hashlib.sha256(json.dumps(state,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
      'engine_api':1,'ready_for_full_migration':False,'characters':{}}
    if registry:result.update(legacy_registry_revision=registry.get('state_revision'),legacy_registry_is_stale=registry.get('state_revision')!=state['state_revision'])
    for cid in state['party']['members']:
        char=state['characters'][cid];entries=[];section=None
        for row in char['character_sheet'].get('combat_reference',[]):
            cells=row.get('cells',[]);label=cells[0] if cells else None
            if not isinstance(label,str):continue
            if label=='Способности — описание для боя':section='feature';continue
            if label=='Атаки и боевые действия':section='attack';continue
            if label=='Заклинания — боевая шпаргалка':section='spell';continue
            if not section or label in ('Способность','Действие','Заклинание'):continue
            handler=SUPPORTED.get(label)
            entries.append({'source_row':row.get('source_row'),'category':section,'name':label,'description':' · '.join(str(c) for c in cells[1:] if c is not None),
              'status':'primitive_available_needs_verified_profile' if handler else 'needs_handler_or_review',
              **({'primitive':handler} if handler else {})})
        counters=counter_sources(char,cid)
        result['characters'][cid]={'name':char['name'],'class_and_level':char['character_sheet']['class_and_level'],
          'ready':False,'capabilities':entries,'unmapped_resources':sorted(set(char['resources'])-RESOURCES),
          'counter_sources':counters,'missing_current_resources':[key for key,value in counters.items() if value['status'] in ('current_not_recorded','source_conflict')],
          'reason':'Полный профиль не подтверждён; нельзя отключать недостающие способности и запускать сюжетный бой.'}
    return result
def verify_pack(state,pack,coverage,engine_root=None):
    import subprocess
    report=audit(state);errors=[]
    if pack.get('revision')!=state['state_revision'] or pack.get('source_state_sha256')!=report['source_state_sha256']:errors.append('Пакет не соответствует текущему снимку')
    if set(pack.get('characters',{}))!=set(state['party']['members']):errors.append('Неполная партия')
    for cid in state['party']['members']:
        review=coverage.get('characters',{}).get(cid,{});char=state['characters'][cid];entry=pack.get('characters',{}).get(cid,{});profile=pack.get('profiles',{}).get(entry.get('profile'),{})
        digest=hashlib.sha256(json.dumps(char['character_sheet']['combat_reference'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest();local=[]
        if review.get('sheet_mechanics_sha256')!=digest:local.append('Изменились механики карточки: нужна предметная проверка адаптера')
        if entry.get('resources')!={k:v for k,v in char['resources'].items() if k in RESOURCES}:local.append('Ресурсы не соответствуют канону')
        for key,value in review.get('required_features',{}).items():
            if profile.get('features',{}).get(key)!=value:local.append('Нет способности '+key)
        casting=profile.get('casting',{})
        for key,field in [('required_prepared','prepared'),('required_cantrips','cantrips')]:
            if casting.get(field,[])!=review.get(key,[]):local.append('Не совпадает '+field)
        if {x['id'] for x in profile.get('attacks',[])}!=set(review.get('required_attacks',[])):local.append('Не совпадают доступные атаки')
        if not review:local.append('Нет проверенного профиля')
        errors.extend(cid+': '+x for x in local)
        report['characters'][cid].update(ready=not local,reason='Проверенный профиль и обработчики текущей подготовки.' if not local else '; '.join(local),conditional_availability=review.get('conditional_availability',[]))
        for row in report['characters'][cid]['capabilities']:row['status']='reviewed_in_current_profile'
    report['ready_for_full_migration']=not errors;report['errors']=errors;return report

if __name__=='__main__':
    import subprocess
    p=argparse.ArgumentParser();p.add_argument('--state',type=Path,required=True);p.add_argument('--registry',type=Path);p.add_argument('--pack',type=Path);p.add_argument('--coverage',type=Path);p.add_argument('--output',type=Path);p.add_argument('--require-ready',action='store_true');a=p.parse_args()
    state=json.loads(a.state.read_text(encoding='utf-8'))
    if a.pack:
        if not a.coverage:raise SystemExit('Нужен reviewed-profiles.json')
        subprocess.run(['node',str(Path(__file__).resolve().parents[1]/'sdk/cli.js'),'validate',str(a.pack)],check=True,stdout=subprocess.DEVNULL)
        report=verify_pack(state,json.loads(a.pack.read_text()),json.loads(a.coverage.read_text()))
    else:report=audit(state,json.loads(a.registry.read_text()) if a.registry else None)
    value=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(value,encoding='utf-8')
    else:print(value,end='')
    if a.require_ready and not report['ready_for_full_migration']:raise SystemExit('Migration blocked: '+str(report.get('errors','verified profiles and handlers are missing')))
