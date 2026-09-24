"""Browser integration tests for the five solo modes using an isolated context."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
MODES = ("expedition", "hunt", "puzzle", "siege", "conquest")
CLASSIC_KEYS = ("vc_save4", "vc_daily3", "vc_arena3")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def evaluate(page, expression, argument=None):
    if argument is None:
        return page.evaluate(expression)
    return page.evaluate(expression, argument)


def canonical_units(units):
    return [
        None if unit is None else {key: unit.get(key) for key in ("id", "star", "hp", "maxhp", "atk")}
        for unit in units
    ]


CAMPAIGN_SEED = 20260925
PROTECTED_KEYS = (
    "vc_solo_v1_expedition", "vc_solo_v1_hunt", "vc_solo_v1_puzzle", "vc_solo_v1_siege",
    "vc_save4", "vc_daily3", "vc_arena3",
)


def drive_real_battle(page, tick_cap=700):
    """Start the shared battle engine, drive real ticks synchronously, return the raw outcome."""
    return evaluate(page, """cap => {
        const before = {wins:S.stats.wins, losses:S.stats.losses, battles:S.soloBattles,
                        gold:S.gold, ruleBattles:S.solo.stats.battles, phase:S.solo.phase};
        startBattle(); stopTickLoop();
        let ticks = 0;
        while (S.phase === 'battle' && ticks < cap) { currentTick(); ticks++; }
        const allies = window.__bu.filter(u => u.side === 0 && u.hp > 0).length;
        const enemies = window.__bu.filter(u => u.side === 1 && u.hp > 0).length;
        return {before, ticks, phase:S.phase, allies, enemies, won:SoloHost.battleWon(allies, enemies)};
    }""", tick_cap)


def settle_once_and_duplicate(page):
    """Wait out the result banner, then prove the settle happened once and a replay is a no-op."""
    page.wait_for_function("() => S.phase === 'prep'", timeout=6000)
    return evaluate(page, """() => {
        const mid = {wins:S.stats.wins, losses:S.stats.losses, battles:S.soloBattles,
                     gold:S.gold, ruleBattles:S.solo.stats.battles, phase:S.solo.phase,
                     owned:S.solo.map.owned.length};
        const raw = localStorage.getItem('vc_solo_v1_conquest');
        const duplicate = SoloHost.settle(true, 0, 2);
        return {mid, duplicate, rawStable: raw === localStorage.getItem('vc_solo_v1_conquest'),
                after:{wins:S.stats.wins, losses:S.stats.losses, battles:S.soloBattles,
                       gold:S.gold, ruleBattles:S.solo.stats.battles, phase:S.solo.phase,
                       owned:S.solo.map.owned.length}};
    }""")


def campaign_suite(page, errors):
    """战役征服 v2：真实引擎驱动的地图/存档隔离/幂等结算/幕检查点/难度门控/窄屏冒烟。"""
    rows = []

    def step(name, detail):
        rows.append((name, detail))
        print(f"  campaign ok: {name} :: {detail}")

    # 1. 战役启动与地图：全幅地图上屏、节点数与规则层一致、#main 隐藏
    started = evaluate(page, f"() => SoloHost.start('conquest', true, {{seed:{CAMPAIGN_SEED}, difficulty:1}})")
    map_ui = evaluate(page, """() => ({
        mode:S.solo && S.solo.mode, act:S.solo && S.solo.act, phase:S.solo && S.solo.phase,
        bodyOpen:document.body.classList.contains('solo-camp-map-open'),
        domNodes:document.querySelectorAll('.solo-camp-node').length,
        ruleNodes:S.solo.map.nodes.length,
        mainDisplay:getComputedStyle(document.getElementById('main')).display})""")
    require(started and map_ui["mode"] == "conquest" and map_ui["act"] == 1 and map_ui["phase"] == "map",
            f"campaign start failed: {started}, {map_ui}")
    require(map_ui["bodyOpen"] and map_ui["domNodes"] == map_ui["ruleNodes"] and map_ui["mainDisplay"] == "none",
            f"campaign map did not take over the page: {map_ui}")
    step("启动战役并全幅上屏（body.solo-camp-map-open，#main display:none）",
         f"seed={CAMPAIGN_SEED} act={map_ui['act']} 节点 DOM/规则层={map_ui['domNodes']}/{map_ui['ruleNodes']}")

    # 2. 存档隔离基线：其余四模式 + 三个经典槽位逐字节快照
    protected_before = evaluate(page, "keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))",
                                list(PROTECTED_KEYS))

    # 3. 地图选路（点首个可攻节点）→ body class 移除、#main 恢复、进入 fight
    route = evaluate(page, """() => {
        const btn = document.querySelector('.solo-camp-node.solo-camp-attackable:not([disabled])');
        if (!btn) return {clicked:false};
        const id = btn.dataset.campKey;
        btn.click();
        return {clicked:true, id, phase:S.solo.phase, target:S.solo.target,
                bodyOpen:document.body.classList.contains('solo-camp-map-open'),
                mainDisplay:getComputedStyle(document.getElementById('main')).display};
    }""")
    require(route["clicked"] and route["phase"] == "fight" and not route["bodyOpen"]
            and route["mainDisplay"] != "none", f"campaign route click failed: {route}")
    step("地图选路（点击可攻节点）恢复棋盘区", f"节点={route['id']} phase={route['phase']} #main={route['mainDisplay']}")

    # 4. 进攻战斗真实引擎结算 + 幂等（重复 settle 返回 false，战绩/金币/存档不重复）
    evaluate(page, "() => { autoDeploy(); for (let i=0;i<5;i++) if (S.shop[i] && S.gold >= S.shop[i].cost) buy(i); autoDeploy(); }")
    battle = drive_real_battle(page)
    require(battle["phase"] == "settle" and battle["allies"] + battle["enemies"] > 0 and battle["ticks"] > 0,
            f"campaign attack battle did not run the shared engine: {battle}")
    settled = settle_once_and_duplicate(page)
    require(settled["mid"]["battles"] == battle["before"]["battles"] + 1
            and settled["mid"]["wins"] + settled["mid"]["losses"] == battle["before"]["wins"] + battle["before"]["losses"] + 1
            and settled["mid"]["ruleBattles"] == battle["before"]["ruleBattles"] + 1,
            f"campaign attack battle did not settle exactly once: {battle}, {settled}")
    require(settled["duplicate"] is False and settled["rawStable"] and settled["after"] == settled["mid"],
            f"campaign attack duplicate settle altered state: {settled}")
    step("进攻战斗真实结算一次且重复结算无效",
         f"ticks={battle['ticks']} won={battle['won']} battles={settled['mid']['battles']} dup={settled['duplicate']}")

    # 5. 幕内推进到首次占领（规则层快进），再强制敌袭触发防守战并验证幂等
    owned = evaluate(page, """() => {
        const ctx = {gold: 9999};
        const win = st => SoloModes.settle(st, {won:true, survivors:0, allies:4, deployed:4, playerStartingCount:4, time:25, gold:60}).state;
        let guard = 0;
        while (!(S.solo.map.owned.length >= 1 && ['map', 'reward'].includes(S.solo.phase)) && guard++ < 200) {
            const st = S.solo;
            if (st.phase === 'finished') break;
            if (st.phase === 'map') {
                const c = SoloModes.view(st, ctx).choices.find(x => x.id.startsWith('attack:') && !x.disabled);
                S.solo = SoloModes.act(st, c ? c.id : 'map:rest', ctx).state;
            } else if (st.phase === 'fight' || st.phase === 'defense') S.solo = win(st);
            else if (st.phase === 'reward') S.solo = SoloModes.act(st, 'reward:gold', ctx).state;
            else if (st.phase === 'treasure') S.solo = SoloModes.act(st, st.relics.length < 4 ? 'treasure:relic' : 'treasure:gold', ctx).state;
            else if (st.phase === 'shop') S.solo = SoloModes.act(st, 'shop:leave', ctx).state;
            else if (st.phase === 'rest') S.solo = SoloModes.act(st, st.hp < st.maxHp ? 'rest:heal' : 'rest:levelup', ctx).state;
            else if (st.phase === 'event') S.solo = SoloModes.act(st, 'event:0', ctx).state;
            else break;
        }
        if (S.solo.phase === 'reward') SoloHost.action('reward:gold');
        return {phase:S.solo.phase, owned:S.solo.map.owned.slice(),
                garrisoned:S.solo.map.owned.filter(id => S.solo.armies.some(a => a.node === id))};
    }""")
    require(owned["phase"] == "map" and owned["garrisoned"],
            f"campaign could not reach a garrisoned node: {owned}")
    defense = evaluate(page, """() => {
        S.solo.telegraph = {node: S.solo.map.owned.filter(id => S.solo.armies.some(a => a.node === id))[0], countdown: 1};
        const ok = SoloHost.action('map:end');
        return {ok, phase:S.solo.phase, target:S.solo.target,
                modifier:SoloModes.view(S.solo, {gold:S.gold}).encounter &&
                         SoloModes.view(S.solo, {gold:S.gold}).encounter.modifier};
    }""")
    require(defense["ok"] and defense["phase"] == "defense" and defense["modifier"] == "counterattack",
            f"campaign defense battle did not trigger: {defense}")
    dbattle = drive_real_battle(page)
    require(dbattle["phase"] == "settle" and dbattle["allies"] + dbattle["enemies"] > 0,
            f"campaign defense battle did not run: {dbattle}")
    dsettled = settle_once_and_duplicate(page)
    require(dsettled["mid"]["battles"] == dbattle["before"]["battles"] + 1,
            f"campaign defense battle did not settle once: {dbattle}, {dsettled}")
    require(dsettled["duplicate"] is False and dsettled["rawStable"] and dsettled["after"] == dsettled["mid"],
            f"campaign defense duplicate settle altered state: {dsettled}")
    step("防守战（counterattack）真实结算一次且重复结算无效",
         f"ticks={dbattle['ticks']} won={dbattle['won']} dup={dsettled['duplicate']}")

    # 6. 幕检查点：规则层快进至 actClear → 经宿主 act:next 进入第 2 幕
    cleared = evaluate(page, """() => {
        const ctx = {gold: 9999};
        const win = st => SoloModes.settle(st, {won:true, survivors:0, allies:4, deployed:4, playerStartingCount:4, time:25, gold:60}).state;
        let guard = 0;
        while (S.solo.phase !== 'actClear' && guard++ < 400) {
            const st = S.solo;
            if (st.phase === 'finished') break;
            if (st.phase === 'map') {
                const c = SoloModes.view(st, ctx).choices.find(x => x.id.startsWith('attack:') && !x.disabled);
                S.solo = SoloModes.act(st, c ? c.id : 'map:rest', ctx).state;
            } else if (st.phase === 'fight' || st.phase === 'defense') S.solo = win(st);
            else if (st.phase === 'reward') S.solo = SoloModes.act(st, 'reward:gold', ctx).state;
            else if (st.phase === 'treasure') S.solo = SoloModes.act(st, st.relics.length < 4 ? 'treasure:relic' : 'treasure:gold', ctx).state;
            else if (st.phase === 'shop') S.solo = SoloModes.act(st, 'shop:leave', ctx).state;
            else if (st.phase === 'rest') S.solo = SoloModes.act(st, st.hp < st.maxHp ? 'rest:heal' : 'rest:levelup', ctx).state;
            else if (st.phase === 'event') S.solo = SoloModes.act(st, 'event:0', ctx).state;
            else break;
        }
        return {phase:S.solo.phase, act:S.solo.act};
    }""")
    require(cleared["phase"] == "actClear" and cleared["act"] == 1,
            f"campaign act 1 did not reach actClear: {cleared}")
    advanced = evaluate(page, """() => {
        const ok = SoloHost.action('act:next');
        return {ok, act:S.solo.act, phase:S.solo.phase, hp:S.solo.hp,
                checkpointAct:S.solo.actCheckpoint && S.solo.actCheckpoint.act,
                owned:S.solo.map.owned.length};
    }""")
    require(advanced["ok"] and advanced["act"] == 2 and advanced["phase"] == "map"
            and advanced["checkpointAct"] == 2 and advanced["owned"] == 0,
            f"campaign act:next failed: {advanced}")
    step("幕 Boss 胜利后经 act:next 进入第 2 幕（新地图空补给线，幕检查点=act 2）",
         f"act={advanced['act']} hp={advanced['hp']} owned={advanced['owned']}")

    # 7. 本营陷落 → checkpoint:retry 回幕起点：地图/据点/耐久与幕初一致且棋盘有兵
    doomed = evaluate(page, """() => {
        const c = SoloModes.view(S.solo, {gold:S.gold}).choices.find(x => x.id.startsWith('attack:') && !x.disabled);
        if (!c) return {attackable:false};
        S.solo.hp = 3; S.hp = 3;
        const ok = SoloHost.action(c.id);
        return {attackable:true, ok, phase:S.solo.phase};
    }""")
    require(doomed["attackable"] and doomed["ok"] and doomed["phase"] == "fight",
            f"campaign doomed attack failed: {doomed}")
    evaluate(page, "() => startBattle()")
    dead = evaluate(page, "() => { endBattle(0, 2); return {phase:S.solo.phase, outcome:S.solo.outcome, hp:S.solo.hp}; }")
    require(dead["phase"] == "finished" and dead["outcome"] == "lost" and dead["hp"] == 0,
            f"campaign defeat did not finish the run: {dead}")
    retried = evaluate(page, """() => {
        const cp = JSON.parse(JSON.stringify(S.solo.actCheckpoint));
        const ok = SoloHost.action('checkpoint:retry');
        return {ok, phase:S.solo.phase, act:S.solo.act, hp:S.solo.hp,
                hpMatches:S.solo.hp === cp.hp,
                ownedMatches:JSON.stringify(S.solo.map.owned) === JSON.stringify(cp.map.owned),
                cursorMatches:JSON.stringify(S.solo.map.cursor) === JSON.stringify(cp.map.cursor),
                boardUnits:S.board.filter(Boolean).length, activeArmy:S.solo.activeArmy};
    }""")
    require(retried["ok"] and retried["phase"] == "map" and retried["act"] == 2
            and retried["hpMatches"] and retried["ownedMatches"] and retried["cursorMatches"]
            and retried["boardUnits"] > 0,
            f"campaign checkpoint retry failed: {retried}")
    step("本营陷落后 checkpoint:retry 回到第 2 幕起点",
         f"act={retried['act']} owned/cursor/hp 与幕初一致 board={retried['boardUnits']} 兵 activeArmy={retried['activeArmy']}")

    # 8. 战役中途重载 → resume 回同一运行
    before_reload = evaluate(page, "() => ({runId:S.runId, act:S.solo.act, turn:S.solo.stats.turns})")
    page.reload(wait_until="load")
    page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI")
    resumed = evaluate(page, "() => ({ok:SoloHost.resume('conquest'), runId:S.runId, act:S.solo.act, turn:S.solo.stats.turns, phase:S.solo.phase})")
    require(resumed["ok"] and resumed["runId"] == before_reload["runId"] and resumed["act"] == 2
            and resumed["turn"] == before_reload["turn"],
            f"campaign resume after reload failed: {before_reload}, {resumed}")
    step("战役中途重载并 resume", f"runId 一致 act={resumed['act']} turn={resumed['turn']}")

    # 9. 难度门控：vc_campaign_meta.maxClearedDifficulty=1 → II 可用 III 禁用；清除后仅 I 可用
    evaluate(page, "() => localStorage.setItem('vc_campaign_meta', JSON.stringify({maxClearedDifficulty:1}))")
    page.reload(wait_until="load")
    page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI")
    require(evaluate(page, "() => SoloHost.openHub()"), "campaign hub did not open for difficulty gating")
    gate1 = evaluate(page, """() => {
        const sel = document.querySelector('select[data-mode-option="difficulty"]');
        return sel ? {found:true, disabled:[...sel.options].map(o => o.disabled)} : {found:false};
    }""")
    require(gate1["found"] and gate1["disabled"] == [False, False, True],
            f"difficulty II/III gating wrong with maxClearedDifficulty=1: {gate1}")
    evaluate(page, "() => localStorage.removeItem('vc_campaign_meta')")
    page.reload(wait_until="load")
    page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI")
    require(evaluate(page, "() => SoloHost.openHub()"), "campaign hub did not open after meta clear")
    gate0 = evaluate(page, """() => {
        const sel = document.querySelector('select[data-mode-option="difficulty"]');
        return sel ? {found:true, disabled:[...sel.options].map(o => o.disabled)} : {found:false};
    }""")
    require(gate0["found"] and gate0["disabled"] == [False, True, True],
            f"difficulty gating wrong with cleared meta: {gate0}")
    step("难度门控（vc_campaign_meta 驱动大厅难度选项）",
         f"maxCleared=1 → 禁用位 {gate1['disabled']}；清空 → 禁用位 {gate0['disabled']}")

    # 10. ≤880px 冒烟：390×844 打开地图相，无横向溢出且节点仍可点
    page.set_viewport_size({"width": 390, "height": 844})
    mobile = evaluate(page, """() => {
        const resumed = SoloHost.resume('conquest');
        return {resumed, phase:S.solo.phase, bodyOpen:document.body.classList.contains('solo-camp-map-open'),
                overflow:document.scrollingElement.scrollWidth - window.innerWidth,
                nodes:document.querySelectorAll('.solo-camp-node').length,
                enabled:[...document.querySelectorAll('.solo-camp-node')].filter(b => !b.disabled).length};
    }""")
    require(mobile["resumed"] and mobile["phase"] == "map" and mobile["bodyOpen"]
            and mobile["overflow"] <= 1 and mobile["enabled"] > 0,
            f"campaign mobile map smoke failed: {mobile}")
    tap = evaluate(page, """() => {
        const btn = document.querySelector('.solo-camp-node.solo-camp-attackable:not([disabled])');
        if (!btn) return {clicked:false};
        btn.click();
        return {clicked:true, phase:S.solo.phase,
                overflow:document.scrollingElement.scrollWidth - window.innerWidth};
    }""")
    require(tap["clicked"] and tap["phase"] == "fight" and tap["overflow"] <= 1,
            f"campaign mobile node tap failed: {tap}")
    page.set_viewport_size({"width": 1366, "height": 768})
    step("390×844 地图相无横向溢出且节点可点", f"溢出={mobile['overflow']}px 可攻节点点击后 phase={tap['phase']}")

    # 11. 存档隔离收口：campaign 全程未动其余模式与经典槽位
    protected_after = evaluate(page, "keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]))",
                               list(PROTECTED_KEYS))
    changed = [k for k in PROTECTED_KEYS if protected_after[k] != protected_before[k]]
    require(not changed, f"campaign activity modified protected saves: {changed}")
    require(not errors, f"campaign runtime errors: {errors}")
    step("campaign 全程其余四模式与 vc_save4/vc_daily3/vc_arena3 字节不变", f"diff 键: 无")
    return rows


def main():
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}/index.html"
    errors = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, channel="msedge")
            context = browser.new_context(viewport={"width": 1366, "height": 768})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(base, wait_until="load")
            try:
                page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI", timeout=15000)
            except Exception as error:
                flags = evaluate(page, "() => ({host:!!window.SoloHost,modes:!!window.SoloModes,ui:!!window.SoloUI})")
                raise AssertionError(f"solo scripts failed to initialize: {flags}; page errors: {errors}") from error

            evaluate(page, "() => SoloHost.openHub()")
            require(page.locator("#soloHub").is_visible(), "single-player hub did not open")
            cards = evaluate(page, "() => [...document.querySelectorAll('#soloHubCards [data-mode]')].map(x=>x.dataset.mode)")
            require(set(MODES).issubset(cards), f"hub is missing a mode card: {cards}")

            # Create valid classic checkpoints in this temporary browser context.
            evaluate(page, "() => startConfiguredRun({mode:'normal'}, {confirmed:true})")
            evaluate(page, "() => startConfiguredRun({mode:'daily',dailySeed:todaySeed()}, {confirmed:true})")
            evaluate(page, "() => startConfiguredRun({mode:'arena'}, {confirmed:true})")
            classic_before = evaluate(page, "keys => Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", list(CLASSIC_KEYS))
            require(all(classic_before.values()), f"could not create all classic save slots: {classic_before}")
            require(evaluate(page, "() => ['vc_save4','vc_daily3','vc_arena3'].every(k=>inspectSave(k).status==='valid')"),
                    "classic normal/daily/arena save checkpoints are not valid")

            # Each solo mode receives only its own independent key, and can round-trip.
            solo_raw = {}
            for mode in MODES:
                other_slots = evaluate(page, "v => Object.fromEntries(v.modes.filter(x=>x!==v.current).map(x=>[x,localStorage.getItem('vc_solo_v1_'+x)]))", {"modes": list(MODES), "current": mode})
                started = evaluate(page, "m => SoloHost.start(m,true,{seed:8100+['expedition','hunt','puzzle','siege','conquest'].indexOf(m)})", mode)
                require(started, f"could not start {mode}")
                state = evaluate(page, "() => ({mode:S.solo&&S.solo.mode,phase:S.solo&&S.solo.phase,runId:S.runId,save:localStorage.getItem('vc_solo_v1_'+S.solo.mode)})")
                require(state["mode"] == mode and state["runId"], f"{mode} did not create the expected run: {state}")
                require(state["save"] and json.loads(state["save"])["state"]["solo"]["mode"] == mode,
                        f"{mode} did not save its own mode state")
                after_other_slots = evaluate(page, "v => Object.fromEntries(v.modes.filter(x=>x!==v.current).map(x=>[x,localStorage.getItem('vc_solo_v1_'+x)]))", {"modes": list(MODES), "current": mode})
                require(after_other_slots == other_slots, f"starting {mode} changed another solo save")
                solo_raw[mode] = state["save"]

                before = evaluate(page, "() => ({mode:S.solo.mode,runId:S.runId,solo:JSON.stringify(S.solo),board:JSON.stringify(S.board),bench:JSON.stringify(S.bench),gold:S.gold,hp:S.hp,enemy:S.enemyBoard.map(u=>u&&({id:u.id,star:u.star,hp:u.hp,maxhp:u.maxhp,atk:u.atk}))})")
                evaluate(page, "() => SoloHost.openHub()")
                page.reload(wait_until="load")
                page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI")
                resumed = evaluate(page, "m => ({ok:SoloHost.resume(m),mode:S.solo&&S.solo.mode,runId:S.runId,solo:JSON.stringify(S.solo),board:JSON.stringify(S.board),bench:JSON.stringify(S.bench),gold:S.gold,hp:S.hp,enemy:S.enemyBoard.map(u=>u&&({id:u.id,star:u.star,hp:u.hp,maxhp:u.maxhp,atk:u.atk}))})", mode)
                require(resumed["ok"] and resumed["mode"] == mode and resumed["runId"] == before["runId"],
                        f"{mode} did not resume the same run: {resumed}")
                for field in ("solo", "board", "bench", "gold", "hp", "enemy"):
                    require(resumed[field] == before[field], f"{mode} resume changed {field}")
                evaluate(page, "() => SoloHost.openHub()")

            # Exercise the public battle loop for all five modes. The result
            # banner's own callback must carry the outcome into SoloHost.
            battle_results = {}
            for mode in MODES:
                sibling_saves = evaluate(page, "v => Object.fromEntries(v.modes.filter(x=>x!==v.current).map(x=>[x,localStorage.getItem('vc_solo_v1_'+x)]))", {"modes": list(MODES), "current": mode})
                require(evaluate(page, "m => SoloHost.start(m,true,{seed:9000+['expedition','hunt','puzzle','siege','conquest'].indexOf(m),puzzleIndex:0})", mode),
                        f"could not set up real combat for {mode}")
                setup = {
                    "expedition": ["route:battle"],
                    "hunt": ["prep:scout", "prep:forge", "prep:recruit"],
                    "puzzle": [],
                    "siege": ["build:economy"],
                    # 战役征服 v2：节点 id 由种子生成（a<幕>n<序>），改为动态取首个可攻节点
                    "conquest": [],
                }[mode]
                for action in setup:
                    require(evaluate(page, "a => SoloHost.action(a)", action), f"{mode} setup action failed: {action}")
                if mode == "conquest":
                    require(evaluate(page, "() => { const v = SoloModes.view(S.solo, {gold:S.gold}); const c = v.choices.find(x => x.id.startsWith('attack:') && !x.disabled); return c ? SoloHost.action(c.id) : false; }"),
                            "conquest setup action failed: no attackable node")
                if mode == "puzzle":
                    evaluate(page, "() => buy(0)")
                require(evaluate(page, "() => SoloHost.canFight()"), f"{mode} did not become fight-ready")
                started = evaluate(page, "() => { const before={wins:S.stats.wins,losses:S.stats.losses,battles:S.soloBattles}; window.__originalSoloSettle=SoloHost.settle; window.__soloReport=null; SoloHost.settle=(...args)=>{window.__soloReport=args; return window.__originalSoloSettle(...args);}; startBattle(); stopTickLoop(); const deployed=window.__bu.filter(u=>u.side===0).length; const enemies=window.__bu.filter(u=>u.side===1).length; let ticks=0; while(S.phase==='battle'&&ticks<620){currentTick();ticks++;} const aliveAllies=window.__bu.filter(u=>u.side===0&&u.hp>0).length,aliveEnemies=window.__bu.filter(u=>u.side===1&&u.hp>0).length; return {before,deployed,enemies,ticks,phase:S.phase,combatTime:S.soloCombatTime,aliveAllies,aliveEnemies,expectedWin:SoloHost.battleWon(aliveAllies,aliveEnemies)}; }")
                require(started["deployed"] > 0 and started["enemies"] > 0 and started["combatTime"] >= 1000,
                        f"{mode} shared battle did not deploy and advance: {started}")
                require(started["phase"] == "settle", f"{mode} shared battle did not reach result banner: {started}")
                during_banner = evaluate(page, "() => ({hub:SoloHost.openHub(),newRun:SoloHost.start(S.solo.mode,true),phase:S.phase})")
                require(during_banner == {"hub": False, "newRun": False, "phase": "settle"},
                        f"{mode} result banner allowed an unsafe transition: {during_banner}")
                page.wait_for_function("() => S.phase === 'prep'", timeout=5000)
                settled = evaluate(page, "() => { const report=window.__soloReport; SoloHost.settle=window.__originalSoloSettle; const raw=localStorage.getItem('vc_solo_v1_'+S.solo.mode); const before={wins:S.stats.wins,losses:S.stats.losses,battles:S.soloBattles,gold:S.gold,phase:S.solo.phase}; const duplicate=SoloHost.settle(true,0,2); return {report,before,duplicate,stable:raw===localStorage.getItem('vc_solo_v1_'+S.solo.mode),after:{wins:S.stats.wins,losses:S.stats.losses,battles:S.soloBattles,gold:S.gold,phase:S.solo.phase}}; }")
                require(settled["report"] == [started["expectedWin"], started["aliveEnemies"], started["aliveAllies"]],
                        f"{mode} forwarded the wrong battle result: {started}, {settled}")
                require(settled["before"]["battles"] == started["before"]["battles"] + 1,
                        f"{mode} battle did not settle once: {started}, {settled}")
                require(settled["before"]["wins"] + settled["before"]["losses"]
                        == started["before"]["wins"] + started["before"]["losses"] + 1,
                        f"{mode} battle did not record one outcome: {started}, {settled}")
                require(settled["duplicate"] is False and settled["stable"] and settled["after"] == settled["before"],
                        f"{mode} duplicate result altered state: {settled}")
                after_siblings = evaluate(page, "v => Object.fromEntries(v.filter(x=>x!==S.solo.mode).map(x=>[x,localStorage.getItem('vc_solo_v1_'+x)]))", list(MODES))
                require(after_siblings == sibling_saves, f"{mode} battle changed a sibling mode checkpoint")
                battle_results[mode] = {"ticks": started["ticks"], "allies": started["aliveAllies"],
                                        "enemies": started["aliveEnemies"], "phase": settled["before"]["phase"]}

            # A genuine public combat tick reaches the solo settlement adapter once.
            evaluate(page, "() => SoloHost.start('expedition',true,{seed:1942})")
            evaluate(page, "() => SoloHost.action('route:battle')")
            battle = evaluate(page, "() => { startBattle(); for(let i=0;i<20&&S.phase==='battle';i++)currentTick(); const ticks=S.soloCombatTime; const units=window.__bu.length; endBattle(2,0); const after={phase:S.phase,mode:S.solo.mode,battles:S.soloBattles,wins:S.stats.wins,gold:S.gold,soloPhase:S.solo.phase}; const raw=localStorage.getItem('vc_solo_v1_expedition'); const again=SoloHost.settle(true,0,2); return {ticks,units,after,again,rawStable:raw===localStorage.getItem('vc_solo_v1_expedition')}; }")
            require(battle["ticks"] >= 1000 and battle["units"] > 0, f"shared combat did not advance: {battle}")
            require(battle["after"]["mode"] == "expedition" and battle["after"]["battles"] == 1
                    and battle["after"]["wins"] == 1 and battle["after"]["soloPhase"] == "reward",
                    f"expedition battle did not settle exactly once: {battle}")
            require(battle["again"] is False and battle["rawStable"], f"duplicate settle changed the checkpoint: {battle}")
            reward = evaluate(page, "() => { const before=S.gold; const first=SoloHost.action('reward:gold'); const after=S.gold; const second=SoloHost.action('reward:gold'); return {first,second,before,after,final:S.gold,phase:S.solo.phase}; }")
            require(reward["first"] and reward["after"] == reward["before"] + 6 and reward["second"] is False
                    and reward["final"] == reward["after"], f"expedition reward was not one-shot: {reward}")
            page.reload(wait_until="load")
            page.wait_for_function("() => window.SoloHost && window.SoloModes && window.SoloUI")
            reward_resume = evaluate(page, "() => ({resumed:SoloHost.resume('expedition'),gold:S.gold,phase:S.solo.phase,second:SoloHost.action('reward:gold'),final:S.gold})")
            require(reward_resume["resumed"] and reward_resume["gold"] == reward["after"]
                    and reward_resume["second"] is False and reward_resume["final"] == reward["after"],
                    f"expedition reward repeated after reload: {reward_resume}")

            # A hunt retry must restore its exact pre-battle resources and lineup after resume.
            evaluate(page, "() => SoloHost.start('hunt',true,{seed:5512})")
            for action in ("prep:scout", "prep:forge", "prep:recruit"):
                require(evaluate(page, "a => SoloHost.action(a)", action), f"hunt action failed: {action}")
            retry = evaluate(page, "() => { const initial={board:JSON.stringify(S.board),bench:JSON.stringify(S.bench),items:JSON.stringify(S.items),gold:S.gold,boss:S.solo.boss,seed:S.solo.seed}; startBattle(); currentTick(); endBattle(0,3); const failed={phase:S.solo.phase,hp:S.solo.hp,attempts:S.solo.attempts}; const open=SoloHost.openHub(); const resume=SoloHost.resume('hunt'); const action=SoloHost.action('retry:same'); const restored={phase:S.solo.phase,hp:S.solo.hp,attempts:S.solo.attempts,board:JSON.stringify(S.board),bench:JSON.stringify(S.bench),items:JSON.stringify(S.items),gold:S.gold,boss:S.solo.boss,seed:S.solo.seed}; return {initial,failed,open,resume,action,restored}; }")
            require(retry["failed"]["phase"] == "retry" and retry["failed"]["attempts"] == 1 and retry["failed"]["hp"] < 3,
                    f"hunt loss did not enter retry state: {retry}")
            require(retry["open"] and retry["resume"] and retry["action"], f"hunt retry could not survive resume: {retry}")
            for field in ("board", "bench", "items", "gold", "boss", "seed"):
                require(retry["restored"][field] == retry["initial"][field], f"hunt retry changed {field}")
            require(retry["restored"]["phase"] == "fight" and retry["restored"]["attempts"] == 1,
                    f"hunt retry did not resume the same encounter: {retry}")

            # Opening the legacy run menu during battle is safe; exiting to the solo hub is rejected without hiding the panel.
            evaluate(page, "() => { SoloHost.start('hunt',true,{seed:817}); SoloHost.action('prep:scout'); SoloHost.action('prep:forge'); SoloHost.action('prep:recruit'); startBattle(); }")
            menu = evaluate(page, "() => {showGameMenu();return {page:flowPage,phase:S.phase,saveDisabled:$('menuSaveHome').disabled,restartDisabled:$('menuRestart').disabled,endDisabled:$('menuEnd').disabled,clock:S.soloCombatTime};}")
            require(menu["page"] == "gameMenu" and menu["phase"] == "battle" and menu["saveDisabled"]
                    and menu["restartDisabled"] and menu["endDisabled"], f"battle menu offered unsafe actions: {menu}")
            page.wait_for_timeout(450)
            menu_clock = evaluate(page, "() => ({phase:S.phase,clock:S.soloCombatTime})")
            menu_paused = menu_clock == {"phase": "battle", "clock": menu["clock"]}
            evaluate(page, "() => showHelp()")
            help_clock_start = evaluate(page, "() => ({page:flowPage,phase:S.phase,clock:S.soloCombatTime})")
            page.wait_for_timeout(450)
            help_clock_end = evaluate(page, "() => ({page:flowPage,phase:S.phase,clock:S.soloCombatTime})")
            help_paused = help_clock_start == help_clock_end and help_clock_end["page"] == "help"
            evaluate(page, "() => closeHelp()")
            after_exit = evaluate(page, "() => {returnToLiveView();const exit=document.querySelector('#soloPanel [data-action=exit]');exit.click();return {page:flowPage,phase:S.phase,panelHidden:document.querySelector('#soloPanel').hidden,runId:S.runId};}")
            require(after_exit["phase"] == "battle" and after_exit["page"] == "game"
                    and not after_exit["panelHidden"], f"battle exit changed or hid the active run: {after_exit}")
            resumed_clock = evaluate(page, "() => S.soloCombatTime")
            page.wait_for_timeout(350)
            require(evaluate(page, "() => S.phase==='battle' && S.soloCombatTime") > resumed_clock,
                    f"battle clock did not resume after closing the game menu: {resumed_clock}")
            evaluate(page, "() => endBattle(0,1)")

            # The three original slots remain byte-identical and retain their former validators.
            classic_after = evaluate(page, "keys => Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", list(CLASSIC_KEYS))
            require(classic_after == classic_before, "solo actions modified classic normal/daily/arena saves")
            require(evaluate(page, "() => ['vc_save4','vc_daily3','vc_arena3'].every(k=>inspectSave(k).status==='valid')"),
                    "solo actions invalidated a classic save")
            require(evaluate(page, "() => loadGame('vc_arena3') && S.mode==='arena' && ARENA.seats.length===8"),
                    "the legacy arena checkpoint no longer restores its eight-seat match")
            require(evaluate(page, "() => loadGame('vc_daily3') && S.mode==='daily' && S.dseed===todaySeed()"),
                    "the legacy daily checkpoint no longer restores today's seed")
            require(evaluate(page, "() => loadGame('vc_save4') && S.mode==='normal'"),
                    "the legacy normal checkpoint no longer restores")

            # 战役征服 v2：真实引擎驱动的 campaign 集成场景（地图/隔离/幂等/检查点/门控/窄屏）。
            campaign_rows = campaign_suite(page, errors)

            require(not errors, f"browser runtime errors: {errors}")
            require(menu_paused, f"battle clock advanced while the game menu was open: {menu}, {menu_clock}")
            require(help_paused, f"battle clock advanced while help was open: {help_clock_start}, {help_clock_end}")

            print("PASS solo browser integration: five independent saves and reload/resumes; isolated classic slots; deterministic enemy restore; five shared battle-loop settlements and duplicate guards; one-shot reward across reload; hunt retry snapshot; menu/help battle pause and resume; exit guards; normal/daily/arena restore; campaign conquest map/isolation/idempotent settle/act checkpoint/difficulty gating/mobile smoke")
            print("BATTLE_RESULTS " + json.dumps(battle_results, ensure_ascii=False, sort_keys=True))
            print("CAMPAIGN_ASSERTIONS")
            width = max(len(name) for name, _ in campaign_rows)
            for name, detail in campaign_rows:
                print(f"  通过 | {name.ljust(width)} | {detail}")
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
