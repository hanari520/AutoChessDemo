/* 专精通关测试（tools/syn_test.js）：锁定只买某一羁绊/职业棋子的"死忠玩家"机器人，
   检验"任意羁绊阵容都有通关的可能"。购买逻辑复制自 tools/bot_strategy.js，
   差异：商店评分只考虑锁内棋子；其余（装备/升级/roll 车/编队）与普通机器人一致。
   用法：node tools/syn_test.js [每羁绊局数] [羁绊名1 羁绊名2 ...]
        不给羁绊名 = 测全部 22 个；局数默认 30 */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1] + `

;globalThis.API = { get S(){return S}, setS:v=>{S=v},
  get currentTick(){return currentTick},
  byId, buy, pairCount, rollShop, startBattle, clickUnit, getAt, setAt, xpNeed, checkLevel, autoDeploy, autoDeployBest,
  UNITS, FACTIONS, CLASSES };
`;

/* ---------- DOM 桩（与 sim.js 相同，战斗热路径无 getComputedStyle） ---------- */
function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], title: '', textContent: '',
    _ih: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c) { if(this.children.length>200) this.children.shift(); this.children.push(c); return c; },
    removeChild(){}, remove(){},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(){}, setAttribute(){},
    getBoundingClientRect() { return { left: 0, top: 0, width: 58, height: 58 }; },
    closest() { return null; },
  };
  Object.defineProperty(el, 'innerHTML', { get(){ return this._ih; }, set(v){ this._ih = v; } });
  Object.defineProperty(el, 'offsetHeight', { get(){ return 40; } });
  Object.defineProperty(el, 'offsetWidth', { get(){ return 478; } });
  return el;
}
const elCache = {};
const fakeTimers = []; let fakeClock = 0;
global.document = {
  getElementById(id) { return elCache[id] || (elCache[id] = makeEl()); },
  createElement() { return makeEl(); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(){}, elementFromPoint() { return null; },
  body: makeEl(),
};
global.window = global;
global.addEventListener = () => {};
global.localStorage = { _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
global.matchMedia = () => ({ matches: false });
global.requestAnimationFrame = () => 0;
global.innerWidth = 1280; global.innerHeight = 800;
global.Worker = class { postMessage(){} terminate(){} };
global.navigator = { serviceWorker: null };
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = (fn, ms) => { if(fakeTimers.length>20000) fakeTimers.length=0; fakeTimers.push({ t: fakeClock + (ms || 0), fn }); return fakeTimers.length; };
global.clearTimeout = () => {};

(0, eval)(code);
const A = globalThis.API;

/* ---------- 锁羁绊机器人：复制 bot_strategy.js，购买只认锁内棋子 ---------- */
const botSrc = `
function botPrep() {
  if (S.phase !== 'prep') return;
  const LOCK = globalThis.LOCK_SYN;             // Set<棋子id>
  const inLock = u => LOCK.has(u.id);
  const JOB_FRONT = new Set(['守护', '刀客', '狂战']);
  const ownedAll = () => S.board.filter(Boolean).length + S.bench.filter(Boolean).length;
  const lockOwned = () => [...S.board, ...S.bench].filter(u => u && inLock(u)).length;
  // 通用卖出（与 sellSelected 相同的结算，不走选中 UI）：1★ 原价，高星折价并返还卡池
  const sellAt = (zone, i) => {
    const u = getAt(zone, i); if (!u) return false;
    const d = byId(u.id);
    S.gold += (u.star === 1 ? d.cost : Math.pow(3, u.star - 1) * d.cost - (u.star - 1));
    S.pool[u.id] += Math.pow(3, u.star - 1);
    (u.items || []).forEach(k => S.items.push(k));
    setAt(zone, i, null);
    return true;
  };

  // 1) 穿装备：输出装给高攻主C，防御装给前排（与普通机器人一致）
  let guard = 0;
  while (S.items.length > 0 && guard++ < 10) {
    const it = S.items[0];
    const dmgItem = ['sword','staff','bow','vamp'].includes(it);
    let ti = -1, best = -1;
    S.board.forEach((u, i) => {
      if (!u) return; if (!u.items) u.items = [];
      if (u.items.length >= 2) return;
      const d = byId(u.id);
      if (dmgItem && d.job !== '守护' && u.atk > best) { best = u.atk; ti = i; }
      if (!dmgItem && JOB_FRONT.has(d.job) && u.maxhp > best) { best = u.maxhp; ti = i; }
    });
    if (ti < 0) S.board.forEach((u, i) => { if (u && (!u.items || u.items.length < 2) && ti < 0) ti = i; });
    if (ti < 0) break;
    S.selItem = 0; clickUnit('board', ti);
  }
  // 腾位卖出：只卖"锁外棋子"（锁定模式正常不会出现）；锁内散子保留追三
  const sellIdle = () => {
    if (S.bench.filter(x => !x).length > 0) return true;
    let bi = -1, bv = 1e9;
    S.bench.forEach((u, i) => {
      if (!u || u.star !== 1 || pairCount(u.id) >= 2) return;
      if (inLock(u)) return;
      const d = byId(u.id);
      if (d.cost < bv) { bv = d.cost; bi = i; }
    });
    if (bi < 0) return false;
    const u = S.bench[bi], d = byId(u.id);
    S.gold += d.cost; S.pool[u.id] += 1; S.bench[bi] = null; return true;
  };
  // 1.5) 临时替补：全场无人且本回合刷不出可负担的锁内棋子时，买最便宜的过渡卡
  //      （startBattle 要求至少 1 人上场；2 费起步的羁绊第 1 回合商店必然无锁内卡）
  if (ownedAll() === 0 && !S.shop.some(u => u && inLock(u) && u.cost <= S.gold)) {
    let fi = -1, fc = 99;
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i];
      if (u && u.cost <= S.gold && u.cost < fc) { fc = u.cost; fi = i; }
    }
    if (fi >= 0) buy(fi);
  }
  // 2) 购买：只买锁内棋子（对子优先，锁内高费优先于低费）
  const keepGold = S.round <= 1 ? 0 : (S.hp >= 12 ? 8 : 2);
  let bought = true, iterGuard = 0;
  while (bought && iterGuard++ < 40) {
    bought = false;
    let bestI = -1, bestSc = -1;
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || !inLock(u) || u.cost > S.gold - keepGold) continue;
      const pc = pairCount(u.id);
      const sc = (pc >= 2 ? 100 : 50) + u.cost;
      if (sc > bestSc) { bestSc = sc; bestI = i; }
    }
    if (bestI < 0) break;
    const canSlot = S.bench.filter(x => !x).length > 0;
    if (canSlot || pairCount(S.shop[bestI].id) >= 2) { buy(bestI); bought = true; }
    else if (sellIdle()) bought = true;
    else break;
  }
  // 3) 锁内 4-5 费强卡：腾位也要买
  for (let i = 0; i < S.shop.length; i++) {
    const u = S.shop[i]; if (!u || !inLock(u) || u.cost < 4 || u.cost > S.gold - keepGold) continue;
    if (pairCount(u.id) >= 2 || S.bench.filter(x => !x).length > 0) { buy(i); continue; }
    let bi = -1, bv = 1e9;
    S.bench.forEach((b2, j) => {
      if (!b2 || b2.star !== 1 || pairCount(b2.id) >= 2) return;
      const bd = byId(b2.id);
      if (bd.cost < bv) { bv = bd.cost; bi = j; }
    });
    if (bi >= 0) { const b2 = S.bench[bi], bd = byId(b2.id); S.gold += bd.cost; S.pool[b2.id] += 1; S.bench[bi] = null; buy(i); }
  }
  // 3.5) 已有锁内棋子：清掉全部临时替补（先备战席后场上，场上留人以便开战由编队保证）
  if (lockOwned() > 0) {
    let cg = 0;
    while (cg++ < 10) {
      const bi2 = S.bench.findIndex(u => u && !inLock(u));
      if (bi2 >= 0) { sellAt('bench', bi2); continue; }
      const fi2 = S.board.findIndex(u => u && !inLock(u));
      if (fi2 >= 0) { sellAt('board', fi2); continue; }
      break;
    }
  }
  // 4) 升级人口节奏（与普通机器人一致）
  const lvlPlan = { 2:2, 3:3, 5:4, 8:5, 12:6, 16:7, 20:8, 23:9, 25:10 };
  const target = lvlPlan[S.round] || S.lvl;
  for (let k = 0; k < 8 && S.lvl < target; k++) {
    if (S.gold >= 5 + (S.hp >= 12 ? 4 : 2)) { S.gold -= 5; S.xp += 4; checkLevel(); } else break;
  }
  // 5) 富余 roll down：只收锁内棋子
  let rolls = 0;
  while (S.gold >= keepGold + 14 && rolls++ < 25) {
    if (S.bench.filter(x => !x).length === 0 && !sellIdle()) break;
    S.gold -= 2; rollShop();
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || !inLock(u) || u.cost > S.gold - keepGold) continue;
      if (pairCount(u.id) >= 2) buy(i);
      else if (S.bench.filter(x => !x).length > 0 && u.cost >= 3) buy(i);
    }
    if (S.gold >= 30 && S.lvl < 10 && S.gold - 5 >= 14) { S.gold -= 5; S.xp += 4; checkLevel(); }
  }
  // 6) 择优编队
  autoDeployBest();
  renderAll();
}
`
  .replace(/\bS\b/g, 'API.S')
  .replace(/\bbyId\b/g, 'API.byId')
  .replace(/\bpairCount\b/g, 'API.pairCount')
  .replace(/\bbuy\b/g, 'API.buy')
  .replace(/\bclickUnit\b/g, 'API.clickUnit')
  .replace(/\brollShop\b/g, 'API.rollShop')
  .replace(/\bcheckLevel\b/g, 'API.checkLevel')
  .replace(/\bautoDeployBest\b/g, 'API.autoDeployBest')
  .replace(/\brenderAll\b/g, '(() => {})');
(0, eval)(botSrc);
const botPrep = globalThis.botPrep;

/* ---------- 战斗驱动（与 sim.js 相同） ---------- */
function drainTimers() {
  fakeTimers.sort((a, b) => a.t - b.t);
  while (fakeTimers.length && fakeTimers[0].t <= fakeClock) {
    const { fn } = fakeTimers.shift();
    fn();
  }
}
function driveBattle(maxTicks = 640) {
  let used = 0;
  for (let i = 0; i < maxTicks && A.S.phase === 'battle'; i++) {
    fakeClock += 100;
    API.currentTick();
    drainTimers();
    used = i + 1;
  }
  drainTimers();
  fakeClock += 3000;
  drainTimers();
  fakeTimers.length = 0;
  return used * 100;
}

/* ---------- 锁定名单 ---------- */
const A_ = A;
const allSyn = [];
Object.keys(A_.FACTIONS).forEach(k => allSyn.push(k));
Object.keys(A_.CLASSES).forEach(k => allSyn.push(k));
const argv = process.argv.slice(2);
const N = parseInt(argv[0] || '30', 10);
const targets = argv.length > 1
  ? argv.slice(1).filter(n => allSyn.includes(n) || (console.log(`⚠ 未知羁绊：${n}，已跳过`), false))
  : allSyn;

/* ---------- 主循环 ---------- */
const t0 = Date.now();
const report = [];
for (const syn of targets) {
  const lockIds = new Set(A_.UNITS.filter(u => u.fac === syn || u.job === syn).map(u => u.id));
  globalThis.LOCK_SYN = lockIds;
  let wins = 0; const lossRounds = [];
  for (let g = 0; g < N; g++) {
    (0, eval)('newGame()');
    let outcome = null;
    for (let guard = 0; guard < 40; guard++) {
      botPrep();
      (0, eval)('startBattle')();
      driveBattle();
      if (process.env.DBG) console.log(`  [dbg] r${A.S.round} hp=${A.S.hp} phase=${A.S.phase} lvl=${A.S.lvl} 场上=${A.S.board.filter(Boolean).length} bench=${A.S.bench.filter(Boolean).length} gold=${A.S.gold}`);
      if (A.S.phase === 'over') {
        const ovT = String(global.document.getElementById('ovTitle').textContent || '');
        outcome = { win: ovT.includes('通关'), round: A.S.round };
        break;
      }
    }
    if (outcome && outcome.win) wins++;
    else if (outcome) lossRounds.push(outcome.round);
  }
  const lossDist = {};
  lossRounds.forEach(r => lossDist[r] = (lossDist[r] || 0) + 1);
  report.push({ syn, wins, n: N, rate: wins / N * 100, lossDist, members: lockIds.size });
}
console.log(`\n=== 专精通关测试（每羁绊 N=${N}，锁定只买该羁绊棋子） ===`);
report.sort((a, b) => b.rate - a.rate);
for (const r of report) {
  const bar = '█'.repeat(Math.round(r.rate / 5));
  const dist = Object.entries(r.lossDist).map(([k, v]) => `r${k}×${v}`).join(' ') || '—';
  console.log(`${r.syn.padEnd(5)} ${r.members}人  通关 ${(r.rate.toFixed(1) + '%').padStart(6)} ${bar}`);
  if (r.rate < 50) console.log(`      失败回合: ${dist}`);
}
const rates = report.map(r => r.rate);
const min = report[report.length - 1];
console.log(`\n汇总：最高 ${rates[0].toFixed(1)}%  最低 ${min.syn} ${min.rate.toFixed(1)}%  中位 ${rates[Math.floor(rates.length / 2)].toFixed(1)}%  耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const weak = report.filter(r => r.rate < 20);
if (weak.length) console.log(`⚠ 低于 20%（系统性歧视线）：${weak.map(r => `${r.syn} ${r.rate.toFixed(1)}%`).join('、')}`);
