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
    check(moved.get("drawerAuto")=="closed" and moved.get("drawerAfter")=="closed",
          f"详情直开默认关：点选移动全程抽屉不开（{moved.get('drawerAuto')}→{moved.get('drawerAfter')}）", results)
    page.screenshot(path=f"{OUT}/mobile_390_moved.png")

    # ===== 抽屉化：底栏按钮 + 商店抽屉 + 详情抽屉 =====
    bar = page.evaluate("""(() => {
      const g=id=>{ const el=document.getElementById(id); const r=el.getBoundingClientRect();
        return {x:+r.x.toFixed(0), y:+r.y.toFixed(0), vis:r.width>0&&r.height>0, inBar:!!el.closest('#shopbar')};
      };
      return { shopBtn:g('mShopBtn'), equipBtn:g('mEquipBtn'), sideBtn:g('mSideBtn'), fight:g('fightBtn'),
               shopInFlow:document.getElementById('shop').closest('#mDrawer')?'drawer':'flow',
               equipInFlow:document.getElementById('equipPanel').closest('#mDrawer')?'drawer':'flow' };
    })()""")
    check(bar["shopBtn"]["vis"] and bar["shopBtn"]["inBar"] and bar["sideBtn"]["vis"] and bar["sideBtn"]["inBar"]
          and bar["equipBtn"]["vis"] and bar["equipBtn"]["inBar"],
          "底栏出现 [商店][装备][详情] 抽屉按钮", results)
    check(abs(bar["shopBtn"]["y"]-bar["fight"]["y"])<20 and abs(bar["equipBtn"]["y"]-bar["fight"]["y"])<20,
          "商店/装备/详情/开战同在底栏第一行", results)
    check(bar["shopInFlow"]=="drawer" and bar["equipInFlow"]=="drawer", "商店与装备面板均已搬入抽屉容器", results)

    # ===== 羁绊抽屉：底栏第五入口，羁绊栏不再挤占棋盘 =====
    bond = page.evaluate("""(() => {
      const btn=document.getElementById('mBondBtn'), col=document.getElementById('synCol');
      const r=btn.getBoundingClientRect();
      const inBar=!!btn.closest('#shopbar') && r.width>0;
      const inFlow=!!document.getElementById('main').contains(col);
      document.getElementById('mBondBtn').click();
      const open=!document.getElementById('mDrawer').classList.contains('hidden')
        && !document.getElementById('mBondSec').classList.contains('hidden');
      const heads=document.querySelectorAll('#mBondSec .syn-head').length;
      const badges=document.querySelectorAll('#mBondSec .syn-badge').length;
      document.getElementById('mDrawerClose').click();
      return {inBar, inFlow, open, heads, badges};
    })()""")
    check(bond["inBar"] and not bond["inFlow"],
          "羁绊按钮入底栏、羁绊栏不再占据棋盘滚动流", results)
    check(bond["open"] and bond["badges"]>0,
          f"羁绊抽屉：打开正常（分组头 {bond['heads']}，徽章 {bond['badges']}）", results)

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

    # ===== 装备系统全链路（装备独立抽屉版）=====
    # ① 详情直开默认关：点棋子只进移动模式，抽屉不开
    tog = page.evaluate("""(() => {
      document.getElementById('mDrawerClose').click();
      const unit=document.querySelector('#bench .bslot .unit');
      if(!unit) return {ok:false, why:'bench empty'};
      if(!window.__S.items.length){ window.__S.items.push('sword'); renderEquip(); }
      unit.click();
      return {ok:true, drawerClosed:document.getElementById('mDrawer').classList.contains('hidden'),
              label:document.getElementById('mAutoInspectBtn').textContent.trim()};
    })()""")
    check(tog.get("ok") and tog.get("drawerClosed") and tog.get("label")=="详情直开：关",
          f"详情直开默认关：点棋子不开抽屉（按钮={tog.get('label')}）", results)

    # ② 装备抽屉：打开 + 点芯片选装（抽屉收起）→ 点棋子穿上（详情抽屉回弹）
    equip_flow = page.evaluate("""(() => {
      const out={};
      document.getElementById('mEquipBtn').click();
      out.equipOpen=!document.getElementById('mEquipSec').classList.contains('hidden');
      out.panelInDrawer=!!document.querySelector('#mEquipSec #equip');
      const chip=document.querySelector('#mEquipSec .item-chip');
      if(!chip) return {...out, ok:false, why:'无装备芯片'};
      out.bagN=window.__S.items.length;
      chip.click();                                          // 点选装备 → 抽屉自动收起
      out.closedOnSelect=document.getElementById('mDrawer').classList.contains('hidden');
      const unit=document.querySelector('#bench .bslot .unit');
      unit.click();                                          // 点棋子 → 穿上
      out.worn=(out.bagN-window.__S.items.length)===1;
      out.reOpen=!document.getElementById('mDrawer').classList.contains('hidden');
      out.ok=out.equipOpen&&out.panelInDrawer&&out.closedOnSelect&&out.worn&&out.reOpen;
      return out;
    })()""")
    check(equip_flow.get("ok") and equip_flow.get("equipOpen") and equip_flow.get("panelInDrawer")
          and equip_flow.get("closedOnSelect") and equip_flow.get("worn") and equip_flow.get("reOpen"),
          f"装备抽屉：打开{equip_flow.get('equipOpen')} 选装收起{equip_flow.get('closedOnSelect')} 穿上{equip_flow.get('worn')} 详情回弹{equip_flow.get('reOpen')}", results)

    # ③ 身上装备条：装备抽屉顶部出现当前查看棋子的已穿芯片 → 点按=卸下单件（派发真实 pointer 事件）
    worn_tap = page.evaluate("""(() => {
      document.getElementById('mDrawerClose').click();
      document.getElementById('mEquipBtn').click();
      const worn=document.querySelector('#mEquipSec .worn-strip .in-item-chip.worn');
      if(!worn) return {ok:false, why:'无身上装备条'};
      const bagN=window.__S.items.length;
      const r=worn.getBoundingClientRect();
      worn.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:r.x+2,clientY:r.y+2,bubbles:true}));
      worn.dispatchEvent(new PointerEvent('pointerup',{button:0,clientX:r.x+2,clientY:r.y+2,bubbles:true}));
      return {ok:window.__S.items.length===bagN+1, bagN};
    })()""")
    check(worn_tap.get("ok"), f"身上装备条点按=卸下单件（背包 {worn_tap.get('bagN')}→+1）", results)

    # ④ 拖拽穿戴：装备抽屉开着，把背包芯片拖到棋盘棋子身上
    drag_equip = page.evaluate("""(() => {
      if(!window.__S.items.length){ window.__S.items.push('staff'); renderEquip(); }   // 补种子装备
      const chip=document.querySelector('#mEquipSec .item-chip');
      const unit=document.querySelector('#board .cell:not(.enemy-preview-cell) .unit, #bench .bslot .unit');
      if(!chip||!unit) return {ok:false, why:'missing chip='+!!chip+' unit='+!!unit};
      const cr=chip.getBoundingClientRect(), ur=unit.getBoundingClientRect();
      return {ok:true, cx:cr.x+cr.width/2, cy:cr.y+cr.height/2, ux:ur.x+ur.width/2, uy:ur.y+ur.height/2, bagN:window.__S.items.length};
    })()""")
    if drag_equip.get("ok"):
        pg_x, pg_y = drag_equip["cx"], drag_equip["cy"]
        page.mouse.move(pg_x, pg_y); page.mouse.down()
        for i in range(1, 9):
            page.mouse.move(pg_x+(drag_equip["ux"]-pg_x)*i/8, pg_y+(drag_equip["uy"]-pg_y)*i/8)
            page.wait_for_timeout(20)
        page.mouse.up(); page.wait_for_timeout(250)
        drag_res = page.evaluate("window.__S.items.length")
        check(drag_res == drag_equip["bagN"]-1, f"拖拽穿戴：背包芯片拖到棋子身上（背包 {drag_equip['bagN']}→{drag_res}）", results)
    else:
        check(False, f"拖拽穿戴：{drag_equip.get('why')}", results)

    # ⑤ 拖拽卸下：身上装备条芯片拖到装备背包栏
    drag_uneq = page.evaluate("""(() => {
      if((window.drawerMode&&window.drawerMode())!=='equip') document.getElementById('mEquipBtn').click();
      const worn=document.querySelector('#mEquipSec .worn-strip .in-item-chip.worn');
      const bag=document.getElementById('equip');
      if(!worn||!bag) return {ok:false, why:'missing worn/bag'};
      const wr=worn.getBoundingClientRect(), br=bag.getBoundingClientRect();
      return {ok:true, wx:wr.x+wr.width/2, wy:wr.y+wr.height/2, bx:br.x+br.width/2, by:br.y+br.height/2, bagN:window.__S.items.length};
    })()""")
    if drag_uneq.get("ok"):
        page.mouse.move(drag_uneq["wx"], drag_uneq["wy"]); page.mouse.down()
        for i in range(1, 9):
            page.mouse.move(drag_uneq["wx"]+(drag_uneq["bx"]-drag_uneq["wx"])*i/8, drag_uneq["wy"]+(drag_uneq["by"]-drag_uneq["wy"])*i/8)
            page.wait_for_timeout(20)
        page.mouse.up(); page.wait_for_timeout(250)
        drag_res2 = page.evaluate("window.__S.items.length")
        check(drag_res2 == drag_uneq["bagN"]+1, f"拖拽卸下：身上装备拖回背包栏（背包 {drag_uneq['bagN']}→{drag_res2}）", results)
    else:
        check(False, f"拖拽卸下：{drag_uneq.get('why')}", results)

    # ⑥ 详情直开开关：打开抽屉点开关 → 关闭 → 点棋子抽屉自动弹
    tog2 = page.evaluate("""(() => {
      if(document.getElementById('mDrawer').classList.contains('hidden')) document.getElementById('mSideBtn').click();
      document.getElementById('mAutoInspectBtn').click();
      const label=document.getElementById('mAutoInspectBtn').textContent.trim();
      document.getElementById('mDrawerClose').click();
      const unit=document.querySelector('#bench .bslot .unit, #board .cell:not(.enemy-preview-cell) .unit');
      if(!unit) return {ok:false};
      unit.click();
      return {ok:true, label, autoOpen:!document.getElementById('mDrawer').classList.contains('hidden'),
              mode:document.getElementById('mSideSec').classList.contains('hidden')?'other':'side'};
    })()""")
    check(tog2.get("ok") and tog2.get("label")=="详情直开：开" and tog2.get("autoOpen") and tog2.get("mode")=="side",
          f"详情直开开：点棋子自动弹详情抽屉（{tog2.get('label')}）", results)

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
