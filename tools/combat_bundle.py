"""Shared offline assembler: campaign data is supplied by the caller."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
MODULES=['core/battlefield.js','core/capabilities.js','core/content_pack.js','core/rules_engine.js','core/tactical_ai.js','core/campaign_adapter.js','web/combat_app.js']
def encoded(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
def engine_version(root=ROOT):return re.search(r'static ENGINE = "([^"]+)"',(root/'core/capabilities.js').read_text()).group(1)
def render(runtime,scene,art=None,root=ROOT):
    html=(root/'web/shell.html').read_text(encoding='utf-8')
    values={'STYLE':(root/'web/desktop.css').read_text(encoding='utf-8'),'RUNTIME':encoded(runtime),'SCENE':encoded(scene),'ART':encoded(art or {'assets':{}}),'CODE':'\n\n'.join((root/p).read_text(encoding='utf-8') for p in MODULES)}
    for marker,value in values.items():
        token='/*__'+marker+'__*/'
        if html.count(token)!=1:raise ValueError('Missing build marker '+marker)
        html=html.replace(token,value)
    return html
