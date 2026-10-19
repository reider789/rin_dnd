#!/usr/bin/env python3
"""Reproducible offline v30 bundle. Canonical state is read-only."""
import argparse,base64,hashlib,json
from pathlib import Path
from sync_combat_runtime import snapshot
from combat_bundle import MODULES, render, engine_version, scene_art
ROOT=Path(__file__).resolve().parents[1]
def build(root=ROOT,scene=None,check=False,full_art=False):
    runtime=snapshot(root)
    canonical_path=root/'config/rin_runtime.json'
    runtime_text=json.dumps(runtime,ensure_ascii=False,indent=2)+'\n'
    scene_path=Path(scene) if scene else root/'encounters/caravan_ambush_training.json'
    encounter=json.loads(scene_path.read_text(encoding='utf-8'))
    if encounter.get('kind')=='story' and (encounter.get('source_revision')!=runtime['source_state_revision'] or encounter.get('source_state_sha256')!=runtime['source_state_sha256']):
        raise ValueError('Story scenario does not match canonical state')
    if encounter.get('kind')!='story':encounter['source_revision']=runtime['source_state_revision']
    art=json.loads((root/'art/hayvengard_art_v1.json').read_text(encoding='utf-8'))
    portrait=(root/'assets/rin-portrait-256.webp').read_bytes()
    art['assets']['heroes.rin']={'mime':'image/webp','data':'data:image/webp;base64,'+base64.b64encode(portrait).decode()}
    if not full_art:art=scene_art(runtime,encounter,art)
    files=MODULES+['web/shell.html','web/desktop.css','config/combat_profiles.json',str(scene_path.relative_to(root))]
    manifest={'name':'rin-veir-combat','version':30,'engine_version':engine_version(root),'rules_version':runtime['rules_version'],
      'source_state_revision':runtime['source_state_revision'],'source_state_sha256':runtime['source_state_sha256'],
      'sources':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in files}}
    html=render(runtime,encounter,art,root)
    manifest.update(bundle_sha256=hashlib.sha256(html.encode()).hexdigest(),bytes=len(html.encode()),art_mode='full' if full_art else 'scene',art_assets=sorted(art['assets']))
    entry={'schema_version':3,'engine':'rin-combat-v30','engine_version':manifest['engine_version'],'desktop_only':True,'main_ui_path':'index.html','source_engine':'web/shell.html','source_modules':MODULES,
      'runtime':'config/rin_runtime.json','default_training':'encounters/caravan_ambush_training.json','canonical':False,
      'mode':'offline-desktop','save_session':'dnd-combat-session-v30','narrative_handoff':'rin-combat-result-v30'}
    current={'schema_version':3,'engine':'v30','engine_version':manifest['engine_version'],'current_ui_path':'index.html','source_state':'config/rin_runtime.json','mode':encounter.get('kind','training'),
      'canonical':False,'source_state_revision':runtime['source_state_revision'],'source_state_sha256':runtime['source_state_sha256'],
      'bundle_sha256':manifest['bundle_sha256'],'bundle_size_bytes':manifest['bytes'],'battle_handoff':'rin-combat-result-v30'}
    outputs={canonical_path:runtime_text,root/'index.html':html,root/'rin-build-manifest.json':json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',
      root/'entrypoint.json':json.dumps(entry,ensure_ascii=False,indent=2)+'\n',root/'current-manifest.json':json.dumps(current,ensure_ascii=False,indent=2)+'\n'}
    for dest,content in outputs.items():
        if check:
            if not dest.is_file() or dest.read_text(encoding='utf-8')!=content:raise ValueError(f'Stale generated file: {dest.name}; run python tools/build_rin.py')
        else:dest.write_text(content,encoding='utf-8')
    return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--scene',type=Path);p.add_argument('--full-art',action='store_true');a=p.parse_args()
    print(json.dumps(build(scene=a.scene,check=a.check,full_art=a.full_art),ensure_ascii=False,indent=2))
