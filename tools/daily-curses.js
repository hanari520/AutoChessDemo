/* Shared, deterministic single-curse rules for daily and custom campaigns. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DailyCurses=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const VERSION=3;
  const CATALOG=Object.freeze([
    {id:'dc_rift',name:'裂隙地带',limit:'每章我方半区固定出现 4 个裂隙格；站在上面的棋子最大生命 -15%。',compensation:'裂隙格棋子伤害 +15%。',timing:'每章开始更换裂隙，整章不变。'},
    {id:'dc_cluster',name:'密阵反噬',limit:'任意 2×2 区域站有至少 3 名己方棋子时，该区域棋子攻击速度 -15%。',compensation:'未触发拥挤惩罚时，全队攻击速度 +5%。',timing:'按开战时站位结算。'},
    {id:'dc_flank',name:'侧翼风暴',limit:'最左和最右列的己方棋子受到伤害 +20%。',compensation:'这些棋子造成伤害 +15%。',timing:'按开战时站位结算。'},
    {id:'dc_rear',name:'后排暴露',limit:'最后一行的己方棋子受到伤害 +20%。',compensation:'前两行的己方棋子获得 8% 减伤。',timing:'按开战时站位结算。'},
    {id:'dc_bias',name:'羁绊偏科',limit:'每章一项固定职业或阵营羁绊，各档门槛 +1。',compensation:'每章开始获得一名具有该羁绊的 2 费棋子；满备战席折为 3 金。',timing:'每章第 1 回合更新，整章不变。'},
    {id:'dc_economy',name:'经济封锁',limit:'商店 4 格，利息上限 2 金。',compensation:'每回合首次主动刷新免费；普通战胜利 +1 金。',timing:'自动生效，免费刷新不结转。'},
    {id:'dc_growth',name:'定额成长',limit:'无法购买经验；每章最后 5 回合敌方生命与攻击 +10%。',compensation:'自然经验每回合 +3；开局获得 1 张升星券。',timing:'压力期为 21～25、46～50、71～75、96～100 回合。'},
    {id:'dc_debt',name:'血债',limit:'生命上限 32；每逢第 5 回合自动支付 3 金，不足失去 2 生命。',compensation:'开局 +10 金。',timing:'第 5、10…100 回合，自动在商店刷新前结算。'},
    {id:'dc_fog',name:'迷雾军情',limit:'备战期隐藏敌方具体棋子与站位，仍显示人数、费用分布和羁绊。',compensation:'每章开始获得 1 件基础装备。',timing:'第 1、26、51、76 回合发装备。'},
    {id:'dc_glass',name:'脆晶军团',limit:'己方最大生命 -20%。',compensation:'己方攻击 +20%；每章开始获得 1 件护甲。',timing:'第 1、26、51、76 回合发护甲。'},
    {id:'dc_drought',name:'枯潮',limit:'己方主动技能耗蓝 50→70。',compensation:'技能直接伤害和治疗 +20%；每章开始 +4 金。',timing:'第 1、26、51、76 回合发金。'},
    {id:'dc_armor',name:'重甲入侵',limit:'敌方最大生命与攻击 +10%。',compensation:'每个 5 回合区间首次普通战胜利 +4 金。',timing:'区间为 1～5、6～10…96～100。'}
  ]);
  const BY_ID=Object.fromEntries(CATALOG.map(x=>[x.id,x]));
  const CHAPTER_START=[1,26,51,76], ITEMS=['sword','staff','armor','bow','vamp','mana'];
  const EPOCH=Date.UTC(2026,0,1), DAY=86400000, CACHE=new Map();
  function hash(n){let x=(Number(n)^0x9e3779b9)>>>0;x=Math.imul(x^x>>>16,0x45d9f3b);x=Math.imul(x^x>>>16,0x45d9f3b);return(x^x>>>16)>>>0;}
  function valid(seed){if(!Number.isInteger(seed)||seed<20260101||seed>20991231)return false;const y=Math.floor(seed/10000),m=Math.floor(seed/100)%100,d=seed%100,t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d;}
  function pick(seed){if(!valid(seed))return null;if(CACHE.has(seed))return CACHE.get(seed);const y=Math.floor(seed/10000),m=Math.floor(seed/100)%100,d=seed%100,target=Date.UTC(y,m-1,d),recent=[];let chosen=null;for(let date=EPOCH;date<=target;date+=DAY){const dt=new Date(date),key=dt.getUTCFullYear()*10000+(dt.getUTCMonth()+1)*100+dt.getUTCDate(),pool=CATALOG.filter(x=>!recent.includes(x.id));chosen=pool[hash(key^0x2d4c2)%pool.length];recent.push(chosen.id);if(recent.length>10)recent.shift();if(date+DAY>target)CACHE.set(seed,chosen);}return chosen;}
  function create(seed,id){if(!valid(seed))return null;const rule=id?BY_ID[id]:pick(seed);return rule?{version:VERSION,id:rule.id,seed,custom:!!id,done:{},refreshes:0,refreshRound:0,focus:null}:null;}
  function restore(saved,seed,id){if(!saved||!valid(seed)||saved.version!==VERSION||saved.seed!==seed||!BY_ID[saved.id]||saved.id!==(id||pick(seed).id)||!!saved.custom!==!!id||!saved.done||typeof saved.done!=='object'||Array.isArray(saved.done))return null;const s=create(seed,id);s.done=Object.fromEntries(Object.entries(saved.done).filter(([k,v])=>/^[a-z]+:[1-9]\d{0,2}$/.test(k)&&v===true));s.refreshRound=Number.isInteger(saved.refreshRound)&&saved.refreshRound>=0&&saved.refreshRound<=100?saved.refreshRound:0;s.refreshes=Number.isInteger(saved.refreshes)&&saved.refreshes>=0&&saved.refreshes<=100?saved.refreshes:0;s.focus=typeof saved.focus==='string'?saved.focus:null;return s;}
  function description(id){return BY_ID[id]||null;}
  function chapter(round){return Math.ceil(round/25);}
  function chapterRound(round){return((round-1)%25)+1;}
  function rifts(state,round){const ch=chapter(round),pool=Array.from({length:32},(_,i)=>i+32),out=[];for(let i=0;i<4;i++){const index=hash(state.seed^(ch*7919)^(i*1777))%pool.length;out.push(pool.splice(index,1)[0]);}return out.sort((a,b)=>a-b);}
  function synergyAt(state,round,names,units){const offered=new Set((Array.isArray(units)?units:[]).filter(u=>u&&u.cost===2).flatMap(u=>[u.fac,u.fac2,u.job,u.job2].filter(Boolean))),pool=(Array.isArray(names)?names:[]).filter(n=>offered.has(n)).slice().sort();return pool.length?pool[hash(state.seed^(chapter(round)*2654435761))%pool.length]:null;}
  function itemAt(state,round){return ITEMS[hash(state.seed^(round*7919))%ITEMS.length];}
  function unitAt(state,round,units,focus){const pool=(Array.isArray(units)?units:[]).filter(u=>u&&u.cost===2&&u.id&&[u.fac,u.fac2,u.job,u.job2].includes(focus));if(!pool.length)return{type:'gold',amount:3,text:'偏科招募无可用棋子，折为 3 金'};const u=pool[hash(state.seed^round)%pool.length];return{type:'unit',key:u.id,fallbackGold:3,text:'羁绊偏科章节招募'};}
  function transition(saved,event,ctx={}){if(!saved||!BY_ID[saved.id])return{state:saved,effects:[]};const s={...saved,done:{...saved.done}},effects=[],r=Number(ctx.round);if(!Number.isInteger(r)||r<1||r>100)return{state:s,effects};if(event==='refresh'){if(s.refreshRound!==r){s.refreshRound=r;s.refreshes=0;}s.refreshes++;return{state:s,effects};}const tag=`${event}:${r}`;if(!['start','roundStart','result'].includes(event)||(event==='start'&&r!==1)||s.done[tag])return{state:s,effects};s.done[tag]=true;
    if(event==='start'){if(s.id==='dc_debt')effects.push({type:'gold',amount:10,text:'血债开局补偿'});if(s.id==='dc_growth')effects.push({type:'ticket',amount:1,text:'定额成长开局升星券'});}
    if(event==='roundStart'){s.refreshRound=r;s.refreshes=0;if(CHAPTER_START.includes(r)){if(s.id==='dc_bias'){s.focus=synergyAt(s,r,ctx.synergies,ctx.units);if(s.focus){effects.push({type:'log',text:`本章偏科羁绊：${s.focus}，各档门槛 +1`});effects.push(unitAt(s,r,ctx.units,s.focus));}}if(s.id==='dc_fog')effects.push({type:'item',key:itemAt(s,r),text:'迷雾军情章节装备'});if(s.id==='dc_glass')effects.push({type:'item',key:'armor',text:'脆晶军团章节护甲'});if(s.id==='dc_drought')effects.push({type:'gold',amount:4,text:'枯潮章节补给'});if(s.id==='dc_rift')effects.push({type:'log',text:`本章裂隙格：${rifts(s,r).map(i=>`${Math.floor(i/8)-3}排${i%8+1}列`).join('、')}`});}if(s.id==='dc_debt'&&r%5===0){effects.push(Number(ctx.gold)>=3?{type:'gold',amount:-3,text:'血债支付 3 金'}:{type:'hp',amount:-2,text:'血债断供，失去 2 生命'});}}
    if(event==='result'&&ctx.won&&ctx.ordinary&&!ctx.creep&&!ctx.boss){if(s.id==='dc_economy')effects.push({type:'gold',amount:1,text:'经济封锁普通战胜利'});if(s.id==='dc_armor'){const key=`bounty:${Math.ceil(r/5)}`;if(!s.done[key]){s.done[key]=true;effects.push({type:'gold',amount:4,text:'重甲入侵区间首胜'});}}}return{state:s,effects};}
  function modifiers(s,ctx={}){const r=Number(ctx.round)||1,id=s&&s.id,m={shopSize:5,refreshCost:2,interestCap:3,interestMultiplier:1,maxHp:40,cap:11,naturalXp:2,buyXp:true,allyHpMultiplier:1,allyAtkMultiplier:1,enemyHpMultiplier:1,enemyAtkMultiplier:1,manaCost:50,skillMultiplier:1,fog:false,synergyPenalty:null,boardCurse:null,rifts:[]};if(!id)return m;
    if(id==='dc_rift'){m.boardCurse='rift';m.rifts=rifts(s,r);}if(id==='dc_cluster')m.boardCurse='cluster';if(id==='dc_flank')m.boardCurse='flank';if(id==='dc_rear')m.boardCurse='rear';if(id==='dc_bias')m.synergyPenalty=s.focus||null;if(id==='dc_economy'){m.shopSize=4;m.interestCap=2;m.refreshCost=s.refreshRound===r&&s.refreshes>0?2:0;}if(id==='dc_growth'){m.naturalXp=3;m.buyXp=false;if(chapterRound(r)>=21){m.enemyHpMultiplier=1.1;m.enemyAtkMultiplier=1.1;}}if(id==='dc_debt')m.maxHp=32;if(id==='dc_fog')m.fog=true;if(id==='dc_glass'){m.allyHpMultiplier=.8;m.allyAtkMultiplier=1.2;}if(id==='dc_drought'){m.manaCost=70;m.skillMultiplier=1.2;}if(id==='dc_armor'){m.enemyHpMultiplier=1.1;m.enemyAtkMultiplier=1.1;}return m;}
  function nextNotice(s,round){if(!s||!BY_ID[s.id])return'';if(s.id==='dc_debt')return`第 ${Math.ceil(Math.max(1,round)/5)*5} 回合自动支付 3 金（不足失去 2 生命）`;if(s.id==='dc_bias')return`本章门槛 +1：${s.focus||'章节开始揭晓'}`;return BY_ID[s.id].timing;}
  return Object.freeze({VERSION,CATALOG,pick,create,restore,transition,modifiers,description,nextNotice,rifts});
});
