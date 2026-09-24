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
                    "conquest": ["attack:mine"],
                }[mode]
                for action in setup:
                    require(evaluate(page, "a => SoloHost.action(a)", action), f"{mode} setup action failed: {action}")
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
            require(not errors, f"browser runtime errors: {errors}")
            require(menu_paused, f"battle clock advanced while the game menu was open: {menu}, {menu_clock}")
            require(help_paused, f"battle clock advanced while help was open: {help_clock_start}, {help_clock_end}")

            print("PASS solo browser integration: five independent saves and reload/resumes; isolated classic slots; deterministic enemy restore; five shared battle-loop settlements and duplicate guards; one-shot reward across reload; hunt retry snapshot; menu/help battle pause and resume; exit guards; normal/daily/arena restore")
            print("BATTLE_RESULTS " + json.dumps(battle_results, ensure_ascii=False, sort_keys=True))
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
