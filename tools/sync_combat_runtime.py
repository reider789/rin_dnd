#!/usr/bin/env python3
"""Build the NEXT Rin battle snapshot from the canonical state.
Never alter running sessions, the story outcome, or authoritative resources.
"""
from __future__ import annotations
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def build(project:Path=ROOT):
    state=json.loads((project/'state/_campaign-state.json').read_text(encoding='utf-8'))
    rin=state['characters']['rin']
    dest=project/'config/rin_runtime.json'
    old=json.loads(dest.read_text(encoding='utf-8'))
    if old.get('schema_version')!=2 or 'rin' not in old.get('characters',{}):
        raise ValueError('Wrong combat runtime schema')
    old.update(source_state_revision=state['state_revision'],source='state/_campaign-state.json',is_canonical=False)
    c=old['characters']['rin'];c['name']=rin['name']
    sheet=rin['character_sheet'];c['class_and_level']=sheet['class_and_level'];c['ac_description']=sheet['armor_class'];c['speed']=sheet['speed'];
    for key,val in rin['resources'].items():
       if isinstance(val,dict) and 'current' in val:c.setdefault('resources',{})[key]=val
    # Full inventory is authoritative, including ownership and at which place an item is stored.
    c['inventory']=[{'id':k,'name':v['name'],'quantity':v['quantity'],'description':v.get('description',''),'status':v.get('status','')} for k,v in rin['inventory_catalog'].items()]
    c['skills_attacks_spells']=[{'name':s['cells'][0], 'description':' · '.join(str(v) for v in s['cells'][1:] if v is not None)} for s in sheet.get('combat_reference',[]) if s.get('cells')]
    dest.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return dest
if __name__=='__main__':print(build())
