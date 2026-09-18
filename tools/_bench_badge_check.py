# -*- coding: utf-8 -*-
"""板凳徽章/星级位置验证：买入几名棋子进备战席，截图板凳区域"""
from playwright.sync_api import sync_playwright

OUT = 'F:/demo/autochess/out/_bench_badge_check.png'
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    pg.goto('http://127.0.0.1:8081/index.html', wait_until='networkidle')
    pg.wait_for_timeout(800)
    info = pg.evaluate('''() => {
      globalThis.newGame();
      const ov = document.getElementById('overlay'); if (ov) ov.style.display = 'none';
      S.gold = 99;
      let bought = 0;
      for (let round = 0; round < 8 && bought < 5; round++) {
        rollShop();
        for (let i = 0; i < 5 && bought < 5; i++) {
          const c = S.shop[i];
          if (c) { buy(i); bought++; }
        }
      }
      renderAll();
      const st = [...document.querySelectorAll('#bench .unit .st')].map(x => x.textContent);
      const sy = [...document.querySelectorAll('#bench .unit .syn .sy')].length;
      return { bought, benchStars: st, benchBadges: sy,
               benchRect: (() => { const r = document.getElementById('bench').getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })() };
    }''')
    print('state:', info)
    pg.wait_for_timeout(300)
    r = info['benchRect']
    pg.screenshot(path=OUT, clip={'x': max(0, r['x']-10), 'y': max(0, r['y']-70), 'width': r['w']+20, 'height': r['h']+90})
    b.close()
print('saved', OUT)
