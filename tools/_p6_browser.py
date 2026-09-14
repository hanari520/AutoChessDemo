# Phase 6 浏览器验收：sfx 事件计数 / 静音开关 / 限流 / console 零报错
import os, sys, time
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'out')
BOT_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bot_strategy.js'), encoding='utf8').read()

SKILL_KEYS = ['slash', 'spellFire', 'spellIce', 'spellZap', 'spellDark', 'heal', 'shield', 'stunHit']

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, channel='msedge', args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1400, 'height': 950})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.error:' + m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8081/index.html')
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
      newGame(); renderAll();
    }""")
    fails = []
    def ok(cond, msg):
        print(('  ✓ ' if cond else '  ✗ ') + msg)
        if not cond: fails.append(msg)

    print('[1] 三场战斗 sfx 计数（施法≈log、暴击/死亡/结算有数）')
    pg.evaluate(BOT_JS)
    # 先推进 10 回合到中期（人口上来、技能/购买/刷新都活跃），再开始计数
    for i in range(10):
        pg.evaluate("() => botPrep()")
        pg.evaluate("() => { setSpeed(2); startBattle(); }")
        t0 = time.time()
        while time.time() - t0 < 60:
            if pg.evaluate("() => S.phase") in ('prep', 'over'): break
            pg.wait_for_timeout(200)
        if pg.evaluate("() => S.phase") == 'over':
            pg.evaluate("() => { newGame(); renderAll(); }")
    pg.evaluate("""() => {
      window.__sfxCount = {}; window.__sfxPlayed = 0; window.__castN = 0;
      const cs = castSkill; castSkill = function(a,b2,c,d){ window.__castN++; return cs(a,b2,c,d); };
    }""")
    for i in range(3):
        st = pg.evaluate("() => S.phase")
        if st != 'prep': pg.evaluate("() => newGame()")
        pg.evaluate("() => botPrep()")
        pg.evaluate("() => { setSpeed(2); startBattle(); }")
        t0 = time.time()
        while time.time() - t0 < 60:
            if pg.evaluate("() => S.phase") in ('prep', 'over'): break
            pg.wait_for_timeout(200)
    cnt = pg.evaluate("() => ({c: window.__sfxCount, played: window.__sfxPlayed, castN: window.__castN})")
    c = cnt['c']
    skillSum = sum(c.get(k, 0) for k in SKILL_KEYS)
    ok(cnt['castN'] > 0 and skillSum == cnt['castN'],
       f"技能音 = 施法数（{skillSum} == __castN {cnt['castN']}，含双方）")
    groups = [k for k in SKILL_KEYS if c.get(k, 0) > 0]
    ok(len(groups) >= 3, f"技能音色分组可辨（≥3 组出现：{groups}）")
    ok(c.get('crit', 0) > 0, f"暴击音 {c.get('crit', 0)} 次")
    ok(c.get('die', 0) > 0, f"死亡音 {c.get('die', 0)} 次（限流后）")
    ok(c.get('settle', 0) >= 2, f"回合结算音 {c.get('settle', 0)} 次（≥2 场）")
    ok(c.get('buy', 0) > 0, f"购买 {c.get('buy', 0)}（bot 经营音）")
    # 刷新音走按钮路径（bot 直接调 rollShop 不经按钮——UI 音挂在按钮上，按玩家操作验证）
    pg.evaluate("() => { if(S.phase!=='prep'){ newGame(); renderAll(); } S.gold=Math.max(S.gold,10); renderTop(); }")
    pg.click('#refreshBtn')
    pg.wait_for_timeout(200)
    c2 = pg.evaluate("() => window.__sfxCount.roll || 0")
    ok(c2 > 0, f"刷新按钮音 {c2} 次（玩家路径）")
    ok(cnt['played'] > 0, f"实际发声计数 {cnt['played']}（浏览器手势已解锁 AudioContext）")

    print('[2] 静音开关：切换后全静默、刷新保持')
    btn0 = pg.evaluate("() => document.getElementById('sfxBtn').textContent")
    ok('🔊' in btn0, f"初始音效开（{btn0}）")
    pg.click('#sfxBtn')
    st1 = pg.evaluate("() => ({btn: document.getElementById('sfxBtn').textContent, ls: localStorage.getItem('vc_sfx')})")
    ok('🔇' in st1['btn'] and st1['ls'] == '0', f"点击后静音 + localStorage 记忆（{st1['btn']}, vc_sfx={st1['ls']}）")
    played0 = pg.evaluate("() => window.__sfxPlayed || 0")
    pg.evaluate("() => { if(S.phase==='prep'){} else { newGame(); } botPrep(); }")
    pg.evaluate("() => { if(S.phase==='prep'){ setSpeed(2); startBattle(); } }")
    t0 = time.time()
    while time.time() - t0 < 40:
        if pg.evaluate("() => S.phase") in ('prep', 'over'): break
        pg.wait_for_timeout(200)
    played1 = pg.evaluate("() => window.__sfxPlayed || 0")
    cnt1 = pg.evaluate("() => window.__sfxCount || {}")
    ok(played1 == played0 and sum(cnt1.values()) > 0,
       f"静音期间事件计数增长（{sum(cnt1.values())}）但实际发声不增长（{played0}→{played1}）")
    # 刷新保持
    pg.reload()
    pg.wait_for_timeout(800)
    pg.evaluate("""() => {
      const r = document.getElementById('resumeOv');
      if (r && !r.classList.contains('hidden')) document.getElementById('resumeNo').click();
      const o = document.getElementById('overlay');
      if (o && !o.classList.contains('hidden')) document.getElementById('ovBtn').click();
    }""")
    pg.wait_for_timeout(300)
    st2 = pg.evaluate("() => document.getElementById('sfxBtn').textContent")
    ok('🔇' in st2, f"刷新后静音状态保持（{st2}）")
    pg.click('#sfxBtn')   # 恢复开启
    st3 = pg.evaluate("() => localStorage.getItem('vc_sfx')")
    ok(st3 == '1', '再次点击恢复开启并记忆')

    print('[3] 限流与并发（战斗中 voices ≤8）')
    pg.evaluate("() => { newGame(); renderAll(); }")
    pg.evaluate(BOT_JS)
    max_voices = 0
    pg.evaluate("() => botPrep()")
    pg.evaluate("() => { setSpeed(2); startBattle(); }")
    for i in range(20):
        v = pg.evaluate("() => (typeof _sfxVoices==='number') ? _sfxVoices : -1")
        max_voices = max(max_voices, v if isinstance(v, int) else 0)
        pg.wait_for_timeout(150)
        if pg.evaluate("() => S.phase") in ('prep', 'over'): break
    ok(max_voices <= 8, f"并发 voices 峰值 {max_voices} ≤ 8")

    ok(errs == [], f"console 零报错（{errs[:3]}）")
    b.close()
    print('RESULT:', 'ALL PASS ✅' if not fails else f'FAIL {len(fails)}')
    sys.exit(0 if not fails else 1)
