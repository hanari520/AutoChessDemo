"""Daily challenge integration acceptance: 14-rule availability, 4x25 run, and save/rank isolation."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    errors = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, channel="msedge")
            context = browser.new_context(viewport={"width": 1366, "height": 768})
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/index.html", wait_until="load")
            page.wait_for_function("() => window.DailyCurses && typeof S !== 'undefined' && typeof startConfiguredRun === 'function'", timeout=15000)

            catalog = page.evaluate("() => DailyCurses.CATALOG.map(c=>({id:c.id,name:c.name,limit:c.limit,compensation:c.compensation,timing:c.timing}))")
            require(len(catalog) == 14, f"expected 14 daily curse definitions, got {len(catalog)}")
            require(len({row["id"] for row in catalog}) == 14, "daily curse IDs are not unique")
            require(all(all(row.get(k) for k in ("name", "limit", "compensation", "timing")) for row in catalog),
                    "a daily rule is missing player-facing limit/compensation/timing")

            # Protect the two unrelated save domains while the daily slot is created and finished.
            page.evaluate("""() => {
              S.auto=false; S.autoFight=false; autoStoreSet(false); afStoreSet(false);
              startConfiguredRun({mode:'normal'}, {confirmed:true}); saveGame();
              const normal=localStorage.getItem('vc_save4');
              startConfiguredRun({mode:'arena'}, {confirmed:true}); saveGame();
              const arena=localStorage.getItem('vc_arena3');
              window.__dailySentinels={normal,arena};
            }""")
            started = page.evaluate("""() => {
              const ok=startConfiguredRun({mode:'daily',dailySeed:todaySeed()}, {confirmed:true});
              S.auto=false; S.autoFight=false; autoStoreSet(false); afStoreSet(false);
              return {ok,mode:S.mode,daily:S.daily,seed:S.dseed,today:todaySeed(),limit:runLimit(),chapterLength:chLen(),
                rule:S.dailyCurse||null,curses:S.curses,save:localStorage.getItem('vc_daily3')};
            }""")
            require(started["ok"] and started["mode"] == "daily" and started["daily"], f"daily run failed to start: {started}")
            require(started["seed"] == started["today"], f"daily run did not use today's seed: {started}")
            require(started["limit"] == 100 and started["chapterLength"] == 25,
                    f"daily run is not four 25-round chapters: {started}")
            rule_before = page.evaluate("() => DailyCurses.pick(S.dseed).id")
            require(started["rule"] and started["rule"]["id"] == rule_before and started["rule"]["version"] == 2,
                    f"daily state did not pin the selected v2 rule: {started}")
            page.evaluate("""() => {
              const seed=S.dseed;
              const a=DailyCurses.pick(seed), b=DailyCurses.pick(seed);
              if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('same-day rule pick changed');
              if(dailyCursesFor(seed)?.[0]!==a.id||S.dailyCurse?.id!==a.id)
                throw new Error('daily mode does not use the selected daily rule');
              if((S.curses||[]).length!==1||S.curses[0]!==a.id)
                throw new Error('daily must keep exactly its catalog id in S.curses (daily100 rank contract requires curses=1)');
              saveGame();
            }""")
            require(page.evaluate("() => localStorage.getItem('vc_daily3')") is not None,
                    "daily start did not create its own save slot")
            saved_rule = page.evaluate("() => JSON.parse(localStorage.getItem('vc_daily3')).dailyCurse")
            require(saved_rule and saved_rule["id"] == rule_before and saved_rule["version"] == 2,
                    f"daily save did not persist the pinned rule state: {saved_rule}")

            progression = page.evaluate("""() => {
              const chapters=[]; let settled=0;
              for(let round=1; round<=100; round++) {
                if(S.phase==='over'||S.round!==round)throw new Error(`stopped before round ${round}`);
                S.auto=false; S.autoFight=false; S.phase='battle'; endBattle(1,0); settled++;
                if([25,50,75].includes(round)) {
                  if(S.phase!=='chapter'||!S.settleOffer?.length)throw new Error(`missing chapter reward at round ${round}`);
                  chapters.push(Math.ceil(S.round/chLen())); pickAug(0); chapterContinue();
                  if(S.phase!=='prep'||S.round!==round+1)throw new Error(`chapter ${round} did not continue to the next prep`);
                }
              }
              return {chapters,settled,phase:S.phase,round:S.round,finished:S.finished};
            }""")
            chapters = progression["chapters"]
            require(progression == {"chapters": [1, 2, 3], "settled": 100, "phase": "over", "round": 100, "finished": True},
                    f"daily progression did not complete four chapters/100 battles: {progression}")
            final = page.evaluate("""() => ({phase:S.phase,round:S.round,finished:S.finished,mode:S.mode,daily:S.daily,
              runLimit:runLimit(),ranked:rankedRun(),save:localStorage.getItem('vc_daily3'),
              history:JSON.parse(localStorage.getItem('vc_history')||'[]').find(x=>x.runId===S.runId),
              resultText:document.getElementById('finalReport')?.textContent||''})""")
            require(final["phase"] == "over" and final["finished"] is True and final["round"] == 100,
                    f"daily did not end in a 100-round win: {final}")
            require(final["ranked"] is True and final["history"] and final["history"]["rules"] == "daily100",
                    f"daily result was not recorded as daily100 and rank eligible: {final}")
            finished_save = json.loads(final["save"]) if final["save"] else None
            require(finished_save is None or finished_save.get("resumable") is False,
                    "finished daily run left a resumable daily save")
            require(page.evaluate("x => localStorage.getItem('vc_save4')===x.normal && localStorage.getItem('vc_arena3')===x.arena", page.evaluate("() => __dailySentinels")),
                    "daily run changed the normal or arena save slot")

            # Same-day restart picks the same curse; daily records do not contaminate custom/normal rules.
            page.evaluate("() => startConfiguredRun({mode:'daily',dailySeed:todaySeed()}, {confirmed:true})")
            require(page.evaluate("x => DailyCurses.pick(S.dseed).id===x && S.dseed===todaySeed()", rule_before),
                    "same-day restart changed the daily curse")
            page.evaluate("() => { S.auto=false; S.autoFight=false; showHome(); startConfiguredRun({mode:'normal'}, {confirmed:true}); }")
            require(page.evaluate("() => S.mode==='normal'&&!S.daily&&runLimit()===100&&rankedRun()"),
                    "ordinary campaign inherited daily state or lost its ranking eligibility")
            page.evaluate("() => { S.auto=false; S.autoFight=false; showHome(); startConfiguredRun({mode:'custom',curses:['solo']}, {confirmed:true}); }")
            custom = page.evaluate("() => ({mode:S.mode,daily:S.daily,dailyRule:S.dailyCurse||null,curses:S.curses.slice(),ranked:rankedRun(),dailySave:localStorage.getItem('vc_daily3')})")
            require(custom["mode"] == "custom" and custom["daily"] is False and "solo" in custom["curses"] and custom["ranked"] is False,
                    f"custom curse mode behavior changed: {custom}")
            require(custom["dailyRule"] is None, f"custom mode inherited a daily-only rule: {custom}")
            require(custom["dailySave"] is not None, "custom mode modified the daily save slot")
            require(not errors, f"browser runtime errors: {errors[:5]}")
            print("PASS daily100 browser: 14 rule catalog metadata; deterministic same-day curse; 4 chapter transitions; 100-round terminal result; daily ranking/history; normal/arena/daily save isolation; normal/custom regression")
            print("CHAPTERS " + json.dumps(chapters))
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
