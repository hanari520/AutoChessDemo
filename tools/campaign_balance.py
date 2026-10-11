"""Campaign conquest v2 balance harness (M5): full real-engine pushes, 3 seeds x difficulty I.

Drives the actual browser game like a player: map routing (battle/stronghold first,
rest to heal, then shop/treasure/event), player-like prep spending (一键装备/一键上阵/
买牌/买经验, gold down to <=2), real startBattle+currentTick settlement, act:next between
acts. window.CAMPAIGN_FAST=3 only speeds the shared battle clock (both sides, x3).

Usage: python tools/campaign_balance.py [--seeds 11,22,33] [--limit 480]
Strictly read-only versus game code: never touches tools/bot_strategy.js.
"""
import argparse
import json
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SEED_LIMIT_DEFAULT = 480  # 8 min per seed, then record progress and stop

MAP_JS = """() => {
  const st = S.solo;
  const v = SoloModes.view(st, {gold:S.gold});
  const atks = v.choices.filter(c => c.id.startsWith('attack:') && !c.disabled)
    .map(c => ({id:c.id, node:st.map.nodes.find(n => n.id === c.id.slice(7))}))
    .filter(a => a.node);
  window.__campWait = window.__campWait || 0;
  if (window.__actMark === undefined || S.solo.act !== window.__actMark || S.solo.stats.battles < (window.__battleMark || 0)) {
    window.__actMark = S.solo.act; window.__battleMark = S.solo.stats.battles;
  }
  if (atks.length) {
    // 路策略：残血就休整（rest 节点 +6 / 原地 +2），攒金再战；boss 前的层扫强节点；boss 留到最后。
    // 终局保证：不设等待配额，死循环/磨局由 harness 的 8 分钟时限兜底（任务允许超时记录进度）。
    const rest = atks.find(a => a.node.kind === 'rest');
    const boss = atks.find(a => a.node.kind === 'boss');
    const forward = atks.filter(a => a.node.kind !== 'boss');
    const hurt = st.hp <= st.maxHp - 6 && !(window.__battleMark !== undefined && S.solo.stats.battles - window.__battleMark > 40);   // 40 场战斗无幕推进 = 放弃治疗（磨局收敛为败局）
    if (hurt) {
      window.__campWait++;
      if (rest) { SoloHost.action(rest.id); return {kind:'map', act:'rest-heal', node:rest.node.id}; }
      SoloHost.action('map:rest');
      return {kind:'map', act:'heal-wait', hp:st.hp};
    }
    window.__campWait = 0;
    if (forward.length) {
      const KR = {battle:0, stronghold:1, elite:2, treasure:3, shop:4, event:5, rest:6};
      // 最深优先：把前线推向 boss；被敌袭偷掉的后方节点不回头纠缠（否则永远在补线内打转）
      forward.sort((a,b) => (b.node.layer - a.node.layer) || ((KR[a.node.kind] ?? 9) - (KR[b.node.kind] ?? 9)));
      SoloHost.action(forward[0].id);
      return {kind:'map', act:'attack', node:forward[0].node.id, kindNode:forward[0].node.kind};
    }
    SoloHost.action(boss.id);
    return {kind:'map', act:'boss', node:boss.node.id};
  }
  SoloHost.action('map:rest');
  return {kind:'map', act:'rest'};
}"""

PHASE_JS = """() => {
  const st = S.solo;
  const v = SoloModes.view(st, {gold:S.gold});
  const pick = prefixes => {
    const c = v.choices.find(c => prefixes.some(p => c.id === p || c.id.startsWith(p)) && !c.disabled);
    return c ? c.id : null;
  };
  let id = null;
  if (st.phase === 'actClear') id = 'act:next';
  else if (st.phase === 'reward') id = pick(['reward:item', 'reward:gold']);
  else if (st.phase === 'treasure') id = pick(['treasure:relic', 'treasure:item', 'treasure:gold']);
  else if (st.phase === 'shop') id = (S.gold >= 5 && pick(['shop:buy:0'])) || 'shop:leave';
  else if (st.phase === 'rest') id = st.hp < st.maxHp ? 'rest:heal' : 'rest:levelup';
  else if (st.phase === 'event') id = pick(['event:0', 'event:1']);
  if (!id) return {kind:'stuck', phase:st.phase, choices:v.choices.map(c => [c.id, c.disabled])};
  const ok = SoloHost.action(id);
  return {kind:st.phase, id, ok, phase:S.solo.phase};
}"""

