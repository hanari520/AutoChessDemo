"""Exercise menu, setup, preparation, battle, results and the next turn."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path('F:/demo/workspace/sap-arena-preview')
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width,height in [(1440,1000),(390,844)]:
  context=browser.new_context(viewport={'width':width,'height':height})
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8082/arena.html',wait_until='networkidle')
  page.wait_for_selector('#homeDialog[open]')
  page.screenshot(path=str(out/f'flow-{width}-home.png'))
  page.locator('#homeArena').click()
  page.locator('#nameFirst button').nth(2).click()
  page.locator('#nameLast button').nth(2).click()
  name=page.locator('#namePreview').inner_text()
  page.screenshot(path=str(out/f'flow-{width}-setup.png'))
  page.locator('#startArena').click()
  page.wait_for_selector('#setupDialog',state='hidden')
  assert page.locator('#teamTitle').inner_text()==name
  page.locator('#freezeBtn').click()
  page.locator('[data-zone="shop"][data-slot="4"]').click()
  page.wait_for_selector('.shop-card.frozen')
  page.locator('#freezeBtn').click()
  for i in range(2):
   page.locator(f'[data-zone="shop"][data-slot="{i}"]').click()
   page.locator(f'[data-zone="team"][data-slot="{i}"]').click()
   page.wait_for_function(f"document.querySelector('#gold').textContent === '{10-(i+1)*3}'")
  assert page.locator('#prepFeedback').inner_text()
  page.locator('#fightBtn').click()
  assert page.locator('#endTurnDialog').is_visible()
  page.locator('#confirmEndTurn').click()
  page.wait_for_selector('#battleDialog[open]')
  assert '回合结束' in page.locator('#eventBadge').inner_text()
  page.locator('#skipBtn').click();page.locator('#continueBtn').click()
  page.wait_for_selector('#resultDialog[open]')
  page.screenshot(path=str(out/f'flow-{width}-result.png'))
  page.locator('#resultNext').click()
  assert page.locator('#round').inner_text()=='2'
  assert '回合开始' in page.locator('#prepFeedback').inner_text()
  assert page.locator('.shop-card.frozen').count()==1
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.locator('#menuBtn').click();page.locator('#homeContinue').click()
  assert not page.locator('#homeDialog').is_visible()
  assert not errors,errors
  context.close()
 browser.close()
print(json.dumps({'ok':True,'screens':['1440px','390px'],'flow':['menu','pack-and-name','shop','round-end','battle','result','round-start','resume']}))
