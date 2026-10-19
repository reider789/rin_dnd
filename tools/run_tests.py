#!/usr/bin/env python3
"""One entry point for campaign, rules, scenarios, generated bundle and optional browser QA."""
from pathlib import Path
import argparse,subprocess,sys
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--browser',action='store_true');p.add_argument('--suite',choices=['all','campaign','combat'],default='all');a=p.parse_args()
def run(*args):subprocess.run(args,cwd=root,check=True)
if a.suite in ('all','campaign'):
    for f in sorted((root/'tests_campaign').glob('test_*.py')):run(sys.executable,str(f))
    run(sys.executable,'tools/campaignctl.py','--project',str(root),'check')
    run(sys.executable,'tools/campaignctl.py','--project',str(root),'check-views')
if a.suite in ('all','combat'):
    run('node','--test','tests/test_magic.js','tests/test_correctness_30_5_1.js','tests/test_correctness_30_5_2.js','tests/test_rules_v30.js','tests/test_scenarios_v30.js','tests/test_content_packs.js','tests/test_class_features.js','tests/test_defenses.js','tests/test_martial_features.js','tests/test_desktop_reliability.js')
    run(sys.executable,'tools/test_package.py')
    run(sys.executable,'tools/test_portable_export.py')
    if a.browser:
        run(sys.executable,'tools/test_browser_v30.py')
        run(sys.executable,'tools/test_browser_desktop.py')
        run(sys.executable,'tools/test_browser_magic.py')
        run(sys.executable,'tools/test_browser_integrity.py')
