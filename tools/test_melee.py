import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1366,'height':900})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)+'\n'+str(e.stack)[:160]))
  await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text(),wait_until='load')
  await page.wait_for_timeout(300)
  await page.locator('[data-v21-new]').click()
  fixture={'name':'Проверка ударов Рина','kind':'training','heroes':{'rin':{'cell':'B6','initiative':24},'guard_a':{'cell':'A1','initiative':13},'guard_b':{'cell':'A2','initiative':9},'guard_c':{'cell':'A3','initiative':8}},'walls':[],'rubble':[],'enemies':[{'name':'Манекен','cell':'C6','hp':200,'ac':8,'initiative':4,'attack':{'bonus':0,'count':1,'die':4,'flat':0,'range':5},'tokenKey':'warrior'}]}
  await page.locator('#v21json').fill(json.dumps(fixture,ensure_ascii=False))
  await page.locator('[data-v21-create]').click()
  print('fixture',await page.locator('header h2').inner_text(),'err',errors)
  await page.locator('[data-rin-do="metabolism"]').click()
  await page.locator('[data-tile="2,5"]').click()
  await page.locator('[data-action="attack"]').click()
  await page.locator('[data-op="apply"]').click()
  print('main', (await page.locator('#rin-abilities').inner_text())[:220],'errors',errors)
  print('nick-count',await page.locator('[data-rin-do="nick"]').count(),'response',(await page.locator('#response').inner_text())[:150])
  if await page.locator('[data-rin-do="nick"]').count():await page.locator('[data-rin-do="nick"]').click()
  await page.locator('[data-rin-do="flurry"]').click()
  print('flurry-button',await page.locator('[data-rin-do="flurryStrike"]').count(),'info',(await page.locator('#rin-abilities').inner_text())[:230])
  if await page.locator('[data-rin-do="flurryStrike"]').count():await page.locator('[data-rin-do="flurryStrike"]').click()
  if await page.locator('[data-rin-do="flurryStrike"]').count():await page.locator('[data-rin-do="flurryStrike"]').click()
  print('errors after',errors,'journal',(await page.locator('#journal').inner_text())[:1500])
  await browser.close()
asyncio.run(main())
