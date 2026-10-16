#!/usr/bin/env python3
"""Full interactive settlement-map UI, powered by Rin campaign state.
The original fixed Havengard v3 adapter lives in upstream_campaign/tools/.
No settlement is invented while the player has none.
"""
from __future__ import annotations
import json
from decimal import Decimal
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def make_data(project:Path=ROOT)->dict:
    state=json.loads((project/'state/_campaign-state.json').read_text(encoding='utf-8'))
    world=state['world']; city=world.get('city')
    layout=json.loads((project/'map/layout-base.json').read_text(encoding='utf-8'))
    objects=list(layout.get('objects', []))
    positions={}
    sites=[];house=[];residents=[];projects=[]
    if isinstance(city,dict):
      sites=city.get('worksites',[])
      house=city.get('housing',[])
      residents=city.get('residents',[])
      projects=city.get('projects',[])
      for key,pos in city.get('layout',{}).get('placements',{}).items():
        if not isinstance(pos,dict):continue
        try:
          x=float(pos['x_m'])/10;y=float(pos['y_m'])/10; w=float(pos['width_m'])/10;h=float(pos['height_m'])/10
          if key not in {o['id'] for o in objects}:
            objects.append({'id':key,'name':pos.get('name',key),'x':x,'y':y,'w':w,'h':h,'category':pos.get('category','civic')})
          positions[key]={'x':x,'y':y}
        except (ValueError,KeyError,TypeError):pass
    treasury=world.get('city_treasury_cp')
    reserve=world.get('city_food_reserve_pe')
    target=world.get('city_food_target_pe')
    objids=[o['id'] for o in objects]
    if len(set(objids))!=len(objids): raise ValueError('duplicate map object ID')
    return {
       'schema':'rin.settlement.map.v1','revision':state['state_revision'],'month':world.get('date_label','дата неизвестна'),
       'source':'state/_campaign-state.json','objects':objects,'saved_positions':positions,
       'population':len(residents) if residents else (world.get('city_population') if city else 'не определено'),
       'ordinary_occupied':sum(int(x.get('current_occupants') or 0) for x in house),
       'comfortable_capacity':'не определено' if not house else sum(int(x.get('comfortable_capacity') or 0) for x in house),
       'separate_residents':0 if not city else world.get('city_population',0),
       'treasury_gp':str(Decimal(treasury)/100) if isinstance(treasury,int) else 'не установлена',
       'food_reserve_pe':reserve if reserve is not None else 'не установлено',
       'food_target_pe':target if target is not None else 'не установлено',
       'food_shortfall_pe':world.get('city_food_shortfall_pe','не установлено'),
       'worksites_count':len(sites),'garrison':city.get('garrison_count',0) if city else 0,
       'projects':projects,'has_city':bool(city),'settlement_name':city.get('name','Поселение Рина') if city else 'Владения пока не получены',
       'rein_project':None,'wall_project':None,
    }

def build(project:Path=ROOT)->Path:
    data=make_data(project)
    tpl=(project/'map/template.html').read_text(encoding='utf-8')
    marker='/*CITY_JSON*/'
    if tpl.count(marker)!=1:raise ValueError('Expected one JSON marker')
    result=tpl.replace(marker,json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'))
    output=project/'map/offline.html';output.parent.mkdir(exist_ok=True,parents=True);output.write_text(result,encoding='utf-8')
    return output
if __name__=='__main__':
    print(build())
