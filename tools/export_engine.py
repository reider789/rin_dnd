#!/usr/bin/env python3
"""Deterministic portable SDK. Deliberate allowlist excludes live campaign data and secrets."""
from pathlib import Path
import argparse,hashlib,json,zipfile
from combat_bundle import ROOT,MODULES,engine_version
FILES=MODULES+['sdk/index.js','sdk/cli.js','sdk/verify.js','web/shell.html','web/desktop.css',
 'tools/combat_bundle.py','tools/combat_resources.py','tools/build_combat.py','tools/export_engine.py','tools/audit_havengard.py',
 'tests/test_content_packs.js','tests/test_class_features.js','tests/test_defenses.js','tests/test_martial_features.js','tests/test_desktop_reliability.js','examples/portable/border-watch.json','examples/portable/class-defense-lab.json','docs/CONTENT_PACKS.md','docs/CLASS_FEATURES.md','docs/PORTABLE_ENGINE.md']
def export(output,root=ROOT):
    content={name:(root/name).read_bytes() for name in FILES}
    content['README.md']=(root/'docs/PORTABLE_ENGINE.md').read_bytes()
    manifest={'kind':'dnd-combat-engine-package','version':1,'engine_version':engine_version(root),'content_api':1,
      'rules_version':'dnd-2024-2026-10','files':{k:hashlib.sha256(v).hexdigest() for k,v in sorted(content.items())}}
    content['engine-manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(content.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
    return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(export(a.output))
