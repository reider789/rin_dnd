from pathlib import Path
import copy,hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from sync_combat_runtime import snapshot,state_hash
from import_combat_result import prepare
from campaignctl import build_result, CampaignError
state=json.loads((ROOT/'state/_campaign-state.json').read_text(encoding='utf-8'))
original=json.dumps(state,sort_keys=True)
runtime=snapshot(ROOT);assert runtime['source_state_revision']==state['state_revision'];assert runtime['source_state_sha256']==state_hash(state)
inv=runtime['characters']['rin']['inventory'];assert len(inv)==len(state['characters']['rin']['inventory_catalog'])
assert not next(i for i in inv if i['id']=='bandit_arrows')['combat_available'];assert next(i for i in inv if i['id']=='cherta')['combat_available']
before=copy.deepcopy(state['characters']['rin']['resources']);after={k:copy.deepcopy(v) for k,v in before.items() if k in {'hp','focus','luck','heroic','arrows','unusual_metabolism'}}
after['arrows']['current']-=2;after['hp']['current']-=4;after['unusual_metabolism']['current']=0
report={'kind':'rin-combat-result','version':30,'phase':'ended','session_kind':'story','campaign_id':state['campaign']['id'],'battle_id':'BRIDGE-REGRESSION-NOT-CANON',
 'source_revision':state['state_revision'],'source_state_sha256':state_hash(state),'before':{'rin':before},'after':{'rin':after},'events':[{'type':'battleEnded'}],'participants':{},'elapsed_seconds':18}
report['inventory_before']={'rin':{'daggers':4,'arrows':20}};report['inventory_after']={'rin':{'daggers':3,'arrows':18}}
tx=prepare(report,state);next_state=build_result(state,tx)
assert next_state['characters']['rin']['resources']['arrows']['current']==18
assert next_state['characters']['rin']['inventory_catalog']['arrows']['quantity']==18
assert next_state['characters']['rin']['resources']['hp']['current']==27
assert next_state['characters']['rin']['inventory_catalog']['daggers']['quantity']==3
assert next_state['world']['timekeeping']['elapsed_seconds_from_anchor']==state['world']['timekeeping']['elapsed_seconds_from_anchor']+18
assert build_result(next_state,prepare(report,next_state))==next_state
for changed in ('training','stale','hash','tampered','same_id_changed'):
    r=copy.deepcopy(report);s=state
    if changed=='training':r['session_kind']='training'
    if changed=='stale':r['source_revision']+=1
    if changed=='hash':r['source_state_sha256']='0'*64
    if changed=='tampered':r['after']['rin']['focus']['current']=99
    if changed=='same_id_changed':r['after']['rin']['hp']['current']=26;s=next_state
    try:prepare(r,s)
    except (ValueError,CampaignError):pass
    else:raise AssertionError(changed)
assert json.dumps(state,sort_keys=True)==original
print('COMBAT BRIDGE OK: snapshot, ownership, bounds, conflict, exact replay, changed replay, arrows catalog; live canon unchanged')
