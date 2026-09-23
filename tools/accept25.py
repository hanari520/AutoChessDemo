# 25 局浏览器对战验收：同一页面连续 newGame 打 25 局，统计普通玩家(bot)通关率
# 用法: python tools/accept25.py [--speed 6] [--games 25]
import json, os, sys, time
from playwright.sync_api import sync_playwright

SPEED = 6
GAMES = 25
for i, a in enumerate(sys.argv):
    if a == '--speed': SPEED = int(sys.argv[i + 1])
    if a == '--games': GAMES = int(sys.argv[i + 1])

BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()

def play_game(pg, game_no, errs):
    """打完一整局，返回 dict(win, round, hp, err)"""
    t0 = time.time()
    battles = 0
    while time.time() - t0 < 40 * 60:          # 单局总看门狗 40 分钟
        st = pg.evaluate("() => ({phase:S.phase, round:S.round, hp:S.hp})")
        if st['phase'] == 'over':
            ov = pg.evaluate("() => document.getElementById('flowResultTitle').textContent")
            win = '通关' in (ov or '')
            return dict(win=win, round=st['round'], hp=st['hp'], battles=battles,
                        err=errs.pop(0) if errs else None)
        if st['phase'] == 'chapter':
            pg.evaluate("() => { if (S.settlePick == null) pickAug(0); chapterContinue(); }")
            continue
        pg.evaluate("() => botPrep()")
        pg.evaluate("() => { setSpeed(%d); startBattle(); }" % SPEED)
        battles += 1
        bt0 = time.time()
        while time.time() - bt0 < 150:          # 单场战斗看门狗 150 秒
            s2 = pg.evaluate("() => S.phase")
            if s2 in ('prep', 'over'): break
            pg.wait_for_timeout(200)
        else:
            return dict(win=False, round=st['round'], hp=st['hp'], battles=battles,
                        err='battle watchdog timeout')
    return dict(win=False, round=-1, hp=0, battles=battles, err='game watchdog timeout')

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8081/index.html'); pg.wait_for_timeout(800)
    pg.locator('#homeNew').click()
    pg.locator('#setupStart').click()
    pg.wait_for_timeout(300)
    pg.evaluate(BOT_JS)

    results = []
    for g in range(GAMES):
        r = play_game(pg, g + 1, errs)
        results.append(r)
        print(f"game {g+1:02d}: {'WIN ' if r['win'] else 'LOSE'} round={r['round']} "
              f"hp={r['hp']} battles={r['battles']}{'' if not r['err'] else '  ERR=' + str(r['err'])}",
              flush=True)
        # 引擎压力测试直接初始化下一局；生命周期交互由 lifecycle_test.py 覆盖。
        pg.evaluate("""() => {
          if (S.phase === 'over') { newGame(); renderAll(); }
        }""")
        pg.wait_for_timeout(200)

    wins = [r for r in results if r['win']]
    print(f"\n=== 验收汇总：{GAMES} 局，通关 {len(wins)} 局，胜率 {len(wins)/GAMES*100:.1f}% ===", flush=True)
    print('results=' + json.dumps(results, ensure_ascii=False), flush=True)
    b.close()
