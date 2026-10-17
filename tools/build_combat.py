#!/usr/bin/env python3
"""Build any validated combat pack with the same engine and desktop UI."""
from pathlib import Path
import argparse,json,subprocess
from combat_bundle import ROOT,render

def build(pack,output,encounter=None):
    command=['node',str(ROOT/'sdk/cli.js'),'compile',str(Path(pack).resolve())]
    if encounter:command.append(encounter)
    data=json.loads(subprocess.check_output(command,cwd=ROOT,text=True))
    html=render(data['runtime'],data['scene'])
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(html,encoding='utf-8')
    return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pack',type=Path,required=True);p.add_argument('--encounter');p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(build(a.pack,a.output,a.encounter))
