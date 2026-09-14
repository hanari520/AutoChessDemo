# 特效验收：开 3 局，战斗中每 130ms 连拍截图，并检查特效节点预算/残留与 console 报错
import json, os, sys, time
from playwright.sync_api import sync_playwright

BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out', 'vfx')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.'+m.type+': '+m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const r = document.getElementById('resumeOv');
      if (r && !r.classList.contains('hidden')) document.getElementById('resumeNo').click();
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
    }""")
    pg.wait_for_timeout(300)
    pg.evaluate(BOT_JS)

    peak = 0
    residue_bad = 0
    for game in range(3):
        if game > 0:
            # 结算画面 → 再来一局
            pg.evaluate("() => { const o=document.getElementById('overlay'); if(o&&!o.classList.contains('hidden')) document.getElementById('ovBtn').click(); }")
            pg.evaluate("() => newGame()")
            pg.wait_for_timeout(300)
        for battle in range(25):
            st = pg.evaluate("() => ({phase:S.phase, round:S.round})")
            if st['phase'] != 'prep':
                break
            r = st['round']
            pg.evaluate("() => botPrep()")
            pg.evaluate("() => { setSpeed(1); startBattle(); }")
            pg.wait_for_timeout(500)   # 跳过开战缓冲，进入交火
            # 战斗中连拍 2.6s（约 20 帧），记录 _vfxN 峰值与现存节点数
            for i in range(20):
                if pg.evaluate("() => S.phase") != 'battle':
                    break
                n = pg.evaluate("""() => {
                  const fx = document.querySelectorAll('#board .vfx').length;
                  const dm = document.querySelectorAll('#board .dmg').length;
                  return { n: (typeof _vfxN==='number'?_vfxN:-1), fx, dm };
                }""")
                peak = max(peak, n['n'], n['fx'])
                if i % 3 == 0 and battle in (2, 6, 10, 14):
                    pg.screenshot(path=os.path.join(OUT, f'g{game}_r{r:02d}_{i:02d}.png'))
                pg.wait_for_timeout(130)
            # 等战斗结束
            t0 = time.time()
            while time.time() - t0 < 60:
                if pg.evaluate("() => S.phase") in ('prep', 'over'):
                    break
                pg.wait_for_timeout(200)
            pg.wait_for_timeout(1400)   # 结算横幅 + 特效自然回收
            res = pg.evaluate("""() => ({
              vfx: document.querySelectorAll('#board .vfx').length,
              dmg: document.querySelectorAll('#board .dmg').length,
              layer: !!document.getElementById('unitLayer'),
              phase: S.phase, round: S.round })""")
            if res['vfx'] or res['dmg']:
                residue_bad += 1
                print('RESIDUE!', res)
            if pg.evaluate("() => S.phase") == 'over':
                break
        print(f'game {game} done, peak nodes so far = {peak}, residue events = {residue_bad}')
    print('PAGE ERRORS:', errs[:5] if errs else 'none')
    print(f'SUMMARY: peak={peak} residue_bad={residue_bad} errors={len(errs)}')
    b.close()
