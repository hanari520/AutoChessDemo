# Phase 1 浏览器验收：阵型轮换截图 + 拖拽出售五连测（真实鼠标事件）
# 用法: 先在 F:/demo/autochess 起 python -m http.server 8081，再 python tools/_p1_browser.py
import json, os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 950})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.' + m.type + ':' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
      newGame(); renderAll();
    }""")
    pg.wait_for_timeout(300)
    fails = []
    def ok(cond, msg):
        print(('  ✓ ' if cond else '  ✗ ') + msg)
        if not cond: fails.append(msg)

    # ---------- A. 一键上阵连点 4 次：阵型肉眼可辨不同 ----------
    print('[A] 一键上阵连点 4 次（阵型轮换）')
    pg.evaluate("""() => {
      const mk=(id,star)=>({uid:S.uid++,id,star:star||1,sks:1,hp:200,maxhp:200,atk:20,items:[]});
      const roster=['ein','goutan','chiharu','aza','haruka','tiandou','pako','sanli','xuezhu','shadow'];
      S.bench=Array(8).fill(null);
      S.board=Array(64).fill(null);
      // 10 人 > 备战席 8 格：放 6 个上备战席即可（人口 8）
      ['ein','chiharu','aza','tiandou','sanli','shadow'].forEach((id,i)=>S.bench[i]=mk(id));
      S.lvl=8; S.phase='prep'; renderAll();
    }""")
    layouts = []
    for k in range(4):
        pg.click('#deployBtn')
        pg.wait_for_timeout(150)
        st = pg.evaluate("""() => {
          const pos=[]; S.board.forEach((u,i)=>{ if(u) pos.push([u.id, i%8, Math.floor(i/8)]); });
          return {pos, log:S.log[0]};
        }""")
        layouts.append(st['pos'])
        melee_rows = [r for (uid, x, r) in st['pos'] if uid in ('ein','chiharu','aza')]
        ok(all(r == 4 for r in melee_rows), f'第{k+1}次布阵近战全在第4行 {melee_rows}')
        pg.screenshot(path=os.path.join(OUT, f'p1_forma_{k+1}.png'))
    sig = [json.dumps(sorted(l)) for l in layouts]
    ok(len(set(sig)) >= 3, f'4 次布阵 ≥3 种阵型（{len(set(sig))} 种）')
    ok(any('一键上阵' in l for l in pg.evaluate("() => S.log.slice(0,6)")), '一键上阵日志在案')

    # ---------- B. 拖拽出售五连测 ----------
    print('[B] 拖拽出售（真实鼠标）')
    def setup_bench():
        pg.evaluate("""() => {
          const mk=(id,star)=>({uid:S.uid++,id,star:star||1,sks:1,hp:200,maxhp:200,atk:20,items:[]};
          )}""")  # placeholder replaced below
    def put_bench(idx, jsexpr):
        pg.evaluate(f"() => {{ S.bench[{idx}]={jsexpr}; renderAll(); }}")

    mk1 = "(() => { const u = {uid:S.uid++, id:'ein', star:1, sks:1, hp:200, maxhp:200, atk:20, items:[]}; return u; })()"

    def drag_from_bench(bi, tx, ty, steps=12):
        box = pg.locator(f'#bench .bslot[data-bi="{bi}"] .unit').bounding_box()
        sx, sy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        pg.mouse.move(sx, sy)
        pg.mouse.down()
        for i in range(1, steps + 1):
            pg.mouse.move(sx + (tx - sx) * i / steps, sy + (ty - sy) * i / steps)
            if i == steps // 2:
                pg.wait_for_timeout(60)
        pg.wait_for_timeout(120)

    # B1: 备战席棋子拖到商店卡片区 → 高亮+金额预览 → 松手出售
    put_bench(0, mk1)
    pre = pg.evaluate("() => ({gold:S.gold, pool:S.pool.ein, bench0:!!S.bench[0]})")
    shop_box = pg.locator('#shop').bounding_box()
    tx, ty = shop_box['x'] + shop_box['width'] / 2, shop_box['y'] + shop_box['height'] / 2
    drag_from_bench(0, tx, ty)
    hl = pg.evaluate("""() => ({
      zone: document.getElementById('shop').classList.contains('sell-zone'),
      banner: document.getElementById('sellBanner').style.display,
      txt: document.getElementById('sellBanner').textContent })""")
    ok(hl['zone'] and hl['banner'] == 'block' and '松手出售 +1💰' in hl['txt'],
       f"悬停商店区: sell-zone 高亮 + 横幅『{hl['txt']}』")
    ghost = pg.evaluate("() => ({op: document.getElementById('dragGhost').style.opacity, cls: document.getElementById('dragGhost').className})")
    ok('in-sell' in ghost['cls'], '拖拽幽灵进入出售区半透明(in-sell)')
    pg.mouse.up()
    pg.wait_for_timeout(150)
    post = pg.evaluate("() => ({gold:S.gold, pool:S.pool.ein, bench0:!!S.bench[0], selUid:S.selUid, zone:document.getElementById('shop').classList.contains('sell-zone'), banner:document.getElementById('sellBanner').style.display})")
    ok(post['gold'] == pre['gold'] + 1 and post['pool'] == pre['pool'] + 1 and not post['bench0'],
       f"松手出售结算: gold {pre['gold']}→{post['gold']}, pool.ein {pre['pool']}→{post['pool']}, 备战席格清空")
    ok(post['selUid'] is None and not post['zone'] and post['banner'] == 'none', 'selUid 清空 + 高亮/横幅清除')
    pg.screenshot(path=os.path.join(OUT, 'p1_sell_shop.png'))

    # B2: 拖到一键上阵/刷新按钮（shopbar 内非 #shop 区）→ 不出售、棋子回原位
    put_bench(0, mk1)
    pre2 = pg.evaluate("() => ({gold:S.gold, has:!!S.bench[0]})")
    btn_box = pg.locator('#deployBtn').bounding_box()
    drag_from_bench(0, btn_box['x'] + btn_box['width'] / 2, btn_box['y'] + btn_box['height'] / 2)
    mid2 = pg.evaluate("() => document.getElementById('shop').classList.contains('sell-zone')")
    ok(not mid2, '悬停按钮区不出现商店出售高亮')
    pg.mouse.up()
    pg.wait_for_timeout(120)
    post2 = pg.evaluate("() => ({gold:S.gold, has:!!S.bench[0]})")
    ok(post2['gold'] == pre2['gold'] and post2['has'], '按钮上松手：不出售、棋子回原位')

    # B3: 拖拽完成后点击商店卡片 → 正常购买、无高亮残留
    card_box = pg.locator('#shop .card:not(.sold)').first.bounding_box()
    gold3 = pg.evaluate("() => S.gold")
    pg.mouse.click(card_box['x'] + card_box['width'] / 2, card_box['y'] + card_box['height'] / 2)
    pg.wait_for_timeout(150)
    post3 = pg.evaluate("() => ({gold:S.gold, benchN:S.bench.filter(Boolean).length, zone:document.getElementById('shop').classList.contains('sell-zone')})")
    ok(post3['gold'] < gold3 and post3['benchN'] >= 1 and not post3['zone'],
       f"拖拽后购买正常: gold {gold3}→{post3['gold']}, 备战席 {post3['benchN']} 人, 无高亮残留")

    # B4: 拖到出售按钮 → 仍正常出售
    put_bench(2, mk1)
    pre4 = pg.evaluate("() => ({gold:S.gold})")
    sb_box = pg.locator('#sellBtn').bounding_box()
    drag_from_bench(2, sb_box['x'] + sb_box['width'] / 2, sb_box['y'] + sb_box['height'] / 2)
    hl4 = pg.evaluate("() => document.getElementById('sellBtn').classList.contains('sell-hl')")
    ok(hl4, '悬停出售按钮高亮')
    pg.mouse.up()
    pg.wait_for_timeout(120)
    post4 = pg.evaluate("() => S.gold")
    ok(post4 == pre4['gold'] + 1, f'出售按钮路径仍生效: {pre4["gold"]}→{post4}')

    # B5: 战斗阶段拖拽无反应（人口设为场上人数，排除自动补位干扰本用例）
    pg.evaluate("() => { S.bench[4]={uid:S.uid++, id:'chiharu', star:1, sks:1, hp:200, maxhp:200, atk:20, items:[]}; S.board[4*8+3]={uid:S.uid++, id:'ein', star:1, sks:1, hp:500, maxhp:500, atk:40, items:[]}; S.lvl=S.board.filter(Boolean).length; renderAll(); }")
    pg.evaluate("() => startBattle()")
    pg.wait_for_timeout(200)
    st5 = pg.evaluate("() => ({phase:S.phase, ghost:document.getElementById('dragGhost').style.display})")
    ok(st5['phase'] == 'battle', '已进入战斗阶段')
    # 战斗阶段从备战席发起拖拽尝试（phase 守卫应拦截，无幽灵、无移动）
    b5 = pg.locator('#bench .bslot[data-bi="4"] .unit').bounding_box()
    if b5:
        pg.mouse.move(b5['x'] + b5['width'] / 2, b5['y'] + b5['height'] / 2)
        pg.mouse.down()
        pg.mouse.move(b5['x'] + 80, b5['y'] - 120)
        pg.wait_for_timeout(80)
        gh5 = pg.evaluate("() => document.getElementById('dragGhost').style.display")
        pg.mouse.up()
        ok(gh5 == 'none', '战斗阶段从备战席拖拽无幽灵（phase 守卫生效）')
    # 快速拖拽尝试（应无 ghost）
    bb = pg.locator('#board').bounding_box()
    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
    pg.mouse.down(); pg.mouse.move(bb['x'] + 100, bb['y'] + 100); pg.mouse.up()
    st5b = pg.evaluate("() => document.getElementById('dragGhost').style.display")
    ok(st5b == 'none', '战斗阶段拖拽无幽灵出现')
    # 结束战斗（驱动到结束）
    t0 = time.time()
    while time.time() - t0 < 60:
        if pg.evaluate("() => S.phase") in ('prep', 'over'): break
        pg.wait_for_timeout(300)
    print('battle done, phase =', pg.evaluate("() => S.phase"))

    # ---------- C. 快捷键文案 ----------
    print('[C] 快捷键文案')
    labels = pg.evaluate("""() => ({
      deploy: document.getElementById('deployBtn').textContent,
      tidy: document.getElementById('tidyBtn').textContent,
      refresh: document.getElementById('refreshBtn').textContent,
      sell: document.getElementById('sellBtn').textContent,
      lock: document.getElementById('lockBtn').textContent,
      lvl: document.getElementById('lvlBtn').textContent })""")
    ok('(R)' in labels['deploy'] and '(T)' in labels['tidy'] and '(D)' in labels['refresh'], f"上阵/整理/刷新带快捷键: {labels['deploy']} | {labels['tidy']} | {labels['refresh']}")
    ok('(E)' in labels['sell'] and '(L)' in labels['lock'] and '(F)' in labels['lvl'], f"出售/锁定/经验快捷键保持: {labels['sell']} | {labels['lock']}")
    # 选中后再看 renderTop 重写是否仍带 (E)
    pg.evaluate("() => { S.selUid=S.board.filter(Boolean)[0] ? S.board.filter(Boolean)[0].uid : null; renderTop(); }")
    lab2 = pg.evaluate("() => document.getElementById('sellBtn').textContent")
    ok('(E)' in lab2, f'选中棋子后出售按钮仍带 (E): {lab2}')

    print('\nPAGE ERRORS:', errs[:5] if errs else '无')
    print('RESULT:', 'ALL PASS ✅' if not fails and not errs else f'FAIL {len(fails)} + errs {len(errs)}')
    b.close()
    sys.exit(0 if not fails and not errs else 1)
