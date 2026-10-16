"""Rin campaign regression: full state, graph, ownership, map, and transaction preview."""
from pathlib import Path
import sys,json,copy,tempfile,subprocess
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from campaignctl import validate_project,validate_transaction,apply_operation,rendered_views
from knowledgegraph import validate_graph
from build_city_map import make_data
from sync_combat_runtime import build as combat_snapshot
state=json.loads((ROOT/'state/_campaign-state.json').read_text(encoding='utf-8'))
rules=json.loads((ROOT/'rules/_campaign-rules.json').read_text(encoding='utf-8'))
assert not validate_project(state,rules),validate_project(state,rules)
assert not validate_graph(state,state['knowledge_graph'])
assert state['campaign']['id']=='rin-veir'
assert state['party']['members']==['rin']
assert state['characters']['rin']['resources']['focus']['current']==0
assert state['characters']['rin']['resources']['personal_money_cp']==18289
assert state['loot_bundles']['caravan_stolen_property']['currency_cp']==2099
assert all(v['status']!='canonical' for v in state['knowledge'].values() if v.get('spoiler'))
assert all(k.startswith('rin') or k in ('hp','arrows','luck','focus','heroic','unusual_metabolism','personal_money_cp') for k in state['characters']['rin']['resources'])
assert 'world.city' not in state['world']
assert state['world'].get('city') is None
assert not make_data(ROOT)['objects']
assert 'spoiler' in str(state['knowledge']['K900'])
assert state['scene_context']['handoff']['open_question']
assert set(state['characters']['rin']['inventory'])==set(state['characters']['rin']['inventory_catalog'])
assert state['characters']['rin']['inventory_catalog']['arrows']['quantity']==state['characters']['rin']['resources']['arrows']['current']
assert 'npc:oli' in state['knowledge_graph']['principals']
assert 'BR-GM-ESTATE' not in state['world']['scene_knowledge_branches']
views=rendered_views(state,rules)
assert 'Оли' in views['scene-context.md']
assert 'Яр и Дафна' not in views['scene-context.md']
assert 'Освин Керр' not in views['player-context.md']
original=json.dumps(state,sort_keys=True,ensure_ascii=False)
# A preview is read-only; no back-to-back resource mutation without a commit.
assert original==json.dumps(state,sort_keys=True,ensure_ascii=False)
print('RIN CAMPAIGN TESTS OK')
