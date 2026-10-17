"""Additional counters and spell slots use the same guarded, idempotent campaign transaction."""
from pathlib import Path
import copy,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from sync_combat_runtime import state_hash
from import_combat_result import prepare,RESOURCES
from campaignctl import build_result
s=json.loads((ROOT/'state/_campaign-state.json').read_text(encoding='utf-8'));before_live=json.dumps(s,sort_keys=True)
# A cloned campaign with another character ID proves that no hero-specific branch is required.
s['characters']['sentinel']=copy.deepcopy(s['characters']['rin']);s['party']['members']=['sentinel']
r=s['characters']['sentinel']['resources']
r.update(second_wind={'current':4,'max':4,'note':'canonical counter annotation'},action_surge={'current':1,'max':1},spell_slots={'1':{'current':4,'max':4},'2':{'current':3,'max':3,'note':'canonical slot annotation'}})
after={k:copy.deepcopy(v) for k,v in r.items() if k in RESOURCES}
after['second_wind'].pop('note');after['spell_slots']['2'].pop('note')
after['second_wind']['current']=3;after['action_surge']['current']=0;after['spell_slots']['2']['current']=2
report={'kind':'dnd-combat-result','version':30,'phase':'ended','session_kind':'story','campaign_id':s['campaign']['id'],'battle_id':'SHARED-COUNTER-TEST','source_revision':s['state_revision'],'source_state_sha256':state_hash(s),'before':{'sentinel':copy.deepcopy(r)},'after':{'sentinel':after},'elapsed_seconds':12,'events':[{'type':'battleEnded'}]}
tx=prepare(report,s);next_state=build_result(s,tx)
assert next_state['characters']['sentinel']['resources']['second_wind']['current']==3
assert next_state['characters']['sentinel']['resources']['action_surge']['current']==0
assert next_state['characters']['sentinel']['resources']['spell_slots']['2']['current']==2
assert next_state['characters']['sentinel']['resources']['spell_slots']['2']['note']=='canonical slot annotation'
assert next_state['characters']['sentinel']['resources']['second_wind']['note']=='canonical counter annotation'
assert build_result(next_state,prepare(report,next_state))==next_state
for change in ('slot_cap','negative_slot','missing_level','boolean_slot','resource_cap'):
    bad=copy.deepcopy(report);slots=bad['after']['sentinel']['spell_slots']
    if change=='slot_cap':slots['1']['max']=20
    if change=='negative_slot':slots['1']['current']=-1
    if change=='missing_level':slots.pop('2')
    if change=='boolean_slot':slots['1']['current']=True
    if change=='resource_cap':bad['after']['sentinel']['second_wind']['max']=99
    try:prepare(bad,s)
    except ValueError:pass
    else:raise AssertionError(change)
manifest=json.loads(subprocess.check_output(['node','sdk/cli.js','capabilities'],cwd=ROOT,text=True))
# The JS counter registry and the importer must agree about every tracked counter.
from_import=set(RESOURCES)-{'hp','focus','luck','heroic','arrows','unusual_metabolism','spell_slots'}
assert set(manifest['counters'])==from_import
assert json.dumps(json.loads((ROOT/'state/_campaign-state.json').read_text()),sort_keys=True)==before_live
print('CLASS RESOURCE BRIDGE OK: generic actor, counters, nested slots, replay, bounds, live canon unchanged')
