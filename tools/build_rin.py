#!/usr/bin/env python3
"""Build the complete Havengard v29 combat UI with Rin campaign profiles.
Original unmodified v29 snapshot and all original core modules remain in repo.
"""
import json, base64, hashlib, argparse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ORDER=[
 ('/*__HV_COMBAT_CORE_MODULES__*/',['dice.js','journal.js','conditions.js','battlefield.js','state_port.js','dom_renderer.js','persistence.js']),
 ('/*__HV_SPELL_RESOLVER__*/',['spell_resolver.js']),
 ('/*__HV_REACTION_RESOLVER__*/',['reaction_resolver.js']),
]
TERM='\n})();\n</script>'

def build(root=ROOT,scene=None):
 engine=(root/'engine-v29.html').read_text(encoding='utf-8')
 for marker,paths in ORDER:
  assert engine.count(marker)==1, f'Cannot find {marker}'
  engine=engine.replace(marker,'\n'.join((root/'core'/p).read_text(encoding='utf-8') for p in paths),1)
 assert engine.count('/*__RIN_ADAPTER__*/')==1
 adapter=(root/'rin_rules.js').read_text(encoding='utf-8')
 portrait=(root/'assets/rin-portrait-256.webp').read_bytes()
 adapter=adapter.replace('__RIN_PORTRAIT_DATA__','data:image/webp;base64,'+base64.b64encode(portrait).decode())
 engine=engine.replace('/*__RIN_ADAPTER__*/',adapter,1)
 skin=(root/'visual_skin.js').read_text(encoding='utf-8')
 assert engine.count(TERM)==1
 engine=engine.replace(TERM,'\n'+skin+TERM,1)
 css=(root/'fantasy_ui.css').read_text(encoding='utf-8')
 engine=engine.replace('</style>','</style>\n<style>\n'+css+'\n#hv12 .tile.rin-dark-tile {background:#0d1030ee!important;box-shadow:inset 0 0 0 1px #6a60b3bd} \n#hv12 .rin-dark-tile .unit {z-index:4}\n</style>',1)
 fx=(root/'core/visual_fx.js').read_text(encoding='utf-8')
 engine=engine.replace(TERM,'\nroot.classList.add("hv-fantasy");\n'+fx+
   '\ncombatFX=new CombatVisualFX(root,()=>s,()=>names);\n'+
   'const oldFXRender=render;render=function(){oldFXRender();combatFX?.afterRender()};\n'+TERM,1)
 handoff=(root/'core/narrative_handoff.js').read_text(encoding='utf-8')
 engine=engine.replace(TERM,'\n'+handoff+'\n'+
   'const combatHandoff=new CombatNarrativeHandoff({root,state:()=>s,runtime:()=>runtime,party:()=>heroes,enemies:()=>foes,names:()=>names,outcome:()=>v21Outcome(),log,render:()=>render(),save:()=>hostSave()});\n'+TERM,1)
 ko=(root/'core/knockout_2024.js').read_text(encoding='utf-8')
 port=('const knockout2024=new CombatKnockout2024({'+'getState:()=>s,getHurt:()=>hurt,setHurt:f=>{hurt=f},'
  'getHeal:()=>heal,setHeal:f=>{heal=f},getAfterWeaponHit:()=>afterWeaponHit,setAfterWeaponHit:f=>{afterWeaponHit=f},'
  'getEnemyTurn:()=>enemyTurn,setEnemyTurn:f=>{enemyTurn=f},getRender:()=>render,setRender:f=>{render=f},'
  'root:()=>root,party:()=>heroes,foes:()=>foes,names:()=>names,log,addStatus,removeStatus,save:()=>hostSave(),render:()=>render(),escape:esc,'
  'isMeleeWeapon:(attacker,weapon,target)=>{const w=weapons[attacker]?.find(v=>v[0]===weapon);return Boolean(w&&(w[7]===5||(weapon==="dagger"&&dist(s.units[attacker],s.units[target])<=5)));}});')
 engine=engine.replace(TERM,'\n'+ko+'\n'+port+TERM,1)
 runtime=json.dumps(json.loads((root/'config/rin_runtime.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
 if scene is None: scene=root/'encounters/caravan_ambush_training.json'
 scene=json.dumps(json.loads(Path(scene).read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
 # Offline art pack from original Havengard, plus Rin's newly generated portrait.
 artpack=json.loads((root/'art/hayvengard_art_v1.json').read_text(encoding='utf-8'))
 artpack['assets']['heroes.rin']={'mime':'image/webp','data':'data:image/webp;base64,'+base64.b64encode(portrait).decode()}
 art_text=json.dumps(artpack,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
 tags='<script type="application/json" data-hg-runtime>'+runtime+'</script>\n<script type="application/json" data-rin-default-scene>'+scene+'</script>\n<script type="application/json" data-hg-artpack>'+art_text+'</script>\n'
 engine=engine.replace('<div id="hv12">','<div id="hv12">\n'+tags,1)
 # Full HTML, no external executable code. Original v29 assets load by CDN optional; local portrait always bundled.
 html=('< !doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  '<title>Рин Вейр — Тактический бой v29</title></head><body style="background:#101b25;padding:10px;margin:0">' + engine + '</body></html>').replace('< !doctype','<!doctype')
 (root/'index.html').write_text(html,encoding='utf-8')
 manifest={'name':'rin-veir-combat','engine':'full-havengard-v29-adaptation','origin':'reider789/havengard-campaign-engine','source_engine':'upstream_snapshot/engine-v29.html',
  'player':'Рин Вейр','scene':'caravan_ambush_training','offline_rules':True,'art_pack':'embedded offline original Havengard 24 assets plus portrait Rin 25th','bundle_sha256':hashlib.sha256(html.encode()).hexdigest(),'bytes':len(html.encode())}
 (root/'rin-build-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return manifest
if __name__=='__main__':print(json.dumps(build(),ensure_ascii=False,indent=2))
