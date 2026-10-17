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
def prepare(report,state):
    if report.get('kind') not in {'rin-combat-result','dnd-combat-result'} or report.get('version')!=30 or report.get('phase')!='ended':raise ValueError('Нужен завершённый отчёт v30')
    if report.get('session_kind')!='story':raise ValueError('Учебный бой не применяется к кампании')
    if report.get('campaign_id')!=state['campaign']['id']:raise ValueError('Другая кампания')
    battle=report.get('battle_id')
    if not isinstance(battle,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,120}',battle):raise ValueError('Нужен постоянный battle_id')
    if not isinstance(report.get('source_revision'),int):raise ValueError('Нет исходной ревизии')
    seconds=report.get('elapsed_seconds')
    if not isinstance(seconds,int) or isinstance(seconds,bool) or not 0<=seconds<=86400:raise ValueError('Неверная длительность боя')
    if not isinstance(report.get('events'),list) or not any(e.get('type')=='battleEnded' for e in report['events']):raise ValueError('Нет события завершения боя')
    eid='combat-'+hashlib.sha256((report['campaign_id']+':'+battle).encode()).hexdigest()[:32]
    operations=[]
    before,after=report.get('before',{}),report.get('after',{})
    if not after or any(cid not in state['party']['members'] for cid in after):raise ValueError('Неверные участники отчёта')
    for cid,resources in after.items():
        if not isinstance(resources,dict) or set(resources)!=(set(before.get(cid,{}))&RESOURCES):raise ValueError('Неполный набор ресурсов')
        for key,now in resources.items():
            old=before[cid][key]
            if key=='spell_slots':
                if not isinstance(now,dict) or set(now)!=set(old):raise ValueError('Неполный набор ячеек')
                for level,pool in now.items():
                    original=old[level]
                    if not re.fullmatch('[1-9]',level) or not isinstance(pool,dict) or set(pool)!={'current','max'}:raise ValueError('Неверная ячейка')
                    if not isinstance(pool['current'],int) or isinstance(pool['current'],bool) or pool['max']!=original['max'] or not 0<=pool['current']<=pool['max']:raise ValueError('Недопустимое изменение ячейки')
                if now!=old:operations.append({'type':'set_character_resource','id':cid,'resource':'spell_slots','value':{level:{**old[level],**pool} for level,pool in now.items()}})
                continue
            if not isinstance(now,dict) or set(now)!={'current','max'} or not isinstance(now['current'],int) or isinstance(now['current'],bool):raise ValueError('Неверный счётчик')
            if now['max']!=old['max'] or now['current']<0 or now['current']>now['max']:raise ValueError('Недопустимое изменение ресурса')
            delta=now['current']-old['current']
            if delta:operations.append({'type':'adjust_resource','id':cid,'resource':key,'delta':delta})
    inv_before,inv_after=report.get('inventory_before',{}),report.get('inventory_after',{})
    if set(inv_before)!=set(inv_after):raise ValueError('Неполный инвентарь отчёта')
    for cid,items in inv_after.items():
        if cid not in state['party']['members'] or set(items)!=set(inv_before[cid]):raise ValueError('Неверный инвентарь участника')
        catalog=state['characters'][cid]['inventory_catalog']
        for iid,qty in items.items():
            if iid not in catalog or not isinstance(qty,int) or isinstance(qty,bool) or qty<0 or qty>inv_before[cid][iid]:raise ValueError('Неверный расход предмета')
            if catalog[iid].get('name')=='Стрелы' or iid=='arrows':
                if qty!=after[cid]['arrows']['current']:raise ValueError('Стрелы расходятся между ресурсами и инвентарём')
            elif qty!=inv_before[cid][iid]:operations.append({'type':'adjust_item_quantity','id':cid,'item':iid,'delta':qty-inv_before[cid][iid]})
    if seconds:operations.append({'type':'advance_time','seconds':seconds})
    tx={'expected_state_revision':report['source_revision'],'unique_key':'combat:'+report['campaign_id']+':'+battle,
        'event':{'id':eid,'summary':'Завершён бой '+battle+'. Ресурсы перенесены из проверенного боевого отчёта.','visibility':'party',
                 'combat':{'battle_id':battle,'result_sha256':digest(report),'elapsed_seconds':report.get('elapsed_seconds',0),'participants':report.get('participants',{})}},'operations':operations}
    # Existing receipt is checked BEFORE the stale-state guard; exact replay is a no-op.
    if eid not in state.get('applied_events',{}):
        if state['state_revision']!=report['source_revision'] or state_hash(state)!=report.get('source_state_sha256'):raise ValueError('Канон изменился после начала боя; нужен разбор конфликта')
        for cid in after:
            if before[cid]!=state['characters'][cid]['resources']:raise ValueError('Исходные ресурсы не соответствуют канону')
        for cid,items in inv_before.items():
            if any(state['characters'][cid]['inventory_catalog'].get(iid,{}).get('quantity')!=qty for iid,qty in items.items()):raise ValueError('Исходный инвентарь не соответствует канону')
    build_result(state,tx)  # Includes receipt hash, resource bounds and ammunition catalog validation.
    return tx

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
