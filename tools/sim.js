/* 无头模拟器：加载 index.html 的游戏脚本，用 DOM 桩跑真实战斗逻辑，
   由"普通玩家"机器人代打，统计各章守关通过率（r25/50/75/100 魔王战胜负；守关失败不终局，
   对局按普通回合扣血死亡结束）。用法：node tools/sim.js [局数]；MAXR=100 环境变量可在
   打完 r100 章节结算后截断（只测前四章时省算力，章节统计不受影响） */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `

;globalThis.API = { get S(){return S}, setS:v=>{S=v},
  get currentTick(){return currentTick},
  byId, buy, pairCount, rollShop, startBattle, clickUnit, getAt, xpNeed, checkLevel, autoDeploy, autoDeployBest,
  /* 诊断插桩（DBG/T1 测试用，只读导出，不影响游戏逻辑） */
  get ITEMS(){return ITEMS}, get UNITS(){return UNITS}, get FACTIONS(){return FACTIONS}, get CLASSES(){return CLASSES},
  get SKILL_VAR(){return SKILL_VAR}, get SKILL_INFO(){return SKILL_INFO}, get FORMA_COLS(){return FORMA_COLS},
  placeFormation, genEnemy, prepEnemy, tidyBench, fillBoardBeforeBattle, unitBand, makeBattleUnit, equipTo, sellSelected,
  get sfx(){return typeof sfx==='function'?sfx:null}, get battleStats(){return typeof battleStats!=='undefined'?battleStats:null} };
`;

/* ---------- DOM 桩 ---------- */
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

/* ---------- 普通玩家机器人：直接加载页内版 bot_strategy.js（单一事实来源）。
   仅做符号改写：经 globalThis.API 访问游戏作用域（indirect eval 顶层 let 不可直接引用） ---------- */
const botSrc = fs.readFileSync(path.join(__dirname, 'bot_strategy.js'), 'utf8')
  .replace(/\bS\b/g, 'API.S')
  .replace(/\bbyId\b/g, 'API.byId')
  .replace(/\bpairCount\b/g, 'API.pairCount')
  .replace(/\bbuy\b/g, 'API.buy')
  .replace(/\bclickUnit\b/g, 'API.clickUnit')
  .replace(/\brollShop\b/g, 'API.rollShop')
  .replace(/\bcheckLevel\b/g, 'API.checkLevel')
  .replace(/\bautoDeployBest\b/g, 'API.autoDeployBest')
  .replace(/\bautoDeploy\b/g, 'API.autoDeploy')
  .replace(/\brenderAll\b/g, '(() => {})');
(0, eval)(botSrc);
const botPrep = globalThis.botPrep;   // indirect eval 的函数声明挂在 globalThis

/* ---------- 战斗驱动：手动推 currentTick，压缩真实时间 ---------- */
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
  fakeClock += 3000;   // 推进结算横幅（1100ms）等延迟回调
  drainTimers();
  fakeTimers.length = 0;  // 丢弃战斗中的视觉特效定时器，防内存膨胀
  // 战斗时长统计（游戏内毫秒）：超时 = 打满 60s
  globalThis.battleMs = globalThis.battleMs || [];
  globalThis.battleMs.push(used * 100);
  if (used * 100 >= 59000) globalThis.battleTimeouts = (globalThis.battleTimeouts || 0) + 1;
  if (process.env.DBG) console.log('[battle end]', A.S.phase, 'round', A.S.round, 'used', used * 100 + 'ms');
}

/* 内嵌机器人已删除：统一使用上方加载的 bot_strategy.js（与浏览器实跑同一份） */

/* ---------- 功能断言测试（T1=Phase1 布阵/备战席/补位；用 node 后即退出，不跑主循环） ---------- */
if (process.env.T1) { require('./_t1_tests.js').run(A, driveBattle); process.exit(0); }
if (process.env.T2) { require('./_t2_tests.js').run(A, driveBattle); process.exit(0); }
if (process.env.T3) { require('./_t3_tests.js').run(A, driveBattle); process.exit(0); }
if (process.env.T4) { require('./_t4_tests.js').run(A, driveBattle); process.exit(0); }


