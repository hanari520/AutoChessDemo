# Phase 2 浏览器验收：2 局完整对局，截图战报结算块与总结面板
import os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    fails = []
    for game in (1, 2):
        pg = b.new_page(viewport={'width': 1400, 'height': 950})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://127.0.0.1:8081/index.html')
        pg.wait_for_timeout(700)
        pg.evaluate("""() => {
          const o = document.getElementById('overlay');
          if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
          newGame(); renderAll();
        }""")
        pg.evaluate(BOT_JS)
        result = None
        for i in range(40):
            st = pg.evaluate("() => ({phase:S.phase, round:S.round})")
            if st['phase'] == 'over': break
            pg.evaluate("() => botPrep()")
            if st['round'] in (3, 8) and game == 1:
                pg.screenshot(path=os.path.join(OUT, f'p2_g{game}_r{st["round"]}_log.png'))
            pg.evaluate("() => { setSpeed(2); startBattle(); }")
            t0 = time.time()
            while time.time() - t0 < 60:
                if pg.evaluate("() => S.phase") in ('prep', 'over'): break
                pg.wait_for_timeout(250)
        st = pg.evaluate("() => ({phase:S.phase, round:S.round})")
        ov = pg.evaluate("() => document.getElementById('ovText').innerHTML")
        title = pg.evaluate("() => document.getElementById('ovTitle').textContent")
        win = '通关' in title
        print(f"game{game}: {title} round={st['round']}")
        for kw in ('经济构成', '阶段扣血', '最终阵容', '全场之最'):
            if kw not in ov: fails.append(f'g{game} 缺 {kw}')
        if (not win) and '败局简析' not in ov: fails.append(f'g{game} 败局缺简析')
        # 战报结算块在面板中按序
        log_html = pg.evaluate("() => document.getElementById('log').innerHTML")
        for kw in ('回合结算', '本场之最', '下回合：难度'):
            if kw not in log_html: fails.append(f'g{game} 战报缺 {kw}')
        pg.screenshot(path=os.path.join(OUT, f'p2_g{game}_report.png'))
        if errs: fails.append(f'g{game} errors: {errs[:2]}')
        pg.close()
    b.close()
    print('FAILS:', fails if fails else '无 — ALL PASS ✅')
    sys.exit(0 if not fails else 1)
