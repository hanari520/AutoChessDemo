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
    # 买几枚棋子备战席（触屏下商店在抽屉里，用 JS click 不受可见性限制）
    for _ in range(buys):
        page.evaluate("(() => { const c=document.querySelector('#shop .card:not(.sold)'); if(c) c.click(); })()")
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
      const drawerAuto=document.getElementById('mDrawer').classList.contains('hidden')?'closed':'open';
      // 选一个我方半区空格（y=4 行 x=3 → idx=4*8+3=35）
      const cells=document.getElementById('board').children;
      const dst=[...cells].find((c,i)=>i>=32&&!c.querySelector('.unit'));
      dst.click();
      const inBoard=window.__S.board.some(u=>u&&String(u.uid)===String(uid));
      const drawerAfter=document.getElementById('mDrawer').classList.contains('hidden')?'closed':'open';
      return {ok:inBoard, hl, hint, drawerAuto, drawerAfter};
    })()""")
    check(moved.get("ok"), f"点选移动：备战席→棋盘上阵成功（高亮格数={moved.get('hl')}, 提示条={moved.get('hint')}）", results)
    check(moved.get("drawerAuto")=="open" and moved.get("drawerAfter")=="closed",
          f"点选时详情抽屉自动弹出、移动后自动收起（{moved.get('drawerAuto')}→{moved.get('drawerAfter')}）", results)
    page.screenshot(path=f"{OUT}/mobile_390_moved.png")

    # ===== 抽屉化：底栏按钮 + 商店抽屉 + 详情抽屉 =====
    bar = page.evaluate("""(() => {
      const g=id=>{ const el=document.getElementById(id); const r=el.getBoundingClientRect();
        return {x:+r.x.toFixed(0), y:+r.y.toFixed(0), vis:r.width>0&&r.height>0, inBar:!!el.closest('#shopbar')};
      };
      return { shopBtn:g('mShopBtn'), sideBtn:g('mSideBtn'), fight:g('fightBtn'),
               shopInFlow:document.getElementById('shop').closest('#mDrawer')?'drawer':'flow' };
    })()""")
    check(bar["shopBtn"]["vis"] and bar["shopBtn"]["inBar"] and bar["sideBtn"]["vis"] and bar["sideBtn"]["inBar"],
          "底栏出现 [商店][详情] 抽屉按钮", results)
    check(abs(bar["shopBtn"]["y"]-bar["fight"]["y"])<20, "商店/详情/开战同在底栏第一行", results)
    check(bar["shopInFlow"]=="drawer", "商店节点已搬入抽屉容器", results)

    # 商店抽屉：打开 → 买牌 → 刷新
    shop_dr = page.evaluate("""(() => {
      document.getElementById('mShopBtn').click();
      const d=document.getElementById('mDrawer');
      const open=!d.classList.contains('hidden') && !document.getElementById('mShopSec').classList.contains('hidden');
      const cards=[...document.querySelectorAll('#mShopSec .card:not(.sold)')];
      const before=window.__S.bench.filter(Boolean).length;
      if(cards.length) cards[0].click();
      const after=window.__S.bench.filter(Boolean).length;
      const gold=window.__S.gold;
      document.getElementById('refreshBtn').click();
      return {open, bought:after>before, gold, drawerStillOpen:!d.classList.contains('hidden')};
    })()""")
    check(shop_dr["open"] and shop_dr["bought"] and shop_dr["drawerStillOpen"],
          f"商店抽屉：打开/买牌/抽屉保持（金币 {shop_dr['gold']}）", results)

    # 详情抽屉 + 装备全链路：点棋子→弹详情→点装备芯片→抽屉收起→点棋子→穿上→抽屉再弹→卸下
    equip_flow = page.evaluate("""(() => {
      const out={};
      document.getElementById('mDrawerClose').click();          // 关商店抽屉
      const unit=document.querySelector('#bench .bslot .unit');
      if(!unit) return {ok:false, why:'bench empty'};
      unit.click();                                             // 点棋子 → 详情抽屉自动弹
      out.autoOpen=!document.getElementById('mDrawer').classList.contains('hidden');
      out.inspectName=(document.querySelector('#inspect .in-hd b')||{}).textContent||'';
      if(!window.__S.items.length){ window.__S.items.push('sword'); renderEquip(); }   // 测试注入：开局背包通常为空
      const chip=document.querySelector('#mSideSec .item-chip');
      if(!chip) return {...out, ok:false, why:'无装备可穿（需先有掉落）'};
      out.bagN=window.__S.items.length;
      chip.click();                                             // 点装备 → 抽屉自动收起
      out.closedOnSelect=document.getElementById('mDrawer').classList.contains('hidden');
      unit.click();                                             // 点棋子 → 穿上
      const pos=window.__S.items.length;
      out.worn=(out.bagN-pos)===1;
      out.reOpen=!document.getElementById('mDrawer').classList.contains('hidden');
      const ub=document.querySelector('#inspect .in-unequip');
      out.unequipBtn=!!ub;
      if(ub) ub.click();                                        // 卸下全部装备
      out.backToBag=window.__S.items.length===out.bagN;
      out.ok=out.autoOpen&&out.closedOnSelect&&out.worn&&out.reOpen&&out.unequipBtn&&out.backToBag;
      return out;
    })()""")
    check(equip_flow.get("ok"), 
          f"装备全链路：详情弹窗{equip_flow.get('autoOpen')} 选装收起{equip_flow.get('closedOnSelect')} 穿上{equip_flow.get('worn')} 再弹{equip_flow.get('reOpen')} 卸下按钮{equip_flow.get('unequipBtn')} 回包{equip_flow.get('backToBag')}", results)

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
