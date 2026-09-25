# -*- coding: utf-8 -*-
"""2026-09-25 改动验收（浏览器）：
   1. 无 console 错误 / 无 404
   2. 开局定向招募弹窗出现、可点选、兑现到备战席
   3. 详情面板出现「🎯 技能定位」行
   4. 战斗中「大招就绪」标记类可挂上
   5. 结算面板包含「败因归因」（构造一次败局）
   截图输出到 tools/_vv_*.png
"""
import os, sys
from playwright.sync_api import sync_playwright

OUT = os.path.dirname(os.path.abspath(__file__))
URL = os.environ.get("URL", "http://localhost:8088/index.html")
errors, fails = [], []

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True,
                          args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: fails.append("REQFAIL " + r.url))
    pg.goto(URL)
    pg.wait_for_timeout(1500)

    # 走真实 UI 流程：新建对局 → 开始普通模式（保证 flow 状态与真实玩家一致）
    pg.click("#homeNew"); pg.wait_for_timeout(300)
    pg.click("#setupStart"); pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(OUT, "_vv_1_opening.png"))

    # ① 开局定向招募
    has_offer = pg.evaluate("() => !!document.getElementById('openingOfferOverlay')")
    print("① 开局定向招募弹窗:", "出现" if has_offer else "缺失")
    picked = None
    if has_offer:
        picked = pg.evaluate("""() => { const b=document.querySelector('#openingOfferOverlay button[data-i]');
            const name=b?b.querySelector('div').textContent:null; b&&b.click(); return name; }""")
        pg.wait_for_timeout(300)
        bench = pg.evaluate("() => S.bench.filter(Boolean).map(u=>byId(u.id).name)")
        dup = pg.evaluate("() => S.bench.filter(Boolean).length")
        print("   选中:", picked, "| 备战席:", bench, "| 席位数:", dup)
        print("   兑现成功:", "是" if picked in (bench or []) else "否")

    # ② 技能定位行
    pg.evaluate("""() => { const u=S.bench.find(Boolean) || {uid:1}; clickUnit('bench', S.bench.indexOf(u)); }""")
    pg.wait_for_timeout(300)
    role = pg.evaluate("() => { const el=document.querySelector('#inspect .in-role'); return el?el.textContent.trim():null; }")
    print("② 详情面板技能定位:", role if role else "缺失")
    pg.screenshot(path=os.path.join(OUT, "_vv_2_inspect.png"))

    # ③ 大招就绪标记（造一个蓝满的单位跑一帧）
    # ③ 大招就绪标记：走真实按钮路径（一键上阵 → 开战），保证舞台正常渲染
    pg.evaluate("""() => { const mk=id=>{ const d=byId(id); const hp=Math.round(d.hp*HP_SCALE);
        return {uid:S.uid++, id, star:1, sks:1, hp, maxhp:hp, atk:d.atk, items:[]}; };
      S.lvl=2; S.board=Array(64).fill(null); S.bench=Array(8).fill(null);
      S.bench[0]=mk('sanli'); S.bench[1]=mk('yuji'); S.phase='prep'; renderAll(); }""")
    pg.wait_for_timeout(200)
    pg.click("#deployBtn"); pg.wait_for_timeout(300)
    pg.click("#fightBtn"); pg.wait_for_timeout(400)
    # 等战斗跑一会儿，再把主动角色的蓝灌满，观察标记
    mark = pg.evaluate("""() => { const us=(window.__bu||[]); if(!us.length) return {err:'no-units'};
        us.filter(x=>x.side===0&&!isPassive(x)).forEach(x=>{ x.mana=x.maxmana; x.skillCd=0; });
        renderBattle(us);
        return {亮标记数:document.querySelectorAll('.unit.ult-ready').length,
                我方单位数:us.filter(x=>x.side===0).length,
                我方被动数:us.filter(x=>x.side===0&&isPassive(x)).length,
                舞台可见:!!document.getElementById('board')&&getComputedStyle(document.getElementById('board')).display!=='none'}; }""")
    pg.wait_for_timeout(200)
    print("③ 大招就绪标记:", mark)
    pg.screenshot(path=os.path.join(OUT, "_vv_3_battle.png"))

    # ④ 败因归因（直接渲染结算面板）
    pg.evaluate("() => { S.stats.wins=3; S.stats.losses=1; showFinalResult('测试', reportHTML('lose')); }")
    pg.wait_for_timeout(300)
    attr = pg.evaluate("() => { const t=document.getElementById('finalReport').textContent||''; "
                       "return {归因: t.includes('败因归因'), 定位: t.includes('技能：')}; }")
    print("④ 结算面板:", attr)
    pg.screenshot(path=os.path.join(OUT, "_vv_4_report.png"), full_page=True)

    b.close()

print("console 错误:", len(errors), errors[:3] if errors else "无")
print("资源失败:", len(fails), fails[:3] if fails else "无")
sys.exit(1 if (errors or fails) else 0)
