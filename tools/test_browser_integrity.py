"""30.5.2 regressions through the real desktop controls and browser storage."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API = 'window.__RIN_TEST_API'


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        page.set_default_timeout(8000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
        page.goto((ROOT / 'index.html').as_uri())
        page.wait_for_function(f'Boolean({API})')
        page.locator('#pack-file').set_input_files(str(ROOT / 'examples/portable/border-watch.json'))
        page.wait_for_function(f"{API}.snapshot().meta.campaignId==='border-watch'")
        page.evaluate(f'''()=>{{{API}.stop();{API}.set(s=>{{
          s.pending=null;s.queue=[];s.started=true;s.phase='active';s.index=s.order.indexOf('ena');s.turnSerial++;
          s.terrain.walls=[];s.terrain.cover={{}};s.zones=[];
          for(const id of s.order){{const u=s.units[id];u.controlled=u.team==='party';u.features={{}};u.statuses=[];u.policies={{heroic:false,luck:false,defenseLuck:false}};}}
          Object.assign(s.units.ena,{{x:2,y:3,action:1,bonus:1,slotTurn:-1,
            casting:{{ability:'INT',attack:11,dc:19,level:10,prepared:['dispelMagic'],cantrips:[]}},
            slots:{{3:{{current:3,max:3}},5:{{current:3,max:3}}}}}});
          Object.assign(s.units.tal,{{x:3,y:3}});
          s.effects=[{{id:'effect-999',kind:'bigbyHand',owner:'tal',targets:[],level:5,dc:19,until:s.elapsed+60,concentration:true}}];
          s.spellFrames={{'effect-999':{{id:'effect-999',actor:'tal',spell:'bigbyHand',level:5,targets:[],offered:[]}}}};
          s.objects={{'effect-999':{{id:'effect-999',owner:'tal',x:5,y:3,hp:50,max:50,ac:20,dc:19,createdTurn:0,grappled:null,interposing:false}}}};
        }});}}''')
        page.locator('#magic-spell').select_option('dispelMagic')
        page.locator('#magic-level').select_option('5')
        page.locator('#magic-dispel').select_option('object:effect-999')
        assert page.locator('[data-op="cast"]').is_enabled()
        page.locator('[data-op="cast"]').click()
        assert page.evaluate(f'{API}.snapshot().objects["effect-999"]') is None
        assert page.evaluate(f'{API}.snapshot().units.ena.slots[5].current') == 2
        page.evaluate(f'''{API}.set(s=>{{s.effects=[{{id:'effect-998',kind:'haste',owner:'ena',targets:['ena'],level:0,dc:10,until:s.elapsed+60,concentration:false,noLethargy:true}}]}})''')
        assert 'Ускорение' in page.locator('#magic').inner_text()
        assert 'haste ·' not in page.locator('#magic').inner_text()
        # The archive menu keeps every control inside its frame at desktop sizes.
        for width, height in [(1366, 768), (1440, 900), (1920, 1080)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.locator('.tools').evaluate('(el)=>el.open=true')
            assert page.locator('.toolbox').evaluate('''el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight && [...el.querySelectorAll('button,select')].every(x=>{const b=x.getBoundingClientRect();return b.left>=r.left && b.right<=r.right})}''')
        page.set_viewport_size({'width': 1440, 'height': 900})

        # Export/delete/restore an old battle through real controls.
        page.locator('[data-op="new"]').click()
        page.evaluate(f'{API}.stop()')
        page.locator('.tools').evaluate('(el)=>el.open=true')
        archived = page.locator('#archive-session option').evaluate_all('(xs)=>xs.map(x=>x.value).filter(Boolean)')
        assert archived
        key = archived[-1]
        page.locator('#archive-session').select_option(key)
        assert page.locator('#archive-delete').is_disabled()
        with page.expect_download() as pending:
            page.locator('[data-op="archive-export"]').click()
        archive_path = pending.value.path()
        archive = json.loads(archive_path.read_text())
        assert archive['kind'] == 'dnd-combat-archive'
        chosen = next(i for i, x in enumerate(archive['sessions']) if x['key'] == key)
        target = archive['sessions'][chosen]['value']['session']['meta']['battleId']
        page.locator('#archive-session').select_option(key)
        assert page.locator('#archive-delete').is_enabled()
        current = page.evaluate(f'{API}.snapshot().meta.battleId')
        page.locator('#archive-delete').click()
        assert page.evaluate('(key)=>localStorage.getItem(key)', key) is None
        assert page.evaluate(f'{API}.snapshot().meta.battleId') == current
        page.locator('#import-file').set_input_files(str(archive_path))
        page.locator('#archive-imported').select_option(str(chosen))
        page.locator('#archive-restore').click()
        page.evaluate(f'{API}.stop()')
        assert page.evaluate(f'{API}.snapshot().meta.battleId') == target

        # Long active sessions keep saving; starting another never silently evicts history.
        for n in range(3):
            page.evaluate(f'''{API}.set(s=>{{s.events=Array.from({{length:8000}},(_,i)=>({{
              seq:i+1,turn:10,round:2,type:'audit',actor:s.order[0],text:'Длинный журнал тестового боя. '.repeat(6),rolls:[12,6],total:18
            }}));}})''')
            page.locator('[data-op="save"]').click()
            assert 'Сохранено в этом браузере' in page.locator('#save-status').inner_text()
            key = page.evaluate("localStorage.getItem('dnd-combat-active-session:rin-veir')")
            raw = page.evaluate('(key)=>localStorage.getItem(key)', key)
            assert len(json.loads(raw)['session']['events']) == 8000
            previous_id = page.evaluate(f'{API}.snapshot().meta.battleId')
            page.locator('[data-op="new"]').click()
            assert page.evaluate(f'{API}.snapshot().meta.battleId') == previous_id
            assert 'Архив боёв заполнен' in page.locator('#notice').inner_text()
            assert page.evaluate('(key)=>localStorage.getItem(key)', key) == raw
            page.locator('.tools').evaluate('(el)=>el.open=true')
            with page.expect_download() as pending:
                page.locator('[data-op="export-current-new"]').click()
            exported = json.loads(pending.value.path().read_text())
            assert len(exported['session']['events']) == 8000
            assert exported['session']['meta']['battleId'] == previous_id
            assert page.evaluate(f'{API}.snapshot().meta.battleId') != previous_id
            assert page.evaluate('(key)=>localStorage.getItem(key)', key) is None
            page.evaluate(f'{API}.stop()')
            assert 'Сохранено в этом браузере' in page.locator('#save-status').inner_text()
        assert not errors, errors
        browser.close()
        print('INTEGRITY DESKTOP OK: typed Dispel, Russian effects, archive export/delete/restore, 3 long-session quota cycles, current/history protection; no JS errors')


if __name__ == '__main__':
    run()
