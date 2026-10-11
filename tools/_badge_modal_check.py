# -*- coding: utf-8 -*-
"""徽章悬浮层 vs 弹窗层级验证：徽章不得泄漏到荣誉殿堂弹窗之上"""
import json
from playwright.sync_api import sync_playwright

OUT = 'F:/demo/autochess/out/_badge_modal_check.png'
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True)
    pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    pg.goto('http://127.0.0.1:8081/index.html', wait_until='networkidle')
    pg.wait_for_timeout(800)
    res = pg.evaluate('''() => {
      globalThis.newGame();
      const ov = document.getElementById('overlay'); if (ov) ov.style.display = 'none';
      S.board.fill(null);
      S.board[4*8+3] = { uid: S.uid++, id: 'zhouyi', star: 2, items: [] };
      S.board[5*8+3] = { uid: S.uid++, id: 'yua', star: 1, items: [] };
      prepEnemy(); renderAll();
      const layer = document.getElementById('synBadgeLayer');
      const sy = layer.querySelector('.sy');
      const r = sy.getBoundingClientRect();
      const probe = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      const badgeAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el ? (el.closest('#histModal') ? 'modal' : (el.closest('#synBadgeLayer') ? 'badge' : (el.className || el.tagName))) : 'none';
      };
      const before = badgeAt(probe.x, probe.y);
      document.getElementById('histBtn').click();
      const histVisible = !document.getElementById('histModal').classList.contains('hidden');
      const after = badgeAt(probe.x, probe.y);
      return { before, after, histVisible, probe };
    }''')
    print('result:', json.dumps(res))
    pg.wait_for_timeout(300)
    pg.screenshot(path=OUT)
    b.close()
print('saved', OUT)
