"""Isolated browser acceptance for the local arena preview (server :8082)."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('F:/demo/workspace/sap-arena-preview')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8082/arena.html', wait_until='networkidle')
    page.wait_for_function("document.querySelector('#connection').textContent.includes('异步联机')")
    if page.locator('#homeDialog').is_visible(): page.locator('#homeContinue').click()
    page.locator('#codexBtn').click()
    assert page.locator('.codex-card').count() == 100
    assert '50' in page.locator('#codexCount').inner_text()
    page.locator('#codexMode').select_option('outfits')
    assert page.locator('.codex-card').count() == 50
    assert page.locator('.codex-card .atlas-portrait').count() == 50
    atlas_sizes = page.evaluate("""async () => {
      const urls=[...new Set([...document.querySelectorAll('.atlas-cell')].map(el=>el.style.backgroundImage.match(/url\([\"']?(.*?)[\"']?\)/)[1]))];
      return await Promise.all(urls.map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve([i.naturalWidth,i.naturalHeight]);i.onerror=()=>reject(new Error(src));i.src=src;})));
    }""")
    assert len(atlas_sizes) == 3 and all(w > 800 and h > 800 for w,h in atlas_sizes)
    page.screenshot(path=str(OUT/'desktop-outfit-codex.png'))
    page.locator('#codexSearch').fill('忍梓')
    assert page.locator('.codex-card').count() == 1
    page.locator('.codex-card').click()
    assert '阿梓' in page.locator('#codexDetail').inner_text()
    assert page.locator('#codexDetail .outfit-source').get_attribute('href').startswith('https://')
    page.locator('#codexSearch').fill('')
    page.locator('#codexTier').select_option('6')
    assert page.locator('.codex-card').count() > 0
    page.locator('#closeCodex').click()
    if page.locator('#homeDialog').is_visible(): page.locator('#homeContinue').click()
    page.screenshot(path=str(OUT/'desktop-opening.png'), full_page=True)
    for i in range(3):
        page.locator(f'[data-zone="shop"][data-slot="{i}"]').click()
        page.locator(f'[data-zone="team"][data-slot="{i}"]').click()
        page.wait_for_function(f"document.querySelector('#gold').textContent === '{10-(i+1)*3}'")
    page.locator('[data-zone="shop"][data-slot="4"]').click()
    page.locator('#freezeBtn').click()
    page.wait_for_selector('.shop-card.frozen')
    page.screenshot(path=str(OUT/'desktop-prep.png'), full_page=True)
    page.locator('#fightBtn').click()
    page.wait_for_selector('#battleDialog[open]')
    page.locator('#pauseBattle').click()
    assert page.locator('#pauseBattle').inner_text() == '播放'
    current_step = page.locator('#battleStep').inner_text()
    page.wait_for_timeout(1200)
    assert page.locator('#battleStep').inner_text() == current_step
    page.locator('#nextEvent').click()
    assert page.locator('#battleStep').inner_text() != current_step
    assert page.locator('.health-track').count() > 0
    assert page.locator('#eventBadge').inner_text()
    assert page.locator('#battleLog li').count() > 0
    page.locator('#restartBattle').click()
    page.locator('#pauseBattle').click()
    assert page.locator('#battleStep').inner_text().startswith('1 /')
    page.locator('#nextEvent').click()
    page.screenshot(path=str(OUT/'desktop-battle.png'), full_page=True)
    page.locator('#skipBtn').click()
    page.wait_for_selector('#continueBtn:not([hidden])')
    page.locator('#continueBtn').click()
    assert page.locator('#resultDialog').is_visible()
    page.locator('#resultNext').click()
    assert page.locator('#round').inner_text() == '2'
    assert page.locator('.shop-card.frozen').count() == 1
    page.reload(wait_until='networkidle')
    page.wait_for_function("document.querySelector('#round').textContent === '2'")
    assert page.locator('#replayBtn').is_visible()
    page.locator('#helpBtn').click()
    assert page.locator('#helpDialog').is_visible()
    page.locator('#closeHelp').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
    phone = mobile.new_page()
    phone.on('pageerror', lambda e: errors.append(str(e)))
    phone.goto('http://127.0.0.1:8082/arena.html', wait_until='networkidle')
    phone.wait_for_function("document.querySelector('#connection').textContent.includes('异步联机')")
    if phone.locator('#homeDialog').is_visible(): phone.locator('#homeContinue').tap()
    phone.locator('#codexBtn').tap()
    assert phone.locator('.codex-card').count() == 100
    assert phone.evaluate("document.querySelector('#codexDialog').scrollWidth <= document.querySelector('#codexDialog').clientWidth"), 'codex overflow'
    phone.screenshot(path=str(OUT/'mobile-outfit-codex.png'))
    phone.locator('#closeCodex').tap()
    phone.locator('[data-zone="shop"][data-slot="0"]').tap()
    phone.locator('[data-zone="team"][data-slot="0"]').tap()
    phone.wait_for_function("document.querySelector('#gold').textContent === '7'")
    phone.screenshot(path=str(OUT/'mobile-prep.png'), full_page=True)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'
    phone.locator('#fightBtn').tap()
    if phone.locator('#endTurnDialog').is_visible(): phone.locator('#confirmEndTurn').tap()
    phone.wait_for_selector('#battleDialog[open]')
    assert '真人历史阵容' in phone.locator('#opponentLabel').inner_text()
    phone.screenshot(path=str(OUT/'mobile-battle.png'), full_page=True)
    phone.locator('#skipBtn').tap()
    phone.locator('#continueBtn').tap()
    broken = page.evaluate("[...document.images].filter(i => !i.complete || i.naturalWidth===0).map(i=>i.src)")
    assert not broken, broken
    assert not errors, errors
    browser.close()
    print(json.dumps({'ok': True, 'desktop': '1440px', 'mobile': '390px', 'errors': errors, 'screenshots': str(OUT)}))
