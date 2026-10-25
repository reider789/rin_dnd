"""Shared report validation; the SDK owns the continuation schema."""
import hashlib,json,re,subprocess
from pathlib import Path
from combat_resources import RESOURCES

def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()

def validate_continuity(report):
    """Read-only validation using the same domain code as the offline SDK."""
    cli=Path(__file__).resolve().parents[1]/'sdk/cli.js'
    try:
        result=subprocess.run(['node',str(cli),'validate-continuity'],
            input=json.dumps({'continuity':report['continuity'],'after':report['after']},ensure_ascii=False),
            text=True,capture_output=True,timeout=20)
    except (OSError,subprocess.TimeoutExpired) as error:
        raise ValueError('Не удалось проверить продолжение через SDK') from error
    if result.returncode:raise ValueError(result.stderr.strip() or 'Неверное продолжение боя')
    return json.loads(result.stdout)

def prepare_report(report,state,build_result,state_hash):
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
    continuity=validate_continuity(report) if report.get('continuity') is not None else None
    if continuity is None and any(r.get('hp',{}).get('current',0)==0 for r in after.values()):
        raise ValueError('Для героя с нулём ПЗ нужен отчёт с состоянием жизни')
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
            if now['current']<0 or now['current']>now['max']:raise ValueError('Недопустимое изменение ресурса')
            if now['max']!=old['max']:
                if key!='hp':raise ValueError('Недопустимое изменение максимума')
                old_aid=sum(x.get('amount',0) for x in report.get('continuity_before',{}).get('effects',[]) if x['kind']=='aid' and cid in x['targets'])
                new_aid=sum(x.get('amount',0) for x in report.get('continuity',{}).get('effects',[]) if x['kind']=='aid' and cid in x['targets'])
                if not isinstance(new_aid,int) or not 0<=new_aid<=40 or now['max']-old['max']!=new_aid-old_aid:raise ValueError('Максимум ПЗ не соответствует Помощи')
                operations.append({'type':'set_character_resource','id':cid,'resource':key,'value':now,'capacity_reason':'Временная прибавка максимума ПЗ от подтверждённого заклинания Помощь'})
                continue
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
    if continuity is not None:
        clock=report.get('source_clock',0)+seconds
        if not isinstance(clock,int) or clock<seconds:raise ValueError('Неверные часы боя')
        effects=continuity.get('effects',[])
        for effect in effects:
            if not isinstance(effect.get('remaining_seconds'),int) or not 0<effect['remaining_seconds']<=86400:raise ValueError('Неверный действующий эффект')
        for cid in after:
            selected=[{**effect,'expires_at':clock+effect['remaining_seconds']} for effect in effects if effect['owner']==cid]
            value={'effects':selected,'temporary_hp':continuity.get('temporary_hp',{}).get(cid,0),'temp_source':continuity.get('temp_sources',{}).get(cid),'recorded_at':clock,'summons':[u for u in continuity.get('units',[]) if u.get('summoner')==cid],'objects':[o for o in continuity.get('objects',[]) if o.get('owner')==cid],'zones':[{**z,'expires_at':clock+z['remaining_seconds']} for z in continuity.get('zones',[]) if z.get('owner')==cid], 'statuses':[{**z,**({'expires_at':clock+z['until']-seconds} if 'until' in z else {})} for z in continuity.get('statuses',{}).get(cid,[]) if 'until' not in z or z['until']>seconds]}
            vials=[dict(v) for v in continuity.get('cauldron_vials',[]) if v['owner']==cid]
            if vials or state['characters'][cid].get('combat_continuity',{}).get('cauldron_vials'):
                value['cauldron_vials']=vials
            if 'exhaustion' in continuity or 'exhaustion' in state['characters'][cid].get('combat_continuity',{}):
                value['exhaustion']=continuity.get('exhaustion',{}).get(cid,0)
            if cid in continuity.get('life',{}):value['life']=continuity['life'][cid]
            if 'scene' in continuity:value['scene']=continuity['scene']
            for summon in value['summons']:
                sid=summon['id']
                # Old reports kept summons only in units. Preserve their exact
                # transaction payload so an existing receipt remains a no-op.
                if not any(sid in continuity.get(k,{}) for k in ('life','statuses','temporary_hp','temp_sources')):continue
                summon['persistent_statuses']=[{**z,**({'expires_at':clock+z['until']-seconds} if 'until' in z else {})} for z in continuity.get('statuses',{}).get(sid,[]) if 'until' not in z or z['until']>seconds]
                summon['persistent_temp']=continuity.get('temporary_hp',{}).get(sid,0)
                summon['persistent_temp_source']=continuity.get('temp_sources',{}).get(sid)
                if sid in continuity.get('life',{}):summon['persistent_life']=continuity['life'][sid]
            if not isinstance(value['temporary_hp'],int) or not 0<=value['temporary_hp']<=1000:raise ValueError('Неверные временные ПЗ')
            operations.append({'type':'set_character_field','id':cid,'field':'combat_continuity','value':value})
            resources=state['characters'][cid]['resources']
            if 'mage_armor' in resources:
                active=any(x['kind']=='mageArmor' and cid in x['targets'] for x in effects)
                operations.append({'type':'set_character_resource','id':cid,'resource':'mage_armor','value':'активен' if active else 'не активен'})
            if 'concentration' in resources:
                active=[x['kind'] for x in effects if x['owner']==cid and x.get('concentration')]
                operations.append({'type':'set_character_resource','id':cid,'resource':'concentration','value':', '.join(active) or 'нет'})
    if seconds:operations.append({'type':'advance_time','seconds':seconds})
    tx={'expected_state_revision':report['source_revision'],'unique_key':'combat:'+report['campaign_id']+':'+battle,
        'event':{'id':eid,'summary':'Завершён бой '+battle+'. Ресурсы перенесены из проверенного боевого отчёта.','visibility':'party',
                 'combat':{'battle_id':battle,'result_sha256':digest(report),'elapsed_seconds':report.get('elapsed_seconds',0),'participants':report.get('participants',{})}},'operations':operations}
    # Existing receipt is checked BEFORE the stale-state guard; exact replay is a no-op.
    if eid not in state.get('applied_events',{}):
        if state['state_revision']!=report['source_revision'] or state_hash(state)!=report.get('source_state_sha256'):raise ValueError('Канон изменился после начала боя; нужен разбор конфликта')
        if report.get('continuity') is not None and report.get('source_clock',0)!=state.get('world',{}).get('timekeeping',{}).get('elapsed_seconds_from_anchor',0):raise ValueError('Исходные часы боя не соответствуют канону')
        for cid in after:
            if before[cid] not in (state['characters'][cid]['resources'],{k:v for k,v in state['characters'][cid]['resources'].items() if k in RESOURCES}):raise ValueError('Исходные ресурсы не соответствуют канону')
        for cid,items in inv_before.items():
            if any(state['characters'][cid]['inventory_catalog'].get(iid,{}).get('quantity')!=qty for iid,qty in items.items()):raise ValueError('Исходный инвентарь не соответствует канону')
    build_result(state,tx)  # Includes receipt hash, resource bounds and ammunition catalog validation.
    return tx

