"""经典模式 · 移动端全阶段巡检（竖屏 390×844 + 横屏 844×390）。
覆盖：首页 / 设置页 / 进局 / 买棋 / 上阵 / 触屏抽屉×4 / 战斗 / 回合结束回备战 /
对局菜单 / 玩法说明 / 图鉴×3 页签 / 荣誉殿堂 / 章节结算（布局注入） / 横屏进局+战斗。
每阶段截图 + 溢出检查（main 与弹层不得超出视口/互相挤压）。
运行前提：静态 :8081。
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'classic-stages'
OUT.mkdir(parents=True, exist_ok=True)

TOUCH_PATCH = """
Object.defineProperty(window, 'ontouchstart', {value: () => {}});
const _mm = window.matchMedia.bind(window);
window.matchMedia = q => q.includes('pointer:coarse') ? {matches:true, media:q, addEventListener(){}, removeEventListener(){}} : _mm(q);
"""

CHECK = """() => {
  const R = id => { const el = document.getElementById(id); if (!el) return null;
    const r = el.getBoundingClientRect(); return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; };
  const main = document.getElementById('main');
  const vw = innerWidth, vh = innerHeight;
  const bad = [];
  // 可见的弹层/面板不得超出视口（允许 2px 圆角误差）
  for (const sel of ['#flowShell','#flowHome','#flowSetup','#flowHelp','#flowGameMenu','#flowChapter',
                     '#bookModal','#bookPanel','#histModal','#histPanel','#mDrawer','#mDrawerBox',
                     '#openingOfferOverlay','#guideOverlay','#hotkeyDialog']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right > vw + 2 || r.bottom > vh + 2 || r.left < -2 || r.top < -2) {
      bad.push(`${sel} 超出视口: ${JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)})}`);
    }
  }
  return {
    vw, vh,
    mainOverflow: main ? main.scrollHeight - main.clientHeight : null,
    phase: document.body.dataset.phase || null,
    portrait: document.body.classList.contains('portrait-play'),
    board: R('board'), shopbar: R('shopbar'), syn: R('synCol'),
    flowVisible: (() => { const f=document.getElementById('flowShell');
      return f ? !f.classList.contains('is-hidden') : false; })(),
    bad,
  };
}"""

results = []
errors = []

def check(page, stage, shot):
    snap = page.evaluate(CHECK)
    results.append((stage, snap))
    page.screenshot(path=str(OUT / shot))
    flag = ''
    if snap['bad']:
        flag = ' ⚠ ' + '；'.join(snap['bad'])
    if snap['mainOverflow'] is not None and snap['mainOverflow'] > 1:
        flag += f" ⚠ main 溢出 {snap['mainOverflow']}px"
    print(f"[{stage}] overflow={snap['mainOverflow']} phase={snap['phase']} portrait={snap['portrait']}{flag}")

def enter_game(page):
    page.locator('#homeNew').click()
    page.locator('#setupStart').click()
    page.wait_for_function('() => document.body.classList.contains("touch")', timeout=8000)
    page.wait_for_timeout(1200)
    for sel in ('#guideOverlay [data-skip]', '#guideOverlay button', '#openingOfferOverlay [data-skip]'):
        loc = page.locator(sel)
        if loc.count():
            try: loc.first.click(timeout=1500)
            except Exception: pass
    page.wait_for_timeout(400)

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')

    # ================= 竖屏 =================
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    page.add_init_script(TOUCH_PATCH)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8081/index.html')
    page.wait_for_timeout(800)
    check(page, '1-首页', 'p1-home.png')

    page.locator('#homeNew').click()
    page.wait_for_timeout(400)
    check(page, '2-新建对局设置', 'p2-setup.png')

    page.locator('#setupStart').click()
    page.wait_for_function('() => document.body.classList.contains("touch")', timeout=8000)
    page.wait_for_timeout(1200)
    check(page, '3-进局(含引导/开局弹层)', 'p3-prep-entry.png')
    for sel in ('#guideOverlay [data-skip]', '#guideOverlay button', '#openingOfferOverlay [data-skip]'):
        loc = page.locator(sel)
        if loc.count():
            try: loc.first.click(timeout=1500)
            except Exception: pass
    page.wait_for_timeout(400)
    check(page, '4-备战(弹层关闭)', 'p4-prep.png')

    first = page.evaluate('()=>{const c=document.querySelector("#shop .card:not(.sold) .cn");return c?c.textContent:null}')
    if first:
        idx = page.evaluate('''(name)=>{const cs=[...document.querySelectorAll("#shop .card:not(.sold)")];
          return cs.findIndex(c=>c.querySelector(".cn").textContent===name);}''', first)
        for _ in range(2):
            page.locator('#shop .card:not(.sold)').nth(idx).click()
            page.wait_for_timeout(400)
    check(page, '5-买棋', 'p5-bought.png')

    page.locator('#bench .bslot .unit').first.click()
    page.locator('#board .cell').nth(40).click()
    page.wait_for_timeout(700)
    check(page, '6-上阵', 'p6-deployed.png')

    for btn, name, shot in (('#mShopBtn','7-抽屉·调整','p7-drawer-shop.png'),
                            ('#mEquipBtn','8-抽屉·装备','p8-drawer-equip.png'),
                            ('#mSideBtn','9-抽屉·详情','p9-drawer-side.png'),
                            ('#mMenuBtn','10-抽屉·更多','p10-drawer-menu.png')):
        page.locator(btn).click()
        page.wait_for_timeout(400)
        check(page, name, shot)
        page.locator('#mDrawerClose').click()
        page.wait_for_timeout(250)

    # 战斗
    page.locator('#fightBtn').click()
    try:
        page.wait_for_function('() => !!document.getElementById("unitLayer")', timeout=30000)
        page.wait_for_timeout(1500)
    except Exception:
        pass
    check(page, '11-战斗', 'p11-battle.png')

    # 回合结束回备战
    try:
        page.wait_for_function('() => document.body.dataset.phase === "prep"', timeout=150000)
        page.wait_for_timeout(800)
    except Exception:
        pass
    check(page, '12-回合结束回备战', 'p12-next-prep.png')

    # 对局菜单 / 玩法说明（触屏下顶栏 ic 按钮隐藏，入口在「更多」抽屉，这里直接触发同一入口）
    page.evaluate('document.getElementById("resetBtn").click()')
    page.wait_for_timeout(400)
    check(page, '13-对局菜单', 'p13-game-menu.png')
    page.locator('#menuHelp').click()
    page.wait_for_timeout(400)
    check(page, '14-玩法说明', 'p14-help.png')
    page.locator('#flowHelpClose').click()
    page.wait_for_timeout(300)
    page.locator('#menuResume').click()
    page.wait_for_timeout(400)

    # 图鉴（三页签）
    page.evaluate('document.getElementById("bookBtn").click()')
    page.wait_for_timeout(500)
    check(page, '15-图鉴·棋子', 'p15-book-units.png')
    page.locator('#bookTabs .btab[data-tab="syn"]').click()
    page.wait_for_timeout(400)
    check(page, '16-图鉴·羁绊', 'p16-book-syn.png')
    page.locator('#bookTabs .btab[data-tab="items"]').click()
    page.wait_for_timeout(400)
    check(page, '17-图鉴·装备', 'p17-book-items.png')
    page.locator('#bookClose').click()
    page.wait_for_timeout(300)

    # 荣誉殿堂
    page.evaluate('document.getElementById("histBtn").click()')
    page.wait_for_timeout(500)
    check(page, '18-荣誉殿堂', 'p18-history.png')
    page.locator('#histClose').click()
    page.wait_for_timeout(300)

    # 章节结算（布局注入：只验弹层布局不挤压，不触碰游戏逻辑）
    injected = page.evaluate('''() => {
      const shell = document.getElementById('flowShell');
      const pageEl = document.getElementById('flowChapter');
      if (!shell || !pageEl) return false;
      const body = document.getElementById('chapterBody');
      body.innerHTML = Array.from({length:6},(_,i)=>
        `<div class="settle-row">第 ${i+1} 章结算示例 · 存活 ${20-i} 回合 · 经济 ${30+i*5}</div>`).join('')
        + `<div class="settle-ask">选择一个增强</div><div class="aug-row">`
        + Array.from({length:3},(_,i)=>`<div class="aug-card"><b>增强 ${i+1}</b><div class="ad">示例效果文本：全体攻击 +${10+i*5}%</div><div class="at">示例来源</div></div>`).join('')
        + `</div>`;
      shell.classList.remove('is-hidden'); shell.removeAttribute('aria-hidden');
      document.querySelectorAll('#flowShell .flow-page').forEach(p=>{ if(p!==pageEl) p.hidden = true; });
      pageEl.hidden = false;
      return true;
    }''')
    page.wait_for_timeout(400)
    check(page, '19-章节结算(布局注入)', 'p19-chapter.png')
    page.evaluate('''() => {
      const shell = document.getElementById('flowShell');
      shell.classList.add('is-hidden'); shell.setAttribute('aria-hidden','true');
      document.querySelectorAll('#flowShell .flow-page').forEach(p=>p.hidden = true);
    }''')
    page.wait_for_timeout(300)

    # ================= 横屏 =================
    land = browser.new_page(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True)
    land.add_init_script(TOUCH_PATCH)
    land.on('pageerror', lambda e: errors.append('landscape: '+str(e)))
    land.goto('http://127.0.0.1:8081/index.html')
    enter_game(land)
    check(land, '20-横屏·备战', 'l20-prep.png')
    land.locator('#fightBtn').click()
    try:
        land.wait_for_function('() => !!document.getElementById("unitLayer")', timeout=30000)
        land.wait_for_timeout(1500)
    except Exception:
        pass
    check(land, '21-横屏·战斗', 'l21-battle.png')

    browser.close()

print('\n==== 汇总 ====')
problems = 0
for stage, snap in results:
    issues = list(snap['bad'])
    if snap['mainOverflow'] is not None and snap['mainOverflow'] > 1:
        issues.append(f"main 溢出 {snap['mainOverflow']}px")
    if issues:
        problems += 1
        print(f"⚠ {stage}: {'；'.join(issues)}")
print(f"阶段数 {len(results)} · 问题阶段 {problems}")
print('pageerrors:', errors[:5] or '无')
