#!/usr/bin/env python3
"""Validate a completed story battle and prepare one idempotent campaign transaction."""
from __future__ import annotations
import argparse,hashlib,json,re,subprocess,sys,tempfile
from pathlib import Path
from sync_combat_runtime import state_hash
from campaignctl import build_result
ROOT=Path(__file__).resolve().parents[1]
from combat_resources import RESOURCES

def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
from combat_handoff import prepare_report

def prepare(report,state):
    return prepare_report(report,state,build_result,state_hash)

def main():
    p=argparse.ArgumentParser();p.add_argument('report',type=Path);p.add_argument('--project',type=Path,default=ROOT);p.add_argument('--output',type=Path);p.add_argument('--apply',action='store_true');a=p.parse_args()
    state=json.loads((a.project/'state/_campaign-state.json').read_text(encoding='utf-8'));report=json.loads(a.report.read_text(encoding='utf-8'))
    tx=prepare(report,state);text=json.dumps(tx,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.write_text(text,encoding='utf-8')
    if a.apply:
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'combat.json';f.write_text(text,encoding='utf-8')
            subprocess.run([sys.executable,str(a.project/'tools/campaignctl.py'),'--project',str(a.project),'commit','--transaction',str(f)],check=True)
    else:print(text,end='')
if __name__=='__main__':main()
