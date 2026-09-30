"""Real phone portrait flows against the local static server."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'portrait-ui'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    for width, height in [(390, 844), (320, 568), (430, 932)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:8081/index.html')
        page.locator('#homeNew').click()
        page.screenshot(path=str(OUT / f'{width}-setup.png'))
        page.locator('#setupStart').click()
        if page.locator('#guideOverlay').count():
            page.locator('#guideOverlay [data-go]').click()
        if page.locator('#openingOfferOverlay').count():
            page.locator('#openingOfferOverlay [data-i]').first.click()
        if page.locator('#levelGuideModal').is_visible():
            page.locator('#levelGuideAck').click()
        page.wait_for_timeout(500)
        assert page.locator('#shopbar>#shop .card').count() == 5
        assert page.locator('#portraitActions #refreshBtn').is_visible()
        assert page.locator('#portraitActions #lvlBtn').is_visible()
        boxes = {id: page.locator('#' + id).bounding_box() for id in ['topbar', 'board', 'bench', 'shopbar', 'fightBtn']}
        assert boxes['fightBtn']['y'] + boxes['fightBtn']['height'] <= height, boxes
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), boxes
        page.screenshot(path=str(OUT / f'{width}-prep.png'))
        page.locator('#shop .card:not(.sold)').first.click()
        page.locator('#mShopBtn').click()
        page.locator('#deployBtn').click()
        page.locator('#mDrawerClose').click()
        # Every existing panel must remain reachable after recruitment moves out.
        for button, section in [('mShopBtn', 'mShopSec'), ('mBondBtn', 'mBondSec'), ('mEquipBtn', 'mEquipSec'), ('mSideBtn', 'mSideSec'), ('mMenuBtn', 'mMenuSec')]:
            page.locator('#' + button).click()
            assert page.locator('#' + section).is_visible(), section
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUT / f'{width}-{section}.png'))
            page.locator('#mDrawerClose').click()
        page.locator('#mMenuBtn').click()
        page.locator('#mMenuSec [data-target="themeBtn"]').click()
        assert page.locator('html').get_attribute('data-theme') == 'dark'
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / f'{width}-dark.png'))
        # Rotation must restore the existing touch layout and move back on portrait.
        page.set_viewport_size({'width': height, 'height': width})
        page.wait_for_timeout(250)
        assert page.locator('#mShopSec>#shop').count() == 1
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(250)
        assert page.locator('#shopbar>#shop').count() == 1
        if width == 390:
            for target, panel, close in [('bookBtn', 'bookPanel', 'bookClose'), ('histBtn', 'histPanel', 'histClose')]:
                page.locator('#mMenuBtn').click()
                page.locator(f'#mMenuSec [data-target="{target}"]').click()
                assert page.locator('#' + panel).is_visible()
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUT / f'{width}-{panel}.png'))
                page.locator('#' + close).click()
            page.locator('#fightBtn').click()
            page.wait_for_timeout(1000)
            assert page.locator('body').get_attribute('data-phase') == 'battle'
            assert not page.locator('#oppBar').is_visible()
            page.screenshot(path=str(OUT / f'{width}-battle.png'))
            page.wait_for_function('window.__S.phase === "prep"', timeout=60000)
            assert page.locator('#oppBar').is_visible()
            if page.locator('#levelGuideModal').is_visible():
                page.locator('#levelGuideAck').click()
            page.locator('#mMenuBtn').click()
            page.locator('#mMenuSec [data-target="themeBtn"]').click()
            page.locator('#mMenuBtn').click()
            page.locator('#mMenuSec [data-target="resetBtn"]').click()
            page.locator('#menuEnd').click()
            page.locator('#flowConfirmAccept').click()
            page.locator('#flowResult').wait_for(state='visible')
            page.screenshot(path=str(OUT / f'{width}-result.png'))
        assert not errors, errors
        print(json.dumps({'viewport': [width, height], 'boxes': boxes, 'errors': errors}))
        page.close()
    browser.close()
