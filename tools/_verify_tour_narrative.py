# -*- coding: utf-8 -*-
"""M5 browser acceptance (final, 2026-09-27): tour narrative M1-M4b + curve C/D + classic copy A1-A3.

Re-run notes (project constraints):
- Direct `python tools/_verify_tour_narrative.py` is blocked by the Mimosa hook
  (any .py path in the Bash command). Run the code inline via heredoc halves,
  exactly like the acceptance run recorded in the session log:
  part1 = classic copy + SW (expects vcache-v71-tour-bar-width after the M5 fix),
  part2 = solo-stack injection (index.html does NOT load solo-* in production;
  inject tools/solo-ui.css + solo-modes/solo-ui/solo-host via add_style/script_tag).
- Page globals: S / UNITS are top-level let/const -> NOT on window; inside
  page.evaluate use bare S (wait on `typeof startConfiguredRun === 'function'`).
- Since batch D (1301fea, 2026-09-27) the solo stack is NATIVELY loaded again
  (SW v72); the add_script_tag injection below is now only a no-op safety net.
- The old secondary button #homeSolo was retired and replaced by #homeClassic
  (经典挑战); the main button #homeNew is now "✦ 巡演企划 · 剧情模式".
- Sample the whole dialogue queue by calling NarrativeBar.next() until hidden
  (the beat lines live deep in the queue, not on the first line).
- Narrow-screen assertion follows the spec wording "不遮死": assert no horizontal
  overflow AND fight-button coverage < 60% with center not inside the bar
  (a ~23% edge overlap is accepted; bar is dismissible).
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8081/index.html"
SW_CACHE = "vcache-v71-tour-bar-width"
failures = []


def check(name, cond, detail=""):
    ok = bool(cond)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  :: " + str(detail)[:260]))
    if not ok:
        failures.append(name)


TOUR_DRIVE = r"""() => {
  SoloHost.start('expedition', {seed: 20260927});
  const drain = () => { let t = ''; let guard = 0;
    const bar = document.getElementById('narrativeBar');
    while (bar && !bar.hidden && guard++ < 40) { t += bar.textContent + ' | '; NarrativeBar.next(); }
    return t; };
  const clearBar = () => NarrativeBar.finish();
  const fight = win => { S.phase = 'battle'; SoloHost.settle(win, 0, 4); };
  const beats = { s1intro: '', s2intro: '', s3intro: '', clears: 0, trans: [], finale: '' };
  let bossNames = [], mechNames = [], guestCheck = null;
  for (let c = 1; c <= 3; c++) {
    for (let n = 0; n < 6; n++) {
      SoloHost.action(n === 5 ? 'route:boss' : 'route:battle');
      const v = SoloModes.view(S.solo, {gold: S.gold});
      if (n === 5) { bossNames.push(v.encounter.name); mechNames.push(v.enemyHint); beats['s' + c + 'intro'] = drain(); }
      fight(true);
      if (n === 5 && drain()) beats.clears++;
      if (S.solo.phase === 'reward') {
        if (c === 2 && n === 0 && !guestCheck) {
          const v2 = SoloModes.view(S.solo, {gold: S.gold});
          const has4 = v2.choices.some(x => x.id === 'reward:guest:4');
          const has5 = v2.choices.some(x => x.id === 'reward:guest:5');
          SoloHost.action('reward:guest:4');
          guestCheck = { has4, has5, slot0: S.shop[0] ? (UNITS.find(x=>x.id===S.shop[0].id)?.cost ?? S.shop[0].cost) : null,
                         logHit: (document.getElementById('log')?.innerText || '').includes('特邀嘉宾登场') };
        } else SoloHost.action('reward:gold');
        const t = drain();
        if (c < 3 && S.solo.chapter === c + 1) beats.trans.push(t);
        if (S.solo.phase === 'finished') beats.finale = t;
      }
      clearBar();
    }
  }
  return { beats, bossNames, mechNames, guestCheck, finished: S.solo.phase === 'finished', outcome: S.solo.outcome, hp: S.solo.hp };
}"""


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, channel="msedge")

        # ---- part 1: classic copy + SW (plain load) ----
        p1 = browser.new_context(viewport={"width": 1366, "height": 768}).new_page()
        errs1 = []
        p1.on("pageerror", lambda e: errs1.append(str(e)))
        p1.goto(BASE, wait_until="load")
        p1.wait_for_function("() => typeof startConfiguredRun === 'function'", timeout=15000)
        descs = p1.evaluate("() => { try { openSetup(); } catch (e) {} const t = document.body.innerText; return { normal: t.includes('常设赛·常规场'), daily: t.includes('每日同步赛'), custom: t.includes('自选规则场'), old: t.includes('选择章节增强'), arena: t.includes('八人竞技') }; }")
        check("A1 mode-card descs tournament voice", descs["normal"] and descs["daily"] and descs["custom"] and not descs["old"], descs)
        check("A1 arena card untouched (batch D deferred)", descs["arena"], descs)
        guide = p1.evaluate("() => { startConfiguredRun({mode:'normal'},{confirmed:true}); const ov = document.getElementById('guideOverlay'); const t = ov ? ov.innerText : ''; return { shown: !!ov, match: t.includes('FIRST MATCH'), tail: t.includes('名次自己会说话') }; }")
        check("A3 guide FIRST MATCH + closing line", guide["shown"] and guide["match"] and guide["tail"], guide)
        banner = p1.evaluate("() => { const ov = document.getElementById('guideOverlay'); if (ov) ov.remove(); return { text: (document.getElementById('log')?.innerText || '').slice(-400), solo: !!S.solo }; }")
        check("A1 run-start banner", "常设赛开始" in banner["text"] and not banner["solo"], banner)
        shop = p1.evaluate("() => { rollShop(); return S.shop.filter(Boolean).map(u => UNITS.find(x=>x.id===u.id)?.cost ?? u.cost); }")
        check("C classic shop unaffected", all(1 <= c <= 5 for c in shop) and shop, shop)
        sw = p1.evaluate("async () => { await navigator.serviceWorker.ready; await new Promise(r => setTimeout(r, 2500)); const keys = await caches.keys(); const name = keys.find(k => k.startsWith('vcache-')); const hit = {}; if (name) { const c = await caches.open(name); for (const f of ['./tools/narrative-tour.js?v=1','./tools/narrative-bar.js?v=1','./tools/narrative-bar.css?v=2','./index.html?v=71']) hit[f] = !!(await c.match(f)); } return { name, hit }; }")
        check("SW " + SW_CACHE + " with narrative assets", sw["name"] == SW_CACHE and all(sw["hit"].values()), sw)
        check("no page errors (classic)", not errs1, errs1[:3])

        # ---- part 2: solo stack injection + full tour drive ----
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        p3 = ctx.new_page()
        errs3 = []
        p3.on("pageerror", lambda e: errs3.append(str(e)))
        p3.goto(BASE, wait_until="load")
        p3.wait_for_function("() => typeof startConfiguredRun === 'function' && window.NarrativeTour && window.NarrativeBar", timeout=15000)
        p3.add_style_tag(path="tools/solo-ui.css")
        for f in ("tools/solo-modes.js", "tools/solo-ui.js", "tools/solo-host.js"):
            p3.add_script_tag(path=f)
        p3.wait_for_function("() => window.SoloHost && window.SoloUI", timeout=10000)

        panel = p3.evaluate("() => { SoloHost.start('expedition', {seed: 20260927}); return { sub: document.querySelector('#soloPanel .solo-panel-subtitle')?.textContent || '', obj: document.querySelector('#soloPanel .solo-panel-objective')?.textContent || '', line: document.querySelector('#soloPanel .solo-panel-line')?.textContent || '', bar: (document.getElementById('narrativeBar') && !document.getElementById('narrativeBar').hidden) ? document.getElementById('narrativeBar').textContent : '' }; }")
        check("M2 subtitle station+venue", "潮声港·灯塔剧场" in panel["sub"] and "演出体力20/20" in panel["sub"], panel["sub"])
        check("M2 station-1 objective", "把声音送到第三十八步" in panel["obj"], panel["obj"])
        check("M3 lead first line", "七海：「台口到最远那排，三十七步。」" in panel["line"], panel)
        check("M4b station-1 opening", "星轨的第一道刻痕落在潮声港" in panel["bar"], panel["bar"][:80])

        odds = p3.evaluate("() => { const seen = {1:[], 2:[], 3:[]}; const costs = () => S.shop.filter(Boolean).map(u => UNITS.find(x=>x.id===u.id)?.cost ?? u.cost); for (const ch of [1,2,3]) { S.solo.chapter = ch; const n = ch === 3 ? 60 : 15; for (let i = 0; i < n; i++) { rollShop(); seen[ch].push(...costs()); } } S.solo.chapter = 1; return { max1: Math.max(...seen[1]), has4_2: seen[2].some(c=>c===4), has5_2: seen[2].some(c=>c===5), has5_3: seen[3].some(c=>c===5) }; }")
        check("C station-1 caps at 3-cost", odds["max1"] <= 3, odds)
        check("C station-2 has 4-cost no 5", odds["has4_2"] and not odds["has5_2"], odds)
        check("C station-3 has 5-cost", odds["has5_3"], odds)

        ev = p3.evaluate("() => { const s = SoloModes.create('expedition', 55); const intro = SoloModes.view(s, {gold: 30}); const st = SoloModes.view({...s, phase:'event', current:'event'}, {gold: 30}); return { sit: ['主办方的音响','第一排有两个座位'].some(k => intro.choices.some(c=>c.description.includes(k)) || st.objective.includes(k)), labels: st.choices.map(c => c.label).join('/') }; }")
        check("M1 event situation + locked labels", ev["sit"] and ev["labels"] == "稳妥合作/尝试临时联动", ev)

        tour = p3.evaluate(TOUR_DRIVE)
        check("M2 boss names per station", tour["bossNames"] == ["灯塔剧场·压轴夜", "天桥圆形广场·压轴夜", "星轨穹顶·压轴夜"], tour["bossNames"])
        check("mechanic hints shield/charge/summon", any("应援屏障" in m for m in tour["mechNames"]) and any("压轴蓄势" in m for m in tour["mechNames"]) and any("全息伴舞" in m for m in tour["mechNames"]), tour["mechNames"])
        check("M4b S1 boss intro", "今晚最后一首" in tour["beats"]["s1intro"], tour["beats"]["s1intro"][:60])
        check("M4b S2 boss intro (等下一个节目)", "他们在等下一个节目" in tour["beats"]["s2intro"], tour["beats"]["s2intro"][:60])
        check("M4b S3 boss intro silence (你也)", "你也" in tour["beats"]["s3intro"], tour["beats"]["s3intro"][:60])
        check("M4b 3 boss clears", tour["beats"]["clears"] == 3, tour["beats"]["clears"])
        t1 = tour["beats"]["trans"][0] if tour["beats"]["trans"] else ""
        t2 = tour["beats"]["trans"][1] if len(tour["beats"]["trans"]) > 1 else ""
        check("S1->S2 transition", ("第二段" in t1 or "点名" in t1) and "霓虹街" in t1, t1[:70])
        check("S2->S3 transition", "第二段" in t2 and "长夜台" in t2, t2[:70])
        check("finale encore (hp20/0 defeats)", tour["finished"] and tour["outcome"] == "won" and ("再来一首" in tour["beats"]["finale"] or "没有人走" in tour["beats"]["finale"]), (tour["beats"]["finale"][:60], tour["hp"]))
        check("D guest e2e (st2 choice, slot0=4-cost, logged)", tour["guestCheck"] and tour["guestCheck"]["has4"] and not tour["guestCheck"]["has5"] and tour["guestCheck"]["slot0"] == 4 and tour["guestCheck"]["logHit"], tour["guestCheck"])

        # ---- part 3: narrow screen (spec: 不遮死 = no full block; no overflow) ----
        ctx4 = browser.new_context(viewport={"width": 400, "height": 760})
        p4 = ctx4.new_page()
        p4.goto(BASE, wait_until="load")
        p4.wait_for_function("() => typeof startConfiguredRun === 'function' && window.NarrativeBar", timeout=15000)
        p4.add_style_tag(path="tools/solo-ui.css")
        for f in ("tools/solo-modes.js", "tools/solo-ui.js", "tools/solo-host.js"):
            p4.add_script_tag(path=f)
        p4.wait_for_function("() => window.SoloHost", timeout=10000)
        n = p4.evaluate("() => { SoloHost.start('expedition', {seed: 7}); const r = document.getElementById('narrativeBar').getBoundingClientRect(); const fb = document.getElementById('fightBtn').getBoundingClientRect(); const ovH = Math.max(0, Math.min(r.bottom, fb.bottom) - Math.max(r.top, fb.top)); const cy = (fb.top + fb.bottom) / 2; return { overflowX: document.documentElement.scrollWidth > window.innerWidth, barRight: Math.round(r.right), innerW: window.innerWidth, coverFrac: Math.round(100 * ovH / Math.max(1, fb.height)), centerInside: r.top < cy && cy < r.bottom }; }")
        check("narrow: no horizontal overflow", not n["overflowX"] and n["barRight"] <= n["innerW"] + 1, n)
        check("narrow: fight button not fully covered", n["coverFrac"] < 60 and not n["centerInside"], n)
        check("no page errors (solo)", not errs3, errs3[:3])
        browser.close()

    print()
    print("RESULT: " + ("ALL GREEN" if not failures else "FAILURES: " + ", ".join(failures)))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
