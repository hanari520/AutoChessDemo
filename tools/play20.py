# 浏览器实跑 25 回合：Playwright 打开 8081，页内 evaluate 驱动（与模拟器同一套机器人策略）
# 用法: python tools/play20.py [--speed 2]
import json, os, sys, time
from playwright.sync_api import sync_playwright

BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    # 新开一局只由设置页的显式按钮确认。
    pg.locator('#homeNew').click()
    pg.locator('#setupStart').click()
    pg.wait_for_timeout(300)
    pg.evaluate(BOT_JS)
    pg.set_viewport_size({'width': 1400, 'height': 900})

    hp_log, round_log = [], []
    for battle_no in range(30):
        state = pg.evaluate("""() => ({phase:S.phase, round:S.round, hp:S.hp, gold:S.gold, lvl:S.lvl, endless:!!S.endless})""")
        if state['phase'] == 'over':
            print('GAME OVER:', state); break
        if state['phase'] == 'chapter':
            cards = pg.locator('#chapterBody [data-aug]')
            if cards.count(): cards.first.click()
            pg.locator('#chapterContinue').click()
            continue
        # 备战阶段：机器人操作 + 截图关键回合
        r = state['round']
        pg.evaluate("() => botPrep()")
        if r in (1, 5, 10, 15, 20, 25):
            pg.screenshot(path=f'out/round_{r:02d}.png', full_page=False)
        pg.evaluate("() => { setSpeed(2); startBattle(); }")
        # 等待回到备战阶段或终局（含结算横幅 1.1s）
        t0 = time.time()
        while time.time() - t0 < 60:
            st = pg.evaluate("() => ({phase:S.phase, round:S.round, hp:S.hp})")
            if st['phase'] in ('prep', 'over'):
                break
            pg.wait_for_timeout(300)
        st = pg.evaluate("() => ({phase:S.phase, round:S.round, hp:S.hp, gold:S.gold, lvl:S.lvl, streak:S.streak})")
        if errs: print('PAGE ERRORS:', errs[:3]); errs.clear()
        hp_log.append((st['round'], st['hp']))
        print(f"battle {battle_no+1}: round={st['round']} phase={st['phase']} hp={st['hp']} gold={st['gold']} lvl={st['lvl']} streak={st['streak']}")
        if st['phase'] == 'over':
            ov = pg.evaluate("() => document.getElementById('flowResultTitle').textContent")
            win = '通关' in (ov or '')
            print('RESULT:', 'WIN' if win else 'LOSE', ov, st)
            pg.screenshot(path='out/end_screen.png')
            break
    else:
        print('guard exhausted')
    print('hp trajectory:', hp_log)
    b.close()
