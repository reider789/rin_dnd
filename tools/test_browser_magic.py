"""Audit regressions exercised through real desktop form and map controls."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API = 'window.__RIN_TEST_API'


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.set_default_timeout(8000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
        page.goto((ROOT / 'index.html').as_uri())
        page.wait_for_function(f'Boolean({API})')
        page.locator('#pack-file').set_input_files(str(ROOT / 'examples/portable/border-watch.json'))
        page.wait_for_function(f"{API}.snapshot().meta.campaignId==='border-watch'")
        page.evaluate(f'''()=>{{
          {API}.stop();{API}.set(s=>{{
            s.pending=null;s.queue=[];s.started=true;s.phase='active';s.index=s.order.indexOf('ena');s.turnSerial++;
            s.terrain.walls=[];s.terrain.cover={{}};s.effects=[];s.spellFrames={{}};s.objects={{}};s.zones=[];
            for(const id of s.order){{const u=s.units[id];u.controlled=u.team==='party';u.features={{}};u.statuses=[];u.policies={{heroic:false,luck:false,defenseLuck:false,sneak:true}};}}
            Object.assign(s.units.ena,{{x:2,y:3,hp:100,max:100,action:1,bonus:1,move:30,slotTurn:-1,
              casting:{{ability:'INT',attack:11,dc:19,level:10,prepared:['lesserRestoration','findSteed','dimensionDoor','bigbyHand'],cantrips:[]}},
              slots:{{1:{{current:3,max:3}},2:{{current:3,max:3}},3:{{current:3,max:3}},4:{{current:3,max:3}},5:{{current:3,max:3}}}},
              counters:{{faithful_steed:{{current:1,max:1}}}},equipment:{{}},attacks:[{{id:'staff',name:'Staff',kind:'melee',range:5,bonus:11,count:1,die:6,flat:1,damageType:'bludgeoning'}}]}});
            Object.assign(s.units.tal,{{x:2,y:4}});Object.assign(s.units.hunter_a,{{x:6,y:3,hp:200,max:200}});Object.assign(s.units.hunter_b,{{x:8,y:5}});
            s.random.tape=Array(100).fill(2);
          }});window.magicBaseline={API}.snapshot();
        }}''')

        def reset(extra=''):
            page.evaluate(f'{API}.set(s=>{{Object.assign(s,structuredClone(window.magicBaseline));{extra}}})')
            page.locator('.magic-panel').evaluate('(el)=>el.open=true')

        reset("s.units.tal.statuses=[{kind:'blinded'},{kind:'poisoned'}]")
        page.locator('#magic-spell').select_option('lesserRestoration')
        page.locator('#magic-targets').select_option(['tal'])
        page.locator('#magic-condition').select_option('poisoned')
        page.locator('[data-op="cast"]').click()
        assert page.evaluate(f'{API}.snapshot().units.tal.statuses.map(z=>z.kind)') == ['blinded']

        reset()
        page.locator('#magic-spell').select_option('findSteed')
        page.locator('#magic-steed-payment').select_option('free')
        page.locator('#magic-steed-type').select_option('fey')
        page.locator('[data-op="cast"]').click()
        assert page.evaluate(f'{API}.snapshot().units["ena-steed"].creatureType') == 'fey'
        assert page.evaluate(f'{API}.snapshot().units.ena.slots[2].current') == 3
        reset()
        page.locator('#magic-spell').select_option('findSteed')
        page.locator('#magic-steed-payment').select_option('slot')
        page.locator('#magic-level').select_option('3')
        page.locator('#magic-steed-type').select_option('fiend')
        page.locator('[data-op="cast"]').click()
        assert page.evaluate(f'{API}.snapshot().units["ena-steed"].summonLevel') == 3
        assert page.evaluate(f'{API}.snapshot().units.ena.slots[3].current') == 2
        assert page.evaluate(f'{API}.snapshot().units.ena.counters.faithful_steed.current') == 1

        reset()
        page.locator('#magic-spell').select_option('dimensionDoor')
        page.locator('#magic-passenger').select_option('tal')
        page.locator('[data-op="magicPoint"]').click()
        page.locator('[data-tile="8,3"]').click()
        page.locator('[data-op="passengerPoint"]').click()
        page.locator('[data-tile="8,4"]').click()
        page.locator('[data-op="cast"]').click()
        assert page.evaluate(f'{API}.snapshot().units.ena.x') == 8
        assert page.evaluate(f'{API}.snapshot().units.tal.y') == 4
        assert page.evaluate(f'{API}.snapshot().units.tal.x') == 8

        reset('''s.effects=[{id:'effect-998',kind:'bless',owner:'tal',targets:['tal'],level:1,dc:14,until:60,concentration:true},
          {id:'effect-999',kind:'greaterInvisibility',owner:'ena',targets:['ena'],level:4,dc:19,until:60,concentration:true}];''')
        owners = page.locator('#route [data-op="endConcentration"]').evaluate_all('(els)=>els.map(e=>e.dataset.owner)')
        assert set(owners) == {'tal', 'ena'}
        assert 'Caster' not in page.locator('[data-op="endConcentration"][data-owner="tal"]').inner_text()
        page.locator('[data-op="endConcentration"][data-owner="ena"]').click()
        assert page.evaluate(f'{API}.snapshot().effects.map(x=>x.owner)') == ['tal']

        reset('''s.effects=[{id:'effect-999',kind:'bigbyHand',owner:'tal',targets:[],level:5,dc:19,until:60,concentration:true}];
          s.objects={'effect-999':{id:'effect-999',owner:'tal',x:3,y:3,hp:50,max:50,ac:20,dc:19,createdTurn:0,grappled:null,interposing:false}};
          s.random.tape=[20,2,2];''')
        assert '50/50 ПЗ' in page.locator('[data-tile="3,3"]').get_attribute('title')
        assert '50/50 ПЗ' in page.locator('[data-tile="3,3"]').inner_text()
        page.locator('[data-tile="3,3"]').click()
        page.locator('[data-op="attackObject"]').click()
        assert page.evaluate(f'{API}.snapshot().objects["effect-999"].hp') == 45
        assert not errors, errors
        browser.close()
        print('MAGIC DESKTOP OK: one-condition restoration, free/paid steed and type, passenger/map destinations, named concentration owners, object HP/selection/attack')


if __name__ == '__main__':
    run()
