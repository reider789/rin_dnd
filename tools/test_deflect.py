import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox']);page=await b.new_page()
  err=[];page.on('pageerror',lambda e:err.append(str(e)))
  await page.evaluate('window.__HV_ENABLE_TEST_APIS = true')
  await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text())
  await page.evaluate("window.__HV_TEST_API.attack('enemy_1','rin',25,false)")
  await page.evaluate('window.__HV_TEST_API.render()')
  print('pending',await page.evaluate('window.__HV_TEST_API.snapshot().pending'),'errors',err,'buttons',await page.locator('[data-rin-deflect]').count())
  if await page.locator('[data-rin-deflect="yes"]').count():
   await page.locator('[data-rin-deflect="yes"]').click()
   print('after reaction',await page.evaluate('({hp:window.__HV_TEST_API.snapshot().units.rin.hp,react:window.__HV_TEST_API.snapshot().units.rin.reaction,pending:window.__HV_TEST_API.snapshot().pending})'),'errors',err)
  await b.close()
asyncio.run(main())
