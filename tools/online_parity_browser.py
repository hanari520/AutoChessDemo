"""Local eight-player UI smoke test. Run with static :8081 and online API :3000."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'online-parity-20260930'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    signature_responses = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: signature_responses.append(response.status) if 'skill_signature_manifest.json' in response.url else None)
    page.goto('http://127.0.0.1:8081/online.html')
    page.locator('.advanced-settings summary').click()
    page.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API','http://127.0.0.1:3000'))
    page.locator('#playerName').fill('UI 验收')
    page.locator('#createBtn').click()
    page.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        page.locator('#addBotBtn').click()
        page.wait_for_function('(n) => document.querySelectorAll("#lobbySeats .seat-name .bot-badge").length === n', arg=n + 1)
    page.locator('#lobbyReadyBtn').click()
    page.locator('#gameSection').wait_for(state='visible', timeout=10000)
    page.wait_for_function('() => performance.getEntriesByType("resource").some(entry => entry.name.includes("skill_signature_manifest.json"))')
    assert 200 in signature_responses, signature_responses
    page.wait_for_function('document.querySelector("#phaseLabel").textContent.includes("备战")')
    assert page.locator('#boardGrid .battle-cell').count() == 64
    assert page.locator('#phaseCountdown').is_visible()
    assert int(page.locator('#countdownValue').inner_text())>0
    assert page.locator('#countdownValue').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')>=25
    buy = page.locator('#shopList [data-buy]:not([disabled])').first
    buy.click()
    page.locator('#benchGrid .unit-slot:not(.empty)').first.wait_for()
    assert page.locator('#benchGrid .prep-unit .pt').count()>0
    assert page.locator('#benchGrid .prep-unit .st').first.inner_text()=='★'
    assert page.locator('#benchGrid .prep-unit .syn .sy').count()>=2
    page.screenshot(path=str(OUT / 'desktop-bench-parity.png'), full_page=True)
    page.locator('#benchGrid .unit-slot:not(.empty)').first.click()
    page.locator('#boardGrid .board-position.empty:not([disabled])').first.click()
    page.locator('#boardGrid .board-position.occupied').first.wait_for()
    page.locator('#boardGrid .board-position.occupied').first.click()
    assert page.locator('#unitInspect .inspect-stat-grid').count() == 1
    assert '普攻特性' in page.locator('#unitInspect').inner_text()
    assert page.locator('#boardGrid .rng-src').count()==1
    assert page.locator('#boardGrid .rng-hl').count()>0
    assert page.locator('#levelProgressTrack').get_attribute('role') == 'progressbar'
    boxes = {key: page.locator(selector).bounding_box() for key, selector in {'details': '.game-left .inspect-panel', 'bonds': '.game-left .bonds-panel', 'board': '#boardGrid', 'bench': '#benchGrid', 'gear': '.game-side .inventory-panel', 'report': '.game-side .war-report-panel', 'xp': '.shop-player-panel', 'shop': '#shopList', 'seats': '#scoreboard'}.items()}
    assert boxes['details']['x'] < boxes['board']['x'] < boxes['gear']['x'], boxes
    assert boxes['bonds']['x'] < boxes['board']['x'] < boxes['report']['x'], boxes
    assert boxes['bench']['y'] >= boxes['board']['y'] + boxes['board']['height'], boxes
    assert boxes['xp']['x'] < boxes['shop']['x'] and boxes['xp']['y'] > boxes['bench']['y'], boxes
    assert boxes['seats']['y'] < boxes['board']['y'], boxes
    print('Desktop module positions:', boxes)
    page.screenshot(path=str(OUT / 'desktop-prep-detail.png'), full_page=True)
    page.locator('.game-room-menu > summary').click()
    page.locator('#sfxBtn').click()
    assert page.evaluate('localStorage.getItem("vc_sfx")')=='0'
    page.locator('#sfxBtn').click()
    assert page.evaluate('localStorage.getItem("vc_sfx")')=='1'
    page.locator('#matchHelpBtn').click()
    assert page.locator('#matchHelpDialog').is_visible()
    page.keyboard.press('Escape')
    page.locator('#scoreboard [data-watch="1"]').click()
    assert '观战' in page.locator('#arenaTitle').inner_text()
    assert page.locator('#boardGrid [draggable="true"]').count()==0
    page.locator('#scoreboard [data-watch="0"]').click()
    assert page.locator('#arenaTitle').inner_text()=='上阵棋盘'
    page.locator('#gameReadyBtn').click()
    page.wait_for_timeout(1000)
    page.locator('#battleArena .battle-piece').first.wait_for(timeout=70000)
    page.locator('#battleArena .battle-piece').first.click()
    assert page.locator('#unitInspect .inspect-stat-grid').count() == 1
    assert page.locator('.battle-stat-tabs [data-stat]').count()==3
    page.locator('.battle-stat-tabs [data-stat=healing]').click()
    assert page.locator('.battle-stat-tabs [data-stat=healing]').get_attribute('aria-pressed')=='true'
    page.locator('.battle-stat-tabs [data-stat=damage]').click()
    assert page.locator('#battleArena .battle-hp').count() > 0
    assert page.locator('#battleArena .battle-mp').count() > 0
    assert page.locator('#battleArena .piece-name').count() == 0
    assert page.locator('#battleArena .piece-star').count() == 0
    assert page.locator('#battleArena .piece-art').first.evaluate('el => el.complete && el.naturalWidth > 0 && el.getBoundingClientRect().width > 0')
    page.screenshot(path=str(OUT / 'desktop-combat-detail.png'), full_page=True)
    page.locator('#scoreboard [data-watch="1"]').click()
    assert 'VS' in page.locator('#combatTitle').inner_text()
    page.locator('#battleArena .battle-piece').first.click()
    assert page.locator('#unitInspect .inspect-stat-grid').count()==1
    page.locator('#scoreboard [data-watch="0"]').click()
    page.locator('#battleArena .battle-piece').first.click()
    page.locator('#themeBtn').click()
    assert page.locator('html').get_attribute('data-theme') == 'dark'
    page.screenshot(path=str(OUT / 'desktop-combat-dark.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'mobile-combat-detail.png'), full_page=True)
    page.wait_for_function('document.querySelector("#roundTitle").textContent.includes("第 2 回合") && document.querySelector("#phaseLabel").textContent.includes("备战")', timeout=60000)
    assert page.locator('#arenaPanel').is_visible()
    assert page.locator('#levelProgressTrack').is_visible()
    page.locator('[data-panel=bonds]').click()
    assert page.locator('#bondList').is_visible()
    page.locator('#matchPanelClose').click()
    for panel in ['equipment', 'details', 'report']:
        page.locator(f'[data-panel={panel}]').click()
        assert page.locator('#matchPanelDialog').is_visible()
        page.locator('#matchPanelClose').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
    page.screenshot(path=str(OUT / 'mobile-round2-prep.png'), full_page=True)
    page.locator('#gameReadyBtn').click()
    page.wait_for_function('document.querySelector("#roundTitle").textContent.includes("第 2 回合") && document.querySelector("#battleArena .battle-piece")', timeout=70000)
    assert page.locator('#battleArena .battle-piece').count() > 0
    page.screenshot(path=str(OUT / 'mobile-round2-combat.png'), full_page=True)
    assert not errors, errors
    print('PASS desktop prep/combat, mobile combat/round 2, details, XP, bonds, HP/MP; page errors:', errors)
    browser.close()
