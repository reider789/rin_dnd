import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox'])
  page=await b.new_page();await page.evaluate('window.__HV_ENABLE_TEST_APIS=true');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text())
  scene={'name':'Проверка нокаута','kind':'training','heroes':{'rin':{'cell':'B6','initiative':24},'guard_a':{'cell':'A1','initiative':13},'guard_b':{'cell':'A2','initiative':9},'guard_c':{'cell':'A3','initiative':8}},'walls':[],'rubble':[],'enemies':[{'name':'Тренировочный враг','cell':'C6','hp':1,'ac':5,'initiative':4,'attack':{'bonus':0,'count':1,'die':4,'flat':0,'range':5}}]}
  await page.evaluate('(s)=>window.__HV_TEST_API.newScenario(s)',scene)
  await page.locator('[data-tile="2,5"]').click()
  await page.evaluate('Math.random=()=>0.95')
  await page.locator('[data-action="attack"]').click()
  await page.locator('[data-op="apply"]').click()
  state=await page.evaluate("({pending:window.__HV_TEST_API.snapshot().pending, hp:window.__HV_TEST_API.snapshot().units.enemy_1.hp})")
  print('before',state,'errors',errors,'buttons',await page.locator('[data-hg-ko]').count())
  if await page.locator('[data-hg-ko]').count():
    print('choices',await page.locator('[data-hg-ko]').all_text_contents())
    val=await page.locator('[data-hg-ko]').evaluate_all('(x)=>x.map(e=>e.dataset.hgKo)');print('values',val)
    await page.locator('[data-hg-ko]').first.click()
  print('after',await page.evaluate("({pending:window.__HV_TEST_API.snapshot().pending, hp:window.__HV_TEST_API.snapshot().units.enemy_1.hp, statuses:window.__HV_TEST_API.snapshot().units.enemy_1.status})"),'errors',errors)
  await b.close()
asyncio.run(main())
