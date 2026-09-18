# -*- coding: utf-8 -*-
"""8 张 AI 立绘接入验收：定向买 8 人上阵，截 备战/战斗/图鉴 视图 + 404 检查"""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.dirname(os.path.abspath(__file__))
def shot_path(n): return os.path.join(OUT, "_shot8_" + n + ".png")

fails, errors = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("requestfailed", lambda r: fails.append(r.url))
    pg.on("response", lambda r: {404: lambda: fails.append("404 " + r.url)}.get(r.status, lambda: None)())
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto("http://localhost:8081/index.html")
    pg.wait_for_timeout(1200)

    # 定向买到 8 名新立绘棋子并上阵
    pg.evaluate("""
      closeIntro();
      S.gold = 99999; S.lvl = 11;
      const want = ['suiji','kouichi','yua','goutan','pako','aza','shengge','nox'];
      for (let round = 0; round < 80 && want.length; round++) {
        rollShop();
        for (let i = 4; i >= 0; i--) {
          const id = S.shop[i] && S.shop[i].id;
          if (want.includes(id)) { buy(i); want.splice(want.indexOf(id), 1); }
        }
      }
      autoDeploy(); tryMerge();
    """)
    pg.evaluate("renderAll && renderAll()")
    pg.wait_for_timeout(700)
    got = pg.evaluate("(()=>{const s=new Set();document.querySelectorAll('#board .unit').forEach(u=>s.add(u.dataset.id||u.className));return [...s]})()")
    pg.screenshot(path=shot_path("prep"))

    # 开战看战斗态：调到 r14 打满编敌人，抓战斗中三帧
    pg.evaluate("S.round=14; prepEnemy(); renderAll(); startBattle()")
    pg.wait_for_timeout(700)
    st = pg.evaluate("""(()=>{
      const ul=document.getElementById('unitLayer');
      if(!ul) return {battle:false};
      const zs=sel=>[...document.querySelectorAll(sel)].map(v=>+getComputedStyle(v).zIndex);
      return {battle:true, ulz:+getComputedStyle(ul).zIndex,
        vfxMin:Math.min(...zs('#board > .vfx'),999), vfxN:document.querySelectorAll('#board > .vfx').length,
        dmgMin:Math.min(...zs('#board > .dmg'),999)};
    })()""")
    print("LAYER:", st)
    pg.wait_for_timeout(1400)
    pg.screenshot(path=shot_path("battle"))

    # 图鉴
    pg.evaluate("document.getElementById('bookModal').classList.remove('hidden'); renderBook()")
    pg.wait_for_timeout(500)
    pg.screenshot(path=shot_path("book"))
    b.close()

print("ONBOARD:", got if isinstance(got, list) else got)
print("FAILED_REQ:", len(fails))
for f in sorted(set(fails))[:10]: print("  ", f)
print("CONSOLE_ERR:", len(errors))
for e in sorted(set(errors))[:6]: print("  ", e[:160])
