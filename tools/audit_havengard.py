#!/usr/bin/env python3
"""Read-only migration audit. A supported primitive is not a fully migrated character."""
from pathlib import Path
import argparse,hashlib,json
SUPPORTED={'Extra Attack':'extraAttack','Vex':'masteries:vex','Nick':'masteries:nick','Скрытая атака — 5к6':'sneakDice'}
RESOURCES={'hp','focus','luck','heroic','arrows','unusual_metabolism'}
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
            entries.append({'source_row':row.get('source_row'),'category':section,'name':label,
              'status':'primitive_available_needs_verified_profile' if handler else 'needs_handler_or_review',
              **({'primitive':handler} if handler else {})})
        result['characters'][cid]={'name':char['name'],'class_and_level':char['character_sheet']['class_and_level'],
          'ready':False,'capabilities':entries,'unmapped_resources':sorted(set(char['resources'])-RESOURCES),
          'reason':'Полный профиль не подтверждён; нельзя отключать недостающие способности и запускать сюжетный бой.'}
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--state',type=Path,required=True);p.add_argument('--registry',type=Path);p.add_argument('--output',type=Path);p.add_argument('--require-ready',action='store_true');a=p.parse_args()
    report=audit(json.loads(a.state.read_text(encoding='utf-8')),json.loads(a.registry.read_text(encoding='utf-8')) if a.registry else None)
    text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(text,encoding='utf-8')
    else:print(text,end='')
    if a.require_ready and not report['ready_for_full_migration']:raise SystemExit('Migration blocked: verified profiles and handlers are missing')
