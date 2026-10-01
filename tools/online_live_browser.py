"""Two isolated browser players against the real CloudBase service.

Serve the frontend on :8081 first. Never starts or falls back to a local backend.
"""
from pathlib import Path
from urllib.request import urlopen
import json
import os
from playwright.sync_api import sync_playwright

API = 'https://autochess-online-321604-12-1450980602.sh.run.tcloudbase.com'
OUT = Path(__file__).resolve().parents[1] / 'out' / 'online-live-20261002'
OUT.mkdir(parents=True, exist_ok=True)


def run():
    for path in ('/api/health', '/api/ready'):
        with urlopen(API + path, timeout=20) as response:
            assert json.load(response)['ok'] is True
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel='msedge')
        contexts = [browser.new_context(viewport={'width': 1440, 'height': 900}) for _ in range(2)]
        pages = [context.new_page() for context in contexts]
        try:
            for i, page in enumerate(pages):
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(os.environ.get('ONLINE_TEST_PAGE', 'http://127.0.0.1:8081/online.html'))
                page.locator('.advanced-settings summary').click()
                page.locator('#apiBase').fill(API)
                assert not page.locator('#createBtn').is_visible()
                page.locator('#invitationCode').fill('wrong')
                page.locator('#invitationBtn').click()
                page.wait_for_function('() => document.getElementById("entryError").textContent.includes("邀请码不正确")')
                assert not page.locator('#createBtn').is_visible()
                page.locator('#invitationCode').fill(os.environ['ONLINE_TEST_INVITE'])
                page.locator('#invitationBtn').click()
                page.locator('#roomEntryFields').wait_for(state='visible')
                page.locator('#playerName').fill(f'线上双端验收{i + 1}')
            host, guest = pages
            host.locator('#createBtn').click()
            host.locator('#lobbySection').wait_for(state='visible')
            code = host.locator('#roomCode').inner_text().strip()
            guest.locator('#roomCodeInput').fill(code)
            guest.locator('#joinBtn').click()
            guest.locator('#lobbySection').wait_for(state='visible')
            for n in range(6):
                host.locator('#addBotBtn').click()
                host.wait_for_function('(n) => window.__onlineState.lobby.players.filter(p => p.bot).length === n', arg=n + 1)
            for page in pages:
                page.wait_for_function('() => window.__onlineState.connected && window.__onlineState.synced && window.__onlineState.lobby.players.length === 8')
                page.locator('#lobbyReadyBtn').click()
            for page in pages:
                page.locator('#gameSection').wait_for(state='visible', timeout=20000)
                page.locator('#openingOfferOverlay .stg-pick').first.click()
                page.wait_for_function('() => !document.getElementById("openingOfferOverlay")')
                gold = int(page.locator('#gold').inner_text())
                page.locator('#shop .card:not(.sold)').first.click()
                page.wait_for_function('(gold) => window.__onlineState.view.me.gold < gold', arg=gold)
                page.locator('#deployBtn').click()
                page.wait_for_function('() => window.__onlineState.view.me.board.some(Boolean)')
                page.locator('#fightBtn').click()
            print('PASS: two independent players joined, six bots, purchase, deploy and ready', flush=True)
            for i, page in enumerate(pages):
                page.wait_for_function('() => window.__onlineState.view.phase === "combat" && !!document.getElementById("unitLayer")', timeout=90000)
                page.wait_for_function('() => document.querySelectorAll("#unitLayer .battle-unit").length > 0', timeout=10000)
                page.screenshot(path=str(OUT / f'player-{i + 1}-battle.png'), full_page=True)
            print('PASS: both clients received and rendered real server combat', flush=True)
            for page in pages:
                page.wait_for_function('() => window.__onlineState.view.phase === "prep" && window.__onlineState.view.round >= 2', timeout=90000)
                page.wait_for_function('() => !document.getElementById("unitLayer")')
            seat = guest.evaluate('() => window.__onlineState.seat')
            guest.reload()
            guest.locator('#gameSection').wait_for(state='visible', timeout=20000)
            guest.wait_for_function('(seat) => window.__onlineState.connected && window.__onlineState.synced && window.__onlineState.seat === seat && window.__onlineState.view.round >= 2', arg=seat)
            assert guest.locator('#roomCode').inner_text().strip() == code
            print('PASS: settlement advances to round two; reload restores the same room and seat', flush=True)
            assert not errors, errors
            host.screenshot(path=str(OUT / 'round-two.png'), full_page=True)
        finally:
            for page in pages:
                if page.locator('#roomScreen').is_visible():
                    button = page.locator('#leaveBtn2') if page.locator('#gameSection').is_visible() else page.locator('#leaveBtn')
                    button.click(timeout=10000)
                    page.locator('#entryScreen').wait_for(state='visible', timeout=10000)
            browser.close()
    print('PASS: both test players left; no browser runtime errors', flush=True)


if __name__ == '__main__':
    run()
