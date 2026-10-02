"""Desktop/mobile pointer drags with isolated offline fixtures (no cloud writes)."""
import json
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get('ARENA_TEST_URL', 'http://127.0.0.1:8082/arena.html')
KEY = 'vc_async_arena_preview_v1'
with sync_playwright() as p:
    browser = p.chromium.launch()
    checks = []
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/api/arena/**', lambda route: route.abort())
        page.goto(URL, wait_until='networkidle')
        page.wait_for_selector('#team .unit-slot')
        for target_perk in [None, 'melon']:
            page.evaluate("""async perk => {
                const {createRun}=await import('./arena/core.mjs');const run=createRun('drag-merge');
                run.team[0]={uid:'target',id:'agari',atk:4,hp:3,xp:1,level:1,perk};
                run.team[1]={uid:'source',id:'agari',atk:2,hp:6,xp:0,level:1,perk:'honey'};
                localStorage.removeItem('vc_async_arena_token_v1');localStorage.removeItem('vc_async_arena_pending_v1');
                localStorage.setItem('vc_async_arena_preview_v1',JSON.stringify({run,token:null,lastBattle:null}));
            }""", target_perk)
            page.reload(wait_until='networkidle')
            page.wait_for_selector('[data-unit="source"]')
            source = page.locator('[data-unit="source"]').bounding_box()
            target = page.locator('[data-unit="target"]').bounding_box()
            page.mouse.move(source['x']+source['width']/2, source['y']+source['height']/2)
            page.mouse.down()
            page.mouse.move(target['x']+target['width']/2, target['y']+target['height']/2, steps=15)
            page.mouse.up()
            state = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).run")
            assert state['team'][1] is None
            assert state['team'][0]['perk'] == (target_perk or 'honey')
            assert state['team'][0]['level'] == 2
            source = page.locator('[data-unit="target"]').bounding_box()
            market = page.locator('.market .section-heading').bounding_box()
            before = page.evaluate("({width:document.documentElement.scrollWidth,height:document.querySelector('.market').getBoundingClientRect().height})")
            page.mouse.move(source['x']+source['width']/2, source['y']+source['height']/2)
            page.mouse.down()
            page.mouse.move(market['x']+market['width']/2, market['y']+market['height']/2, steps=15)
            assert page.locator('.market.drop-valid').count() == 1
            assert page.evaluate("({width:document.documentElement.scrollWidth,height:document.querySelector('.market').getBoundingClientRect().height})") == before
            page.mouse.up()
            sold = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).run")
            assert not any(sold['team']) and sold['gold'] > state['gold']
            assert page.locator('.market.drop-valid').count() == 0
            checks.append({'width': width, 'target_perk': target_perk, 'merge_perk': True, 'shop_drag_sale': True})
        assert not errors, errors
        context.close()
    browser.close()
    print(json.dumps({'ok': True, 'checks': checks}))
