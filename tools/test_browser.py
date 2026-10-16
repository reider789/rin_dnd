import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in [(1440,900),(390,844)]:
   page=await browser.new_page(viewport={'width':width,'height':height})
   errs=[]
   page.on('pageerror',lambda e:errs.append(str(e)+'\n'+(e.stack or '')))
   await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8'),wait_until='load')
   await page.wait_for_timeout(1300)
   print('VIEW',width,'ERRORS',errs[:8], 'TITLE',await page.locator('header h2').inner_text(), 'BODYLEN',len(await page.locator('body').inner_text()))
   print('QUEUE', (await page.locator('#queue').inner_text())[:300], 'RIN', (await page.locator('#rin-abilities').inner_text())[:250] if await page.locator('#rin-abilities').count() else 'NO ABILITY PANEL')
   await page.screenshot(path=str(Path(__file__).resolve().parents[1]/f'test-screen-{width}.png'),full_page=True)
   await page.close()
  await browser.close()
asyncio.run(main())
