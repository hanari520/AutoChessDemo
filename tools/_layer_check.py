# -*- coding: utf-8 -*-
"""图层验证：boss 预览完整性 + 战斗特效在单位之上 + 行遮挡"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("http://localhost:8081/index.html")
    pg.wait_for_timeout(1200)

    # 备战：r20 头目预览（2x2 boss），同时买满 8 人（boss 预览与满员同屏验证）
    pg.evaluate("""
      closeIntro(); S.gold=99999; S.lvl=11; S.round=20; prepEnemy();
      const want=['suiji','kouichi','yua','goutan','pako','aza','shengge','nox'];
      for(let r=0;r<80&&want.length;r++){ rollShop();
        for(let i=4;i>=0;i--){ const id=S.shop[i]&&S.shop[i].id;
          if(want.includes(id)){ buy(i); want.splice(want.indexOf(id),1);} } }
      autoDeploy(); tryMerge(); renderAll();
    """)
    pg.wait_for_timeout(500)
    pg.screenshot(path="_layer_bosspreview.png")

    # 战斗：r14 满编 + 抓特效帧
    pg.evaluate("S.round=14; prepEnemy(); renderAll(); startBattle()")
    pg.wait_for_timeout(800)
    checks = pg.evaluate("""
      (() => {
        const ul = document.getElementById('unitLayer');
        if (!ul) return { ulz: -1, note: 'battle already over' };
        const ulz = +getComputedStyle(ul).zIndex;
        const vfxs = [...document.querySelectorAll('#board > .vfx')].map(v => +getComputedStyle(v).zIndex);
        const dmgs = [...document.querySelectorAll('#board > .dmg')].map(v => +getComputedStyle(v).zIndex);
        return { ulz, vfxMin: Math.min(...vfxs, 999), dmgMin: Math.min(...dmgs, 999),
                 vfxCount: vfxs.length, dmgCount: dmgs.length };
      })()
    """)
    print("CHECKS:", checks)
    pg.wait_for_timeout(1500)
    pg.screenshot(path="_layer_fx2.png")
    print("CONSOLE_ERR:", len(errs))
    for e in errs[:4]: print("  ", e[:120])
    b.close()
