"""User-facing regressions found in the desktop audit, using real controls."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
API='window.__RIN_TEST_API'
def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1366,'height':768})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
  page.goto((ROOT/'index.html').as_uri());page.wait_for_function(f'Boolean({API})')
  page.locator('#pack-file').set_input_files(str(ROOT/'examples/portable/class-defense-lab.json'))
  page.wait_for_function(f"{API}.snapshot().meta.campaignId==='class-defense-lab'")
  page.evaluate(f'''{API}.set(s=>{{s.units.ena.features.tacticalMaster=true;s.units.hunter_a.x=3;s.units.hunter_a.y=3;}})''')
  page.locator('#mastery').select_option('push')
  page.locator('[data-tile="3,3"]').click()
  assert page.locator('#mastery').input_value()=='push'
  before=page.evaluate(f'{API}.snapshot()')
  bad=json.loads(json.dumps(before));bad['pending']={'id':'bad','actor':'ena','kind':'unknown'}
  value={'kind':'dnd-combat-session','version':32,'session':bad}
  page.locator('#import-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
  assert page.evaluate(f'{API}.snapshot()')==before
  page.evaluate(f'''{API}.set(s=>{{s.units.hunter_a.x=3;s.units.hunter_a.y=2;s.units.hunter_a.hidden=true;s.units.hunter_a.statuses=[{{kind:'invisible'}}];s.terrain.cover['3,2']=5;}})''')
  assert page.locator('[data-op="attack"]').is_disabled()
  assert page.locator('[data-tile="3,2"] .token').count()==0
  # A dying ally stays on the board; the engine's Medicine command is reachable.
  page.evaluate(f'''{API}.set(s=>{{s.units.tal.hp=0;s.units.tal.stable=false;s.units.tal.x=2;s.units.tal.y=4;s.units.tal.statuses=[{{kind:'unconscious'}}];s.random.tape=[15];}})''')
  assert page.locator('[data-tile="2,4"] .token.down').count()==1
  page.locator('[data-op="stabilize"][data-target="tal"]').click()
  assert page.evaluate(f'{API}.snapshot().units.tal.stable') is True
  page.evaluate(f'''{API}.set(s=>{{s.units.ena.bonus=1;s.units.ena.items.healing=1;s.units.ena.itemTypes.healing='healing';s.random.tape=[2,2];}})''')
  page.locator('[data-op="healPotion"][data-item="healing"]').click()
  assert page.evaluate(f'{API}.snapshot().units.ena.items.healing')==0
  assert page.locator('[data-op="healPotion"][data-item="healing"]').is_disabled()
  saved=page.evaluate(f'{API}.snapshot()')
  page.evaluate("localStorage.setItem('dnd-combat-active-pack:rin-veir','broken-cache')")
  page.reload();page.wait_for_function(f'Boolean({API})')
  assert page.evaluate(f'{API}.snapshot()')==saved
  # Equal area, different geometry must rebuild all coordinates.
  page.evaluate(f'''{API}.set(s=>{{s.terrain.width=8;s.terrain.height=11;}})''')
  assert page.locator('[data-tile="7,10"]').count()==1
  assert page.locator('[data-tile="10,7"]').count()==0
  boxes=page.evaluate("({board:document.querySelector('#board').getBoundingClientRect().toJSON(),side:document.querySelector('aside').getBoundingClientRect().toJSON(),end:document.querySelector('#turn-controls').getBoundingClientRect().toJSON()})")
  assert boxes['board']['bottom']<=768 and boxes['board']['right']<=boxes['side']['left']
  assert boxes['end']['bottom']<=768 and boxes['end']['top']>=boxes['side']['top']
  # A failing localStorage cannot block the host channel, even at startup.
  context=browser.new_context(viewport={'width':1440,'height':900});other=context.new_page()
  other.add_init_script('''window.__HV_ENABLE_TEST_APIS=true;window.hostSaves=[];
    window.__bindings={setValue:v=>window.hostSaves.push(v)};
    Storage.prototype.setItem=function(){throw Error('quota')};
    Storage.prototype.getItem=function(){throw Error('blocked')};''')
  other.goto((ROOT/'index.html').as_uri());other.wait_for_function(f'Boolean({API})')
  assert other.evaluate('hostSaves.length')==1
  assert 'Сохранено в чате' in other.locator('#save-status').inner_text()
  # Repeated manual saves do not serialize/send an unchanged revision again.
  other.locator('[data-op="save"]').click();assert other.evaluate('hostSaves.length')==1
  # Async host writes are serialized; fast consecutive decisions coalesce to latest state.
  asynchronous=browser.new_context();a=asynchronous.new_page()
  a.add_init_script('''window.__HV_ENABLE_TEST_APIS=true;window.peakHostCalls=0;window.activeHostCalls=0;
    window.__bindings={setValue:v=>{activeHostCalls++;peakHostCalls=Math.max(peakHostCalls,activeHostCalls);
    return new Promise(resolve=>setTimeout(()=>{window.lastHostValue=v;activeHostCalls--;resolve()},150))}};
    Storage.prototype.setItem=function(){throw Error('quota')};''')
  a.goto((ROOT/'index.html').as_uri());a.wait_for_function(f'Boolean({API})')
  a.evaluate(f'''()=>{{for(let i=0;i<2;i++){{const p={API}.snapshot().pending;{API}.dispatch({{kind:'decide',id:p.id,choice:i?'no':'skip'}})}}}}''')
  a.wait_for_function('window.lastHostValue?.session.pending===null && activeHostCalls===0')
  assert a.evaluate('peakHostCalls')==1
  assert a.evaluate('lastHostValue.session')==a.evaluate(f'{API}.snapshot()')
  assert not errors,errors
  browser.close();print('DESKTOP AUDIT OK: drafts, corrupt import, hidden targets, dying ally, geometry, browser layout, independent persistence')
if __name__=='__main__':run()
