#!/usr/bin/env python3
"""Independent campaign QA, without running unrelated v29R browser test suites."""
from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[1]
for p in sorted((root/'tests_campaign').glob('test_*.py')):
    print(p.name,flush=True)
    subprocess.run([sys.executable,str(p)],cwd=root,check=True)
subprocess.run([sys.executable,str(root/'tools/campaignctl.py'),'--project',str(root),'check'],check=True)
subprocess.run([sys.executable,str(root/'tools/campaignctl.py'),'--project',str(root),'check-views'],check=True)
