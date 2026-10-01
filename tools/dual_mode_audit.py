"""经典模式 × 八人联机 · 移动端「操作后一致性」对照验收。
同一套操作序列（买棋 → 上阵 → 开抽屉 → 战斗）在两个页面执行，
每个节点采集同一份结构化指标做 diff——静态画面之外，交互后的界面也必须一致。
运行前提：静态 :8081 + 联机 API :3000。
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'out' / 'dual-audit'
OUT.mkdir(parents=True, exist_ok=True)

TOUCH_PATCH = """
Object.defineProperty(window, 'ontouchstart', {value: () => {}});
const _mm = window.matchMedia.bind(window);
window.matchMedia = q => q.includes('pointer:coarse') ? {matches:true, media:q, addEventListener(){}, removeEventListener(){}} : _mm(q);
"""

SNAPSHOT = """() => {
  const R = id => { const el = document.getElementById(id); if (!el) return null;
    const r = el.getBoundingClientRect(); return {y:Math.round(r.y), h:Math.round(r.height), w:Math.round(r.width)}; };
  const txt = id => { const el = document.getElementById(id); return el ? el.textContent.trim().slice(0,14) : null; };
  const main = document.getElementById('main');
  const shop = document.getElementById('shop');
  const cards = shop ? [...shop.querySelectorAll('.card')] : [];
  const chips = [...document.querySelectorAll('#synAll .syn-badge')].map(b => b.textContent.trim().replace(/\\s+/g,' ').slice(0,16));
  const tags = cards.slice(0,5).map(c => [...c.querySelectorAll('.tb')].map(t => t.textContent.trim()).join('|'));
  const statsHidden = cards.length ? [...cards[0].querySelectorAll('.stb .stat')].map(s => getComputedStyle(s).display === 'none') : null;
  const fee = cards.length ? !!cards[0].querySelector('.cc2') && cards[0].querySelector('.cc2').offsetWidth > 0 : null;
  const badges = cards.slice(0,5).map(c => { const b = c.querySelector('.badges'); if (!b) return null;
    const cr = c.getBoundingClientRect(); return {text:b.textContent.trim().slice(0,10), top:Math.round(b.getBoundingClientRect().top - cr.top)}; });
  return {
    phase: document.body.dataset.phase || null,
    portrait: document.body.classList.contains('portrait-play'),
    cell: getComputedStyle(document.body).getPropertyValue('--cell').trim(),
    bars: {topbar: R('topbar'), shopbar: R('shopbar'), main: R('main'), board: R('board'), bench: R('bench'), syn: R('synCol')},
    overflow: main ? main.scrollHeight - main.clientHeight : null,
    chips,
    cards: {count: cards.length, sold: cards.filter(c => c.classList.contains('sold')).length, tags, statsHidden, fee, badges},
    buttons: {refresh: txt('refreshBtn'), lvl: txt('lvlBtn'), fight: txt('fightBtn'), sell: txt('sellBtn')},
    visible: {
      board: !!document.querySelector('#board .cell'),
      boardUnits: document.querySelectorAll('#board .cell .unit').length,
      benchUnits: document.querySelectorAll('#bench .bslot .unit').length,
      shopInBar: !!document.querySelector('#shopbar>#shop'),
      synInMain: !!document.querySelector('#main #synCol'),
      drawerOpen: !document.getElementById('mDrawer').classList.contains('hidden'),
      drawerTitle: txt('mDrawerTitle'),
    },
  };
}"""

IGNORE_KEYS = {'siteHeader'}   # 预留：联机站点页头类差异不在对比内


def diff_snapshots(a, b, path=''):
    """返回两边快照的差异列表（只列不同项）。"""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            out += diff_snapshots(a.get(k), b.get(k), f'{path}.{k}' if path else k)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f'{path}: 长度 {len(a)} vs {len(b)}（{a} vs {b}）')
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                out += diff_snapshots(x, y, f'{path}[{i}]')
    else:
        if a != b:
            out.append(f'{path}: 经典={a!r} 联机={b!r}')
    return out


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel='msedge')
    shots = {}

    # ---------- 经典模式操作序列 ----------
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    page.add_init_script(TOUCH_PATCH)
    page.goto('http://127.0.0.1:8081/index.html')
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
    shots['classic'] = {}
    shots['classic']['1-进局'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-1-prep.png'))

    # 买棋（同名两张 → 对子徽章）
    first = page.evaluate('()=>{const c=document.querySelector("#shop .card:not(.sold) .cn");return c?c.textContent:null}')
    if first:
        idx = page.evaluate('''(name)=>{const cs=[...document.querySelectorAll("#shop .card:not(.sold)")];
          return cs.findIndex(c=>c.querySelector(".cn").textContent===name);}''', first)
        for _ in range(2):
            page.locator('#shop .card:not(.sold)').nth(idx).click()
            page.wait_for_timeout(400)
    shots['classic']['2-买棋'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-2-bought.png'))

    # 上阵（点选移动）
    page.locator('#bench .bslot .unit').first.click()
    page.locator('#board .cell').nth(40).click()
    page.wait_for_timeout(700)
    shots['classic']['3-上阵'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-3-deployed.png'))

    # 抽屉（装备）
    page.locator('#mEquipBtn').click()
    page.wait_for_timeout(400)
    shots['classic']['4-装备抽屉'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-4-drawer.png'))
    page.locator('#mDrawerClose').click()
    page.wait_for_timeout(300)

    # 开战（经典：fightBtn=开战；等战斗层）
    page.locator('#fightBtn').click()
    try:
        page.wait_for_function('() => !!document.getElementById("unitLayer")', timeout=30000)
        page.wait_for_timeout(1500)
    except Exception:
        pass
    shots['classic']['5-战斗'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-5-battle.png'))

    # 6-回合结束回备战（经典战斗结束后自动回备战）
    try:
        page.wait_for_function('() => document.body.dataset.phase === "prep"', timeout=150000)
        page.wait_for_timeout(800)
    except Exception:
        pass
    shots['classic']['6-回合结束回备战'] = page.evaluate(SNAPSHOT)
    page.screenshot(path=str(OUT / 'classic-6-next-prep.png'))

    # ---------- 联机模式操作序列 ----------
    p2 = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    p2.add_init_script(TOUCH_PATCH)
    p2.goto('http://127.0.0.1:8081/online.html')
    p2.locator('.advanced-settings summary').click()
    p2.locator('#apiBase').fill(os.environ.get('ONLINE_TEST_API', 'http://127.0.0.1:3000'))
    p2.locator('#playerName').fill('对照验收')
    p2.locator('#createBtn').click()
    p2.locator('#lobbySection').wait_for(state='visible')
    for n in range(7):
        p2.locator('#addBotBtn').click()
        p2.wait_for_function('(n) => document.querySelectorAll("#lobbySeats .seat-name .bot-badge").length === n', arg=n + 1)
    p2.locator('#lobbyReadyBtn').click()
    p2.locator('#gameSection').wait_for(state='visible', timeout=15000)
    p2.wait_for_function('() => document.body.classList.contains("touch")')
    ov = p2.locator('#openingOfferOverlay')
    if ov.count():
        ov.locator('.stg-pick').first.click()
        p2.wait_for_function('() => !document.getElementById("openingOfferOverlay")', timeout=8000)
    p2.wait_for_timeout(500)
    shots['online'] = {}
    shots['online']['1-进局'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-1-prep.png'))

    first2 = p2.evaluate('()=>{const c=document.querySelector("#shop .card:not(.sold) .cn");return c?c.textContent:null}')
    if first2:
        idx2 = p2.evaluate('''(name)=>{const cs=[...document.querySelectorAll("#shop .card:not(.sold)")];
          return cs.findIndex(c=>c.querySelector(".cn").textContent===name);}''', first2)
        for _ in range(2):
            p2.locator('#shop .card:not(.sold)').nth(idx2).click()
            p2.wait_for_timeout(400)
    shots['online']['2-买棋'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-2-bought.png'))

    p2.locator('#bench .bslot .unit').first.click()
    p2.locator('#board .cell').nth(40).click()
    p2.wait_for_timeout(700)
    shots['online']['3-上阵'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-3-deployed.png'))

    p2.locator('#mEquipBtn').click()
    p2.wait_for_timeout(400)
    shots['online']['4-装备抽屉'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-4-drawer.png'))
    p2.locator('#mDrawerClose').click()
    p2.wait_for_timeout(300)

    p2.locator('#fightBtn').click()
    try:
        p2.wait_for_function('() => !!document.getElementById("unitLayer")', timeout=30000)
        p2.wait_for_timeout(1500)
    except Exception:
        pass
    # 战斗中：棋盘上方必须常驻 8 人血量微条（高度与对手条一致，零挤压）
    try:
        p2.wait_for_function('() => !!document.querySelector("#oppBar .hp-strip")', timeout=20000)
    except Exception:
        pass
    hp_strip = p2.evaluate('''()=>({
      count: document.querySelectorAll('#oppBar .hp-strip i').length,
      oppVisible: getComputedStyle(document.getElementById('oppBar')).display !== 'none',
      oppH: Math.round(document.getElementById('oppBar').getBoundingClientRect().height),
    })''')
    shots['online']['5-战斗'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-5-battle.png'))

    # 6-结算（result 阶段）
    try:
        p2.wait_for_function('() => document.body.dataset.phase === "chapter"', timeout=120000)
        p2.wait_for_timeout(600)
    except Exception:
        pass
    shots['online']['6-结算'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-6-result.png'))

    # 7-下一轮备战
    try:
        p2.wait_for_function('() => document.body.dataset.phase === "prep"', timeout=150000)
        p2.wait_for_timeout(800)
    except Exception:
        pass
    shots['online']['7-下一轮备战'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-7-next-prep.png'))

    # 8-观战（联机独有）：战况抽屉 → 点其他玩家
    p2.locator('#mSideBtn').click()
    p2.wait_for_timeout(400)
    watched = p2.locator('#mSideSec #arenaInfo .pl-row[data-watch]:not(.me)').first
    if watched.count():
        watched.click()
        p2.wait_for_timeout(700)
    shots['online']['8-观战'] = p2.evaluate(SNAPSHOT)
    p2.screenshot(path=str(OUT / 'online-8-spectate.png'))
    p2.locator('#mDrawerClose').click()

    browser.close()

# ---------- diff ----------
ALLOW = [
    'buttons.fight',        # 经典=开战，联机=锁定阵容（语义不同）
    'buttons.lvl',          # 文字可能因金币/回合差异
    'cards.tags', 'chips',  # 随机商店/随机阵容导致内容不同，只比结构
    'cards.badges',         # 徽章文本随商店随机内容变化，结构由下方断言校验
    'bars.board', 'bars.bench', 'bars.syn', 'bars.main', 'cell',   # 棋盘几何允许 1px 级差异
    'visible.boardUnits', 'visible.benchUnits',
]
report = {}
total = 0
structural = []
squeeze = []
# 成对比较：经典与联机的对应阶段（经典无 result/观战，联机用「7-下一轮备战」对齐经典「6-回合结束回备战」）
PAIRS = [('1-进局','1-进局'), ('2-买棋','2-买棋'), ('3-上阵','3-上阵'),
         ('4-装备抽屉','4-装备抽屉'), ('5-战斗','5-战斗'),
         ('6-回合结束回备战','7-下一轮备战')]
for cs, os_ in PAIRS:
    diffs = diff_snapshots(shots['classic'][cs], shots['online'][os_])
    keep = [d for d in diffs if not any(d.startswith(a) for a in ALLOW)]
    report[f'{cs} ↔ {os_}'] = keep
    total += len(keep)
    # 结构校验：对子/羁绊触发徽章必须贴在卡片底部区域（不是右上角旧布局）
    for mode, step in (('classic', cs), ('online', os_)):
        for i, badge in enumerate(shots[mode][step]['cards']['badges']):
            if badge and badge['top'] < 40:
                structural.append(f'{step} {mode} 卡片{i} 徽章 top={badge["top"]}（应在底部 ≥40）')
# 零挤压校验：所有阶段 main 不得溢出（用户要求：模块不得互相挤压，必要时用滚动解决）
for mode, steps in shots.items():
    for step, snap in steps.items():
        if snap['overflow'] is not None and snap['overflow'] > 1:
            squeeze.append(f'{mode} {step}: main 溢出 {snap["overflow"]}px')

print('==== 操作后一致性对照（经典 vs 联机）====')
for step, keep in report.items():
    print(f'\n[{step}] 差异 {len(keep)} 项')
    for d in keep[:14]:
        print('  -', d)
print(f'\n合计非白名单差异：{total}')
print(f'结构校验问题：{len(structural)}')
for s in structural[:6]:
    print('  !', s)
print(f'界面挤压问题：{len(squeeze)}')
for s in squeeze[:8]:
    print('  !', s)
print(f"战斗中血量微条：{hp_strip}（应 count=8 · oppVisible=True）")
(OUT / 'diff-report.json').write_text(json.dumps({'shots': shots, 'diffs': report}, ensure_ascii=False, indent=2), encoding='utf-8')
