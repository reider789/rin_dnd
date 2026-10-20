"""Real browser regression checks for the shared, optional combat visual layer."""
from pathlib import Path
import argparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API = 'window.__RIN_TEST_API'


def run(html=None):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='no-preference')
        context.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(Path(html or ROOT / 'index.html').resolve().as_uri())
        page.wait_for_function(f'Boolean({API})')
        page.evaluate(f'{API}.stop()')
        # The same visual component must work with a portable, unrelated campaign.
        page.locator('#pack-file').set_input_files(str(ROOT / 'examples/portable/border-watch.json'))
        page.wait_for_function(f"{API}.snapshot().meta.campaignId==='border-watch'")
        page.evaluate(f'''()=>{{
          {API}.stop();{API}.set(s=>{{
            s.pending=null;s.queue=[];s.started=true;s.phase='active';s.index=s.order.indexOf('ena');s.turnSerial++;
            s.terrain.walls=[];s.terrain.rubble=[];s.terrain.cover={{}};s.effects=[];s.spellFrames={{}};s.objects={{}};s.zones=[];
            for(const id of s.order){{const u=s.units[id];u.controlled=id==='ena';u.features={{}};u.statuses=[];
              u.policies={{heroic:false,luck:false,defenseLuck:false,sneak:false}};u.reaction=1;u.hidden=false;}}
            Object.assign(s.units.ena,{{x:2,y:3,hp:60,max:100,ac:12,action:1,bonus:1,move:30,slotTurn:-1,
              casting:{{ability:'INT',attack:11,dc:19,level:10,
                prepared:Object.keys(CombatMagic.SPELLS).filter(k=>CombatMagic.SPELLS[k][1]>0),
                cantrips:['fireBolt','rayFrost','mindSliver'],components:{{wardingBond:true,protectionEvil:true}}}},
              slots:Object.fromEntries([1,2,3,4,5].map(n=>[n,{{current:5,max:5}}])),
              equipment:{{stormBracers:true,vaeltirFocus:true}},
              counters:{{storm_bracers:{{current:2,max:2}},storm_daily:{{current:2,max:2}},vaeltir_focus:{{current:2,max:2}}}},
              items:{{healing:1}},itemTypes:{{healing:'healing'}},
              attacks:[{{id:'sword',name:'Клинок',kind:'melee',range:5,bonus:11,count:1,die:6,flat:3,damageType:'slashing'}},
                {{id:'bow',name:'Лук',kind:'ranged',range:240,normalRange:120,bonus:11,count:1,die:6,flat:3,damageType:'piercing'}},
                {{id:'storm_thrower',name:'Грозовой метатель',kind:'ranged',range:120,bonus:11,count:1,die:6,flat:3,damageType:'lightning'}}]}});
            Object.assign(s.units.tal,{{x:2,y:4,hp:100,max:100}});
            Object.assign(s.units.hunter_a,{{x:6,y:3,hp:200,max:200}});
            Object.assign(s.units.hunter_b,{{x:8,y:5,hp:200,max:200}});
            s.random.tape=Array(200).fill(5);
          }});window.visualBaseline={API}.snapshot();
        }}''')
        page.wait_for_timeout(80)

        def stats():
            result = page.evaluate(f'{API}.visuals()')
            assert not result['failure'], result
            return result

        def count(kind):
            return stats()['counts'].get(kind, 0)

        def snapshot():
            # JSON persistence omits optional undefined fields in pending spell frames.
            return page.evaluate(f'JSON.parse(JSON.stringify({API}.snapshot()))')

        def reset(extra=''):
            page.evaluate(f'{API}.clearVisuals();{API}.set(s=>{{Object.assign(s,structuredClone(window.visualBaseline));{extra}}})')

        def dispatch(command):
            page.evaluate(f'c=>{API}.dispatch(c)', command)
            stats()

        def spell(name, **extra):
            dispatch({'kind': 'cast', 'actor': 'ena', 'spell': name, **extra})

        def settled():
            page.wait_for_function(f'{API}.visuals().active===0', timeout=2500)
            assert page.locator('#board [data-fx-moving]').count() == 0

        assert stats()['created'] == 0, 'opening or resetting a battle must not replay its history'
        before = count('ghost')
        dispatch({'kind': 'move', 'actor': 'ena', 'path': [{'x': 3, 'y': 3}, {'x': 4, 'y': 3}]})
        assert count('ghost') == before + 1
        assert page.locator('#board [data-unit="ena"][data-fx-moving]').count() == 1
        ghost = page.locator('.combat-fx-ghost')
        assert ghost.evaluate('e=>getComputedStyle(e).opacity') == '1'
        assert page.evaluate(f'{API}.snapshot().units.ena.x') == 4
        # Actual hit testing goes through the decorative layer to a real tile.
        assert page.locator('[data-tile="4,3"]').evaluate('e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2).closest("[data-tile]")===e}')
        created = stats()['created']
        page.locator('[data-op="save"]').click()
        assert stats()['created'] == created, 'ordinary UI render must not replay the same events'
        page.locator('details.tools').evaluate('e=>e.open=true')
        page.locator('#combat-fx-mode').select_option('off')
        assert stats()['active'] == 0
        assert page.locator('#board [data-fx-moving]').count() == 0
        page.locator('#combat-fx-mode').select_option('standard')
        assert stats()['created'] == created, 'enabling effects must not play skipped old actions'
        page.locator('details.tools').evaluate('e=>e.open=false')

        reset()
        arrows = count('arrow')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'bow', 'target': 'hunter_a'})
        assert count('arrow') > arrows
        reset('s.random.tape=Array(200).fill(1)')
        misses = count('miss')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'bow', 'target': 'hunter_a'})
        assert count('miss') > misses
        assert page.evaluate(f'{API}.snapshot().units.hunter_a.hp') == 200
        reset('s.units.hunter_a.x=3;s.random.tape=[20,5,5,5]')
        critical, slashes = count('critical'), count('slash')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'sword', 'target': 'hunter_a'})
        assert count('critical') > critical and count('slash') > slashes
        reset('''s.units.hunter_a.x=3;s.units.ena.attacks.push({id:'fist',name:'Кулак',kind:'melee',unarmed:true,
          range:5,bonus:11,count:1,die:6,flat:3,damageType:'bludgeoning'});''')
        strikes, slashes = count('strike'), count('slash')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'fist', 'target': 'hunter_a'})
        assert count('strike') > strikes and count('slash') == slashes
        reset('''s.units.ena.items.knives=1;s.units.ena.attacks.push({id:'knife',name:'Метнуть кинжал',kind:'ranged',ammoItem:'knives',
          range:60,bonus:11,count:1,die:6,flat:3,damageType:'piercing'});''')
        thrown = count('thrown')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'knife', 'target': 'hunter_a'})
        assert count('thrown') > thrown and page.evaluate(f'{API}.snapshot().units.ena.items.knives') == 0
        reset()
        misses = count('miss')
        dispatch({'kind': 'attackAt', 'actor': 'ena', 'weapon': 'bow', 'point': {'x': 8, 'y': 4}})
        assert count('miss') > misses
        assert page.evaluate(f'{API}.snapshot().units.hunter_a.hp') == 200
        reset()
        bolts = count('lightning')
        dispatch({'kind': 'attack', 'actor': 'ena', 'weapon': 'storm_thrower', 'target': 'hunter_a'})
        assert count('lightning') > bolts

        for name, color in [('fireBolt', 'fire'), ('rayFrost', 'ice')]:
            reset()
            projectiles = count('projectile')
            spell(name, target='hunter_a')
            assert count('projectile') > projectiles
            assert page.locator(f'.combat-fx-projectile.fx-{color}').count() > 0
        for name, kind in [('fireball', 'area'), ('coneCold', 'cone'), ('burningHands', 'cone'),
                           ('thunderwave', 'cone'), ('web', 'web'), ('fogCloud', 'area'), ('stormSphere', 'area')]:
            reset()
            before = count(kind)
            spell(name, point={'x': 6, 'y': 3})
            assert count(kind) > before, name
        reset()
        spell('mindSliver', target='hunter_a')
        assert page.locator('.combat-fx-rune.fx-mind').count() > 0
        reset()
        hands = count('hand')
        spell('bigbyHand', point={'x': 5, 'y': 3}, target='hunter_a', handMode='fist')
        assert count('hand') > hands
        # The magic hand has its own position; the caster must not lunge from there.
        assert page.locator('.combat-fx-ghost').count() == 0
        reset()
        portals = count('portal')
        spell('dimensionDoor', point={'x': 8, 'y': 3}, passenger='tal', passengerPoint={'x': 8, 'y': 4})
        assert count('portal') >= portals + 4
        assert page.evaluate(f'{API}.snapshot().units.tal.x') == 8
        reset('s.random.tape=Array(200).fill(2)')
        heals, numbers = count('heal'), count('number')
        dispatch({'kind': 'healPotion', 'actor': 'ena', 'item': 'healing'})
        assert count('heal') > heals and count('number') > numbers
        reset()
        spell('bless', targets=['ena', 'tal'])
        badge = page.locator('#board [data-unit="ena"] .combat-fx-status')
        assert 'Концентрация' in badge.get_attribute('title')
        assert 'Усиление' in badge.get_attribute('title')
        page.locator('details.tools').evaluate('e=>e.open=true')
        page.locator('#combat-fx-mode').select_option('off')
        assert badge.count() == 1, 'static status information remains when animations are off'
        page.locator('#combat-fx-mode').select_option('rich')
        page.locator('#combat-fx-speed').select_option('1.5')
        page.locator('details.tools').evaluate('e=>e.open=false')

        reset('''s.units.hunter_a.x=4;s.units.hunter_a.controlled=true;
          s.units.hunter_a.attacks=[{id:'stab',name:'Укол',kind:'melee',range:5,bonus:5,count:1,die:6,flat:1,damageType:'piercing'}];''')
        dispatch({'kind': 'move', 'actor': 'ena', 'path': [{'x': 3, 'y': 3}, {'x': 2, 'y': 2}]})
        assert page.evaluate(f'{API}.snapshot().pending.kind') == 'opportunity'
        assert page.evaluate(f'{API}.snapshot().units.ena.x') == 3
        assert page.locator('#board [data-fx-moving]').count() == 0
        assert page.locator('.combat-fx-ghost').count() == 0
        page.locator('#decision [data-decision="no"]').click()
        assert page.evaluate(f'{API}.snapshot().units.ena.y') == 2

        # Declining/accepting a real defensive reaction remains immediate.
        reset('''s.units.ena.features.shieldSpell=true;s.index=s.order.indexOf('hunter_a');s.units.hunter_a.x=3;
          s.units.hunter_a.action=1;s.units.hunter_a.attackAction=null;s.units.hunter_a.controlled=true;
          s.units.hunter_a.attacks=[{id:'stab',name:'Укол',kind:'melee',range:5,bonus:5,count:1,die:6,flat:1,damageType:'piercing'}];
          s.random.tape=[10,5,5];''')
        shields = count('shield')
        dispatch({'kind': 'attack', 'actor': 'hunter_a', 'weapon': 'stab', 'target': 'ena'})
        assert page.evaluate(f'{API}.snapshot().pending.ability') == 'shield'
        page.locator('#decision [data-decision="yes"]').click()
        assert count('shield') > shields
        assert page.evaluate(f'{API}.snapshot().units.ena.hp') == 60

        reset('''const v=s.units.hunter_a;v.controlled=true;v.casting={ability:'INT',attack:8,dc:19,level:10,prepared:['counterspell'],cantrips:[]};
          v.slots={3:{current:2,max:2}};s.random.tape=Array(200).fill(1);''')
        areas = count('area')
        spell('fireball', point={'x': 6, 'y': 3})
        assert page.evaluate(f'{API}.snapshot().pending.choice') == 'counterspell'
        assert count('area') == areas, 'starting a cast is not a resolved explosion'
        saved = snapshot()
        page.reload();page.wait_for_function(f'Boolean({API})');page.evaluate(f'{API}.stop()')
        assert snapshot() == saved, page.locator('#notice').inner_text()
        assert stats()['created'] == 0
        assert stats()['mode'] == 'rich' and stats()['speed'] == 1.5
        page.locator('#decision [data-decision="yes"]').click()
        assert count('counter') > 0 and count('area') == 0
        assert page.evaluate(f'{API}.snapshot().units.hunter_a.slots[3].current') == 1
        settled()
        # Animation cancellation/completion never spends another slot or changes RNG.
        saved = snapshot();page.wait_for_timeout(120)
        assert snapshot() == saved

        # Seed a fresh deterministic sandbox after the reload, not the saved story.
        page.evaluate('value=>{window.visualBaseline=value}', saved)
        reset('''s.pending=null;s.queue=[];s.phase='active';s.effects=[];s.zones=[];s.objects={};
          s.units.hunter_a.hidden=true;s.units.hunter_a.statuses=[{kind:'invisible'}];''')
        created = stats()['created']
        page.evaluate(f'''{API}.set(s=>{{const from={{x:6,y:3}},to={{x:7,y:3}};Object.assign(s.units.hunter_a,to);
          s.events.push({{seq:++s.sequence,type:'move',actor:'hunter_a',from,to}});}})''')
        assert stats()['created'] == created, 'an invisible enemy must not leave a revealing movement ghost'

        reset('s.units.hunter_a.hidden=false;s.units.hunter_a.statuses=[];s.units.hunter_a.controlled=false;')
        page.evaluate(f'''{API}.set(s=>{{for(let i=0;i<15000;i++)s.events.push({{seq:++s.sequence,type:'tactic',actor:'ena',text:'Архив'}});
          for(let i=0;i<150;i++)s.events.push({{seq:++s.sequence,type:'attack',actor:'ena',target:'hunter_a',hit:true,
            attackKind:'ranged',weapon:'bow',origin:{{x:2,y:3}},point:{{x:6,y:3}},damageType:'piercing'}});}})''')
        assert stats()['active'] <= 40 and stats()['peak'] <= 40
        assert stats()['dropped'] > 0
        settled()
        assert page.locator('.combat-fx-layer > *').count() == 0

        # Reduced motion works even when a richer preference was already saved.
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_function('document.querySelector("#combat-fx-mode").disabled')
        assert stats()['active'] == 0
        created = stats()['created']
        page.evaluate(f'''{API}.set(s=>s.events.push({{seq:++s.sequence,type:'heal',actor:'ena',amount:5}}))''')
        assert stats()['created'] == created
        page.emulate_media(reduced_motion='no-preference')
        page.wait_for_function('!document.querySelector("#combat-fx-mode").disabled')
        assert stats()['created'] == created
        # Non-square/large fields use current geometry, not a hardcoded 11x8 board.
        reset('s.terrain.width=20;s.terrain.height=12;s.units.ena.x=15;s.units.ena.y=10;')
        page.wait_for_timeout(60)
        page.evaluate(f'''{API}.set(s=>{{s.units.ena.x=16;s.events.push({{seq:++s.sequence,type:'move',actor:'ena',from:{{x:15,y:10}},to:{{x:16,y:10}}}})}})''')
        assert page.locator('.combat-fx-ghost').count() == 1
        page.set_viewport_size({'width': 1366, 'height': 768})
        page.wait_for_function(f'{API}.visuals().active===0')
        assert page.locator('#board [data-fx-moving]').count() == 0
        assert not errors, errors
        browser.close()
        print('VISUALS BROWSER OK: movement, melee/crit/miss, arrows/storm, spell schools/areas/hand, passenger portals, healing, static statuses, Shield/Counterspell, reload, limits/cleanup, reduced motion, geometry, hit testing, no state mutation')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--html', type=Path)
    run(parser.parse_args().html)
