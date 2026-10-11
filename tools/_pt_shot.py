# -*- coding: utf-8 -*-
"""立绘接入验收：截图 备战/战斗/图鉴/详情 四视图 + 资源404检查"""
import os, time
from playwright.sync_api import sync_playwright

OUT = os.path.dirname(os.path.abspath(__file__))
def shot_path(n): return os.path.join(OUT, "_shot_" + n + ".png")

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

    # 开局 + 买人上阵
    pg.evaluate("closeIntro()")
    pg.evaluate("S.gold=60; S.lvl=5; rollShop(); for(let i=0;i<5;i++) buy(i); rollShop(); for(let i=0;i<5;i++) buy(i); autoDeploy(); tryMerge();")
    pg.evaluate("renderAll && renderAll()")
    pg.wait_for_timeout(600)
    pg.screenshot(path=shot_path("prep"))

    # 单击棋子 → 详情面板
    pg.evaluate("""const el=document.querySelector('#board .unit'); el && el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))""")
    pg.wait_for_timeout(400)
    pg.screenshot(path=shot_path("inspect"))

    # 开战
    pg.evaluate("startBattle()")
    pg.wait_for_timeout(3000)
    pg.screenshot(path=shot_path("battle"))

    # 图鉴
    pg.evaluate("document.getElementById('bookModal').classList.remove('hidden'); renderBook()")
    pg.wait_for_timeout(400)
    pg.screenshot(path=shot_path("book"))
    b.close()

print("FAILED_REQ:", len(fails))
for f in sorted(set(fails))[:10]: print("  ", f)
print("CONSOLE_ERR:", len(errors))
for e in sorted(set(errors))[:6]: print("  ", e[:160])
