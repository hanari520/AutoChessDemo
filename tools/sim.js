/* 无头模拟器：加载 index.html 的游戏脚本，用 DOM 桩跑真实战斗逻辑。
   普通模式四章各在 r25/50/75/100 守关，败亡即终局；MAXR 可提前截断采样。 */
const fs = require('fs'), path = require('path');
const simMetrics = require('./sim-metrics.js');
const html = fs.readFileSync(process.env.HTML || path.join(__dirname, '..', 'index.html'), 'utf8');   // HTML=路径 可指定文件，用于改动前后 A/B 对照
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `

;globalThis.API = { get S(){return S}, setS:v=>{S=v},
  get flowPage(){return flowPage}, get runSessionId(){return runSessionId}, get afDeadline(){return afDeadline},
  get lastSaveError(){return lastSaveError}, get lastLoadError(){return lastLoadError},
  get SAVE_KEY(){return SAVE_KEY}, get DAILY_KEY(){return DAILY_KEY}, get ARENA_SAVE_KEY(){return ARENA_SAVE_KEY},
  newGame, saveGame, loadGame, inspectSave, saveKey, saveKeyForMode, startConfiguredRun,
  showHome, openSetup, showHelp, closeHelp, showGameMenu, openFlowConfirm, cancelFlowConfirm, acceptFlowConfirm,
  restartGame, endRunEarly, gameOver, chapterSettle, chapterContinue, pickAug, scheduleAutoFight, cancelAutoFight, todaySeed,
  tele: typeof tele==='function'?tele:null,
  flushTelemetry: typeof flushTelemetry==='function'?flushTelemetry:null,
  recordSaveTelemetry: typeof recordSaveTelemetry==='function'?recordSaveTelemetry:null,
  chapterRating: typeof chapterRating==='function'?chapterRating:null,
  recordChapterReview: typeof recordChapterReview==='function'?recordChapterReview:null,
  growthSnapshot: typeof growthSnapshot==='function'?growthSnapshot:null,
  renderGrowthBanner: typeof renderGrowthBanner==='function'?renderGrowthBanner:null,
  renderTop: typeof renderTop==='function'?renderTop:null,
  renderRoundNotice: typeof renderRoundNotice==='function'?renderRoundNotice:null,
  gearDropCardsHTML: typeof gearDropCardsHTML==='function'?gearDropCardsHTML:null,
  showLevelNotice: typeof showLevelNotice==='function'?showLevelNotice:null,
  poolGuideHTML: typeof poolGuideHTML==='function'?poolGuideHTML:null,
  threatTypeForUnit: typeof threatTypeForUnit==='function'?threatTypeForUnit:null,
  enemyThreatHTML: typeof enemyThreatHTML==='function'?enemyThreatHTML:null,
  chooseChallenge: typeof chooseChallenge==='function'?chooseChallenge:null,
  get CHAPTER_RATING_THRESHOLDS(){return typeof CHAPTER_RATING_THRESHOLDS==='undefined'?null:CHAPTER_RATING_THRESHOLDS},
  get currentTick(){return currentTick},
  byId, buy, pairCount, rollShop, startBattle, clickUnit, getAt, xpNeed, checkLevel, autoDeploy, autoDeployBest,
  /* 诊断插桩（DBG/T1 测试用，只读导出，不影响游戏逻辑） */
  get ITEMS(){return ITEMS}, get UNITS(){return UNITS}, get FACTIONS(){return FACTIONS}, get CLASSES(){return CLASSES},
  get COMBAT_KITS(){return COMBAT_KITS}, get ITEM_FX(){return ITEM_FX}, get ITEM_SPECIAL(){return ITEM_SPECIAL},
  castSkill, dealDamage, v3Heal, v3AddShield, v3AttackOf, applyV3Attack, v3RainTrigger,
  get SKILL_VAR(){return SKILL_VAR}, get SKILL_INFO(){return SKILL_INFO}, get FORMA_COLS(){return FORMA_COLS},
  placeFormation, genEnemy, prepEnemy, tidyBench, fillBoardBeforeBattle, unitBand, makeBattleUnit, equipTo, sellSelected,
  dailyEvent, dailyOnPrep, dailyMods, boardCurseImpacts, applyBoardCurse, nbList, interestGain, maxEquip, enemyHidden,
  get sfx(){return typeof sfx==='function'?sfx:null}, get battleStats(){return typeof battleStats!=='undefined'?battleStats:null} };
`;

