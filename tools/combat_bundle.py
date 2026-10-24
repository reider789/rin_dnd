"""Shared offline assembler: campaign data is supplied by the caller."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
MODULES=['core/battlefield.js','core/capabilities.js','core/activities.js','core/combat_journal.js','core/content_pack.js','core/class_features.js','core/defenses.js','core/martial_features.js','core/magic.js','core/advanced_features.js','core/continuity.js','core/rules_engine.js','core/tactical_ai.js','core/campaign_adapter.js','web/session_store.js','core/visual_fx.js','web/combat_app.js']
def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
def engine_version(root=ROOT):return re.search(r'static ENGINE = "([^"]+)"',(root/'core/capabilities.js').read_text()).group(1)
def scene_art(runtime,scene,art):
    """Keep only assets used by this encounter; full pack remains an opt-in."""
    keys={'backgrounds.'+scene.get('theme','forest'),'enemies.warrior','enemies.archer'}
    if scene.get('walls'):keys.add('obstacles.wall')
    if scene.get('rubble'):keys.add('obstacles.rubble')
    for cid,data in scene.get('heroes',{}).items():
        token=data.get('tokenKey') or runtime.get('characters',{}).get(cid,{}).get('combat_profile',{}).get('tokenKey')
        if token:keys.add(token)
    for enemy in scene.get('enemies',[]):
        token=enemy.get('tokenKey','warrior')
        keys.add(token if '.' in token else 'enemies.'+token)
    return {**art,'assets':{k:v for k,v in art.get('assets',{}).items() if k in keys}}
def render(runtime,scene,art=None,root=ROOT):
    html=(root/'web/shell.html').read_text(encoding='utf-8')
    values={'STYLE':(root/'web/desktop.css').read_text(encoding='utf-8'),'RUNTIME':encoded(runtime),'SCENE':encoded(scene),'ART':encoded(art or {'assets':{}}),'CODE':'\n\n'.join((root/p).read_text(encoding='utf-8') for p in MODULES)}
    for marker,value in values.items():
        token='/*__'+marker+'__*/'
        if html.count(token)!=1:raise ValueError('Missing build marker '+marker)
        html=html.replace(token,value)
    return html
