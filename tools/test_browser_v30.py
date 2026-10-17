"""Browser integration: real controls, pending reaction reload, desktop geometry and export."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def run():
 with sync_playwright() as p:
  options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
  if os.environ.get('RIN_CHROMIUM'):options['executable_path']=os.environ['RIN_CHROMIUM']
  browser=p.chromium.launch(**options);page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
  page.goto((ROOT/'index.html').as_uri());api='window.__RIN_TEST_API'
  page.wait_for_function(f'Boolean({api})')
  assert page.locator('[data-decision="skip"]').count()==1
  page.locator('[data-decision="skip"]').click()
  page.locator('[data-decision="yes"]').click()
  assert page.evaluate(f'{api}.snapshot().units.rin.focus')==3
  assert page.locator('.tile').count()==88
  assert not set(('yar','daphne','lyutobor','rada'))&set(page.evaluate(f'Object.keys({api}.snapshot().units)'))
  # One map and sidebar visible together on a desktop; map nodes survive state changes.
  boxes=page.evaluate("({map:document.querySelector('#board').getBoundingClientRect().toJSON(),side:document.querySelector('aside').getBoundingClientRect().toJSON()})")
  assert boxes['map']['right']<=boxes['side']['left']
  page.evaluate('window.__firstTile=document.querySelector(".tile")')
  page.locator('[data-op="darkness"]').click();page.locator('[data-tile="1,5"]').click()
  assert page.evaluate(f'{api}.snapshot().zones[0].kind')=='darkness'
  assert page.evaluate(f'{api}.snapshot().units.rin.focus')==2
  assert page.evaluate('window.__firstTile===document.querySelector(".tile")')
  before=page.evaluate(f'{api}.snapshot()');page.reload();page.wait_for_function(f'Boolean({api})')
  assert page.evaluate(f'{api}.snapshot()')==before
  # Force an ordinary legal adjacent enemy attack, using the real attack command and UI response.
  page.evaluate(f'''{api}.set(s=>{{s.zones=[];s.index=s.order.indexOf('enemy_1');s.units.enemy_1.x=1;s.units.enemy_1.y=4;s.units.enemy_1.action=1;s.units.enemy_1.attacks[0].bonus=20;s.random.tape=[15,3];s.units.rin.reaction=1;}})''')
  page.evaluate(f"{api}.dispatch({{kind:'attack',actor:'enemy_1',target:'rin',weapon:'main'}})")
  snap=page.evaluate(f'{api}.snapshot()');assert snap['pending']['kind']=='deflect';amount=snap['pending']['damage']['amount'];hp=snap['units']['rin']['hp']
  page.reload();page.wait_for_function(f'Boolean({api})');assert page.evaluate(f'{api}.snapshot().pending.id')==snap['pending']['id']
  page.locator('[data-decision="no"]').click();page.evaluate(f'{api}.stop()')
  assert page.evaluate(f'{api}.snapshot().units.rin.hp')==hp-amount
  assert page.evaluate(f'{api}.snapshot().pending') is None
  assert page.locator('[data-decision="no"]').count()==0
  with page.expect_download() as d:page.locator('[data-op="export"]').click()
  data=json.loads(Path(d.value.path()).read_text());assert data['kind']=='dnd-combat-session' and data['version']==30
  assert data['session']['random']['draws']>=2
  with page.expect_download() as d:page.locator('[data-op="journal-export"]').click()
  assert len(Path(d.value.path()).read_text())>50
  if os.environ.get('RIN_SCREENSHOT'):page.screenshot(path=os.environ['RIN_SCREENSHOT'],full_page=True)
  # Import a different campaign through the actual file input; preserve Rin's save.
  pack=json.loads((ROOT/'examples/portable/border-watch.json').read_text())
  page.locator('#pack-file').set_input_files(str(ROOT/'examples/portable/border-watch.json'))
  page.wait_for_function(f"{api}.snapshot().meta.campaignId==='border-watch'")
  assert page.evaluate(f'{api}.snapshot().meta.campaignId')=='border-watch'
  assert set(page.evaluate(f'Object.keys({api}.snapshot().units)'))=={'ena','tal','hunter_a','hunter_b'}
  assert page.evaluate("localStorage.getItem('rin-veir-combat-session-v30')!==null")
  portable=page.evaluate(f'{api}.snapshot()');page.reload();page.wait_for_function(f'Boolean({api})')
  assert page.evaluate(f'{api}.snapshot()')==portable
  invalid=json.loads(json.dumps(pack));invalid['abilities']['venom-claws']['handler']='unknownSpell'
  page.locator('#pack-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
  page.wait_for_function("document.querySelector('#notice').textContent.includes('Недостающий обработчик')")
  assert page.evaluate(f'{api}.snapshot()')==portable
  assert 'Недостающий обработчик' in page.locator('#notice').inner_text()
  with page.expect_download() as d:page.locator('[data-op="export"]').click()
  portable_save=Path(d.value.path()).read_bytes();value=json.loads(portable_save)
  assert value['version']==31 and value['contentPack']['id']=='border-watch'
  # A fresh account/browser context can restore this battle without the original pack upload.
  fresh=browser.new_context(viewport={'width':1440,'height':1000});other=fresh.new_page()
  other.on('pageerror',lambda e:errors.append(str(e)));other.add_init_script('window.__HV_ENABLE_TEST_APIS=true')
  other.goto((ROOT/'index.html').as_uri());other.wait_for_function(f'Boolean({api})')
  other.locator('#import-file').set_input_files({'name':'portable-session.json','mimeType':'application/json','buffer':portable_save})
  other.wait_for_function(f"{api}.snapshot().meta.campaignId==='border-watch'")
  assert other.evaluate(f'{api}.snapshot()')==portable
  other.reload();other.wait_for_function(f'Boolean({api})');assert other.evaluate(f'{api}.snapshot()')==portable
  fresh.close()
  # Current class handlers use real buttons and save their own reaction windows.
  page.locator('#pack-file').set_input_files(str(ROOT/'examples/portable/class-defense-lab.json'))
  page.wait_for_function(f"{api}.snapshot().meta.campaignId==='class-defense-lab'")
  page.evaluate(f"{api}.set(s=>{{s.random.tape=[5];}})")
  page.locator('[data-op="secondWind"]').click()
  assert page.evaluate(f'{api}.snapshot().pending.kind')=='freeMovement'
  assert page.evaluate(f'{api}.snapshot().units.ena.hp')==60
  assert page.evaluate(f'{api}.snapshot().units.ena.counters.second_wind.current')==3
  page.reload();page.wait_for_function(f'Boolean({api})')
  assert page.evaluate(f'{api}.snapshot().pending.kind')=='freeMovement'
  page.locator('[data-tile="1,3"]').click();page.locator('[data-decision="move"]').click()
  assert page.evaluate(f'{api}.snapshot().units.ena.x')==1
  assert page.evaluate(f'{api}.snapshot().units.ena.move')==30
  page.locator('[data-op="actionSurge"]').click()
  assert page.evaluate(f'{api}.snapshot().units.ena.surgeAction')==1
  assert page.evaluate(f'{api}.snapshot().units.ena.counters.action_surge.current')==0
  with page.expect_download() as d:page.locator('[data-op="export"]').click()
  assert json.loads(Path(d.value.path()).read_bytes())['version']==32
  # A selected maneuver is offered only after hit confirmation and survives reload.
  page.evaluate(f"{api}.set(s=>{{s.units.ena.features.maneuvers=['trip'];s.units.ena.features.superiorityDie=10;s.units.ena.features.maneuverDC=17;s.units.hunter_a.x=2;s.units.hunter_a.y=3;s.units.hunter_a.hp=100;s.units.hunter_a.max=100;s.random.tape=[15,2,3,1];}})")
  page.locator('[data-tile="2,3"]').click();page.locator('[data-op="attack"]').click()
  assert page.evaluate(f'{api}.snapshot().pending.kind')=='strikeChoice'
  page.reload();page.wait_for_function(f'Boolean({api})')
  page.locator('#strike-maneuver').select_option('trip');page.locator('[data-decision="use"]').click()
  assert page.evaluate(f'{api}.snapshot().units.hunter_a.statuses.some(z=>z.kind==="prone")')
  assert page.evaluate(f'{api}.snapshot().units.ena.counters.superiority.current')==4
  assert not errors,errors
  print('V30 BROWSER OK: desktop, real ability buttons, incremental map, persistence, reaction decline/reload, downloads, cross-campaign packs, rejected bad pack, portable save in fresh context, no JS errors')
  browser.close()
if __name__=='__main__':run()
