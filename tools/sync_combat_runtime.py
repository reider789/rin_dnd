#!/usr/bin/env python3
"""Derive the next battle snapshot; never change canon or an ongoing session."""
from __future__ import annotations
import copy, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def state_hash(state):
    return hashlib.sha256(json.dumps(state,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def snapshot(project=ROOT):
    state=json.loads((project/'state/_campaign-state.json').read_text(encoding='utf-8'))
    profiles=json.loads((project/'config/combat_profiles.json').read_text(encoding='utf-8'))
    chars={}
    clock=state.get('world',{}).get('timekeeping',{}).get('elapsed_seconds_from_anchor',0)
    continuity={'effects':[],'life':{},'statuses':{},'temporary_hp':{},'temp_sources':{},'objects':[],'zones':[]}
    for cid in state['party']['members']:
        char=state['characters'][cid]
        saved=char.get('combat_continuity',{})
        if saved.get('life'):
            life=copy.deepcopy(saved['life'])
            if char['resources']['hp']['current']>0 and not life['dead']:
                life=dict(dead=False,stable=False,deathSuccesses=0,deathFailures=0)
            continuity['life'][cid]=life
        continuity['statuses'][cid]=[{**z,**({'until':z['expires_at']-clock} if 'expires_at' in z else {})} for z in saved.get('statuses',[]) if 'expires_at' not in z or z['expires_at']>clock]
        if char['resources']['hp']['current']>0:
            continuity['statuses'][cid]=[z for z in continuity['statuses'][cid] if not(z['kind']=='unconscious' and 'until' not in z)]
        continuity['temporary_hp'][cid]=saved.get('temporary_hp',0)
        continuity['temp_sources'][cid]=saved.get('temp_source')
        continuity['effects'] += [{**x,'until':x['expires_at']-clock} for x in saved.get('effects',[]) if x['expires_at']>clock]
        continuity['objects'] += saved.get('objects',[])
        continuity['zones'] += [{**z,'until':z['expires_at']-clock} for z in saved.get('zones',[]) if z.get('expires_at',0)>clock]
        if cid not in profiles['characters']: raise ValueError(f'No verified combat profile for {cid}')
        sheet=char['character_sheet'];profile=copy.deepcopy(profiles['characters'][cid])
        if profile.get('verified_class_and_level')!=sheet['class_and_level']:raise ValueError('Class/level changed: verify combat profile before building '+cid)
        for rus,eng in {'СИЛ':'STR','ЛОВ':'DEX','ТЕЛ':'CON','ИНТ':'INT','МДР':'WIS','ХАР':'CHA'}.items():
            profile['scores'][eng]=int(sheet['abilities'][rus].split()[0])
        profile['ac']=int(sheet['armor_class']);profile['speed']=int(sheet['speed'].split()[0])
        inv=[{'id':iid,**copy.deepcopy(r),'combat_available':'при себе' in r.get('status','') and r['quantity']>0} for iid,r in char['inventory_catalog'].items()]
        chars[cid]={'name':char['name'],'class_and_level':sheet['class_and_level'],'ac_description':sheet['armor_class'],'speed':sheet['speed'],
            'resources':copy.deepcopy(char['resources']),'inventory':inv,'consumables':{},'combat_profile':profile,
            'skills_attacks_spells':[{'name':r['cells'][0],'description':' · '.join(str(c) for c in r['cells'][1:])} for r in sheet.get('combat_reference',[]) if r.get('cells')]}
    return {'schema_version':2,'combat_schema_version':30,'campaign_id':state['campaign']['id'],'title':state['campaign'].get('title',state['campaign']['id']),'source':'state/_campaign-state.json',
        'source_state_revision':state['state_revision'],'source_clock':state.get('world',{}).get('timekeeping',{}).get('elapsed_seconds_from_anchor',0),'source_state_sha256':state_hash(state),'is_canonical':False,'characters':chars,
        'npc_profiles':profiles['npc_profiles'],'rules_version':'dnd-2024-2026-10','continuity':continuity}
def build(project=ROOT):
    dest=project/'config/rin_runtime.json';dest.write_text(json.dumps(snapshot(project),ensure_ascii=False,indent=2)+'\n',encoding='utf-8');return dest
if __name__=='__main__': print(build())
