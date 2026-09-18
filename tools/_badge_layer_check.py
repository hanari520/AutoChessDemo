# -*- coding: utf-8 -*-
"""徽章悬浮层验证：上下相邻棋子场景，断言上排徽章不再被下排头部遮挡"""
import json
from playwright.sync_api import sync_playwright

OUT = 'F:/demo/autochess/out/_badge_layer_check.png'
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    pg.goto('http://127.0.0.1:8081/index.html', wait_until='networkidle')
    pg.wait_for_timeout(800)
    info = pg.evaluate('''() => {
      globalThis.newGame();
      const ov = document.getElementById('overlay'); if (ov) ov.style.display = 'none';
      S.board.fill(null);
      S.board[4*8+3] = { uid: S.uid++, id: 'zhouyi', star: 2, items: [] };   // 上排：黑红刀客（3 徽章）
      S.board[5*8+3] = { uid: S.uid++, id: 'yua',     star: 1, items: ['sword'] }; // 正下方：头会越界的棋子
      S.board[5*8+2] = { uid: S.uid++, id: 'kanban',  star: 1, items: [] };
      S.board[4*8+4] = { uid: S.uid++, id: 'sishi',   star: 1, items: [] };  // 同行右侧（横向溢出风险位）
      prepEnemy();             // 敌方预览也要有徽章
      renderAll();
      const layer = document.getElementById('synBadgeLayer');
      const badges = layer ? [...layer.querySelectorAll('.sy')] : [];
      const rect = el => { const r = el.getBoundingClientRect(); return {l:r.left, t:r.top, r:r.right, b:r.bottom}; };
      const hit = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
      // 上排 (3,4) 徽章条 vs 正下方 (3,5) 头部越界区
      const upperBadges = badges.filter(x => x.title === '音律' || x.title === '游侠');
      const lowerHead = document.querySelector('#board .cell:nth-child(44) .pt, #board .cell:nth-child(44) .unit');
      const upperStrip = upperBadges.length ? rect(upperBadges[0].parentElement) : null;
      const lowerRect = lowerHead ? rect(lowerHead) : null;
      const overlap = (upperStrip && lowerRect) ? hit(upperStrip, lowerRect) : 'n/a';
      return {
        layerExists: !!layer,
        badgeCount: badges.length,
        upperStrip, lowerRect, overlap,
        bigBadges: [...layer.querySelectorAll('.unit.big-badge .sy')].length
      };
    }''')
    print('state:', json.dumps(info))
    pg.wait_for_timeout(300)
    box = pg.evaluate('''() => { const r = document.getElementById('board').getBoundingClientRect();
      return {x: Math.max(0, r.x-8), y: Math.max(0, r.y-8), width: r.width+16, height: Math.min(r.height+16, 900)}; }''')
    pg.screenshot(path=OUT, clip=box)
    # 开战后悬浮层应被移除
    gone = pg.evaluate('''() => { startBattle(); return !document.getElementById('synBadgeLayer'); }''')
    print('layer removed on battle:', gone)
    b.close()
print('saved', OUT)
