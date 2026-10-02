"""Real browser acceptance: request counts, draft reload, and lost responses."""
import json
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get('ARENA_TEST_URL', 'http://127.0.0.1:8082/arena.html')
KEY = 'vc_async_arena_preview_v1'
with sync_playwright() as p:
    browser = p.chromium.launch()
    reports = []
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r) if '/api/arena/' in r.url else None)
        page.goto(URL, wait_until='networkidle')
        page.wait_for_function("document.querySelector('#connection').textContent.includes('异步联机')")
        if page.locator('#homeDialog').is_visible():
            page.locator('#homeContinue').click()
        requests.clear()
        page.locator('[data-zone="shop"][data-slot="0"]').click()
        page.locator('[data-zone="team"][data-slot="0"]').click()
        page.locator('[data-zone="foods"][data-slot="0"]').click()
        page.locator('[data-zone="team"][data-slot="0"]').click()
        page.locator('[data-zone="shop"][data-slot="4"]').click()
        page.locator('#freezeBtn').click()
        page.locator('#rollBtn').click()
        page.locator('[data-zone="team"][data-slot="0"]').click()
        page.locator('[data-zone="team"][data-slot="3"]').click()
        saved = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
        assert saved['draft'] and len(saved['draft']['actions']) == 5
        assert not requests, 'Shop actions must make zero API calls'
        page.reload(wait_until='networkidle')
        page.wait_for_function("gold => document.querySelector('#gold').textContent === String(gold)", arg=saved['run']['gold'])
        restored = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
        assert restored['run'] == saved['run']
        assert restored['draft'] == saved['draft']
        assert len(requests) == 1 and requests[0].url.endswith('/last-battle'), 'Reload needs one cloud read'
        requests.clear()
        page.locator('#fightBtn').click()
        page.locator('#confirmEndTurn').click()
        page.wait_for_selector('#battleDialog[open]')
        assert len(requests) == 1 and requests[0].url.endswith('/battle')
        assert len(requests[0].post_data_json['actions']) == 5
        assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).draft") is None
        page.locator('#skipBtn').click()
        page.locator('#continueBtn').click()
        page.locator('#resultNext').click()
        assert page.locator('#round').inner_text() == '2'
        if width == 1440:
            # Lose the result after the server commits; automatic retry must reuse the id.
            lost = [False]
            def lose_first_response(route):
                if not lost[0]:
                    lost[0] = True
                    route.fetch()
                    route.abort()
                else:
                    route.continue_()
            page.route('**/api/arena/battle', lose_first_response)
            requests.clear()
            page.locator('#rollBtn').click()
            assert not requests
            page.locator('#fightBtn').click()
            page.locator('#confirmEndTurn').click()
            page.wait_for_selector('#battleDialog[open]')
            writes = [r for r in requests if r.url.endswith('/battle')]
            assert len(writes) == 2
            assert writes[0].post_data_json == writes[1].post_data_json
            assert page.locator('#round').inner_text() == '3', 'Lost result settles exactly once'
            page.unroute('**/api/arena/battle', lose_first_response)
            page.locator('#skipBtn').click()
            page.locator('#continueBtn').click()
            page.locator('#resultNext').click()
            # Offline reload restores the draft; shopping stays local until reconnection.
            page.locator('#rollBtn').click()
            before_offline = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
            page.route('**/api/arena/**', lambda route: route.abort())
            page.reload(wait_until='networkidle')
            page.wait_for_function("document.querySelector('#connection').textContent.includes('未连接')")
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).run") == before_offline['run']
            page.locator('#rollBtn').click()
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).draft.actions.length") == 2
            page.unroute('**/api/arena/**')
            page.locator('#connection').click()
            page.wait_for_function("document.querySelector('#connection').textContent.includes('异步联机')")
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).draft.actions.length") == 2
        assert not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        reports.append({'width': width, 'shop_requests': 0, 'round_requests': 1, 'draft_reload': True})
        context.close()
    browser.close()
    print(json.dumps({'ok': True, 'reports': reports, 'lost_response_retry': True, 'offline_draft_restore': True}))
