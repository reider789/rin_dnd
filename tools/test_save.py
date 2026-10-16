import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True,executable_path=(__import__('os').environ.get('RIN_CHROMIUM') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').is_file() else None)),args=['--no-sandbox']);page=await b.new_page(accept_downloads=True)
  await page.evaluate('window.__HV_ENABLE_TEST_APIS=true');errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  await page.set_content((Path(__file__).resolve().parents[1]/'index.html').read_text(encoding='utf-8'))
  await page.locator('[data-rin-do="metabolism"]').click()
  summary=await page.evaluate("window.__HV_TEST_API.outcome()")
  print('outcome',summary.get('kind'),summary.get('session_kind'),[v for v in summary.get('manual_review',[]) if v.get('id')=='rin'])
  async with page.expect_download(timeout=10000) as dl:
   await page.locator('[data-op="export"]').click()
  download=await dl.value
  print('saved',download.suggested_filename,'errors',errs)
  await b.close()
asyncio.run(main())
