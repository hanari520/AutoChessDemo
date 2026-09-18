# -*- coding: utf-8 -*-
"""2×2 boss 预览遮挡修复验证：构造 boss+邻位棋子的敌方预览并截图（前后对比用 seed 控制）"""
import json, sys
from playwright.sync_api import sync_playwright

OUT = 'F:/demo/autochess/out/_boss_fix_check.png'
with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', headless=True,
                          args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1400, 'height': 1000})
    pg.goto('http://127.0.0.1:8081/index.html', wait_until='networkidle')
    pg.wait_for_timeout(800)
    info = pg.evaluate('''() => {
      globalThis.newGame();
      S.round = 12;                 // 头目回合附近，prepEnemy 会生成 big 单位
      prepEnemy();
      const eb = S.enemyBoard;
      let bossIdx = eb.findIndex(u => u && u.big);
      if (bossIdx < 0) {           // 没生成就把某个敌人升级为 big 并挪到指定位置
        const any = eb.findIndex(u => u);
        const u = eb[any]; eb[any] = null;
        bossIdx = 2*8 + 5;         // (x=5, y=2)
        u.big = true; eb[bossIdx] = u;
      }
      // 保证 boss 下一行有棋子（遮挡风险位），并放一个到左下角
      const bx = bossIdx % 8, by = (bossIdx - bx) / 8;
      const belowIdx = (by + 1) * 8 + bx;              // 正下方
      const diagIdx  = (by + 1) * 8 + Math.max(0, bx-1); // 左下
      if (!eb[belowIdx]) { const src = eb.find(u => u && !u.big); if (src) eb[belowIdx] = {id:src.id, star:src.star, items:[]}; }
      if (!eb[diagIdx])  { const src = eb.find(u => u && !u.big); if (src) eb[diagIdx]  = {id:src.id, star:src.star, items:[]}; }
      S.board.fill(null);          // 清我方棋盘便于截图
      const ov = document.getElementById('overlay'); if (ov) ov.style.display = 'none';
      renderAll();
      return { bossIdx, bx, by, belowIdx, diagIdx,
               bossCellZ: document.querySelectorAll('#board .cell')[bossIdx].style.zIndex,
               belowCellZ: document.querySelectorAll('#board .cell')[belowIdx].style.zIndex,
               bigCount: document.querySelectorAll('#board .unit.preview.big').length };
    }''')
    print('state:', json.dumps(info))
    pg.wait_for_timeout(400)
    box = pg.evaluate('''() => { const r = document.getElementById('board').getBoundingClientRect();
      return {x: Math.max(0, r.x-8), y: Math.max(0, r.y-8), width: r.width+16, height: Math.min(r.height+16, 900)}; }''')
    pg.screenshot(path=OUT, clip=box)
    b.close()
print('saved', OUT)
