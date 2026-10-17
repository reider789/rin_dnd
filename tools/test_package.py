from pathlib import Path
import json,re
from build_rin import build
ROOT=Path(__file__).resolve().parents[1]
build(check=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
assert not re.search(r'<script[^>]+src=',html,re.I), 'Unexpected executable dependency'
assert '/*__CODE__*/' not in html
assert 'class CombatRulesEngine' in html and 'class CombatTacticalAI' in html
for name in ('yar','daphne','lyutobor','rada'):
    assert name not in (ROOT/'core/rules_engine.js').read_text(), 'Named hero in domain kernel'
assert json.loads((ROOT/'rin-build-manifest.json').read_text())['version']==30
print('V30 PACKAGE OK: fresh canonical hash, reproducible bundle, offline code, generic kernel')
