"""Exercise the real Phaser scene in isolated desktop/mobile browser contexts."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out' / 'survival'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8081'


def ready(page):
    page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length === 50', timeout=30000)


def run_test():
    errors = []
    failures = []
    result = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE) or route.request.url.startswith('data:') else route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failures.append(response.url) if response.status >= 400 and '/survival' in response.url else None)
        page.goto(BASE + '/survival.html')
        ready(page)
        page.evaluate("localStorage.setItem('vc_save4','protected-original-save')")
        page.screenshot(path=str(OUT / 'desktop-selection.png'))
        page.locator('[data-hero="yua"]').click()
        page.locator('#start').click()
        page.wait_for_function('StarSurvivor.state?.phase === "battle"')
        start = page.evaluate('({x:StarSurvivor.scene.player.x,y:StarSurvivor.scene.player.y})')
        page.keyboard.down('d')
        page.wait_for_timeout(700)
        page.keyboard.up('d')
        after = page.evaluate('({x:StarSurvivor.scene.player.x,y:StarSurvivor.scene.player.y})')
        assert after['x'] > start['x'] + 60, (start, after)
        page.wait_for_function('StarSurvivor.scene.enemies.countActive() > 0')
        # Put a naturally spawned enemy near the player to exercise auto-aim, collision and pickups.
        page.evaluate('''() => {
          const s=StarSurvivor.scene,e=s.enemies.getChildren().find(e=>e.active);
          e.body.reset(s.player.x+90,s.player.y);e.hp=10;
        }''')
        page.wait_for_function('StarSurvivor.state.kills > 0', timeout=10000)
        page.wait_for_function('StarSurvivor.scene.drops.countActive() > 0')
        page.evaluate('''() => {
          const s=StarSurvivor.scene,d=s.drops.getChildren().find(d=>d.active);
          s.player.body.reset(d.x,d.y);
        }''')
        page.wait_for_function('StarSurvivor.state.coins > 0')
        page.locator('#pause').click()
        paused = page.evaluate('StarSurvivor.state.elapsed')
        page.wait_for_timeout(500)
        assert page.evaluate('StarSurvivor.state.elapsed') == paused
        page.locator('#resume').click()
        page.wait_for_timeout(200)
        page.screenshot(path=str(OUT / 'desktop-battle.png'))
        page.evaluate('StarSurvivor.scene.elapsed = StarSurvivor.core.duration(StarSurvivor.state.wave) - .01')
        page.wait_for_function('StarSurvivor.state.phase === "shop"')
        assert page.evaluate('StarSurvivor.state.wave') == 2
        assert page.locator('.offer').count() == 4
        page.screenshot(path=str(OUT / 'desktop-shop.png'))
        assert page.evaluate("localStorage.getItem('vc_save4')") == 'protected-original-save'
        result['real_combat'] = page.evaluate('({kills:StarSurvivor.state.kills,coins:StarSurvivor.state.coins,wave:StarSurvivor.state.wave})')
        # A valid checkpoint exercises purchases, locks, tier merging and a live companion.
        page.evaluate('''() => {
          const C=StarSurvivor.core,s=C.newRun({id:'yua',job:'法师'},0,123);
          s.phase='shop';s.wave=2;s.coins=150;s.companions=['ein'];
          s.offers=[{type:'weapon',id:'wand',price:15,locked:false},
            {type:'item',id:'heart',price:16,locked:false},
            {type:'companion',id:'chiharu',price:30,locked:false},
            {type:'weapon',id:'mic',price:20,locked:false}];
          localStorage.setItem(C.SAVE_KEY,JSON.stringify(C.snapshot(s)));
        }''')
        page.reload()
        ready(page)
        page.locator('#continue').click()
        page.locator('[data-buy="0"]').click()
        assert page.evaluate('StarSurvivor.state.weapons[0].tier') == 2
        assert page.evaluate('StarSurvivor.state.coins') == 135
        page.locator('[data-lock="1"]').click()
        locked = page.evaluate('JSON.stringify(StarSurvivor.state.offers[1])')
        page.locator('#reroll').click()
        assert page.evaluate('JSON.stringify(StarSurvivor.state.offers[1])') == locked
        page.locator('#next').click()
        page.wait_for_function('StarSurvivor.state.phase === "battle"')
        assert page.evaluate('StarSurvivor.scene.partnerSprites.length') == 1
        page.wait_for_timeout(1000)
        page.screenshot(path=str(OUT / 'desktop-companion.png'))
        result['shop_and_companion'] = True
        page.goto(BASE + '/index.html')
        page.locator('#homeSurvival').wait_for(state='visible')
        page.locator('#homeSurvival').click()
        ready(page)
        result['main_menu_entry'] = True
        assert not errors, errors
        assert not failures, failures
        context.close()

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        phone = mobile.new_page()
        phone.on('pageerror', lambda error: errors.append(str(error)))
        phone.goto(BASE + '/survival.html')
        ready(phone)
        phone.screenshot(path=str(OUT / 'mobile-selection.png'))
        phone.locator('#start').tap()
        phone.wait_for_function('StarSurvivor.state?.phase === "battle"')
        phone.wait_for_timeout(1700)
        phone.screenshot(path=str(OUT / 'mobile-battle.png'))
        assert phone.locator('#joystick').is_visible()
        pad = phone.locator('#joystick').bounding_box()
        before_move = phone.evaluate('StarSurvivor.scene.player.x')
        phone.mouse.move(pad['x'] + pad['width'] / 2, pad['y'] + pad['height'] / 2)
        phone.mouse.down()
        phone.mouse.move(pad['x'] + pad['width'] / 2 + 30, pad['y'] + pad['height'] / 2)
        phone.wait_for_timeout(600)
        phone.mouse.up()
        assert phone.evaluate('StarSurvivor.scene.player.x') > before_move + 40
        overflow = phone.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not overflow
        phone.locator('#pause').tap()
        assert phone.locator('#resume').is_visible()
        phone.locator('#resume').tap()
        phone.evaluate('StarSurvivor.scene.elapsed = StarSurvivor.core.duration(StarSurvivor.state.wave) - .01')
        phone.wait_for_function('StarSurvivor.state.phase === "shop"')
        phone.screenshot(path=str(OUT / 'mobile-shop.png'))
        buttons = phone.locator('.offer .buy').evaluate_all('(els)=>els.map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width}))')
        assert all(b['x'] >= 0 and b['x'] + b['w'] <= 390 for b in buttons)
        for width, height in [(320, 740), (844, 390)]:
            phone.set_viewport_size({'width': width, 'height': height})
            phone.wait_for_timeout(350)
            assert not phone.evaluate('document.documentElement.scrollWidth > innerWidth')
            phone.screenshot(path=str(OUT / f'shop-{width}x{height}.png'))
        result['mobile'] = {'width': 390, 'overflow': overflow}
        assert not errors, errors
        mobile.close()
        browser.close()
    (OUT / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': result, 'errors': errors, 'failed_assets': failures}, ensure_ascii=False))


if __name__ == '__main__':
    run_test()
