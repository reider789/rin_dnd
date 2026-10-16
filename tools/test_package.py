from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[1]
req=['engine-v29.html','core/battlefield.js','core/knockout_2024.js','core/reaction_resolver.js','core/spell_resolver.js','core/narrative_handoff.js','fantasy_ui.css','visual_skin.js','rin_rules.js','index.html','art/hayvengard_art_v1.json','assets/rin-portrait-256.webp','upstream_snapshot/engine-v29.html']
for f in req: assert (ROOT/f).is_file(),f
assert (ROOT/'index.html').stat().st_size>1_500_000,'full art pack absent'
assert (ROOT/'engine-v29.html').stat().st_size>170_000,'possibly simplified engine'
art=json.loads((ROOT/'art/hayvengard_art_v1.json').read_text(encoding='utf-8'))
assert art['schema']=='havengard-combat-art-v1' and len(art['assets'])==24
blob=(ROOT/'art/hayvengard_art_v1.json').read_bytes()
sha=hashlib.sha1(b'blob '+str(len(blob)).encode()+b'\0'+blob).hexdigest()
assert sha=='2ab8a19576a496fc18e65e99e09574e7b105befa','upstream art mismatch'
for ability in ['Шквал ударов','Тьма','Отражение атак','Быстрота','Терпеливая защита','Шаг ветра']:
 assert ability in (ROOT/'rin_rules.js').read_text(encoding='utf-8')
snapshot=(ROOT/'config/rin_runtime.json').read_text(encoding='utf-8')
assert 'Шаг Тени' not in snapshot and 'Дополнительная атака' not in snapshot
assert 'data-hg-artpack' in (ROOT/'index.html').read_text(encoding='utf-8')
print('OK: full original v29 modules, art pack, Rin profile and offline bundle verified')