BATTLE_JS = """() => {
  const st = S.solo;
  const isDefense = st.phase === 'defense';
  // —— 备战期像玩家一样花钱：一键装备 → 一键上阵 → 便宜的早期经验 → 买牌（贵先买）→ 剩余金买经验 → 再上阵
  autoEquipAll(); autoDeploy();
  while (S.gold >= 5 && S.lvl < 4) $('lvlBtn').click();
  const tryBuy = i => {   // buy() 成败都不抛错：用金币/人数变化判定真实成交
    const g0 = S.gold, b0 = S.bench.filter(Boolean).length, d0 = S.board.filter(Boolean).length;
    buy(i);
    return S.gold < g0 || S.bench.filter(Boolean).length !== b0 || S.board.filter(Boolean).length !== d0;
  };
  const tryXp = () => {   // lvlBtn 在 lvl>=10 时被 solo-host render 禁用，click() 会静默无效
    const g0 = S.gold, x0 = S.xp;
    $('lvlBtn').click();
    return S.gold < g0 || S.xp > x0;
  };
  for (let g = 0; g < 80; g++) {
    const pairs = {};   // 同名 1★ 拥有数（备战席+场上），与 buy() 的 pairCount 同口径
    S.board.forEach(u => { if (u && u.star === 1) pairs[u.id] = (pairs[u.id] || 0) + 1; });
    S.bench.forEach(u => { if (u && u.star === 1) pairs[u.id] = (pairs[u.id] || 0) + 1; });
    const slots = S.shop.map((d,i) => ({d,i})).filter(x => x.d && S.gold >= x.d.cost);
    const mergeSlot = slots.find(x => (pairs[x.d.id] || 0) >= 2);
    if (mergeSlot && tryBuy(mergeSlot.i)) continue;   // 立即合成：备战席满也允许（buy 内部走超编合成）
    const room = S.bench.filter(Boolean).length < 9;
    if (room && slots.length) {
      slots.sort((a,b) => ((pairs[b.d.id] || 0) - (pairs[a.d.id] || 0)) || (b.d.cost - a.d.cost));
      if (tryBuy(slots[0].i)) continue;   // 玩家本能：先凑同名，其次买贵
    }
    if (S.gold >= 5 && S.lvl < 11 && tryXp()) continue;   // 人口优先于囤金
    if (S.gold >= 5 && S.lvl < 11) { /* lvlBtn 被 host 在 lvl>=10 时禁用：落入刷新分支 */ }
    if (S.gold >= 8) { const g0 = S.gold; $('refreshBtn').click(); if (S.gold < g0) continue; }   // 刷新找合成件/新货
    break;
  }
  autoEquipAll(); autoDeploy();
  const goldSpent = {before:S.gold, lvl:S.lvl, board:S.board.filter(Boolean).length,
                     bench:S.bench.filter(Boolean).length,
                     stars:S.board.filter(Boolean).map(u => u.star).join(''),
                     enc:(SoloModes.view(st, {gold:S.gold}).encounter || {})};
  startBattle(); stopTickLoop();
  let ticks = 0;
  while (S.phase === 'battle' && ticks < 640) { currentTick(); ticks++; }
  const a0 = window.__bu.filter(u => u.side === 0 && u.hp > 0).length;
  const a1 = window.__bu.filter(u => u.side === 1 && u.hp > 0).length;
  const won = SoloHost.battleWon(a0, a1);
  endBattle(a0, a1);   // 结果横幅的迟到回调被 phase 守卫拦下，不会二次结算
  return {kind:isDefense ? 'defense' : 'fight', won, ticks, spent:goldSpent,
          tier:goldSpent.enc.tier, encName:goldSpent.enc.name, encMod:goldSpent.enc.modifier,
          battles:S.solo.stats.battles, losses:S.solo.stats.losses, hp:S.solo.hp,
          phase:S.solo.phase, finished:S.solo.phase === 'finished', outcome:S.solo.outcome || null};
}"""

