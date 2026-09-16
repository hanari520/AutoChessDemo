# -*- coding: utf-8 -*-
# 移动端适配验证：桌面回归 + 手机竖屏（390/360）+ 横屏（740×360）
# 用法：python tools/_mobile_check.py
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8081/index.html"
OUT = "out"

def console_watch(page, errs):
    page.on("pageerror", lambda e: errs.append(str(e)))

def start(page):
    page.goto(BASE)
    page.wait_for_timeout(600)
    # 无存档：直接 newGame + 开场浮层；点开始进入备战
    if page.locator("#overlay:not(.hidden)").count():
        page.locator("#ovBtn").click()
        page.wait_for_timeout(400)

def prep_screenshot(page, path, buys=2):
    # 买几枚棋子备战席，让画面里有内容
    for _ in range(buys):
        cards = page.locator("#shop .card:not(.sold)")
        if cards.count():
            cards.first.click()
            page.wait_for_timeout(150)
    page.screenshot(path=path, full_page=False)

def check(cond, msg, results):
    results.append(("PASS" if cond else "FAIL", msg))

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    results = []

    # ---------- 1) 桌面回归 1280×800 ----------
    ctx = browser.new_context(viewport={"width":1280, "height":800})
    page = ctx.new_page(); errs = []; console_watch(page, errs)
    start(page)
    cell = page.evaluate("getComputedStyle(document.body).getPropertyValue('--cell').trim()")
    touch = page.evaluate("document.body.classList.contains('touch')")
    fight_label = page.locator("#fightBtn").inner_text()
    check("580px" in cell, f"桌面 --cell 公式保持桌面口径（{cell}）", results)
    check(not touch, "桌面无 body.touch", results)
    check("空格" in fight_label, f"桌面开战按钮保留键位提示（{fight_label!r}）", results)
    prep_screenshot(page, f"{OUT}/regress_desktop.png", buys=3)
    check(not errs, f"桌面 console 无报错（{errs[:2]}）", results)
    ctx.close()

    # ---------- 2) 手机竖屏 390×844（触屏） ----------
    ctx = browser.new_context(viewport={"width":390, "height":844}, has_touch=True,
                              is_mobile=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")
    page = ctx.new_page(); errs = []; console_watch(page, errs)
    start(page)
    touch = page.evaluate("document.body.classList.contains('touch')")
    info = page.evaluate("""(() => {
      const b=document.getElementById('board').getBoundingClientRect();
      const bar=document.getElementById('shopbar').getBoundingClientRect();
      const u=document.querySelector('#board .cell .unit, #board .cell');
      return { boardRight:+b.right.toFixed(1), boardLeft:+b.left.toFixed(1), vw:innerWidth,
               barTop:+bar.top.toFixed(1), barBottom:+bar.bottom.toFixed(1), vh:innerHeight,
               cellCss:u?getComputedStyle(u.querySelector('.unit')||u).touchAction:'-',
               transform:document.getElementById('boardwrap').style.transform||'',
               fight:document.getElementById('fightBtn').textContent.trim(),
               sell:document.getElementById('sellBtn').textContent.trim() };
    })()""")
    check(touch, "手机启用 body.touch", results)
    check(info["boardRight"] <= info["vw"] + 0.5 and info["boardLeft"] >= -0.5,
          f"棋盘完整落在视口内（right={info['boardRight']}, vw={info['vw']}）", results)
    check(info["barBottom"] <= info["vh"] + 0.5,
          f"底部动作条完整可见（bottom={info['barBottom']}, vh={info['vh']}）", results)
    check(info["transform"]=="", f"棋盘未被 transform 二次缩放（{info['transform']!r}）", results)
    check("(E)" not in info["sell"] and "空格" not in info["fight"],
          f"触屏按钮无键位提示（sell={info['sell']!r}, fight={info['fight']!r}）", results)
    prep_screenshot(page, f"{OUT}/mobile_390_prep.png")

    # 点选移动：备战席第一枚棋子 → 点它 → 高亮出现 → 点我方半区空格 → 上阵
    moved = page.evaluate("""(() => {
      const slot=[...document.querySelectorAll('#bench .bslot')].find(s=>s.querySelector('.unit'));
      if(!slot) return {ok:false, why:'备战席无棋子'};
      const uid=slot.querySelector('.unit').dataset.uid;
      slot.querySelector('.unit').click();
      const hl=document.querySelectorAll('.mv-hl').length;
      const hint=document.getElementById('moveHint').style.display;
      // 选一个我方半区空格（y=4 行 x=3 → idx=4*8+3=35）
      const cells=document.getElementById('board').children;
      const dst=[...cells].find((c,i)=>i>=32&&!c.querySelector('.unit'));
      dst.click();
      const inBoard=window.__S.board.some(u=>u&&String(u.uid)===String(uid));
      return {ok:inBoard, hl, hint, inBoard};
    })()""")
    check(moved.get("ok"), f"点选移动：备战席→棋盘上阵成功（高亮格数={moved.get('hl')}, 提示条={moved.get('hint')}）", results)
    page.screenshot(path=f"{OUT}/mobile_390_moved.png")

    # 点选换位 + 取消流：点棋盘棋子再点它自己 = 取消
    cancel = page.evaluate("""(() => {
      const unit=document.querySelector('#board .cell .unit');
      if(!unit) return {ok:false};
      unit.click();
      const hl=document.querySelectorAll('.mv-hl').length;
      const src=document.querySelector('.unit.mvsrc');
      if(src) src.click();
      const cleared=!document.querySelector('.unit.mvsrc') && document.getElementById('moveHint').style.display==='none';
      return {ok: cleared, hl};
    })()""")
    check(cancel.get("ok"), f"点选取消：再点自己退出移动模式（高亮格数={cancel.get('hl')}）", results)

    # 触屏选中后出售按钮可用并显示价格（注意别点到敌方预览棋子）
    sell_state = page.evaluate("""(() => {
      const unit=document.querySelector('#board .cell:not(.enemy-preview-cell) .unit, #bench .bslot .unit');
      if(!unit) return {ok:false};
      unit.click();
      return {ok:true, sell:document.getElementById('sellBtn').textContent.trim(),
              disabled:document.getElementById('sellBtn').disabled};
    })()""")
    check(sell_state.get("ok") and not sell_state.get("disabled") and "+" in sell_state.get("sell",""),
          f"触屏选中后出售按钮解锁并显示价格（{sell_state.get('sell')}）", results)

    # 图鉴底部抽屉
    page.locator("#bookBtn").click(); page.wait_for_timeout(300)
    book = page.evaluate("""(() => {
      const p=document.getElementById('bookPanel').getBoundingClientRect();
      return {left:p.left, width:p.width, bottom:p.bottom, vh:innerHeight};
    })()""")
    check(book["left"]<=0.5 and book["width"]>=389 and abs(book["bottom"]-book["vh"])<2,
          f"图鉴为全宽底部抽屉（left={book['left']}, w={book['width']}, bottom={book['bottom']}）", results)
    page.locator("#bookClose").click(); page.wait_for_timeout(200)

    # 开战 → 战斗正常推进 → 回合推进（核心逻辑回归）
    page.locator("#fightBtn").click()
    page.wait_for_timeout(2500)
    phase = page.evaluate("window.__S.phase")
    check(phase in ("battle","prep","result","settle"), f"开战后阶段正常推进（phase={phase}）", results)
    check(not errs, f"手机 console 无报错（{errs[:2]}）", results)

    # 横屏 740×360
    page.set_viewport_size({"width":740, "height":360}); page.wait_for_timeout(400)
    land = page.evaluate("""(() => {
      const b=document.getElementById('board').getBoundingClientRect();
      const m=document.getElementById('main');
      return {right:+b.right.toFixed(1), vw:innerWidth, synShown:getComputedStyle(document.getElementById('synCol')).display!=='none',
              overflowX:m.scrollWidth>m.clientWidth+2};
    })()""")
    check(land["right"]<=land["vw"]+0.5 and not land["synShown"] and not land["overflowX"],
          f"横屏棋盘不溢出、羁绊栏隐藏（right={land['right']}, vw={land['vw']}）", results)
    page.screenshot(path=f"{OUT}/mobile_740_landscape.png")
    ctx.close()

    # ---------- 3) 小屏 360×667 ----------
    ctx = browser.new_context(viewport={"width":360, "height":667}, has_touch=True, is_mobile=True)
    page = ctx.new_page(); errs = []; console_watch(page, errs)
    start(page)
    fit = page.evaluate("""(() => {
      const b=document.getElementById('board').getBoundingClientRect();
      const bar=document.getElementById('shopbar').getBoundingClientRect();
      return {right:+b.right.toFixed(1), vw:innerWidth, barBottom:+bar.bottom.toFixed(1), vh:innerHeight};
    })()""")
    check(fit["right"]<=fit["vw"]+0.5 and fit["barBottom"]<=fit["vh"]+0.5,
          f"360×667 棋盘与动作条完整（right={fit['right']}/{fit['vw']}, bar={fit['barBottom']}/{fit['vh']}）", results)
    page.screenshot(path=f"{OUT}/mobile_360.png")
    check(not errs, f"小屏 console 无报错（{errs[:2]}）", results)
    ctx.close()
    browser.close()

    fails = [m for s,m in results if s=="FAIL"]
    print("\n".join(f"[{s}] {m}" for s,m in results))
    print(f"\n== {len(results)-len(fails)}/{len(results)} passed ==")
    sys.exit(1 if fails else 0)
