from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'upstream_snapshot/visual_skin.js').read_text(encoding='utf-8')
s=s.replace("'obstacles.wall','obstacles.rubble'","'obstacles.wall','obstacles.rubble','heroes.rin'")
s=s.replace("const HG_SKIN_STORAGE='havengard-chat-visual-pack-1';","const HG_SKIN_STORAGE='rin-veir-combat-visual-pack-1';")
s=s.replace("'https://cdn.jsdelivr.net/gh/reider789/havengard-campaign-engine@acb428fc97a3281800feb7111931cc73d058a67c/prototypes/chat-combat/art/hayvengard_art_v1.json'","'./art/hayvengard_art_v1.json'")
s=s.replace("const k=heroes.includes(id)?'heroes.'+id:'enemies.'+hgSkinEnemy(id);", "const k=id==='rin'?'heroes.rin':heroes.includes(id)?'enemies.warrior':'enemies.'+hgSkinEnemy(id);")
s=s.replace("'✓ 4 фона · 4 героя · 8 типов врагов · препятствия'","'✓ 4 фона · Рин · караванные стражи · 8 типов врагов · препятствия'")
s=s.replace("function hgSkinAutoLoad(){","function hgSkinAutoLoad(){\n const local=root.querySelector('script[data-hg-artpack]')?.textContent;\n if(local){try{hgSkinAssets=hgSkinValidate(JSON.parse(local));hgSkinNotice='';render();return;}catch(_){}}")
(ROOT/'visual_skin.js').write_text(s,encoding='utf-8')
