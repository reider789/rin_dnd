"""D&D 2024 Shadow Arts Darkness: opposed visibility every attack and across rounds."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':1240,'height':900})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.evaluate('window.__HV_ENABLE_TEST_APIS=true')
        page.set_content(HTML,wait_until='load')
        api='window.__HV_TEST_API'
        assert page.evaluate(f'{api}.rinSight !== undefined'), 'No visibility test API'
        def reset():
            page.evaluate(f'''{api}.set(s=>{{
              s.phase='active';s.pending=null;s.rinDarkness={{x:5,y:3,until:s.elapsed+600}};
              s.units.rin.x=5;s.units.rin.y=3;s.units.rin.hp=31;s.units.rin.reaction=0;
              s.units.guard_a.x=4;s.units.guard_a.y=3;s.units.guard_a.hp=11;
              s.units.guard_b.x=1;s.units.guard_b.y=7;s.units.guard_b.hp=11;
              s.units.guard_c.x=0;s.units.guard_c.y=7;s.units.guard_c.hp=11;
              for(const id of (s.extraEnemies||[])){{id.hp=Math.max(100,id.hp);id.ac=10;}}
              s.history=[];
            }})''')
        def sight(a,b):
            return page.evaluate(f"{api}.rinSight('{a}','{b}')")
        reset()
        snap=page.evaluate(f'{api}.snapshot()')
        assert snap['rinDarkness']['x']==5
        foe=snap['extraEnemies'][0]['id']
        # Place one bandit inside Rin's area: Rin sees, foe cannot see Rin.
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].x=6;s.units['{foe}'].y=3;s.units['{foe}'].hp=100;s.units['{foe}'].ac=10}})")
        assert sight('rin',foe)=={'adv':True,'disadv':False,'description':sight('rin',foe)['description']}
        assert sight(foe,'rin')['disadv'] and not sight(foe,'rin')['adv']
        # Guard and enemy inside the sphere, both mutually blind: cancel.
        assert sight('guard_a',foe)['adv'] and sight('guard_a',foe)['disadv']
        assert sight(foe,'guard_a')['adv'] and sight(foe,'guard_a')['disadv']
        # Outside the sphere, no line crossing it: no shadow modifier.
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].x=2;s.units['{foe}'].y=7;}})")
        assert not sight('guard_b',foe)['adv'] and not sight('guard_b',foe)['disadv']
        # Opposite edges of opaque sphere: you can't see THROUGH it.
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].x=9;s.units['{foe}'].y=3;s.units.guard_b.x=1;s.units.guard_b.y=3;}})")
        assert sight('guard_b',foe)['adv'] and sight('guard_b',foe)['disadv']
        assert sight('rin',foe)['disadv'] and sight('rin',foe)['adv']
        # Darkvision doesn't defeat magical Darkness; blindsight does.
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].x=6;s.units['{foe}'].y=3;s.units['{foe}'].darkvisionRange=120;}})")
        assert sight(foe,'rin')['disadv']
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].blindsightRange=30;}})")
        assert not sight(foe,'rin')['disadv'] and not sight('rin',foe)['adv']
        page.evaluate(f"{api}.set(s=>{{s.units['{foe}'].blindsightRange=0;}})")
        # Core reaction resolver: force a miss; journal must record disadvantage.
        page.evaluate(f"{api}.set(s=>{{s.history=[];s.units.rin.reaction=0;s.units['{foe}'].enemyAttack={{bonus:5,count:1,die:4,flat:0,range:5}};}})")
        page.evaluate(f"{api}.attack('{foe}','rin',7,true)")
        snap=page.evaluate(f'{api}.snapshot()')
        journal='\n'.join(str(x) for x in snap['history'])
        assert 'ПОМЕХА' in journal and 'Тьма:' in journal, journal[-2000:]
        # Rin gets advantage again on a separate attack, not one-use only.
        for i in range(3):
            page.evaluate(f"{api}.set(s=>{{s.history=[];s.units['{foe}'].hp=100;s.units.rin.vex=null;s.units.rin.sneakUsed=true;}})")
            page.evaluate(f"{api}.rinStrike('{foe}','unarmed')")
            history='\n'.join(str(x) for x in page.evaluate(f'{api}.snapshot().history'))
            assert 'ПРЕИМУЩЕСТВО' in history and 'Тьма:' in history,history[-2000:]
        # NPC guard routine must also show BOTH modifiers and their cancellation.
        page.evaluate(f"{api}.set(s=>{{s.history=[];s.units.guard_a.x=5;s.units.guard_a.y=4;s.units['{foe}'].hp=100;}})")
        page.evaluate(f"{api}.rinGuardStrike('guard_a')")
        history='\n'.join(str(x) for x in page.evaluate(f'{api}.snapshot().history'))
        assert 'ПРЕИМУЩЕСТВО И ПОМЕХА ВЗАИМНО ОТМЕНЕНЫ' in history and 'Тьма:' in history,history[-2000:]
        # Repeated attacks from the same foe in different rounds still have disadvantage.
        for rnd in [2,3,4]:
            page.evaluate(f"{api}.set(s=>{{s.round={rnd};s.history=[];s.units.rin.reaction=0;s.units.rin.hp=31;}})")
            page.evaluate(f"{api}.attack('{foe}','rin',7,true)")
            history='\n'.join(str(x) for x in page.evaluate(f'{api}.snapshot().history'))
            assert 'ПОМЕХА' in history,history[-2000:]
            assert page.evaluate(f'{api}.snapshot().rinDarkness') is not None
        # Real concentration check on severe incoming damage: guaranteed fail.
        page.evaluate(f"{api}.set(s=>{{s.history=[];s.units.rin.max=1000;s.units.rin.hp=1000;s.units.rin.reaction=0;s.units['{foe}'].enemyAttack={{bonus:50,count:10,die:20,flat:220,range:5}};}})")
        page.evaluate(f"{api}.attack('{foe}','rin',70,true)")
        final=page.evaluate(f'{api}.snapshot()')
        assert final['rinDarkness'] is None, final['rinDarkness']
        assert 'концентрация Тьмы' in '\n'.join(str(x) for x in final['history'])
        assert not sight(foe,'rin')['disadv']
        assert not errors,errors
        print('PASS: 2024 Darkness - Rin/foe and ally/foe sight, line geometry, blindsight, NPC attack frames, 3 repeated attacks, 3 rounds, termination')
        browser.close()

if __name__=='__main__':run()
