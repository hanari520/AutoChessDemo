"""Browser regression for the run lifecycle; also saves the required viewport evidence."""
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
BASE = "http://127.0.0.1:8081/index.html"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def save_shot(page, name):
    path = OUT / f"game-flow-{STAMP}-{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"SCREENSHOT {path}")


def ui_metrics(page):
    return page.evaluate("""() => {
      const id = ({home:'flowHome',setup:'flowSetup',help:'flowHelp',gameMenu:'flowGameMenu',confirm:'flowConfirm',chapter:'flowChapter',result:'flowResult'})[flowPage];
      const p = document.getElementById(id), r = p && p.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        bodyScrollWidth:document.body.scrollWidth,page:flowPage,
        rect:r&&{left:r.left,right:r.right,top:r.top,bottom:r.bottom},
        scrollHeight:p&&p.scrollHeight,clientHeight:p&&p.clientHeight};
    }""")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="msedge")
    errors = []

    # The first-run home is captured in all requested dimensions, including touch layouts.
    for width, height, label, mobile in [
        (1366, 768, "home-1366x768", False),
        (390, 844, "home-390x844", True),
        (740, 360, "home-740x360", True),
    ]:
        context = browser.new_context(viewport={"width": width, "height": height}, is_mobile=mobile,
                                      has_touch=mobile, device_scale_factor=1)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until="networkidle")
        page.locator("#flowHome").wait_for(state="visible")
        require(not page.locator("#homeContinue").is_visible(), f"no-save home exposed continue at {width}x{height}")
        metrics = ui_metrics(page)
        require(metrics["scrollWidth"] <= width + 1 and metrics["bodyScrollWidth"] <= width + 1,
                f"horizontal page overflow at {width}x{height}: {metrics}")
        require(metrics["rect"]["left"] >= -1 and metrics["rect"]["right"] <= width + 1,
                f"home card is outside viewport at {width}x{height}: {metrics}")
        require(metrics["scrollHeight"] <= metrics["clientHeight"] + 2,
                f"home content is clipped at {width}x{height}: {metrics}")
        save_shot(page, label)
        context.close()

    context = browser.new_context(viewport={"width": 1366, "height": 768})
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    page.locator("#flowHome").wait_for(state="visible")
    require(page.evaluate("() => flowPage === 'home' && S.menuPreview && S.phase === 'prep'"),
            "startup must show a non-persisted menu preview, not create a run")

    # Help/setup cancellation is presentation-only.
    initial = page.evaluate("() => ({run:S.runId,session:runSessionId,history:localStorage.getItem('vc_history')})")
    page.locator("#homeHelp").click()
    require(page.evaluate("() => flowPage === 'help'"), "help did not open")
    page.keyboard.press("Escape")
    require(page.evaluate("() => flowPage === 'home'"), "Escape from help did not return home")
    page.locator("#homeNew").click()
    page.locator("#setupModes [data-mode='custom']").click()
    page.locator("#setupBack").click()
    require(page.evaluate("(x) => S.runId === x.run && runSessionId === x.session && localStorage.getItem('vc_history') === x.history", initial),
            "closing help or setup changed the run/history")

    # Create a normal run through the explicit UI; its first render writes a checkpoint.
    page.locator("#homeNew").click()
    save_shot(page, "setup-1366x768")
    page.locator("#setupStart").click()
    require(page.evaluate("() => flowPage === 'game' && S.mode === 'normal' && !S.menuPreview"),
            "explicit start did not create a normal run")
    run_id = page.evaluate("() => S.runId")
    raw = page.evaluate("() => localStorage.getItem('vc_save4')")
    require(raw is not None and page.evaluate("() => inspectSave('vc_save4').status === 'valid'"),
            "normal run did not persist a valid checkpoint")
    save_shot(page, "game-1366x768")

    # Invalid read is isolated; the active object and existing storage survive unchanged.
    invalid = page.evaluate("""(raw) => {
      const active=S, round=S.round, saved=localStorage.getItem('vc_save4');
      localStorage.setItem('vc_save4','{broken');
      const ok=loadGame('vc_save4'), unchanged=S===active&&S.round===round;
      localStorage.setItem('vc_save4',saved);
      return {ok,unchanged,stored:localStorage.getItem('vc_save4')===saved};
    }""", raw)
    require(invalid == {"ok": False, "unchanged": True, "stored": True}, f"invalid save mutated the run: {invalid}")

    # Legacy slot shape remains readable and is upgraded only when a later checkpoint is written.
    legacy = page.evaluate("""() => {
      const d=JSON.parse(localStorage.getItem('vc_save4'));
      ['schemaVersion','mode','runConfig','runId','savedAt','resumable','recoverablePhase'].forEach(k=>delete d[k]);
      d.auto=true;d.autoFight=true;localStorage.setItem('vc_save4',JSON.stringify(d));
      const before=runSessionId, ok=loadGame('vc_save4');
      const valid=ok&&S.mode==='normal'&&S.runConfig.mode==='normal'&&!S.auto&&!S.autoFight&&runSessionId===before+1;
      if(ok)saveGame();
      const upgraded=JSON.parse(localStorage.getItem('vc_save4'));
      return {valid,run:S.runId,upgraded:upgraded.schemaVersion===2&&!!upgraded.runId&&!!upgraded.savedAt};
    }""")
    require(legacy["valid"] and legacy["upgraded"], f"legacy save compatibility failed: {legacy}")
    require(page.evaluate("(id) => S.runId === id", legacy["run"]), "legacy migration changed the synthesized identity")
    page.evaluate("() => renderAll()")
    checkpoint = page.evaluate("() => localStorage.getItem('vc_save4')")

    # A failed write cannot report save success or take the player out of the run menu.
    page.locator("#resetBtn").click()
    page.evaluate("""() => {
      window.__oldSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k==='vc_save4')throw new Error('quota test');return window.__oldSetItem.call(this,k,v);};
    }""")
    page.locator("#menuSaveHome").click()
    require(page.evaluate("() => flowPage === 'gameMenu' && /没有保存成功/.test(document.getElementById('menuPhaseNotice').textContent)"),
            "failed save was reported as success or left the run")
    require(page.evaluate("(raw) => localStorage.getItem('vc_save4') === raw", checkpoint),
            "failed save overwrote the prior checkpoint")
    page.evaluate("() => {Storage.prototype.setItem=window.__oldSetItem;delete window.__oldSetItem;}")
    page.locator("#menuResume").click()

    # Automatic battle timer pauses in modal UI and resumes with its remaining delay.
    page.evaluate("() => {S.autoFight=true;S.auto=false;scheduleAutoFight(12000);window.__afEnd=afDeadline;}")
    page.locator("#resetBtn").click()
    held = page.evaluate("() => ({deadline:afDeadline,left:flowPausedSchedulers&&flowPausedSchedulers.autoFightLeft})")
    require(held["deadline"] == 0 and 10000 <= held["left"] <= 12000, f"auto-battle timer did not pause: {held}")
    page.locator("#menuResume").click()
    remaining = page.evaluate("() => afDeadline-Date.now()")
    require(10000 <= remaining <= 12000, f"auto-battle timer did not resume with remaining time: {remaining}")
    page.evaluate("() => {S.autoFight=false;cancelAutoFight();}")

    # Bot/autoplay timeout is invalidated while the menu is open; it cannot mutate the run later.
    page.evaluate("() => {S.auto=true;autoStoreSet(true);autoPilot(5000);}")
    page.locator("#resetBtn").click()
    paused = page.evaluate("() => ({auto:flowPausedSchedulers&&flowPausedSchedulers.auto,busy:autoBusy})")
    require(paused["auto"] and not paused["busy"], f"autoplay was not invalidated: {paused}")
    round_before = page.evaluate("() => S.round")
    page.evaluate("() => {S.auto=false;autoStoreSet(false);}")
    page.locator("#menuResume").click()
    page.wait_for_timeout(300)
    require(page.evaluate("(r) => S.round === r && S.phase === 'prep'", round_before), "stale autoplay callback changed the run")

    # Enter a real chapter reward phase from the engine boundary, then verify menu/help return semantics.
    page.evaluate("() => {S.round=25;S.phase='battle';endBattle(1,0);}")
    require(page.evaluate("() => S.phase === 'chapter' && flowPage === 'chapter'"), "boss settlement did not open chapter page")
    save_shot(page, "chapter-1366x768")
    require(page.locator("#chapterContinue").is_disabled(), "chapter could continue without choosing an augment")
    page.evaluate("() => {S.auto=true;autoStoreSet(true);scheduleChapterAuto(10000);}")
    page.locator("#chapterHelp").click()
    timer_state = page.evaluate("() => ({page:flowPage,pending:chapterAutoPending,timer:chapterAutoTimer})")
    require(timer_state["page"] == "help" and timer_state["pending"] and timer_state["timer"] is None,
            f"chapter autoplay did not pause for help: {timer_state}")
    page.locator("#flowHelpClose").click()
    page.evaluate("() => {S.auto=false;autoStoreSet(false);}")
    page.wait_for_timeout(350)
    require(page.evaluate("() => flowPage === 'chapter' && S.phase === 'chapter'"), "help close advanced or hid the chapter")
    page.locator("#chapterMenu").click()
    require(page.locator("#menuRestart").is_disabled() and page.locator("#menuEnd").is_disabled()
            and page.locator("#menuSaveHome").is_disabled(), "chapter menu exposed prep-only actions")
    page.locator("#menuResume").click()
    require(page.evaluate("() => flowPage === 'chapter'"), "return from the run menu hid the chapter page")
    page.locator("#chapterBody [data-aug]").first.click()
    page.locator("#chapterContinue").click()
    require(page.evaluate("() => S.phase === 'prep' && S.round === 26 && flowPage === 'game'"),
            "chapter reward choice did not continue to the next preparation phase")

    # Execute one scheduled automatic battle; the old session must stop at a single transition.
    page.evaluate("() => {botPrep();if(!S.board.some(Boolean)){buy(0);autoDeploy();}S.autoFight=true;scheduleAutoFight(100);}")
    page.wait_for_function("() => S.phase === 'battle'", timeout=5000)
    require(page.evaluate("() => S.phase === 'battle' && flowPage === 'game'"), "automatic battle did not start")
    page.evaluate("() => {stopTickLoop();S.autoFight=false;cancelAutoFight();endBattle(1,0);}")
    require(page.evaluate("() => S.phase === 'prep' && S.round === 27"), "manual cleanup after scheduled battle failed")

    # Cancel leaves every persistent field untouched; accepting restart twice is idempotent and records no history.
    page.locator("#resetBtn").click()
    page.locator("#menuEnd").click()
    cancel_before = page.evaluate("() => ({run:S.runId,round:S.round,stats:JSON.stringify(S.stats),save:localStorage.getItem('vc_save4'),history:localStorage.getItem('vc_history')})")
    save_shot(page, "confirm-1366x768")
    page.locator("#flowConfirmCancel").click()
    cancel_after = page.evaluate("() => ({run:S.runId,round:S.round,stats:JSON.stringify(S.stats),save:localStorage.getItem('vc_save4'),history:localStorage.getItem('vc_history'),page:flowPage})")
    require(all(cancel_after[k] == cancel_before[k] for k in ("run", "round", "stats", "save", "history"))
            and cancel_after["page"] == "game", "canceling settlement changed run data")
    page.locator("#resetBtn").click()
    page.locator("#menuRestart").click()
    restart_before = page.evaluate("() => ({run:S.runId,mode:S.mode,curses:JSON.stringify(S.curses),round:S.round,history:localStorage.getItem('vc_history'),session:runSessionId})")
    page.locator("#flowConfirmCancel").click()
    require(page.evaluate("(x) => S.runId===x.run&&S.round===x.round&&localStorage.getItem('vc_history')===x.history", restart_before),
            "canceling restart mutated game/history")
    page.locator("#resetBtn").click(); page.locator("#menuRestart").click()
    page.evaluate("() => {acceptFlowConfirm();acceptFlowConfirm();}")
    restarted = page.evaluate("(x) => ({once:runSessionId===x.session+1&&S.runId!==x.run,mode:S.mode,curses:JSON.stringify(S.curses),round:S.round,history:localStorage.getItem('vc_history')===x.history})", restart_before)
    require(restarted["once"] and restarted["mode"] == restart_before["mode"]
            and restarted["curses"] == restart_before["curses"] and restarted["round"] == 1 and restarted["history"],
            f"restart lost config, duplicated, or recorded abandoned run: {restarted}")

    # Early finish keeps the existing normal leaderboard eligibility, records exactly once, and is not resumable.
    hist_before = page.evaluate("() => JSON.parse(localStorage.getItem('vc_history')||'[]').length")
    page.locator("#resetBtn").click(); page.locator("#menuEnd").click()
    page.locator("#flowConfirmAccept").click()
    result = page.evaluate("() => ({phase:S.phase,page:flowPage,ranked:rankedRun(),finalized:S.finalized,history:JSON.parse(localStorage.getItem('vc_history')||'[]').length,save:inspectSave('vc_save4').status})")
    require(result["phase"] == "over" and result["page"] == "result" and result["ranked"]
            and result["finalized"] and result["history"] == hist_before + 1 and result["save"] != "valid",
            f"early finish did not settle with existing rank/save semantics: {result}")
    save_shot(page, "result-1366x768")
    page.evaluate("() => {endRunEarly();gameOver(false);}")
    require(page.evaluate("(n) => JSON.parse(localStorage.getItem('vc_history')||'[]').length===n", hist_before + 1),
            "repeated terminal callback wrote duplicate history")
    page.locator("#resultReplay").click()
    require(page.evaluate("() => flowPage === 'game' && S.mode === 'normal' && S.round === 1"), "result replay did not reuse the finished run mode")
    page.locator("#resetBtn").click(); page.locator("#menuEnd").click(); page.locator("#flowConfirmAccept").click()
    page.locator("#resultHome").click()
    require(page.evaluate("() => flowPage === 'home'"), "result did not return to the main menu")

    # Custom is a separate draft, shares only the normal slot, and cannot touch the arena slot.
    arena_sentinel = "unrelated-arena-record"
    page.evaluate("(v) => localStorage.setItem('vc_arena3',v)", arena_sentinel)
    page.locator("#homeNew").click()
    page.locator("#setupModes [data-mode='custom']").click()
    curse = page.locator("#setupCursePick input:not([disabled])").first
    curse_id = curse.get_attribute("data-curse")
    curse.check()
    page.locator("#setupStart").click()
    require(page.evaluate("(v) => S.mode==='custom'&&S.curses.length===1&&localStorage.getItem('vc_arena3')===v", arena_sentinel),
            "custom start lost its draft or modified another mode's slot")
    custom_raw = page.evaluate("() => localStorage.getItem('vc_save4')")
    page.locator("#resetBtn").click(); page.locator("#menuEnd").click(); page.locator("#flowConfirmAccept").click()
    custom_result = page.evaluate("() => ({ranked:rankedRun(),history:JSON.parse(localStorage.getItem('vc_history')||'[]').at(0),page:flowPage})")
    require(not custom_result["ranked"] and custom_result["history"]["forfeited"]
            and custom_result["history"]["curses"] == 1, f"custom early finish changed rank/history rules: {custom_result}")
    page.locator("#resultHome").click()

    # An expired daily save is explained and retained; canceling replacement keeps its bytes intact.
    expired = page.evaluate("""(raw) => {
      const d=JSON.parse(raw); d.mode='daily';d.daily=true;d.arena=false;d.curses=[];
      d.dseed=todaySeed()+999999;d.runConfig={mode:'daily',curses:[],dailySeed:d.dseed};
      localStorage.setItem('vc_daily3',JSON.stringify(d));
      const saved=localStorage.getItem('vc_daily3');showHome();
      return {status:inspectSave('vc_daily3').status,kept:localStorage.getItem('vc_daily3')===saved,
        explained:document.getElementById('homeSaves').textContent.includes('已过期')};
    }""", custom_raw)
    require(expired["status"] == "expired" and expired["kept"] and expired["explained"],
            f"expired daily save was deleted or unexplained: {expired}")
    page.locator("#homeNew").click(); page.locator("#setupModes [data-mode='daily']").click()
    page.locator("#setupStart").click()
    daily_before_cancel = page.evaluate("() => localStorage.getItem('vc_daily3')")
    require(page.evaluate("() => flowPage === 'confirm'"), "daily overwrite was not confirmed")
    page.locator("#flowConfirmCancel").click()
    require(page.evaluate("(x) => flowPage==='setup'&&localStorage.getItem('vc_daily3')===x", daily_before_cancel),
            "canceling daily overwrite removed the expired save")
    page.locator("#setupStart").click(); page.locator("#flowConfirmAccept").click()
    daily = page.evaluate("() => ({mode:S.mode,seed:S.dseed,today:todaySeed(),normal:inspectSave('vc_save4').status,arena:localStorage.getItem('vc_arena3')})")
    require(daily["mode"] == "daily" and daily["seed"] == daily["today"] and daily["arena"] == arena_sentinel,
            f"daily mode failed to use today's seed or touched another slot: {daily}")
    page.locator("#resetBtn").click(); page.locator("#menuRestart").click()
    before_daily_restart = page.evaluate("() => ({seed:S.dseed,history:localStorage.getItem('vc_history')})")
    page.locator("#flowConfirmCancel").click()
    require(page.evaluate("(x) => S.mode==='daily'&&S.dseed===x.seed&&localStorage.getItem('vc_daily3')!==null&&localStorage.getItem('vc_history')===x.history", before_daily_restart),
            "canceling daily restart changed its mode/save/history")
    # Return to home safely, then create the independent arena slot and verify its existing forfeiture placement.
    page.evaluate("() => {S.auto=false;S.autoFight=false;cancelAutoFight();showHome();localStorage.removeItem('vc_arena3');}")
    page.locator("#homeNew").click(); page.locator("#setupModes [data-mode='arena']").click(); page.locator("#setupStart").click()
    require(page.evaluate("() => S.mode==='arena'&&ARENA&&ARENA.seats.length===8&&inspectSave('vc_arena3').status==='valid'"),
            "arena run did not use its independent slot and eight-seat match")
    page.locator("#resetBtn").click(); page.locator("#menuEnd").click(); page.locator("#flowConfirmAccept").click()
    arena = page.evaluate("() => ({page:flowPage,mode:S.mode,place:ARENA.seats[0].place,forfeited:ARENA.seats[0].forfeited,ranked:rankedRun(),record:JSON.parse(localStorage.getItem('vc_history')||'[]')[0]})")
    require(arena["page"] == "result" and arena["mode"] == "arena" and arena["place"] == 8
            and arena["forfeited"] and not arena["ranked"] and arena["record"]["place"] == 8,
            f"arena early finish changed existing placement semantics: {arena}")

    require(not errors, f"browser uncaught errors: {errors[:5]}")
    print("PASS lifecycle: independent slots, mode drafts, legacy read, invalid-read rollback, write failure, daily expiry, chapter, autoplay/auto-battle, cancellation, restart idempotency, early settlement and arena placement")
    print("PASS viewports: 1366x768, 390x844, 740x360; no horizontal overflow or clipped home cards")
    browser.close()
