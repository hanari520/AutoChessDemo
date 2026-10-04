"""Regression: center the arena when the viewport is wider/taller than the map."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out/survival/camera'
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:8081'
SIZES = [(2559, 1277), (2048, 1015), (1920, 1080), (1280, 800), (844, 390), (390, 844), (320, 740)]


def measure(page):
    return page.evaluate('''() => {
      const s=StarSurvivor.scene,c=s.cameras.main;
      const screen=(x,y)=>({x:(x-c.worldView.x)*c.zoom,y:(y-c.worldView.y)*c.zoom});
      return {width:innerWidth,height:innerHeight,zoom:c.zoom,center:screen(550,390),
        displayWidth:c.displayWidth,displayHeight:c.displayHeight,
        player:screen(s.player.x,s.player.y),overflow:document.documentElement.scrollWidth>innerWidth};
    }''')


def centered(info):
    # Smaller viewports follow the player inside the map rather than fitting it all.
    if info['displayWidth'] >= 1100:
        assert abs(info['center']['x'] - info['width'] / 2) < 2, info
    if info['displayHeight'] >= 780:
        assert abs(info['center']['y'] - info['height'] / 2) < 2, info
    assert not info['overflow'], info


def run_test():
    results, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-webgl'])
        context = browser.new_context(viewport={'width': 2559, 'height': 1277})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE + '/survival.html')
        page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length === 50')
        page.locator('#panel').evaluate('(panel)=>panel.close()')
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / 'wide-idle.png'))
        centered(measure(page))
        page.reload()
        page.wait_for_function('window.StarSurvivor && document.querySelectorAll(".hero-card").length === 50')
        page.locator('#start').click()
        page.wait_for_function('StarSurvivor.state?.phase === "battle"')
        page.evaluate('StarSurvivor.scene.spawnAt=999')
        for width, height in SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(500)
            info = measure(page)
            centered(info)
            assert abs(info['player']['x'] - width / 2) < 2, info
            if info['displayHeight'] >= 780:
                assert abs(info['player']['y'] - height / 2) < 2, info
            page.screenshot(path=str(OUT / f'battle-{width}x{height}.png'))
            results.append(info)
        # Follow remains functional in a narrow screen, after resizing from ultrawide.
        page.keyboard.down('d')
        page.wait_for_timeout(500)
        page.keyboard.up('d')
        assert page.evaluate('StarSurvivor.scene.player.x') > 610
        page.set_viewport_size({'width': 2559, 'height': 1277})
        page.wait_for_timeout(500)
        moved = measure(page)
        centered(moved)
        assert moved['player']['x'] > moved['center']['x'] + 60, moved
        page.locator('#pause').click()
        page.set_viewport_size({'width': 1920, 'height': 1080})
        page.wait_for_timeout(300)
        centered(measure(page))
        page.locator('#retreat').click()
        page.locator('#save-menu').click()
        page.locator('#panel').evaluate('(panel)=>panel.close()')
        page.wait_for_timeout(300)
        centered(measure(page))
        assert not errors, errors
        context.close()
        browser.close()
    (OUT / 'verification.json').write_text(json.dumps({'viewports': results, 'errors': errors}, indent=2), encoding='utf-8')
    print(json.dumps({'passedViewports': len(results), 'resizeMovementPauseReturn': True, 'errors': errors}))


if __name__ == '__main__':
    run_test()
