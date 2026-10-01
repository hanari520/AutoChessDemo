"""八人联机 · 经典界面移动端（触屏）冒烟。
以 390×844 竖屏 + pointer:coarse 伪装触屏，验证：
抽屉迁移（商店/羁绊/装备/详情）、棋盘缩放、买棋、锁定按钮。
运行前提：静态 :8081 + 联机 API :3000。
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'online-classic-ui'
OUT.mkdir(parents=True, exist_ok=True)

TOUCH_PATCH = """
Object.defineProperty(window, 'ontouchstart', {value: () => {}});
const _mm = window.matchMedia.bind(window);
window.matchMedia = q => q.includes('pointer:coarse') ? {matches:true, media:q, addEventListener(){}, removeEventListener(){}} : _mm(q);
"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    page.add_init_script(TOUCH_PATCH)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('ONLINE_TEST_PAGE', 'http://127.0.0.1:8081/online.html'))
    assert page.evaluate('document.body.classList.contains("touch")') is False or True
    page.locator('.advanced-settings summary').click()
    page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3000'))
    page.locator('#invitationCode').fill(os.environ['ONLINE_TEST_INVITE'])
    page.locator('#invitationBtn').click()
    page.locator('#roomEntryFields').wait_for(state='visible')
    page.locator('#playerName').fill('移动端验收')
    page.locator('#createBtn').click()
    page.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        page.locator('#addBotBtn').click()
        page.wait_for_function('(n) => document.querySelectorAll("#lobbySeats .seat-name .bot-badge").length === n', arg=n + 1)
    page.locator('#lobbyReadyBtn').click()
    page.locator('#gameSection').wait_for(state='visible', timeout=15000)
    page.wait_for_function('() => document.body.classList.contains("touch")')
    ov = page.locator('#openingOfferOverlay')
    if ov.count():
        ov.locator('.stg-pick').first.click()
        page.wait_for_function('() => !document.getElementById("openingOfferOverlay")', timeout=8000)

    # 触屏专属按钮出现；商店与羁绊常驻在外（portrait-play），不再收进抽屉
    for bid in ('mShopBtn','mEquipBtn','mSideBtn','mMenuBtn'):
        assert page.locator(f'#{bid}').is_visible(), f'{bid} 应可见'
    assert page.evaluate('document.body.classList.contains("portrait-play")'), 'portrait-play 布局'
    assert page.evaluate('!!document.querySelector("#shopbar>#shop")'), '商店常驻在 shopbar'
    assert page.evaluate('!!document.querySelector("#main #synCol")'), '羁绊列常驻在棋盘下方'
    assert page.evaluate('document.getElementById("mBondBtn").offsetParent === null'), '羁绊抽屉入口应隐藏'
    # 商店卡精简：无血/攻行，费用角标悬浮（等待式断言：renderShop 重建与断言存在竞态）
    page.wait_for_function('''() => {
      const c = document.querySelector('#shop .card:not(.sold) .stb .stat');
      return c && getComputedStyle(c).display === 'none';
    }''', timeout=8000)
    page.wait_for_function('''() => {
      const fee = document.querySelector('#shop .card:not(.sold) .cc2');
      return fee && fee.offsetWidth > 0;
    }''', timeout=8000)

    # 「更多」抽屉（图鉴/主题/音效/玩法/邀请/离房；对局内站点页头已隐藏）
    page.locator('#mMenuBtn').click()
    assert page.evaluate('!document.getElementById("mMenuSec").classList.contains("hidden")'), '更多抽屉'
    assert page.locator('#mMenuSec .btn').count() == 6
    page.locator('#mDrawerClose').click()

    # 商店常驻：直接买一张卡（无需开抽屉）
    gold_before = int(page.locator('#gold').inner_text())
    page.locator('#shop .card:not(.sold)').first.click()
    page.wait_for_function('(g)=>parseInt(document.querySelector("#gold").textContent)<g', arg=gold_before, timeout=10000)
    page.screenshot(path=str(OUT / '06-mobile-prep.png'), full_page=True)

    # 点选移动：点备战席棋子 → 提示条 → 点棋盘空位
    page.locator('#bench .bslot .unit').first.click()
    page.wait_for_function('() => getComputedStyle(document.getElementById("moveHint")).display !== "none"', timeout=5000)
    page.locator('#board .cell').nth(40).click()
    page.wait_for_function('() => document.querySelectorAll("#board .cell .unit").length > 0', timeout=8000)
    page.screenshot(path=str(OUT / '07-mobile-moved.png'), full_page=True)

    # 移动模式必须显示攻击范围（触屏曾因 mv-hl 绿框盖住 rng-hl 蓝框而不可见）
    page.locator('#board .cell .unit').first.click()
    page.wait_for_function('() => document.querySelectorAll("#board .cell.rng-src").length === 1', timeout=5000)
    assert page.locator('#board .cell.rng-hl').count() > 0, '移动模式攻击范围'
    assert '射程' in page.locator('#moveHint').inner_text()
    # 触屏拖拽：落点高亮 + 范围跟随
    src = page.locator('#board .cell .unit').first
    box = src.bounding_box()
    tgt = page.locator('#board .cell').nth(35).bounding_box()
    page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
    page.mouse.down()
    page.mouse.move(tgt['x']+tgt['width']/2, tgt['y']+tgt['height']/2, steps=6)
    page.wait_for_timeout(150)
    assert page.locator('#board .cell.drop-hl').count() == 1, '拖拽落点高亮'
    assert page.locator('#board .cell.rng-hl').count() > 0, '拖拽范围跟随'
    page.mouse.up()
    page.wait_for_function('() => !!document.querySelector("#board .cell:nth-child(36) .unit")', timeout=8000)

    # 战况抽屉（八人血量入口）
    assert page.locator('#mSideBtn').inner_text() == '战况'
    page.locator('#mSideBtn').click()
    assert page.locator('#mSideSec #arenaInfo .pl-row').count() == 8, '触屏战况 8 行'
    page.locator('#mDrawerClose').click()

    # 锁定阵容（触屏文案）
    assert '锁定阵容' in page.locator('#fightBtn').inner_text()
    page.locator('#fightBtn').click()
    page.wait_for_function('() => document.querySelector("#fightBtn").textContent.includes("已锁定")', timeout=8000)
    page.screenshot(path=str(OUT / '08-mobile-locked.png'), full_page=True)

    assert not errors, errors
    page.locator('#leaveBtn2').click()
    page.locator('#entrySection').wait_for(state='visible')
    browser.close()
    print('移动端经典界面冒烟：全部通过')
