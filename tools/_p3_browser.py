# Phase 3 浏览器验收：合成 UI 交互 + 3 局 bot 对局（合成→穿戴→战斗链路）
import os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge')
    pg = b.new_page(viewport={'width': 1400, 'height': 950})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.error:' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(700)
    pg.evaluate("""() => {
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
      newGame(); renderAll();
    }""")
    fails = []
    def ok(cond, msg):
        print(('  ✓ ' if cond else '  ✗ ') + msg)
        if not cond: fails.append(msg)

    # ---------- A. 合成 UI：背包合成按钮 + 详情就地合成 ----------
    print('[A] 合成 UI 交互')
    st = pg.evaluate("""() => {
      S.items = ['sword','sword','bow','vamp'];
      S.board[4*8+3] = {uid:S.uid++, id:'ein', star:1, sks:1, hp:500, maxhp:500, atk:20, items:['staff','mana']};
      S.bench = Array(8).fill(null);
      S.phase='prep'; renderAll();
      const rows = document.querySelectorAll('#equip .combo-row');
      return {rows: rows.length, text: rows.length ? rows[0].textContent : ''};
    }""")
    ok(st['rows'] >= 1 and '炽焰裁决剑' in st['text'], f"背包出现合成预览行（{st['rows']} 行，首行 {st['text'][:26]}…）")
    pg.screenshot(path=os.path.join(OUT, 'p3_combine_row.png'))
    # 点击合成按钮
    pg.evaluate("() => document.querySelector('#equip .combo-row .btn').click()")
    st2 = pg.evaluate("() => ({items:S.items.join(','), log:S.log.find(l=>l.includes('装备合成'))||''})")
    ok('flamejudge' in st2['items'] and 'sword' not in st2['items'].split(','), f"点击合成：sword×2 → flamejudge（{st2['items']}）")
    ok('炽焰裁决剑' in st2['log'], '合成日志含成品名')
    # 详情就地合成（佩戴 staff+mana → tidejewel）
    pg.evaluate("() => { clickUnit('board', 4*8+3); }")
    row = pg.evaluate("() => ({has: !!document.querySelector('#inspect .in-combo'), text: (document.querySelector('#inspect .in-combo')||{}).textContent||''})")
    ok(row['has'] and '蓝玉潮涌' in row['text'], f"详情面板出现就地合成行（{row['text'][:36]}）")
    pg.evaluate("() => document.querySelector('#inspect .in-combo').click()")
    st3 = pg.evaluate("() => S.board[4*8+3].items.join(',')")
    ok(st3 == 'tidejewel', f"就地合成：佩戴变更为 {st3}（腾出 1 格）")
    # 战斗生效链路：开战取战斗单位校验通道
    pg.evaluate("() => { S.lvl = S.board.filter(Boolean).length; startBattle(); }")
    st4 = pg.evaluate("""() => {
      const u = (window.__bu||[]).find(x=>x.id==='ein');
      return u ? {mana:u.mana, atkMul:u.atkMul} : null;
    }""")
    ok(st4 and st4['mana'] == 20, f"蓝玉潮涌战斗生效：开局蓝 {st4 and st4['mana']}")
    t0 = time.time()
    while time.time() - t0 < 30:
        if pg.evaluate("() => S.phase") in ('prep', 'over'): break
        pg.wait_for_timeout(250)

    # ---------- B. 3 局 bot 对局 ----------
    print('[B] 3 局 bot 对局（合成→穿戴→战斗）')
    pg.evaluate(BOT_JS)
    wins = 0
    for g in range(3):
        pg.evaluate("() => { newGame(); renderAll(); }")
        crafted_seen = 0
        for i in range(40):
            st = pg.evaluate("() => ({phase:S.phase, round:S.round})")
            if st['phase'] == 'over': break
            pg.evaluate("() => botPrep()")
            cnt = pg.evaluate("""() => {
              let n=0; [...S.board,...S.bench].forEach(u=>{ if(u) u.items.forEach(k=>{ if(['flamejudge','aegis','twinbows','bloodcore','bramble','soulblade','hexdrinker','tidejewel','galehunt','sagestaff','windmail','swiftecho','twinshell'].includes(k)) n++; }); });
              return n + S.items.filter(k=>k!=='sword'&&k!=='staff'&&k!=='armor'&&k!=='bow'&&k!=='vamp'&&k!=='mana').length;
            }""")
            crafted_seen = max(crafted_seen, cnt)
            pg.evaluate("() => { setSpeed(2); startBattle(); }")
            t0 = time.time()
            while time.time() - t0 < 60:
                if pg.evaluate("() => S.phase") in ('prep', 'over'): break
                pg.wait_for_timeout(250)
        st = pg.evaluate("() => ({phase:S.phase, round:S.round, ov:document.getElementById('ovTitle').textContent})")
        win = '通关' in st['ov']
        wins += 1 if win else 0
        print(f"  game{g+1}: {st['ov']} r{st['round']} 成品持有峰值 {crafted_seen}")
        if g == 0: pg.screenshot(path=os.path.join(OUT, 'p3_equip_panel.png'))
    ok(True, f"3 局完成（{wins} 胜）")
    ok(errs == [], f'console 零报错（{errs[:2]}）')
    b.close()
    print('RESULT:', 'ALL PASS ✅' if not fails else f'FAIL {len(fails)}')
    sys.exit(0 if not fails else 1)
