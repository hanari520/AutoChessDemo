(function(root, factory) {
  const api = factory(typeof module==='object'&&module.exports?require('./content.js'):root.SurvivalContent);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SurvivalCore = api;
})(globalThis, function(Content) {
  'use strict';
  const SAVE_KEY = 'star_survivor_v1';
  const WEAPONS = {
    blade:{name:'星刃',kind:'melee',damage:15,rate:650,range:125,color:0xffd16e,price:15,desc:'近身扇形斩击'},
    wand:{name:'棱晶杖',kind:'shot',damage:10,rate:620,range:460,color:0x76e8d0,price:16,desc:'远程 · 穿透 1 个敌人'},
    bow:{name:'星弦弓',kind:'shot',damage:18,rate:1000,range:570,color:0xeaa3bc,price:18,desc:'远程 · 高伤害'},
    mic:{name:'共鸣音叉',kind:'pulse',damage:8,rate:1250,range:155,color:0x9ee5ff,price:20,desc:'环形音波 · 范围攻击'},
    fan:{name:'散星扇',kind:'fan',damage:6,rate:850,range:330,color:0xffad79,price:19,desc:'远程 · 三发散射'},
    satellite:{name:'巡星环',kind:'orbit',damage:10,rate:550,range:105,color:0xb7ea8c,price:22,desc:'环绕 · 持续接触伤害'}
  };
  const ITEMS = {
    heart:{name:'生命晶簇',stat:'maxHp',value:6,price:16,desc:'最大生命 +6',icon:'heart'},
    edge:{name:'锋芒印记',stat:'damage',value:10,price:19,desc:'伤害 +10%',icon:'blade'},
    boots:{name:'轻盈舞步',stat:'speed',value:8,price:15,desc:'移动速度 +8%',icon:'boots'},
    armor:{name:'守护徽章',stat:'armor',value:2,price:18,desc:'护甲 +2',icon:'shield'},
    magnet:{name:'星屑磁石',stat:'pickup',value:35,price:12,desc:'拾取范围 +35',icon:'gem'},
    rhythm:{name:'节拍加速器',stat:'haste',value:10,price:21,desc:'攻击速度 +10%',icon:'mic'},
    harvest:{name:'丰收灯笼',stat:'harvest',value:4,price:17,desc:'每波额外材料 +4',icon:'gem'},
    regen:{name:'晨光花瓣',stat:'regen',value:1,price:18,desc:'每 5 秒恢复 1 生命',icon:'heart'}
  };
  Object.assign(WEAPONS,Content.WEAPONS);Object.assign(ITEMS,Content.ITEMS);
  for(const [id,def] of Object.entries(WEAPONS)){def.family=Content.family(id);if(!Content.WEAPONS[id])def.desc=def.family+' · '+def.desc;}
  const PERKS = {
    '守护':{text:'最大生命 +10 · 护甲 +2',bonus:{maxHp:10,armor:2},weapon:'blade'},
    '狂战':{text:'伤害 +15% · 攻速 +10%',bonus:{damage:15,haste:10},weapon:'blade'},
    '法师':{text:'伤害 +20% · 拾取范围 +20',bonus:{damage:20,pickup:20},weapon:'wand'},
    '咒术':{text:'伤害 +20% · 拾取范围 +20',bonus:{damage:20,pickup:20},weapon:'wand'},
    '游侠':{text:'移动速度 +12% · 攻速 +10%',bonus:{speed:12,haste:10},weapon:'bow'},
    '刀客':{text:'伤害 +10% · 攻速 +15%',bonus:{damage:10,haste:15},weapon:'blade'},
    '医者':{text:'生命恢复 +2 · 最大生命 +5',bonus:{regen:2,maxHp:5},weapon:'mic'},
    '偶像':{text:'每波额外材料 +5 · 拾取范围 +25',bonus:{harvest:5,pickup:25},weapon:'mic'},
    '歌势':{text:'攻速 +15% · 每波额外材料 +3',bonus:{haste:15,harvest:3},weapon:'mic'},
    '刺客':{text:'移动速度 +15% · 伤害 +10%',bonus:{speed:15,damage:10},weapon:'fan'}
  };
  const DEFAULT_PERK = {text:'伤害 +10% · 最大生命 +5',bonus:{damage:10,maxHp:5},weapon:'wand'};
  const UPGRADES = [
    {stat:'maxHp',value:5,name:'体魄',desc:'最大生命 +5'},
    {stat:'damage',value:10,name:'锋芒',desc:'伤害 +10%'},
    {stat:'haste',value:10,name:'节奏',desc:'攻击速度 +10%'},
    {stat:'speed',value:8,name:'步伐',desc:'移动速度 +8%'},
    {stat:'armor',value:2,name:'防护',desc:'护甲 +2'},
    {stat:'regen',value:1,name:'复苏',desc:'每 5 秒恢复 1 生命'}
  ];
  UPGRADES.push(...Content.UPGRADES);
  const SKILL_UPGRADE={type:'skill',value:1,name:'专属觉醒',desc:'专属技能升 1 阶 · 强度 / 触发效率提高 · 最高 V 阶'};
  function perk(hero) { return PERKS[hero.job] || DEFAULT_PERK; }
  function random(s) { s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296; }
  function choose(s,list) {return list[Math.floor(random(s)*list.length)];}
  function newRun(hero,difficulty=0,seed=Date.now()) {
    const stats={maxHp:35,damage:0,haste:0,speed:0,armor:0,pickup:75,harvest:0,regen:0,...Content.EXTRA_STATS};
    for (const [key,value] of Object.entries(perk(hero).bonus)) stats[key]+=value;
    return {version:2,skillRank:1,hero:hero.id,difficulty,seed:seed>>>0,phase:'ready',wave:1,hp:stats.maxHp,stats,
      coins:0,reserve:0,xp:0,level:1,pendingLevels:0,kills:0,elapsed:0,weapons:[{id:perk(hero).weapon,tier:1}],
      companions:[],items:[],offers:[],refreshes:0,upgrades:[]};
  }
  function duration(wave) {return Math.min(60,20+wave*2);}
  function xpNeed(level) {return 7+level*4;}
  function collect(s,amount=1) {
    if (s.phase!=='battle') return;
    const bonus=Math.min(s.reserve||0,amount);s.reserve=(s.reserve||0)-bonus;
    s.coins+=amount+bonus; s.xp+=amount+bonus;
    while(s.xp>=xpNeed(s.level)) {s.xp-=xpNeed(s.level);s.level++;s.pendingLevels++;}
  }
  function applyStat(s,stat,value) {
    if (!(stat in s.stats)) return;
    s.stats[stat]+=value;
    if(stat==='maxHp')s.hp+=value;
  }
  function upgradeChoices(s) {
    const pool=UPGRADES.slice();s.upgrades=[];
    if(s.skillRank<5&&Content.signature(s.hero))s.upgrades.push({...SKILL_UPGRADE});
    while(s.upgrades.length<3)s.upgrades.push(pool.splice(Math.floor(random(s)*pool.length),1)[0]);
  }
  function makeOffer(s,roster) {
    const roll=random(s);let type,id,base;
    if(roll<.55){type='weapon';const ids=Object.keys(WEAPONS),families=new Set(s.weapons.map(w=>Content.family(w.id))),matching=ids.filter(id=>families.has(Content.family(id)));id=choose(s,[...ids,...matching]);base=WEAPONS[id].price;}
    else if(roll<.85||s.companions.length>=3){type='item';id=choose(s,Object.keys(ITEMS));base=ITEMS[id].price;}
    else {const available=roster.filter(h=>h.id!==s.hero&&!s.companions.includes(h.id));
      if(!available.length)return {type:'item',id:'heart',price:ITEMS.heart.price,locked:false};
      type='companion';id=choose(s,available).id;base=30;}
    return {type,id,price:Math.ceil(base*(1+(s.wave-1)*.085)),locked:false};
  }
  function fillShop(s,roster,preserve=false) {
    s.offers=Array.from({length:4},(_,i)=>preserve&&s.offers[i]?.locked?s.offers[i]:makeOffer(s,roster));
  }
  function beginWave(s) {
    if(!['shop','ready'].includes(s.phase))return false;
    s.phase='battle';return true;
  }
  function endWave(s,roster,stats=s.stats) {
    if(s.phase!=='battle')return false;
    s.coins+=stats.harvest;
    if(s.wave===20){s.phase='victory';return true;}
    s.hp=Math.min(s.stats.maxHp,s.hp+Math.ceil(s.stats.maxHp*.2));s.wave++;s.refreshes=0;
    fillShop(s,roster,true);
    s.phase=s.pendingLevels?'upgrade':'shop';
    if(s.pendingLevels)upgradeChoices(s);
    return true;
  }
  function pickUpgrade(s,index) {
    if(s.phase!=='upgrade'||!s.upgrades[index])return false;
    const u=s.upgrades[index];if(u.type==='skill')s.skillRank=Math.min(5,s.skillRank+1);else applyStat(s,u.stat,u.value);s.pendingLevels--;
    if(s.pendingLevels)upgradeChoices(s);else{s.phase='shop';s.upgrades=[];}
    return true;
  }
  function weaponCanFit(s,id,tier=1) {return s.weapons.length<6||s.weapons.some(w=>w.id===id&&w.tier===tier&&tier<4);}
  function addWeapon(s,id,tier=1) {
    const match=s.weapons.findIndex(w=>w.id===id&&w.tier===tier&&tier<4);
    if(match>=0){s.weapons.splice(match,1);return addWeapon(s,id,tier+1);}
    if(s.weapons.length>=6)return false;
    s.weapons.push({id,tier});return true;
  }
  function buy(s,index) {
    if(s.phase!=='shop')return false;
    const o=s.offers[index];if(!o||o.price>s.coins)return false;
    if(o.type==='weapon'&&!weaponCanFit(s,o.id))return false;
    if(o.type==='companion'&&(s.companions.length>=3||s.companions.includes(o.id)||o.id===s.hero))return false;
    if(o.type==='weapon')addWeapon(s,o.id);
    if(o.type==='item'){const item=ITEMS[o.id];if(!item)return false;applyStat(s,item.stat,item.value);s.items.push(o.id);}
    if(o.type==='companion')s.companions.push(o.id);
    s.coins-=o.price;s.offers[index]=null;return true;
  }
  function refreshCost(s){return 3+Math.floor(s.wave/3)+s.refreshes*2;}
  function refresh(s,roster){const cost=refreshCost(s);if(s.phase!=='shop'||s.coins<cost)return false;s.coins-=cost;s.refreshes++;fillShop(s,roster,true);return true;}
  function lock(s,index){if(s.phase!=='shop'||!s.offers[index])return false;s.offers[index].locked=!s.offers[index].locked;return true;}
  function sell(s,index){if(s.phase!=='shop'||!s.weapons[index]||s.weapons.length===1)return false;const w=s.weapons.splice(index,1)[0];s.coins+=Math.floor(WEAPONS[w.id].price*.5*2**(w.tier-1));return true;}
  function hit(s,raw,armor=s.stats.armor){if(s.phase!=='battle')return 0;const value=Math.max(1,Math.round(raw/(1+armor*.08)));s.hp=Math.max(0,s.hp-value);if(!s.hp)s.phase='defeat';return value;}
  function snapshot(s){if(!['ready','shop','upgrade'].includes(s.phase))return null;return JSON.parse(JSON.stringify(s));}
  function restore(raw,roster) {
    if(!raw||![1,2].includes(raw.version)||!['ready','shop','upgrade'].includes(raw.phase)||!roster.some(h=>h.id===raw.hero))return null;
    raw=JSON.parse(JSON.stringify(raw));
    if(raw.version===1){raw.stats={...Content.EXTRA_STATS,...raw.stats};raw.skillRank=1;raw.version=2;}
    if(!Number.isInteger(raw.skillRank)||raw.skillRank<1||raw.skillRank>5)return null;
    if(!Number.isInteger(raw.wave)||raw.wave<1||raw.wave>20||!Number.isInteger(raw.difficulty)||raw.difficulty<0||raw.difficulty>2)return null;
    if(!raw.stats||!Object.keys(newRun(roster[0]).stats).every(k=>Number.isFinite(raw.stats[k])&&raw.stats[k]>=0&&raw.stats[k]<=10000))return null;
    if(!Array.isArray(raw.weapons)||raw.weapons.length<1||raw.weapons.length>6||raw.weapons.some(w=>!w||!WEAPONS[w.id]||!Number.isInteger(w.tier)||w.tier<1||w.tier>4))return null;
    if(!Array.isArray(raw.companions)||raw.companions.length>3||new Set(raw.companions).size!==raw.companions.length||raw.companions.some(id=>id===raw.hero||!roster.some(h=>h.id===id)))return null;
    if(!Array.isArray(raw.items)||raw.items.some(id=>!ITEMS[id])||!Array.isArray(raw.offers)||raw.offers.length>4)return null;
    if(raw.offers.some(o=>o&&(!['weapon','item','companion'].includes(o.type)||!Number.isFinite(o.price)||o.price<0||!(o.type==='weapon'?WEAPONS[o.id]:o.type==='item'?ITEMS[o.id]:roster.some(h=>h.id===o.id)))))return null;
    for(const k of ['hp','coins','xp','level','pendingLevels','kills','elapsed','seed','refreshes'])if(!Number.isFinite(raw[k])||raw[k]<0||raw[k]>1e12)return null;
    for(const k of ['coins','xp','level','pendingLevels','kills','seed','refreshes'])if(!Number.isInteger(raw[k]))return null;
    if(raw.level<1||raw.pendingLevels>10000)return null;
    if(raw.hp<=0||raw.hp>raw.stats.maxHp||!Array.isArray(raw.upgrades)||raw.upgrades.some(u=>!u||(u.type==='skill'?u.value!==1||raw.skillRank>=5:u.type!==undefined||!UPGRADES.some(x=>x.stat===u.stat&&x.value===u.value))))return null;
    if(raw.phase==='upgrade'&&(raw.pendingLevels<1||raw.upgrades.length!==3))return null;
    if(raw.reserve!==undefined&&(!Number.isFinite(raw.reserve)||raw.reserve<0||raw.reserve>1000000))return null;
    const restored=JSON.parse(JSON.stringify(raw));restored.reserve=restored.reserve||0;
    restored.upgrades=restored.upgrades.map(u=>({... (u.type==='skill'?SKILL_UPGRADE:UPGRADES.find(x=>x.stat===u.stat&&x.value===u.value))}));return restored;
  }
  return {SAVE_KEY,WEAPONS,ITEMS,UPGRADES,perk,random,choose,newRun,duration,xpNeed,collect,applyStat,
    beginWave,endWave,pickUpgrade,buy,refresh,refreshCost,lock,sell,hit,snapshot,restore,weaponCanFit,upgradeChoices};
});
