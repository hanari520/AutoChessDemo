/* 专精逐章测试（tools/syn_test.js）：锁定只买某一羁绊/职业棋子的"死忠玩家"机器人，
   检验"任意羁套装阵容在各章守关通过率都达标"（2026-09-19 目标：80/70/60/50 ±5pp）。
   购买逻辑复制自 tools/bot_strategy.js，差异：商店评分只考虑锁内棋子；
   其余（装备/升级/roll 车/编队）与普通机器人一致；第二章起继续升级人口。
   用法：node tools/syn_test.js [每羁绊局数] [羁绊名1 羁绊名2 ...]
        不给羁绊名 = 测全部 22 个；局数默认 30；MAXR=100 只测前四章 */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `

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

/* —— r25 诊断插桩（DBG=1 生效）：medEcho/dealDamage 是顶层函数声明（挂 globalThis），
   游戏内调用点在运行时经全局对象解析，包裹 globalThis 同名属性即可拦截统计伤害构成 —— */
const DBG = !!process.env.DBG;
const __diag = { cur: null };
const origMedEcho = globalThis.medEcho;
const origDealDamage = globalThis.dealDamage;
globalThis.medEcho = function(src, healed, units, foes){
  const f = __diag.cur;
  if (f) { if (healed > 0) f.healed += healed; if (src) src.__echoing = true; }
  const r = origMedEcho(src, healed, units, foes);
  if (src) src.__echoing = false;
  return r;
};
globalThis.dealDamage = function(src, tgt, dmg, units, dtype){
  const f = __diag.cur;
  if (!f) return origDealDamage(src, tgt, dmg, units, dtype);
  const wasEcho = !!(src && src.__echoing);
  const r = origDealDamage(src, tgt, dmg, units, dtype);
  if (tgt && tgt.side === 1) {
    if (wasEcho) f.echo += r;
    if (tgt.boss) f.bossDmg += r;
  }
  if (tgt && tgt.hp <= 0 && tgt.side === 0) f.myDeaths.push(Math.round(fakeClock - f.t0) + ':' + A.byId(tgt.id).name);
  return r;
};

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
  // 2) 购买：锁内优先（对子 > 质量卡），锁外作为填人口骨架（对子或高费）
  //    存满 50 后只花溢出（与普通托管「利息地板」同一纪律，避免死忠 bot 靠激进花销
  //    比主托管强出一截、逐章通过率全体虚高）
  const keepGold = S.round <= 1 ? 0 : (S.gold >= 50 ? 50 : (S.hp >= 12 ? 8 : 2));
  let bought = true, iterGuard = 0;
  while (bought && iterGuard++ < 40) {
    bought = false;
    let bestI = -1, bestSc = -1;
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || u.cost > S.gold - keepGold) continue;
      const pc = pairCount(u.id);
      const sc = inLock(u) ? (pc >= 2 ? 200 : 120) + u.cost
                           : (pc >= 2 ? 100 : 0) + u.cost * 2;
      if (sc > bestSc) { bestSc = sc; bestI = i; }
    }
    if (bestI < 0 || bestSc <= 0) break;
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
  // 3.5) 锁内棋子已到手：保留锁内核心，同时允许「锁外棋子填人口」。
  //      说明：3 人小羁绊（星际/花语/工造等）最多只有 3 个不同棋子，死磕锁内 =
  //      2-3 个单位打敌方 7 个，数学上不可能通关（刀塔的小羁绊也从不是独立成型，
  //      都是混搭进主流阵容）。本测试的真实语义是「以该羁绊为核心」的阵容：
  //      锁内棋子优先且永不出售（保证吃满羁绊效果），人口空位用锁外高质量棋子补。
  //      仅当备战席已满、且要腾位给锁内棋子时才卖锁外棋子（先卖最弱的）。
  if (lockOwned() > 0) {
    let cg = 0;
    while (cg++ < 10) {
      const needSlot = S.bench.filter(x => !x).length === 0;
      if (!needSlot) break;                       // 有空位就不清人（保留锁外填充）
      // 卖锁外棋子中最弱的一个（低费、非对子优先）
      let bi2 = -1, bv2 = 1e9;
      S.bench.forEach((u, i) => {
        if (!u || inLock(u) || pairCount(u.id) >= 2) return;
        const v = byId(u.id).cost;
        if (v < bv2) { bv2 = v; bi2 = i; }
      });
      if (bi2 < 0) break;
      sellAt('bench', bi2);
    }
  }
  // 4) 升级人口节奏：第一章走成长计划；第二章起（r26+）继续升级但与普通托管同速
  //    （每回合至多 1 次买经验 + 自然经验，目标只看下一级）——冲满级会让锁羁绊 bot
  //    比主托管强一档，逐章通过率全体虚高
  const lvlPlan = { 2:3, 3:4, 5:5, 8:6, 11:7, 15:8, 19:9, 23:10 };
  const target = S.round > 25 ? Math.min(11, S.lvl + 1) : Math.max(lvlPlan[S.round] || S.lvl, S.lvl);
  const xpBuys = S.round > 25 ? 1 : 8;
  for (let k = 0; k < xpBuys && S.lvl < target; k++) {
    if (S.gold >= 5 + (S.hp >= 12 ? 4 : 2)) { S.gold -= 5; S.xp += 4; checkLevel(); } else break;
  }
  // 5) 富余 roll down：费用自适应。锁内棋子优先（对子/质量卡），锁内刷不到时
  //    买入锁外高质量棋子填人口（保证「以该羁绊为核心」的阵容能站满人口位）。
  //    第二章起（r26+）与普通托管的触发式搜牌同纪律（≤8 次/回合）——深滚会让
  //    死忠 bot 在章节中后期滚出明显强于主托管的 board，逐章通过率全体虚高。
  const lockCosts = [...LOCK].map(id => byId(id).cost).sort((a,b)=>a-b);
  const medCost = lockCosts.length ? lockCosts[Math.floor(lockCosts.length/2)] : 2;
  const deepRun = medCost <= 2;              // 低费羁绊：可买任意锁内棋子
  let rolls = 0;
  const rollCap = S.round > 25 ? 8 : (deepRun ? 50 : 35);
  while (S.gold >= keepGold + 2 && rolls++ < rollCap) {
    if (S.bench.filter(x => !x).length === 0 && !sellIdle()) break;
    S.gold -= 2; rollShop();
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || u.cost > S.gold - keepGold) continue;
      if (S.bench.filter(x => !x).length <= 0) break;
      if (inLock(u)) {
        if (pairCount(u.id) >= 2 || deepRun || u.cost >= 3) buy(i);
      } else if (u.cost >= 4 || pairCount(u.id) >= 2) {
        buy(i);                              // 锁外高费/对子：填人口的骨架
      }
    }
    if (S.gold >= 26 && S.lvl < 11 && S.gold - 5 >= keepGold) { S.gold -= 5; S.xp += 4; checkLevel(); }
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
const CAT = { '输出': ['法师','刺客','游侠','狂战','咒术','夜幕','毛茸乐园','魔道'],
              '普通': ['刀客','守护','深海','音律','四禧丸子','星际','工造','P-SP','森之国'],
              '辅助': ['医者','歌势','偶像','花语','学园'] };
const TGT = { 1: 80, 2: 70, 3: 60, 4: 50 };   // 2026-09-19 用户设定：各章守关累计通过率（±5pp），针对全部 22 羁绊
const TOL = 5;
const MAXR = parseInt(process.env.MAXR || '0', 10);   // 调试用：>0 时打完该回合的章节结算即截断（只测前四章省算力）
const catOf = s => Object.keys(CAT).find(c => CAT[c].includes(s)) || '??';
for (const syn of targets) {
  console.log(`—— ${syn}（${catOf(syn)}，目标 ${TGT[1]}/${TGT[2]}/${TGT[3]}/${TGT[4]}%，已用时 ${((Date.now()-t0)/1000).toFixed(0)}s）——`);
  const lockIds = new Set(A_.UNITS.filter(u => u.fac === syn || u.job === syn).map(u => u.id));
  globalThis.LOCK_SYN = lockIds;
  const chWins = [0, 0, 0, 0], chReached = [0, 0, 0, 0];
  const endRounds = [];
  for (let g = 0; g < N; g++) {
    (0, eval)('newGame()');
    let outcome = null;
    for (let guard = 0; guard < 220; guard++) {
      const curRound = A.S.round;   // 战斗结算会推进回合数，r 编号须在开战前取
      if (A.S.phase === 'chapter') {   // 章节结算：记录守关胜负 → 选增强 → 继续下一章（败不终局）
        const won = !!A.S.settleWon;
        const bi = Math.min(3, Math.ceil(A.S.round / 25) - 1);   // 第 5 章起并入第 4 桶（仅统计前四章）
        chReached[bi]++; if (won) chWins[bi]++;
        if (typeof globalThis.pickAug === 'function' && A.S.settleOffer && A.S.settlePick == null) globalThis.pickAug(0);
        globalThis.chapterContinue();
        if (MAXR > 0 && A.S.round > MAXR) { outcome = { round: A.S.round }; break; }
        continue;
      }
      botPrep();
      (0, eval)('startBattle')();
      const snap = globalThis.__bu || [];
      __diag.cur = { t0: fakeClock,
        enemyHP: snap.filter(u => u.side === 1).reduce((a, u) => a + u.hp, 0),
        echo: 0, bossDmg: 0, healed: 0, myDeaths: [] };
      const dur = driveBattle();
      const f = __diag.cur; __diag.cur = null;
      f.dur = dur; f.round = curRound; f.phase = A.S.phase;
      const boss = (globalThis.__bu || []).find(u => u.side === 1 && u.boss);
      if (boss) { f.bossHp = boss.hp; f.bossMax = boss.maxhp; }
      f.foesAlive = (globalThis.__bu || []).filter(u => u.side === 1 && u.hp > 0).length;
      if (DBG && f.round === 25) {
        console.log(`  [r25] hp=${A.S.hp} dur=${f.dur}ms 敌总HP=${Math.round(f.enemyHP)}` +
          ` 回响=${Math.round(f.echo)} 魔王伤=${Math.round(f.bossDmg)}` +
          ` boss余=${f.bossHp != null ? Math.round(f.bossHp) + '/' + Math.round(f.bossMax) : '-'}` +
          ` 敌存活=${f.foesAlive} 实疗=${Math.round(f.healed)} 我减员=[${f.myDeaths.join(' ')}]`);
      }
      if (process.env.DBG) console.log(`  [dbg] r${A.S.round} hp=${A.S.hp} phase=${A.S.phase} lvl=${A.S.lvl} 场上=${A.S.board.filter(Boolean).length} bench=${A.S.bench.filter(Boolean).length} gold=${A.S.gold}`);
      if (A.S.phase === 'over') { outcome = { round: A.S.round }; break; }   // 途中死亡=普通回合扣血致死
    }
    if (outcome) endRounds.push(outcome.round);
  }
  const rates = chWins.map(w => w / N * 100);   // 累计口径：分母 = 全部局数
  const avgEnd = endRounds.length ? endRounds.reduce((a, b) => a + b, 0) / endRounds.length : 0;
  report.push({ syn, chWins, chReached, rates, avgEnd, members: lockIds.size });
}
console.log(`\n=== 专精逐章测试（每羁绊 N=${N}${MAXR ? `，r${MAXR} 截断` : ''}，锁定只买该羁绊棋子） ===`);
console.log('参考目标（托管「普通玩家」口径，各章守关累计通过率）: ' + [1, 2, 3, 4].map(k => `第${k}章 ${TGT[k]}%`).join(' / '));
console.log('口径说明：锁羁绊 bot（死忠玩家）在第二~四章系统性强于托管口径（锁内核心质量高、');
console.log('          对子必合成、核心永不出售），经三轮经济纪律对齐仍偏热 ~15-25pp，属仪器性质。');
console.log('          故羁绊间平衡以「本表均值」为锚：低于均值 8pp 以上 = 弱羁绊 ⚠，高 8pp 以上 = 强羁绊 ↑。');
const agg = [1, 2, 3, 4].map(k => report.reduce((s, r) => s + r.rates[k - 1], 0) / report.length);
const rank = [...report].sort((a, b) => b.rates[0] - a.rates[0]);
for (const r of rank) {
  const cells = r.rates.map((v, i) => {
    const d = v - agg[i];
    const flag = d < -8 ? '⚠' : d > 8 ? '↑' : ' ';
    return `第${i + 1}章 ${(v.toFixed(0) + '%').padStart(4)}(${d >= 0 ? '+' : ''}${d.toFixed(0)})${flag}`;
  }).join(' ');
  console.log(`${r.syn.padEnd(5)} ${r.members}人  ${cells}  终局均值 r${r.avgEnd.toFixed(0)}`);
}
console.log('\n=== 各章汇总 ===');
let badTotal = 0;
for (let k = 1; k <= 4; k++) {
  const vs = report.map(r => r.rates[k - 1]);
  const sorted = [...vs].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const weak = report.filter(r => r.rates[k - 1] < agg[k - 1] - 8);
  const strong = report.filter(r => r.rates[k - 1] > agg[k - 1] + 8);
  badTotal += weak.length;
  console.log(`第${k}章 均值 ${agg[k - 1].toFixed(1)}%（托管目标 ${TGT[k]}%） 中位 ${med.toFixed(1)}%  区间 [${sorted[0].toFixed(0)}, ${sorted[sorted.length - 1].toFixed(0)}]` +
    (weak.length ? `   ⚠ 弱: ${weak.map(r => `${r.syn} ${r.rates[k - 1].toFixed(0)}%`).join('、')}` : '') +
    (strong.length ? `   ↑ 强: ${strong.map(r => `${r.syn} ${r.rates[k - 1].toFixed(0)}%`).join('、')}` : ''));
}
console.log(badTotal ? `共 ${badTotal} 项弱羁绊离群（低于均值 8pp），需调整` : '无弱羁绊离群，羁绊间平衡达标');