PROBE_JS = """() => S.solo ? {phase:S.solo.phase, hostPhase:S.phase, finished:S.solo.phase === 'finished',
  outcome:S.solo.outcome, act:S.solo.act, battles:S.solo.stats.battles, losses:S.solo.stats.losses,
  hp:S.solo.hp, turns:S.solo.stats.turns} : {phase:'none'}"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def run_seed(page, seed, limit_s):
    t0 = time.time()
    start = page.evaluate(f"""() => {{
        window.CAMPAIGN_FAST = 3;
        window.__campWait = 0; window.__campWaitTotal = 0;
        window.__actMark = undefined; window.__battleMark = undefined;
        const ok = SoloHost.start('conquest', true, {{seed:{seed}, difficulty:1}});
        return {{ok, nodes:S.solo.map.nodes.length}};
    }}""")
    if not start["ok"]:
        return {"seed": seed, "error": f"start failed: {start}"}
    print(f"  seed {seed}: started, act1 map has {start['nodes']} nodes", flush=True)
    steps = 0
    idle = 0
    while True:
        if time.time() - t0 > limit_s:
            final = page.evaluate(PROBE_JS)
            print(f"  seed {seed}: TIME LIMIT at {final}", flush=True)
            return {"seed": seed, "cleared": False, "timeout": True, "elapsed": round(time.time() - t0, 1), **final}
        probe = page.evaluate(PROBE_JS)
        if probe["phase"] == "none":
            return {"seed": seed, "error": "campaign state vanished"}
        if probe["finished"]:
            break
        steps += 1
        if steps > 4000:
            final = page.evaluate(PROBE_JS)
            print(f"  seed {seed}: STEP LIMIT at {final}", flush=True)
            return {"seed": seed, "cleared": False, "stepLimit": True, "elapsed": round(time.time() - t0, 1), **final}
        if probe["phase"] in ("fight", "defense") and probe["hostPhase"] == "prep":
            idle = 0
            report = page.evaluate(BATTLE_JS)
            page.wait_for_timeout(1050)   # 等结果横幅的 setTimeout 走完，规避迟到的 endBattle 回调
            print(f"    step {steps}: {report['kind']} won={report['won']} battles={report['battles']} "
                  f"losses={report['losses']} hp={report['hp']} lvl={report['spent']['lvl']} "
                  f"board={report['spent']['board']}({report['spent']['stars']}) bench={report['spent']['bench']} "
                  f"gold={report['spent']['before']} tier={report.get('tier')} enc={report.get('encName')}/{report.get('encMod')}", flush=True)
        elif probe["phase"] == "map" and probe["hostPhase"] == "prep":
            report = page.evaluate(MAP_JS)
            idle = 0 if report.get("act") == "attack" or report.get("act") == "boss" else idle + 1
            if report.get("act") == "attack":
                print(f"    step {steps}: attack {report['node']} ({report['kindNode']})", flush=True)
            if idle == 150 or idle == 399:
                diag = page.evaluate("""() => ({probe:S.solo.phase, host:S.phase, supply:S.solo.supply, ap:S.solo.armies.map(a=>[a.id,a.ap,a.node]),
                    active:S.solo.activeArmy, target:S.solo.target, cursor:S.solo.cursor || S.solo.map.cursor,
                    choices:SoloModes.view(S.solo,{gold:S.gold}).choices.map(c=>[c.id,c.disabled]),
                    board:S.board.filter(Boolean).length, telegraph:S.solo.telegraph})""")
                print(f"    step {steps}: IDLE x{idle} diag {diag}", flush=True)
            if idle > 400:
                final = page.evaluate(PROBE_JS)
                print(f"  seed {seed}: MAP STALL at {final}", flush=True)
                return {"seed": seed, "cleared": False, "stalled": True, "elapsed": round(time.time() - t0, 1), **final}
        elif probe["hostPhase"] == "prep":
            report = page.evaluate(PHASE_JS)
            idle += 1
            if report.get("kind") == "stuck":
                print(f"  seed {seed}: STUCK {report}", flush=True)
                break
            if report.get("id") == "act:next":
                print(f"    step {steps}: act {probe['act']} cleared -> next", flush=True)
        else:
            idle += 1
            page.wait_for_timeout(300)   # 横幅/迟到回调尚未落定，稍候再探
    final = page.evaluate(PROBE_JS)
    elapsed = round(time.time() - t0, 1)
    return {"seed": seed, "cleared": final["outcome"] == "won", "timeout": False,
            "battles": final["battles"], "losses": final["losses"], "hp": final["hp"],
            "act": final["act"], "turns": final["turns"], "elapsed": elapsed}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", default="11,22,33")
    parser.add_argument("--limit", type=int, default=SEED_LIMIT_DEFAULT)
    parser.add_argument("--difficulty", type=int, default=1)
    args = parser.parse_args()
    seeds = [int(x) for x in args.seeds.split(",") if x.strip()]

    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/index.html"
    rows = []
    errors = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, channel="msedge")
            context = browser.new_context(viewport={"width": 1366, "height": 768})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base, wait_until="load")
            page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI", timeout=15000)
            for seed in seeds:
                rows.append(run_seed(page, seed, args.limit))
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    print("\n=== 战役征服平衡推演（难度 %d，CAMPAIGN_FAST=3，玩家式花钱）===" % args.difficulty)
    header = f"{'seed':>5} | {'通关':^4} | {'战斗':>4} | {'失败':>4} | {'终局hp':>6} | {'幕':>2} | {'回合':>4} | {'用时s':>6} | 备注"
    print(header)
    for row in rows:
        if "error" in row:
            print(f"{row['seed']:>5} |  ?  |    - |    - |      - |  - |    - |      - | ERROR {row['error']}")
            continue
        note = "超时未完赛" if row.get("timeout") else ("步数上限" if row.get("stepLimit") else "")
        print(f"{row['seed']:>5} | {'胜' if row['cleared'] else '负':^4} | {row.get('battles', -1):>4} | "
              f"{row.get('losses', -1):>4} | {row.get('hp', -1):>6} | {row.get('act', -1):>2} | "
              f"{row.get('turns', -1):>4} | {row.get('elapsed', -1):>6} | {note}")
    clears = sum(1 for row in rows if row.get("cleared"))
    print(f"通关率: {clears}/{len(rows)} = {clears / max(1, len(rows)) * 100:.0f}%（目标 60–85%）")
    if errors:
        print("PAGE ERRORS:", errors[:5])
    print("BALANCE_ROWS " + json.dumps(rows, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
