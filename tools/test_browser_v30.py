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
  assert not errors,errors
  print('V30 BROWSER OK: desktop, real ability buttons, incremental map, persistence, reaction decline/reload, downloads, no JS errors')
  browser.close()
if __name__=='__main__':run()
