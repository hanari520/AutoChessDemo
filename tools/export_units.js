/* 导出全部棋子数据为 JSON（复用 sim.js 的 DOM 桩方案），供生成 Excel */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let code = html.match(/<script>([\s\S]*)<\/script>/)[1];
code += "\n;globalThis.API = { UNITS, FACTIONS, CLASSES, SKILL_VAR, skillDesc, POOL_COPIES };";

function makeEl() {
  const el = { style:{}, dataset:{}, children:[], title:'', textContent:'', _ih:'',
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(c){ this.children.push(c); return c; }, removeChild(){}, remove(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, setAttribute(){},
    getBoundingClientRect(){ return {left:0,top:0,width:58,height:58}; },
    closest(){ return null; } };
  Object.defineProperty(el,'innerHTML',{get(){return this._ih;},set(v){this._ih=v;}});
  Object.defineProperty(el,'offsetHeight',{get(){return 40;}});
  Object.defineProperty(el,'offsetWidth',{get(){return 478;}});
  return el;
}
const elCache = {};
global.document = {
  getElementById(id){ return elCache[id]||(elCache[id]=makeEl()); },
  createElement(){ return makeEl(); }, querySelector(){ return null; },
  querySelectorAll(){ return []; }, addEventListener(){}, elementFromPoint(){ return null; },
  body: makeEl(),
};
global.window = global; global.addEventListener = () => {};
global.localStorage = { _s:{}, getItem(k){ return this._s[k]??null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } };
global.matchMedia = () => ({ matches:false });
global.requestAnimationFrame = () => 0;
global.innerWidth = 1280; global.innerHeight = 800;
global.Worker = class { postMessage(){} terminate(){} };
global.navigator = { serviceWorker:null };
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = () => 0; global.clearTimeout = () => {};
(0, eval)(code);
const A = globalThis.API;
const out = A.UNITS.map(u => {
  const sv = A.SKILL_VAR[u.id] || {};
  return {
    id:u.id, name:u.name, cost:u.cost, fac:u.fac, job:u.job, fac2:u.fac2||'', job2:u.job2||'',
    hp:u.hp, atk:u.atk, rng:u.rng, spd:u.spd,
    form:u.form==='me'?'近战':'远程', dtype:u.dtype==='phys'?'物理':'法术',
    skName:u.sk[0], passive:u.sk.length>2?'被动':'主动',
    arch:u.sk[1], pool:A.POOL_COPIES[u.cost],
    pow:sv.pow||1, tgt:sv.tgt||'', fx:sv.fx?JSON.stringify(sv.fx):'', p:sv.p?JSON.stringify(sv.p):'',
    rapidN:sv.rapidN||'', stealPct:sv.stealPct||'', txt:sv.txt||'',
    desc:A.skillDesc({...u, star:1}),
  };
});
fs.writeFileSync(path.join(__dirname, 'units.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('exported', out.length, 'units');
