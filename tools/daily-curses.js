/* Daily challenge rules, version 2. This module never reads or rewrites S.curses.
 * All transitions are pure: the host applies effects, then stores the returned state.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DailyCurses = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VERSION = 2;
  const CATALOG = Object.freeze([
    {id:'dc_seal',name:'封印轮转',limit:'每 5 回合封印一项随机羁绊；该回合前预告，封印期间该羁绊不生效。',compensation:'每次新封印当回合免费刷新一次商店，过期不结转。',timing:'第 1、6、11…96 回合封印；第 5、10…95 回合预告下一项。'},
    {id:'dc_class',name:'职业偏科',limit:'己方职业羁绊每档人数门槛 +1。',compensation:'每章开局从三名不同职业的 2 费棋子中确定性获得一名。',timing:'第 1、26、51、76 回合领取。'},
    {id:'dc_faction',name:'阵营流亡',limit:'己方阵营羁绊每档人数门槛 +1。',compensation:'每章开局从三名不同阵营的 2 费棋子中确定性获得一名。',timing:'第 1、26、51、76 回合领取。'},
    {id:'dc_march',name:'急行军',limit:'每章第 20～25 回合敌方生命与攻击 +15%，守关仍在第 25、50、75、100 回合。',compensation:'开局获得 1 张升星券；每章前 10 回合自然经验额外 +1。',timing:'压力期为 20～25、45～50、70～75、95～100 回合。'},
    {id:'dc_debt',name:'血债',limit:'生命上限 30；每逢第 5 回合开局支付 4 金，不足则失去 3 生命。',compensation:'开局 +12 金；每次成功付款返还 2 金。',timing:'第 5、10…100 回合，商店刷新前结算。'},
    {id:'dc_market',name:'黑市货架',limit:'商店仅 4 格；每回合第 3 次及之后主动刷新花费 3 金。',compensation:'每回合首次主动刷新免费；第 2 次仍为 2 金。',timing:'每个备战回合重置刷新次数。'},
    {id:'dc_nointerest',name:'无息赌局',limit:'存款不产生利息。',compensation:'每次普通战胜利额外 +2 金；野怪和守关战不发。',timing:'每场普通战胜利结算。'},
    {id:'dc_slowgrowth',name:'缓慢成长',limit:'不可购买经验。',compensation:'自然经验每回合 +3（原 +2）；开局 +6 金，每章起始再 +4 金。',timing:'第 1、26、51、76 回合发金；自然经验全局生效。'},
    {id:'dc_fog',name:'迷雾军情',limit:'备战期隐藏敌方具体棋子与站位，只显示人数、费用分布与羁绊。',compensation:'每 5 回合免费使用一项本回合临时增益，不能累计或折现。',timing:'第 5、10…100 回合发放，结算后清除。'},
    {id:'dc_five',name:'五人远征',limit:'己方人口上限 5；敌方人数不下调，商店品质仍按回合升档。',compensation:'开局 +16 金；每章第 10 回合得到 1 件基础装备。',timing:'第 10、35、60、85 回合发装备。'},
    {id:'dc_glass',name:'脆晶军团',limit:'己方全体最大生命 -25%、攻击 +25%。',compensation:'开局获得护甲；之后每章开局再获得 1 件护甲。',timing:'第 1、26、51、76 回合发装备。'},
    {id:'dc_drought',name:'枯潮',limit:'己方主动技能耗蓝 50→75。',compensation:'主动技能造成的伤害与治疗 +20%；开局 +6 金，每章起始再 +4 金。',timing:'第 1、26、51、76 回合发金；技能倍率仅作用于技能直接伤害和治疗。'},
    {id:'dc_armor',name:'重甲入侵',limit:'敌方全体最大生命与攻击 +12%。',compensation:'每个 5 回合区间的首次普通战胜利额外 +5 金，每区间最多一次。',timing:'区间 1～5、6～10…96～100；野怪、守关、失败不发。'},
    {id:'dc_lightgear',name:'轻装出战',limit:'每名己方棋子最多装备 1 件，多余装备留在背包。',compensation:'每章第 5、10、15、20 回合野怪战额外掉落 1 件基础装备，胜负都发。',timing:'第 5、10、15、20、30…95 回合结算；四个守关回合不发。'}
  ]);
  const BY_ID = Object.fromEntries(CATALOG.map(x => [x.id, x]));
  const CHAPTER_START = [1,26,51,76];
  const BASE_ITEMS = ['sword','staff','armor','bow','vamp','mana'];
  const DAILY_EPOCH = Date.UTC(2026,0,1);
  const pickCache = new Map();
  function hash(n) {
    let x = (Number(n) ^ 0x9e3779b9) >>> 0;
    x = Math.imul(x ^ x >>> 16, 0x45d9f3b);
    x = Math.imul(x ^ x >>> 16, 0x45d9f3b);
    return (x ^ x >>> 16) >>> 0;
  }
  function dateValid(seed) {
    if (!Number.isInteger(seed) || seed < 20260101 || seed > 20991231) return false;
    const y = Math.floor(seed / 10000), m = Math.floor(seed / 100) % 100, d = seed % 100;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === m && t.getUTCDate() === d;
  }
  function pick(seed) {
    if (!dateValid(seed)) return null;
    if (pickCache.has(seed)) return pickCache.get(seed);
    // Derive history from dates, never local storage. The ten preceding days are excluded.
    const y=Math.floor(seed/10000), m=Math.floor(seed/100)%100, d=seed%100;
    const target=Date.UTC(y,m-1,d), recent=[];
    let chosen=null;
    for (let day=DAILY_EPOCH, guard=0; day<=target && guard<30000; day+=86400000,guard++) {
      const date=new Date(day);
      const daySeed=date.getUTCFullYear()*10000+(date.getUTCMonth()+1)*100+date.getUTCDate();
      const pool=CATALOG.filter(rule=>!recent.includes(rule.id));
      chosen=pool[hash(daySeed ^ 0x2d4c2)%pool.length];
      recent.push(chosen.id);
      if (recent.length>10) recent.shift();
      if (guard>9) pickCache.set(daySeed,chosen);
    }
    return chosen;
  }
  function create(seed) {
    const rule = pick(seed);
    return rule ? {version:VERSION,id:rule.id,seed,done:{},refreshes:0,refreshRound:0,freeRefreshRound:0,freeBuffRound:0,seal:null} : null;
  }
  function restore(saved, seed) {
    if (!saved || !dateValid(seed) || saved.version !== VERSION || saved.seed !== seed ||
        !BY_ID[saved.id] || pick(seed).id !== saved.id || !saved.done ||
        typeof saved.done !== 'object' || Array.isArray(saved.done)) return null;
    const result = create(seed);
    result.done = Object.fromEntries(Object.entries(saved.done).filter(([k,v]) => /^[a-z]+:[1-9]\d{0,2}$/.test(k) && v === true));
    for (const key of ['refreshes','refreshRound','freeRefreshRound','freeBuffRound']) {
      const value = saved[key]; result[key] = Number.isInteger(value) && value >= 0 && value <= 100 ? value : 0;
    }
    result.seal = saved.seal && typeof saved.seal === 'string' ? saved.seal : null;
    return result;
  }
  function description(id) { return BY_ID[id] || null; }
  function chapterRound(round) { return ((round - 1) % 25) + 1; }
  function isOrdinary(ctx) { return !!ctx.won && !!ctx.ordinary && !ctx.creep && !ctx.boss; }
  function offerUnit(state, round, units, field) {
    const pool = (Array.isArray(units) ? units : []).filter(u => u && u.cost === 2 && u.id && u[field]);
    const names = new Set(), options = [];
    const ordered = pool.slice().sort((a,b) => hash(state.seed ^ round ^ hashString(a.id)) - hash(state.seed ^ round ^ hashString(b.id)));
    for (const u of ordered) if (!names.has(u[field]) && options.length < 3) { names.add(u[field]); options.push(u.id); }
    return options.length ? {type:'unit',options, key:options[0], fallbackGold:3, text:`定向招募：获得 ${options[0]}（可在领取前从候选中选一名；满员则获得 3 金）`} : {type:'gold',amount:3,text:'定向招募无可用棋子，折为 3 金'};
  }
  function hashString(s) { let h=2166136261; for (const ch of String(s)) h=Math.imul(h ^ ch.charCodeAt(0),16777619); return h>>>0; }
  function itemAt(state, round) { return BASE_ITEMS[hash(state.seed ^ (round * 7919)) % BASE_ITEMS.length]; }
  function sealAt(state, round, synergies) {
    const names = (Array.isArray(synergies) ? synergies : []).slice().sort();
    return names.length ? names[hash(state.seed ^ (Math.ceil(round / 5) * 2654435761)) % names.length] : null;
  }
  function transition(saved, event, ctx = {}) {
    if (!saved || !BY_ID[saved.id]) return {state:saved,effects:[]};
    const s = {...saved,done:{...saved.done}}, effects=[];
    const r = Number(ctx.round);
    if (!Number.isInteger(r) || r < 1 || r > 100) return {state:s,effects};
    const tag = `${event}:${r}`;
    if (event === 'refresh') {
      if (s.refreshRound !== r) { s.refreshRound=r; s.refreshes=0; }
      s.refreshes++;
      return {state:s,effects};
    }
    if (!['start','roundStart','result'].includes(event) || (event==='start' && r!==1) || s.done[tag]) return {state:s,effects};
    s.done[tag] = true;
    if (event === 'start' || event === 'roundStart') {
      if (event === 'roundStart') { s.refreshRound=r; s.refreshes=0; s.freeRefreshRound=0; s.freeBuffRound=0; }
      if (event === 'start') {
        const startGold={dc_debt:12,dc_slowgrowth:6,dc_five:16,dc_drought:6};
        if (startGold[s.id]) effects.push({type:'gold',amount:startGold[s.id],text:'每日诅咒开局补偿'});
        if (s.id === 'dc_march') effects.push({type:'ticket',amount:1,text:'急行军开局升星券'});
      }
      if (CHAPTER_START.includes(r) && (r !== 1 || event === 'start')) {
        if (s.id === 'dc_class' || s.id === 'dc_faction') {
          const offer=offerUnit(s,r,ctx.units,s.id==='dc_class'?'job':'fac');
          if (offer) effects.push(offer);
        }
        if (s.id === 'dc_glass') effects.push({type:'item',key:'armor',text:'脆晶军团章节护甲补给'});
        if (r > 1 && (s.id === 'dc_slowgrowth' || s.id === 'dc_drought')) effects.push({type:'gold',amount:4,text:'每日诅咒章节补给'});
      }
      if (event === 'roundStart') {
        if (s.id === 'dc_seal') {
          if (chapterRound(r) % 5 === 1) {
            s.seal=sealAt(s,r,ctx.synergies); s.freeRefreshRound=r;
            effects.push({type:'log',text:`本回合封印 ${s.seal || '一项羁绊'}；免费刷新一次，逾期作废`});
          } else if (chapterRound(r) % 5 === 0 && r < 100) {
            const next=sealAt(s,r+1,ctx.synergies);
            if (next) effects.push({type:'log',text:`下回合将封印 ${next}`});
          }
        }
        if (s.id === 'dc_debt' && r % 5 === 0) {
          if (Number(ctx.gold) >= 4) { effects.push({type:'gold',amount:-4,text:'血债支付 4 金'}); effects.push({type:'gold',amount:2,text:'血债及时付款返还 2 金'}); }
          else effects.push({type:'hp',amount:-3,text:'血债金币不足，失去 3 生命'});
        }
        if (s.id === 'dc_fog' && r % 5 === 0) {
          s.freeBuffRound=r; effects.push({type:'freeBuff',options:['atk','hp','nuke'],key:'hp',text:'本回合免费临时增益，不结转'});
        }
        if (s.id === 'dc_five' && chapterRound(r) === 10) effects.push({type:'item',key:itemAt(s,r),text:'五人远征章节装备补给'});
      }
    }
    if (event === 'result') {
      if (s.id === 'dc_nointerest' && isOrdinary(ctx)) effects.push({type:'gold',amount:2,text:'无息赌局普通战胜利'});
      if (s.id === 'dc_armor' && isOrdinary(ctx)) {
        const block=Math.floor((r-1)/5), claim=`bounty:${block+1}`;
        if (!s.done[claim]) {s.done[claim]=true;effects.push({type:'gold',amount:5,text:'重甲入侵区间首胜赏金'});}
      }
      if (s.id === 'dc_lightgear' && ctx.creep && !ctx.boss && chapterRound(r) % 5 === 0)
        effects.push({type:'item',key:itemAt(s,r),text:'轻装出战野怪战额外基础装备'});
      if (s.id === 'dc_fog') s.freeBuffRound=0;
    }
    return {state:s,effects};
  }
  function modifiers(s, ctx = {}) {
    const r=Number(ctx.round)||1, id=s && s.id;
    const m={synergyClassOffset:0,synergyFactionOffset:0,bannedSynergy:null,shopSize:5,refreshCost:2,
      interestMultiplier:1,maxHp:40,cap:11,naturalXp:2,buyXp:true,allyHpMultiplier:1,allyAtkMultiplier:1,
      enemyHpMultiplier:1,enemyAtkMultiplier:1,manaCost:50,skillMultiplier:1,maxEquip:null,shopLevelByRound:false,
      fog:false,freeTempBuff:false,shopLevel:null};
    if (!id) return m;
    if (id==='dc_seal') {m.bannedSynergy=s.seal; if (s.freeRefreshRound===r && s.refreshes===0) m.refreshCost=0;}
    if (id==='dc_class') m.synergyClassOffset=1;
    if (id==='dc_faction') m.synergyFactionOffset=1;
    if (id==='dc_march') {if (chapterRound(r)>=20){m.enemyHpMultiplier=1.15;m.enemyAtkMultiplier=1.15;} if (chapterRound(r)<=10)m.naturalXp=3;}
    if (id==='dc_debt') m.maxHp=30;
    if (id==='dc_market') {m.shopSize=4;m.refreshCost=s.refreshRound===r&&s.refreshes>=2?3:s.refreshRound===r&&s.refreshes===1?2:0;}
    if (id==='dc_nointerest') m.interestMultiplier=0;
    if (id==='dc_slowgrowth') {m.naturalXp=3;m.buyXp=false;}
    if (id==='dc_fog') {m.fog=true;m.freeTempBuff=s.freeBuffRound===r;}
    if (id==='dc_five') {m.cap=5;m.shopLevelByRound=true;m.shopLevel=Math.min(11,5+Math.floor((r-1)/5));}
    if (id==='dc_glass') {m.allyHpMultiplier=.75;m.allyAtkMultiplier=1.25;}
    if (id==='dc_drought') {m.manaCost=75;m.skillMultiplier=1.2;}
    if (id==='dc_armor') {m.enemyHpMultiplier=1.12;m.enemyAtkMultiplier=1.12;}
    if (id==='dc_lightgear') m.maxEquip=1;
    return m;
  }
  function nextNotice(s, round, synergies) {
    if (!s || !BY_ID[s.id]) return '';
    if (s.id==='dc_debt') return `下次血债：第 ${Math.ceil(Math.max(1,round)/5)*5} 回合，备战开始支付 4 金（不足失去 3 生命）`;
    if (s.id==='dc_seal') {const next=round+((5-(round-1)%5)%5);return `第 ${next} 回合封印 ${sealAt(s,next,synergies)||'一项羁绊'}`;}
    if (s.id==='dc_armor') return `当前区间 ${Math.floor((round-1)/5)*5+1}～${Math.ceil(round/5)*5}：首次普通战胜利 +5 金`;
    if (s.id==='dc_fog') return `第 ${Math.ceil(round/5)*5} 回合可领取免费临时增益`;
    return BY_ID[s.id].timing;
  }
  return Object.freeze({VERSION,CATALOG,pick,create,restore,transition,modifiers,description,nextNotice});
});