/* ---------- 主循环 ---------- */
const N = parseInt(process.argv[2] || '100', 10);
const MAXR = parseInt(process.env.MAXR || '0', 10);   // 调试用：>0 时打完该回合的章节结算即截断（章节统计在截断点之前，不受影响）
globalThis.hpCurve = {}; globalThis.wrStats = {}; globalThis.creepWR = {};
const results = [];
let ch1Wins = 0;
const chWins = [0, 0, 0, 0];      // 各章守关胜利局数（第 k 位 = 打赢 r25k 魔王的局数；第 5 章起并入第 4 位）
const chReached = [0, 0, 0, 0];   // 打到该章守关战（存活至该回合）的局数
for (let g = 0; g < N; g++) {
  (0, eval)('newGame()'); (0, eval)('renderAll()');
  let outcome = null;
  let chapters = 0, ch1 = false;
  for (let guard = 0; guard < 400; guard++) {
    const preWins = A.S.stats.wins, curRound = A.S.round, hpBefore = A.S.hp, preStreak = A.S.streak;
    if (A.S.phase === 'chapter') {   // 章节结算：记录守关胜负 → 选增强 → 继续下一章（败亡即终局）
      const won = !!A.S.settleWon;
      const ci = Math.min(3, chapters);
      chReached[ci]++; if (won) chWins[ci]++;
      if (won && chapters === 0) ch1Wins++;
      chapters++;
      if (typeof globalThis.pickAug === 'function' && A.S.settleOffer && A.S.settlePick == null) globalThis.pickAug(0);
      globalThis.chapterContinue();
      if (MAXR > 0 && A.S.round > MAXR) {
        outcome = { win: chapters > 0, chapters, round: A.S.round, hp: A.S.hp, streak: A.S.stats.maxStreak, kills: A.S.stats.kills, truncated: true };
        break;
      }
      continue;
    }
    botPrep();
    (0, eval)('startBattle')();
    driveBattle();
    const S = A.S;
    if (curRound % 5 === 0) {  // 野怪回合战果（含第二~四章 r30+）：以胜负统计增量为准
      (globalThis.creepWR[curRound] = globalThis.creepWR[curRound] || []).push(S.stats.wins > preWins ? 1 : 0);
    }
    if (process.env.DBG) {
      const board = S.board.filter(Boolean).map(u => A.byId(u.id).name + (u.star > 1 ? u.star + '★' : '')).join(',');
      const equipped = S.board.filter(Boolean).reduce((a,u)=>a+(u.items||[]).length,0);
      const loose = S.items.length;
      console.log(`r${S.round} hp${S.hp} g${S.gold} lvl${S.lvl} 装${equipped}件/背包${loose} 场上[${board}]`);
    }
    if (globalThis.hpCurve) { (hpCurve[S.round] = hpCurve[S.round] || []).push(S.hp); }
    // 单回合胜负：按"刚打完的那一回合"(curRound) 记账，用 HP 是否下降判定（野怪回合不扣血，跳过）
    if (curRound % 5 !== 0) {
      const lost = S.hp < hpBefore;   // 普通回合失败必然扣血
      (wrStats[curRound] = wrStats[curRound] || []).push(lost ? 0 : 1);
      // 连胜状态条件胜率：开战前连胜≥4（敌方难度 dyn 已按该连胜加压）的回合单独统计
      const sk = preStreak >= 4 ? 'streak4p' : 'streak0_3';
      (globalThis.streakWR = globalThis.streakWR || {})[sk] = (globalThis.streakWR[sk] || []).concat(lost ? 0 : 1);
    }
    if (S.phase === 'over') {
      outcome = { win: chapters > 0, chapters, round: S.round, hp: S.hp, streak: S.stats.maxStreak, kills: S.stats.kills };
      break;
    }
  }
  if (!outcome) outcome = { win: chapters > 0, chapters, round: A.S.round, hp: A.S.hp, streak: A.S.stats.maxStreak, kills: A.S.stats.kills };
  results.push(outcome);
}
const wins = results.filter(r => r.chapters >= 1);
const fmtPct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
console.log(`局数=${N}${MAXR ? `（r${MAXR} 截断）` : ''}  平均推进章节数=${(results.reduce((s,r)=>s+r.chapters,0)/N).toFixed(2)}  平均最终回合=${(results.reduce((s,r)=>s+r.round,0)/N).toFixed(1)}  到达结算=${wins.length}`);
console.log('章节守关通过率（累计，占全部局数）: ' + chWins.map((w, i) => `第${i + 1}章 ${w}/${N}=${fmtPct(w, N)}`).join('  '));
console.log('章节守关通过率（条件，占打到该章的局数）: ' + chWins.map((w, i) => `第${i + 1}章 ${fmtPct(w, chReached[i])}(${chReached[i]})`).join('  '));
const lossRounds = results.filter(r => !r.win).map(r => r.round);
if (lossRounds.length) {
  const hist = {};
  lossRounds.forEach(r => hist[r] = (hist[r] || 0) + 1);
  console.log('终局回合分布:', JSON.stringify(hist));
}
const curve = globalThis.hpCurve;
console.log('各回合平均血量:', Object.keys(curve).sort((a,b)=>a-b).map(r => `r${r}:${(curve[r].reduce((a,b)=>a+b,0)/curve[r].length).toFixed(1)}`).join(' '));
const wr = globalThis.wrStats;
console.log('各回合胜率:', Object.keys(wr).sort((a,b)=>a-b).map(r => { const a = wr[r]; return `r${r}:${(a.reduce((x,y)=>x+y,0)/a.length*100).toFixed(0)}%`; }).join(' '));
const swr = globalThis.streakWR || {};
['streak4p','streak0_3'].forEach(k => { const a = swr[k];
  if (a && a.length) console.log(`连胜≥4状态回合胜率(${k}): ${(a.reduce((x,y)=>x+y,0)/a.length*100).toFixed(1)}%  样本=${a.length}`); });
const cw = globalThis.creepWR;
console.log('野怪回合胜率(掉装备=胜):', Object.keys(cw).sort((a,b)=>a-b).map(r => { const a = cw[r]; return `r${r}:${(a.reduce((x,y)=>x+y,0)/a.length*100).toFixed(0)}%`; }).join(' '));
console.log('平均存活回合:', (results.reduce((s, r) => s + r.round, 0) / N).toFixed(1),
  '平均最终HP:', (results.reduce((s, r) => s + (r.hp || 0), 0) / N).toFixed(1),
  '平均最高连胜:', (results.reduce((s, r) => s + (r.streak || 0), 0) / N).toFixed(1));
const bm = (globalThis.battleMs || []).slice().sort((a, b) => a - b);
if (bm.length) {
  const avg = bm.reduce((a, b) => a + b, 0) / bm.length;
  const pct = p => bm[Math.min(bm.length - 1, Math.floor(bm.length * p))];
  console.log(`战斗时长(游戏秒): 平均${(avg/1000).toFixed(1)} 中位${(pct(0.5)/1000).toFixed(1)} p90 ${(pct(0.9)/1000).toFixed(1)} | 超时(≥59s) ${globalThis.battleTimeouts||0}/${bm.length} = ${(((globalThis.battleTimeouts||0)/bm.length)*100).toFixed(1)}%`);
}