/* ---------- DOM 桩 ---------- */
function makeEl() {
  const el = {
    style: { setProperty(k,v){ this[k]=v; }, removeProperty(k){ delete this[k]; } }, dataset: {}, children: [], title: '', textContent: '',
    _ih: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c) { if(this.children.length>200) this.children.shift(); this.children.push(c); return c; },
    removeChild(){}, remove(){},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener(){}, setAttribute(k,v){ this[k]=String(v); }, removeAttribute(k){ delete this[k]; }, hasAttribute(k){ return Object.prototype.hasOwnProperty.call(this,k); }, focus(){},
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
global.localStorage = { _s: process.env.TB ? { vc_bottempbuff: '1' } : {}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
global.matchMedia = () => ({ matches: false });
global.requestAnimationFrame = () => 0;
global.innerWidth = 1280; global.innerHeight = 800;
global.Worker = class { postMessage(){} terminate(){} };
global.navigator = { serviceWorker: null };
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = (fn, ms) => { if(fakeTimers.length>20000) fakeTimers.length=0; fakeTimers.push({ t: fakeClock + (ms || 0), fn }); return fakeTimers.length; };
global.clearTimeout = () => {};
/* 无头标记：让游戏知道"没有真实 UI"，需要弹窗的交互（开局定向招募等）走自动兑现分支。
   否则无头跑批时玩家侧会白白少拿一名开局棋子，测量结果系统性低估玩家强度。 */
global.__HEADLESS = true;

/* 确定性回归：SEED=42 node tools/sim.js 20 同代码路径 → 逐字节一致。
   必须在游戏代码 eval 之前替换（游戏顶层 let RND=Math.random 在求值时捕获引用）；
   mulberry32 —— 普通模式 rand() 直通 Math.random，跨进程种子不同则 before/after 对比不可复现。 */
if (process.env.SEED) {
  let t = (+process.env.SEED) >>> 0;
  Math.random = () => { t += 0x6D2B79F5 | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

global.window.DailyCurses = require('./daily-curses.js');
(0, eval)(code);
const A = globalThis.API;
if (process.env.DAILY_CAMPAIGN_TEST) {
  require('./daily-campaign.test.js').run(A);
  process.exit(process.exitCode || 0);
}
if (process.env.CAMPAIGN_TEST) {
  const assert = require('node:assert/strict');
  /* 2026-09-25：敌方人数上限在章节边界必须线性过渡。
     原实现 r>50?10:r>25?9:7 会在 r26 由 7 单回合跳到 9、r51 由 9 跳到 10，
     而玩家人口是连续增长的 → 每次跨章"突然多打 1–2 人"，是节奏断裂而非难度上升。 */
  {
    const capAt = r => { globalThis.newGame(); return globalThis.enemyCap(r); };
    assert.deepEqual([25,26,27,28,29,30,50,51,52,53,54,55].map(capAt),
      [7,7,8,8,9,9,9,9,9,10,10,10], '敌方人数上限在 r26/r51 必须线性过渡而非阶跃');
  }
  const reset = r => { globalThis.newGame(); A.S.round=r; A.S.phase='battle'; };
  reset(25);
  assert.equal(globalThis.runLimit(), 100);
  globalThis.endBattle(1, 0);
  assert.equal(A.S.phase, 'chapter');
  assert.equal(A.S.tickets, 0);
  globalThis.pickAug(0); globalThis.chapterContinue();
  assert.equal(A.S.round, 26);
  reset(25); globalThis.endBattle(0, 1);
  assert.equal(A.S.phase, 'over');
  assert.equal(A.S.finished, false);
  reset(50); globalThis.endBattle(1, 0);
  assert.equal(A.S.tickets, 1);
  reset(100); globalThis.endBattle(1, 0);
  assert.equal(A.S.phase, 'over');
  assert.equal(A.S.finished, true);
  assert.equal(A.S.round, 100);
  reset(100); globalThis.endBattle(0, 1);
  assert.equal(A.S.finished, false);
  /* 随回合升星（enemyStarFor）：第一章全员 1★，第二章起 2★ 占比随回合上升。
     旧断言「r72 恰好 0 个 2★ / r82 恰好 1 个」写于已废弃的"r82/r92 固定 2★ 精英带队"设计，
     与逐回合升星系统冲突、必然失败（2026-09-25 实测：未改动版本 r82 得到 6 个 2★，非恰好 1）。
     改为统计口径断言：只校验"第一章必为 1★"与"第四章平均星数显著上升"这两个稳定性质。
     用 20 次采样取均值，避免单次随机导致回归测试自身不稳定。 */
  {
    const starAvg = r => { let sum=0,n=0,k=20;
      while(k--){ reset(r); globalThis.prepEnemy();
        A.S.enemyBoard.filter(Boolean).forEach(u=>{ sum+=u.star||1; n++; }); }
      return n ? sum/n : 0; };
    /* 取样点必须避开野怪回合（r%5===0）：野怪头目在 r20-24 固定 2★（bossStar 规则），
       会污染"第一章全员 1★"的判定。故取 r21 与 r82 两个普通回合。 */
    const a21=starAvg(21), a82=starAvg(82);
    assert.ok(Math.abs(a21-1)<1e-9, `第一章普通回合（r21）敌方应全员 1★（实测均值 ${a21.toFixed(2)}）`);
    assert.ok(a82>1.5, `第四章普通回合（r82）敌方平均星数应显著 >1（实测均值 ${a82.toFixed(2)}）`);
  }
  globalThis.newGame(); A.S.round=10; A.S.phase='prep'; globalThis.prepEnemy();
  const before=A.S.enemyBoard.filter(Boolean)[0].maxhp;
  globalThis.chooseChallenge();
  assert.equal(A.S.challengeRound, 10);
  assert.ok(A.S.enemyBoard.filter(Boolean)[0].maxhp>before);
  A.S.phase='battle'; globalThis.endBattle(1, 0);
  assert.equal(A.S.items.length, 4);
  globalThis.newGame(); A.S.round=10; A.S.phase='prep'; globalThis.prepEnemy(); globalThis.chooseChallenge();
  A.S.phase='battle'; globalThis.endBattle(0, 1);
  assert.equal(A.S.hp, 37);
  console.log('✅ 四章边界、守关胜负、升星券、100 回合终局通过');
  process.exit(0);
}

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
if (process.env.T1) { require('./_t1_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }
if (process.env.T2) { require('./_t2_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }
if (process.env.T3) { require('./_t3_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }
if (process.env.T4) { require('./_t4_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }
if (process.env.T5) { require('./_solo_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }   // 🪑 独木桥品质成长
if (process.env.EFFECT_TEST) { require('./_effect_tests.js').run(A, driveBattle); process.exit(process.exitCode||0); }
if (process.env.PACE_TEST) { require('./_pace_tests.js').run(A); process.exit(process.exitCode||0); }


/* ---------- 主循环 ---------- */
const N = parseInt(process.argv[2] || '100', 10);
const MAXR = parseInt(process.env.MAXR || '0', 10);   // 调试用：>0 时打完该回合的章节结算即截断（章节统计在截断点之前，不受影响）
globalThis.hpCurve = {}; globalThis.wrStats = {}; globalThis.creepWR = {};
const results = [];
const telemetryTotals = {};
let ch1Wins = 0;
const chWins = [0, 0, 0, 0];      // 各章守关胜利局数（第 k 位 = 打赢 r25k 魔王的局数；第 5 章起并入第 4 位）
const chReached = [0, 0, 0, 0];   // 打到该章守关战（存活至该回合）的局数
/* CURSE=id1,id2：整局注入自定义诅咒（勾选走游戏自己的 toggleCurse 入口——indirect eval
   顶层 let curseSel 不可直接赋值；勾选跨局保留，循环内每局都显式带 custom 重开） */
const CURSE_ENV = process.env.CURSE || '';
if (CURSE_ENV) CURSE_ENV.split(',').forEach(c => (0, eval)(`toggleCurse("${c.trim()}")`));
for (let g = 0; g < N; g++) {
  (0, eval)(`newGame(${CURSE_ENV ? '{custom:true}' : ''})`); (0, eval)('renderAll()');
  let outcome = null;
  let chapters = 0, ch1 = false;
  for (let guard = 0; guard < 400; guard++) {
    const preWins = A.S.stats.wins, curRound = A.S.round, hpBefore = A.S.hp, preStreak = A.S.streak;
    if (A.S.phase === 'chapter') {
      if (typeof globalThis.pickAug === 'function' && A.S.settleOffer && A.S.settlePick == null) {
        // ③ 增强选择走 bot_strategy.js 的 botAugPick（与浏览器 autoSettle 同一份策略）；缺省兜底选第 0 张
        const ai = (typeof globalThis.botAugPick === 'function') ? globalThis.botAugPick(A.S.settleOffer) : 0;
        globalThis.pickAug(ai >= 0 ? ai : 0);
      }
      globalThis.chapterContinue();
      continue;
    }
    botPrep();
    (0, eval)('startBattle')();
    driveBattle();
    const S = A.S;
    if (curRound % 25 === 0) {
      const ci = Math.min(3, curRound / 25 - 1);
      chReached[ci]++;
      if (S.stats.wins > preWins) { chWins[ci]++; chapters++; if (ci === 0) ch1Wins++; }
    }
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
      outcome = { win: !!S.finished, chapters, round: S.round, hp: S.hp, streak: S.stats.maxStreak, kills: S.stats.kills };
      break;
    }
    if (MAXR > 0 && curRound >= MAXR) {
      outcome = { win: false, chapters, round: curRound, hp: S.hp, streak: S.stats.maxStreak, kills: S.stats.kills, truncated: true };
      break;
    }
  }
  if (!outcome) outcome = { win: !!A.S.finished, chapters, round: A.S.round, hp: A.S.hp, streak: A.S.stats.maxStreak, kills: A.S.stats.kills };
  outcome.star4=!!(A.S.ms&&A.S.ms.star4);
  outcome.elites=A.S.botElites||0;
  results.push(outcome);
  simMetrics.mergeTelemetryTotals(telemetryTotals, A.S.stats && A.S.stats.tele);
}
const wins = results.filter(r => r.chapters >= 1);
const fmtPct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '—';
console.log(`局数=${N}${MAXR ? `（r${MAXR} 截断）` : ''}  平均推进章节数=${(results.reduce((s,r)=>s+r.chapters,0)/N).toFixed(2)}  平均最终回合=${(results.reduce((s,r)=>s+r.round,0)/N).toFixed(1)}  到达结算=${wins.length}`);
console.log(`托管决策：使用升星券 ${results.filter(r=>r.star4).length}/${N} 局，精英挑战共 ${results.reduce((n,r)=>n+r.elites,0)} 次；100 回合通关 ${results.filter(r=>r.win).length}/${N}`);
console.log('章节守关通过率（累计，占全部局数）: ' + chWins.map((w, i) => `第${i + 1}章 ${w}/${N}=${fmtPct(w, N)}`).join('  '));
console.log('章节守关通过率（条件，占打到该章的局数）: ' + chWins.map((w, i) => `第${i + 1}章 ${fmtPct(w, chReached[i])}(${chReached[i]})`).join('  '));
if (MAXR === 100 || process.env.DEATH_HIST === '1') console.log(simMetrics.deathReport(results, 100));
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
if (process.env.DBGLOG) {   // 调试：导出最后一局战报里的指定关键词（逗号分隔），如 DBGLOG=独木桥
  const kws = (process.env.DBGLOG || '独木桥').split(',');
  A.S.log.filter(l => kws.some(k => l.includes(k))).forEach(l => console.log('[log]', l));
}

/* 技能可见性（C1 的长期验收口径）：一场战斗放了几次技能、多少棋子一次都没放。
   诊断插桩，只读 S.stats，不影响任何游戏逻辑。任何规模都会输出。 */
{
  const st = A.S.stats || {};
  const b = st.castBattles || 0;
if (b > 0) {
    const total = st.castTotal || 0, units = st.castUnits || 0, zero = st.castZero || 0;
    console.log(`技能可见性：每场我方施法 ${(total / b).toFixed(2)} 次 · 上场 ${(units / b).toFixed(1)} 人 · 未施法 ${(zero / b).toFixed(1)} 人 → 覆盖率 ${units ? (100 * (1 - zero / units)).toFixed(1) : 'n/a'}%`);
  } else {
    console.log('技能可见性：本批未采集到战斗（样本为 0）');
  }
}
if (process.env.TELE === '1') {
  const accepts = telemetryTotals.eliteAccept || 0;
  const declines = telemetryTotals.eliteDecline || 0;
  const augPicks = Object.fromEntries(Object.entries(telemetryTotals).filter(([key]) => key.startsWith('augPick.')));
  const exitRounds = Object.fromEntries(Object.entries(telemetryTotals).filter(([key]) => key.startsWith('exitRound.')));
  console.log('体验遥测聚合：' + JSON.stringify({
    eliteAccept: accepts,
    eliteDecline: declines,
    eliteAcceptRate: accepts + declines ? +(accepts / (accepts + declines)).toFixed(4) : null,
    exitRounds,
    lifePressureRounds: telemetryTotals.lifePressureRound || 0,
    augPick: augPicks,
  }));
}
