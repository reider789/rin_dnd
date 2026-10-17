#!/usr/bin/env python3
"""One entry point for campaign, rules, scenarios, generated bundle and optional browser QA."""
from pathlib import Path
import argparse,subprocess,sys
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--browser',action='store_true');a=p.parse_args()
def run(*args):subprocess.run(args,cwd=root,check=True)
for f in sorted((root/'tests_campaign').glob('test_*.py')):run(sys.executable,str(f))
run(sys.executable,'tools/campaignctl.py','--project',str(root),'check')
run(sys.executable,'tools/campaignctl.py','--project',str(root),'check-views')
run('node','--test','tests/test_rules_v30.js','tests/test_scenarios_v30.js')
run(sys.executable,'tools/test_package.py')
if a.browser:run(sys.executable,'tools/test_browser_v30.py')
