/* 探针：无限模式后期回合的战斗结果 —— 验证「正常阵容在高回合还能不能赢」
   用法：node tools/_probe_late.js
   结论口径：胜负取自 S.stats.wins/losses 增量，超时/存活数从战报文本读取。 */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `

;globalThis.API = { get S(){return S}, setS:v=>{S=v}, byId, genEnemy, prepEnemy, startBattle,
  autoDeployBest, get currentTick(){return currentTick}, get UNITS(){return UNITS},
  get STAR_M(){return STAR_M}, get SKILL_STAR_M(){return SKILL_STAR_M}, get HP_SCALE(){return HP_SCALE},
  get BOARD_W(){return BOARD_W}, get BOARD_H(){return BOARD_H}, get BENCH(){return BENCH} };
`;

/* ---------- DOM 桩（与 tools/sim.js 保持一致） ---------- */
function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], title: '', textContent: '', _ih: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c) { if(this.children.length>200) this.children.shift(); this.children.push(c); return c; },
    removeChild(){}, remove(){}, querySelector() { return null; }, querySelectorAll() { return []; },
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
  createElement() { return makeEl(); }, querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener(){}, elementFromPoint() { return null; }, body: makeEl(),
};
global.window = global;
global.addEventListener = () => {};
global.localStorage = { _s:{}, getItem(k){ return this._s[k] ?? null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
global.matchMedia = () => ({ matches: false });
global.requestAnimationFrame = () => 0;
global.innerWidth = 1280; global.innerHeight = 800;
global.Worker = class { postMessage(){} terminate(){} };
global.navigator = { serviceWorker: null, onLine: true };
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = (fn, ms) => { fakeTimers.push({ t: fakeClock + (ms || 0), fn }); return fakeTimers.length; };
global.clearTimeout = () => {};

(0, eval)(code);
const A = globalThis.API;

function drainTimers() {
  fakeTimers.sort((a, b) => a.t - b.t);
  while (fakeTimers.length && fakeTimers[0].t <= fakeClock) fakeTimers.shift().fn();
}
function driveBattle(maxTicks = 640) {
  let used = 0;
  for (let i = 0; i < maxTicks && A.S.phase === 'battle'; i++) { fakeClock += 100; A.currentTick(); drainTimers(); used = i + 1; }
  drainTimers(); fakeClock += 3000; drainTimers(); fakeTimers.length = 0;
  return used * 100;
}

/* 增强配置：按"章节 23 累计 22 张"的口径给（偏强，用于检验高回合是否有解） */
const BUILD = {
  balanced: { atk:6, hp:6, asp:3, ar:3, regen:2, skillhaste:1, synres:1 },
  stall:    { hp:8, ar:8, regen:6 },
  maxed:    { atk:6, hp:6, asp:3, ar:3, regen:2, skillhaste:1, synres:1 },   // 同 balanced，但全员带神器
};
/* maxed 档：后期玩家装备必然溢出，按满配 3 件（含神器）估上限 */
const ITEMS_OF = { balanced: [], stall: [], maxed: ['godblade','godarmor','godbow'] };
function augsOf(profile) {
  const out = [];
  for (const [id, n] of Object.entries(BUILD[profile])) for (let i = 0; i < n; i++) out.push({ id, weak: false });
  return out;
}

function runAt(round, profile) {
  (0, eval)('newGame()');
  const S = A.S;
  S.round = round; S.endless = round > 25; S.hp = 40; S.lvl = 11; S.xp = 0; S.augs = augsOf(profile);
  S.board = Array(A.BOARD_W * A.BOARD_H).fill(null);
  S.bench = Array(A.BENCH).fill(null);
  const pool = A.UNITS.filter(u => u.cost >= 4);
  const picks = [];
  for (let i = 0; i < 11; i++) picks.push(pool[i % pool.length]);
  picks.forEach((d, i) => {
    const hp = Math.round(d.hp * Math.pow(A.STAR_M[d.cost], 2) * A.HP_SCALE);
    S.bench[i] = { uid: S.uid++, id: d.id, star: 3, sks: Math.pow(A.SKILL_STAR_M[d.cost], 2),
      hp, maxhp: hp, atk: Math.round(d.atk * Math.pow(A.STAR_M[d.cost], 2)), items: [...ITEMS_OF[profile]] };
  });
  A.autoDeployBest();
  const onBoard = S.board.filter(Boolean).length;
  const w0 = S.stats.wins, l0 = S.stats.losses, hp0 = S.hp;
  elCache['log'] && (elCache['log']._ih = '');
  S.enemyBoard = null;
  A.startBattle();
  const ms = driveBattle();
  const logTxt = (elCache['log'] && elCache['log']._ih) || '';
  const alive = (logTxt.match(/我方存活 (\d+) · 敌方存活 (\d+)/) || []);
  const timedOut = /战斗超时/.test(logTxt);
  const eBoard = S.enemyBoard.filter(Boolean).length;
  return {
    round, profile, onBoard, enemyCount: eBoard,
    result: S.stats.wins > w0 ? '胜' : (S.stats.losses > l0 ? '负' : '?'),
    hp: `${hp0}→${S.hp}`, alive: alive.length ? `${alive[1]}:${alive[2]}` : '-',
    timeout: timedOut ? '是' : '否', ms,
  };
}

const rows = [];
for (const profile of ['maxed']) {
  /* 上限探针：maxed 档在极高回合是否仍能取胜（决定服务端该留多大余量） */
  for (const r of [571, 1000, 2000, 5000, 10000]) rows.push(runAt(r, profile));
}
console.log('回合  增强档   场上  敌数  结果  存活(我:敌)  超时  时长');
rows.forEach(x => console.log(
  String(x.round).padEnd(5), x.profile.padEnd(9), String(x.onBoard).padEnd(5), String(x.enemyCount).padEnd(5),
  x.result.padEnd(5), String(x.alive).padEnd(11), x.timeout.padEnd(5), (x.ms/1000).toFixed(1) + 's'));