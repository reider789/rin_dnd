"""Exercise the delivered archive in a different directory with no Rin campaign files."""
from pathlib import Path
import os,subprocess,tempfile,zipfile,sys
from export_engine import export
with tempfile.TemporaryDirectory(prefix='portable-combat-') as tmp:
    tmp=Path(tmp);a=export(tmp/'a.zip');b=export(tmp/'b.zip');assert a.read_bytes()==b.read_bytes()
    target=tmp/'another account';target.mkdir()
    with zipfile.ZipFile(a) as z:
        assert all(not n.startswith(('state/','config/','gm/','views/','upstream')) for n in z.namelist())
        z.extractall(target)
    def run(*args):subprocess.run(args,cwd=target,check=True,stdout=subprocess.DEVNULL)
    run('node','sdk/verify.js');run('node','sdk/cli.js','validate','examples/portable/border-watch.json')
    run('node','--test','tests/test_magic.js','tests/test_correctness_30_5_1.js','tests/test_content_packs.js','tests/test_class_features.js','tests/test_defenses.js','tests/test_martial_features.js')
    run(sys.executable,'tools/build_combat.py','--pack','examples/portable/border-watch.json','--output','dist/battle.html')
    assert (target/'dist/battle.html').is_file()
    f=target/'core/rules_engine.js';f.write_text(f.read_text()+'\n// edited\n')
    assert subprocess.run(['node','sdk/verify.js'],cwd=target,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0
print('PORTABLE EXPORT OK: deterministic allowlisted archive, isolated build, SDK checks, checksum verification')
