"""Browser proof for the three fixed solo puzzles using real buy/startBattle/currentTick.

Run: python tools/solo-puzzle-proof.py
Serves this checkout on localhost:8081 when no server is already listening.
Each puzzle uses a fresh browser context; search is deterministic with seed 20260924.
"""
from __future__ import annotations

import json
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
PORT = 8081


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


def ensure_server():
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", PORT)) == 0:
            return None
    server = ThreadingHTTPServer(("127.0.0.1", PORT), QuietHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


SEARCH_JS = r"""({ puzzle, maxTrials }) => {
  window.confirm = () => true;
  const started = SoloHost.start('puzzle', true, {seed:20260924,puzzleIndex:puzzle});
  if (!started) throw new Error('SoloHost.start failed');
  const candidates = S.solo.candidates.slice();
  const unitInfo = candidates.map(id => {
    const d=UNITS.find(x=>x.id===id);
    return {id,valid:!!d,name:d?.name,job:d?.job,cost:d?.cost};
  });
  const enemy = S.enemyBoard.map((u,i)=>u&&({id:u.id,name:byId(u.id).name,job:byId(u.id).job,x:i%8,y:Math.floor(i/8),boss:!!u.boss,mechanic:u.soloMechanic||null})).filter(Boolean);
  const objective = SoloModes.view(S.solo).objective;
  const description = SoloModes.view(S.solo).enemyHint;
  const base = JSON.stringify(S);
  ARENA_SILENT = true;
  showResultBanner = (_won, cb) => cb();
  const combos = [];
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<6;c++)for(let d=c+1;d<6;d++) {
    const ids=[a,b,c,d], cost=ids.reduce((sum,i)=>sum+unitInfo[i].cost,0);
    if(cost<=12) combos.push({ids,cost});
  }
  const formations = [[3,4,2,5],[0,1,2,3],[7,6,5,4],[2,3,4,5]];
  const results=[]; let trials=0;
  for(const combo of combos) for(let f=0;f<formations.length;f++) {
    if(trials>=maxTrials) break;
    S=JSON.parse(base); S.soloRetry=null; S.phase='prep';
    const chosen=[];
    for(let j=0;j<combo.ids.length;j++) {
      const candidate=unitInfo[combo.ids[j]];
      const shopIndex=S.shop.findIndex(x=>x?.id===candidate.id);
      if(shopIndex<0) throw new Error('Missing puzzle shop candidate: '+candidate.id);
      buy(shopIndex);
      const benchIndex=S.bench.findIndex(x=>x?.id===candidate.id);
      if(benchIndex<0) throw new Error('Buy did not add candidate: '+candidate.id);
      const u=S.bench[benchIndex]; S.bench[benchIndex]=null;
      const y = ['守护','刀客','狂战'].includes(candidate.job) ? 4 : candidate.job==='刺客' ? 7 : 6;
      let x=formations[f][j], pos=y*8+x;
      while(S.board[pos]) {x=(x+1)%8;pos=y*8+x;}
      S.board[pos]=u;
      chosen.push({id:u.id,x,y,cost:candidate.cost});
    }
    if(S.gold!==12-combo.cost || S.board.filter(Boolean).length!==4) throw new Error('Illegal budget/population');
    prepEnemy();
    startBattle(); stopTickLoop();
    if(S.phase!=='battle') throw new Error('Battle did not start');
    let ticks=0;
    while(S.phase==='battle' && ticks<640) {currentTick();ticks++;}
    stopTickLoop();
    const won=S.solo.outcome==='won'||S.solo.phase==='complete';
    results.push({chosen,formation:f,ticks,won,phase:S.solo.phase,enemySurvivors:window.__bu.filter(u=>u.side===1&&u.hp>0).length,
      playerSurvivors:window.__bu.filter(u=>u.side===0&&u.hp>0).length});
    trials++;
    if(won) return {puzzle,candidates:unitInfo,enemy,description,objective,trials,proof:results[results.length-1],sampleLoss:results.find(x=>!x.won)};
  }
  return {puzzle,candidates:unitInfo,enemy,description,objective,trials,proof:null,best:results.sort((a,b)=>a.enemySurvivors-b.enemySurvivors)[0]};
}"""


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    server = ensure_server()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                headless=True,
                args=["--disable-background-timer-throttling"],
            )
            try:
                for puzzle in range(3):
                    context = browser.new_context(viewport={"width": 1365, "height": 900})
                    page = context.new_page()
                    page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
                    page.wait_for_function("!!window.SoloHost && !!window.SoloModes", timeout=10000)
                    report = page.evaluate(SEARCH_JS, {"puzzle": puzzle, "maxTrials": 60})
                    print(json.dumps(report, ensure_ascii=False))
                    if not all(candidate["valid"] for candidate in report["candidates"]):
                        raise AssertionError(f"Puzzle {puzzle + 1} contains missing unit IDs")
                    if not report["proof"]:
                        raise AssertionError(f"Puzzle {puzzle + 1} has no proven solution")
                    context.close()
            finally:
                browser.close()
    finally:
        if server:
            server.shutdown()


if __name__ == "__main__":
    main()
