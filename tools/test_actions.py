from pathlib import Path
import asyncio
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page(viewport={'width':1280,'height':850})
  await page.evaluate('window.__HV_ENABLE_TEST_APIS = true;')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)+' '+str(e.stack)[:300]))
  await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8'),wait_until='load')
  await page.wait_for_timeout(500)
  print('init errors',errors,'art',await page.locator('#hg-skin-note').inner_text())
  print('api keys',await page.evaluate("Object.keys(window.__HV_TEST_API || {}).slice(0,25)"))
  await page.locator('[data-rin-do="metabolism"]').click()
  print('metabolism',(await page.locator('#rin-abilities').inner_text())[:110], 'errors',errors)
  await page.locator('[data-rin-do="darkness"]').click()
  print('selectdark',(await page.locator('#rin-abilities').inner_text())[:200])
  await page.locator('[data-tile="7,3"]').click()
  print('darkness tiles',await page.locator('.rin-dark-tile').count(), 'infos',(await page.locator('#rin-abilities').inner_text())[:120],'errors',errors)
  await page.locator('[data-op="next"]').first.click()
  await page.wait_for_timeout(800)
  print('round',await page.locator('#round').inner_text(),'actor',(await page.locator('#actor').inner_text())[:240], 'errors',errors[:5])
  print('journal last',(await page.locator('#journal').inner_text())[:1900]);
  await browser.close()
asyncio.run(main())
