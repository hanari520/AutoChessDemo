/* 最小驱动：newGame → botPrep()，捕获异常（调试用） */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `
;globalThis.API = { get S(){return S}, byId, buy, pairCount, rollShop, startBattle, clickUnit, getAt, xpNeed, checkLevel, autoDeploy, autoDeployBest,
  placeFormation, genEnemy, prepEnemy, tidyBench, fillBoardBeforeBattle, unitBand, makeBattleUnit, equipTo, sellSelected };`;
function makeEl() {
  const el = { style:{}, dataset:{}, children:[], title:'', textContent:'', _ih:'',
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); return c; }, removeChild(){}, remove(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, setAttribute(){},
    getBoundingClientRect(){ return { left:0, top:0, width:58, height:58 }; }, closest(){ return null; } };
  Object.defineProperty(el,'innerHTML',{ get(){return this._ih;}, set(v){this._ih=v;} });
  Object.defineProperty(el,'offsetHeight',{ get(){return 40;} });
  return el;
}
const elCache = {}; const fakeTimers=[]; let fakeClock=0;
global.document = { getElementById(id){ return elCache[id]||(elCache[id]=makeEl()); }, createElement(){ return makeEl(); },
  querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, elementFromPoint(){ return null; }, body: makeEl() };
global.window = global; global.addEventListener = ()=>{};
global.localStorage = { _s:{}, getItem(k){ return this._s[k]??null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
global.matchMedia = ()=>({matches:false}); global.requestAnimationFrame = ()=>0;
global.innerWidth=1280; global.innerHeight=800;
global.Worker = class { postMessage(){} terminate(){} };
global.navigator = { serviceWorker:null };
global.setInterval = ()=>0; global.clearInterval = ()=>{};
global.setTimeout = (fn,ms)=>{ fakeTimers.push({t:fakeClock+(ms||0),fn}); return fakeTimers.length; };
global.clearTimeout = ()=>{};
(0, eval)(code);
const A = globalThis.API;
const botSrc = fs.readFileSync(path.join(__dirname, 'bot_strategy.js'), 'utf8')
  .replace(/\bS\b/g,'API.S').replace(/\bbyId\b/g,'API.byId').replace(/\bpairCount\b/g,'API.pairCount')
  .replace(/\bbuy\b/g,'API.buy').replace(/\bclickUnit\b/g,'API.clickUnit').replace(/\brollShop\b/g,'API.rollShop')
  .replace(/\bcheckLevel\b/g,'API.checkLevel').replace(/\bautoDeployBest\b/g,'API.autoDeployBest')
  .replace(/\bautoDeploy\b/g,'API.autoDeploy').replace(/\brenderAll\b/g,'(()=>{})');
(0, eval)(botSrc);
try {
  (0,eval)('newGame()');
  console.log('round', A.S.round, 'gold', A.S.gold, 'lvl', A.S.lvl, 'xp', A.S.xp, 'need', A.xpNeed(A.S.lvl));
  globalThis.botPrep();
  console.log('after botPrep: gold', A.S.gold, 'bench', A.S.bench.filter(Boolean).length, 'board', A.S.board.filter(Boolean).length);
  console.log('botPlan:', JSON.stringify(A.S.botPlan));
} catch(e) { console.error('BOT ERROR:', e.stack); }
