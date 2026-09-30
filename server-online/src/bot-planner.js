/* Shared Adaptive v4.3 planner. Only the host may execute game actions.
 * State contains visible, normalized preparation data; no DOM, private RNG,
 * opponent shops, or opponent current preparation boards enter this engine. */
(function(root){
  'use strict';
  const version='Adaptive v4.3';
  function create(host){
    let S;
    const {unitDef:byId,pairs:pairCount,hasTwo:has2star,hasThree:has3star,
    factions:facsOf,jobs:jobsOf,synScore:teamSynScore,buyCard:buy,
    xpNeeded:xpNeed,levelCap:lvlCap,curse:hasCurse,modifiers:dailyMods,
    recipe:comboOf,combine:combineBagPair,slots:maxEquip,passive:isPassive,
    deploy:autoDeployBest,runLength:runLimit,chapterLength:chLen,
    rarity:augRarity,ticket:applyTicket,challengeAvailable,chooseChallenge,
    render:renderAll,schedule:setTimeout,refreshPrice:refreshCost,equipment:ITEMS,
    gearPolicy:BotEquipmentPolicy}=host;
function botMembers(){ return [...(S.board||[]),...(S.bench||[])].filter(Boolean); }
function botBoard(){ return (S.board||[]).filter(Boolean); }
function botBench(){ return (S.bench||[]).filter(Boolean); }
function botPower(u){ return Math.pow(u.star||1,1.7)*(Math.max(1,u.atk||0)*1.7+Math.max(1,u.maxhp||u.hp||0)*.22); }
function botLinePower(team,pop=S.lvl||11){
  const active=(team||[]).filter(Boolean).slice(0,pop||11);
  const raw=active.reduce((n,u)=>n+botPower(u),0);
  const syn=(typeof teamSynScore==='function')?teamSynScore(active):0;
  const gear=active.reduce((n,u)=>n+(u.items||[]).length*28,0);
  return raw+syn*3.2+gear+active.length*25;
}
function botFogged(){   // 🌫 迷雾军情：托管不使用看不到的敌方情报（默认防护）
  return typeof dailyMods==='function' && !!dailyMods() && dailyMods().fog===true;
}
function botOpponentPower(){
  if(!S.enemyBoard||botFogged()) return 0;
  return botLinePower(S.enemyBoard.filter(Boolean),S.arenaOpponentLevel||S.lvl);
}
function botPressure(){
  const own=botLinePower(botBoard()), foe=botOpponentPower();
  return foe>0 ? (foe-own)/Math.max(1,foe) : 0;
}
function botProfile(){ return S.botProfile||'balanced'; }
function botCampaign(){ return !S.arena && !S.daily && !(S.curses||[]).length; }
function botCheckpoint(){ return botCampaign() && S.round%chLen()===0; }
function botRecentDamage(){
  return (S.stats&&S.stats.hpLog||[]).filter(x=>x.r>=S.round-5).reduce((n,x)=>n+x.d,0);
}
function botUrgency(){
  const gap=botPressure();
  if(botCampaign() && S.round>=16){
    const damage=botRecentDamage();
    if(S.hp<=16 || (S.hp<=24 && damage>=6)) return 'survive';
    if(S.hp<=30 || damage>=5) return 'stabilize';
  }
  if(S.hp<=10 || (S.hp<=18 && gap>.22)) return 'survive';
  if(S.lossStreak>=2 || gap>.30 || botBoard().length<Math.min(S.lvl,4)) return 'stabilize';
  if(S.gold>=50 && S.lvl>=7) return 'strengthen';
  return 'economy';
}
function botTagCounts(units){
  const fac={},job={},seen=new Set();
  (units||[]).forEach(u=>{ if(seen.has(u.id))return; seen.add(u.id); const d=byId(u.id);
    (typeof facsOf==='function'?facsOf(d):[d.fac,d.fac2].filter(Boolean)).forEach(k=>fac[k]=(fac[k]||0)+1);
    (typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2].filter(Boolean)).forEach(k=>job[k]=(job[k]||0)+1);
  });
  return {fac,job};
}
function botTagValue(u,team){
  const d=byId(u.id), tags=botTagCounts(team), seen=new Set(team.map(x=>x.id));
  let v=0;
  (typeof facsOf==='function'?facsOf(d):[d.fac,d.fac2].filter(Boolean)).forEach(k=>{
    const n=tags.fac[k]||0; v+=n===0?5:n===1?13:n===2?8:2;
  });
  (typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2].filter(Boolean)).forEach(k=>{
    const n=tags.job[k]||0; v+=n===0?5:n===1?13:n===2?8:2;
  });
  if(seen.has(u.id)) v+=7; // same-piece upgrades are valuable even outside the active plan
  return v;
}
function botPlan(){
  const units=botMembers(), counts=botTagCounts(units), all=[];
  Object.keys(counts.fac).forEach(k=>all.push({kind:'fac',key:k,n:counts.fac[k]}));
  Object.keys(counts.job).forEach(k=>all.push({kind:'job',key:k,n:counts.job[k]}));
  all.sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key));
  const old=S.botPlan, retained=old&&old.tags&&old.tags.filter(t=>units.some(u=>{
    const d=byId(u.id), values=t.kind==='fac'?(typeof facsOf==='function'?facsOf(d):[d.fac,d.fac2]):(typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2]);
    return values.includes(t.key);
  })).length;
  // Pivot when the current bench/shop gives a clear new direction; otherwise keep the comp for a round.
  const best=all.slice(0,4);
  let candidate=best;
  if(botProfile()==='flexible')candidate=best;
  else if(botProfile()==='synergy'&&old&&old.tags&&retained>=1)candidate=old.tags;
  if(botProfile()!=='flexible'&&botProfile()!=='synergy'&&retained>=2&&old.tags.length>=2){
    const pivotScore=best.slice(0,2).reduce((n,t)=>n+t.n,0);
    const oldScore=old.tags.reduce((n,t)=>n+units.filter(u=>{
      const d=byId(u.id), vals=t.kind==='fac'?(typeof facsOf==='function'?facsOf(d):[d.fac,d.fac2]):(typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2]);
      return vals.includes(t.key);
    }).length,0);
    if(pivotScore<oldScore+2) candidate=old.tags;
  }
  S.botPlan={tags:candidate.map(t=>({kind:t.kind,key:t.key})),updated:S.round};
  return S.botPlan;
}
function botInPlan(u,plan){
  const d=byId(u.id), fs=typeof facsOf==='function'?facsOf(d):[d.fac,d.fac2], js=typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2];
  return (plan&&plan.tags||[]).some(t=>(t.kind==='fac'?fs:js).includes(t.key));
}
function botPairProgress(id){
  return botMembers().reduce((n,u)=>n+(u.id===id?(u.star===2?3:(u.star||1)):0),0);
}
function botScoring(u,plan){
  const d=byId(u.id), count=pairCount(u.id), progress=botPairProgress(u.id), own=botMembers();
  let score=botPower({star:1,atk:d.atk,maxhp:d.hp})*.035 + botTagValue(u,own)*1.5 + d.cost*1.7;
  if(count>=2) score+=90+d.cost*5;
  else if(progress>=5 && !has3star(u.id)) score+=36+d.cost*3;
  else if(progress>=3 && has2star(u.id)) score+=19+d.cost*2;
  if(botInPlan(u,plan)) score+=14;
  if(botBoard().length<S.lvl) score+=23;
  const profile=botProfile();
  if(profile==='reroll'&&d.cost<=2) score+=9;
  if(profile==='aggressive'&&d.cost>=3) score+=7;
  if(profile==='tempo'&&botBoard().length<S.lvl)score+=15;
  if(profile==='synergy'&&botInPlan(u,plan))score+=16;
  if(profile==='flexible'&&d.cost>=4)score+=9;
  if(profile==='economy'&&d.cost>=4) score-=8;
  if(!botFogged()&&S.enemyBoard&&S.enemyBoard.filter(Boolean).length){
    const enemies=S.enemyBoard.filter(Boolean), ed=botTagCounts(enemies), enemyJobs=enemies.map(x=>byId(x.id).job);
    const myJobs=typeof jobsOf==='function'?jobsOf(d):[d.job,d.job2];
    if(enemyJobs.filter(j=>j==='刺客').length>=2&&myJobs.some(j=>j==='守护'||j==='医者'))score+=11;
    if(enemyJobs.filter(j=>j==='守护').length>=2&&(d.dtype==='magic'||myJobs.includes('咒术')))score+=9;
    if(enemyJobs.filter(j=>j==='游侠'||j==='法师').length>=3&&myJobs.includes('刺客'))score+=10;
    if(Object.values(ed.fac).some(n=>n>=3)&&d.cost>=3)score+=2;
  }
  if(has3star(u.id)) score-=30;
  return score;
}
function botEconFloor(mode){
  const profile=botProfile();
  // A checkpoint loss ends the run regardless of remaining player health.
  // Invest here; ordinary rounds still preserve the profile's income buffer.
  if(botCheckpoint())return 5;
  // Do not bank the opening hand while the starting board is empty: deploy two
  // affordable units first, then switch back to the profile's savings plan.
  if(S.round<=2&&botBoard().length<Math.min(S.lvl,2))return 0;
  if(botCampaign() && S.round>=16){
    if(mode==='survive') return S.hp<=8?0:5;
    if(mode==='stabilize') return S.hp<=22?10:25;
    if(S.hp<35) return 35;
  }
  if(mode==='survive') return profile==='economy'?12:4;
  if(mode==='stabilize') return S.arena?(profile==='economy'?20:12):22;
  if(mode==='strengthen') return S.arena
    ? (profile==='economy'?45:(profile==='tempo'||profile==='aggressive'?25:35)) : 45;
  if(S.arena){
    // Arena shops compete for one shared pool. Spend more in the opening and
    // midgame; later, economy profiles protect full interest while pressure
    // profiles keep investing in upgrades.
    if(S.round<=4)return profile==='economy'?25:profile==='reroll'?18:20;
    if(S.round<=8)return profile==='economy'?45:profile==='reroll'?28:
      (profile==='tempo'||profile==='aggressive'?25:35);
    return profile==='economy'?50:profile==='reroll'?35:
      (profile==='tempo'||profile==='aggressive'?30:40);
  }
  if(profile==='economy') return 55;
  if(profile==='aggressive') return 38;
  if(profile==='tempo') return 35;
  if(profile==='synergy') return 48;
  if(profile==='flexible') return 42;
  if(profile==='reroll') return 42;
  return 50;
}
function botSellAt(type,index){
  const u=type==='board'?S.board[index]:S.bench[index]; if(!u)return false;
  return host.sell(type,index);
}
function botFreeBenchFor(id,plan){
  if(S.bench.some(x=>!x)||(host.mergeOnFull!==false&&pairCount(id)>=2))return true;
  let pick=-1,low=Infinity;
  S.bench.forEach((u,i)=>{
    if(!u||u.star>1||pairCount(u.id)>=2||u.id===id)return;
    let v=botScoring(u,plan); if(botInPlan(u,plan))v+=18;
    if(v<low){low=v;pick=i;}
  });
  return pick>=0&&botSellAt('bench',pick);
}
function botBuyAvailable(plan,limit=8){
  let bought=0, guard=0;
  while(guard++<limit){
    const under=botBoard().length<S.lvl, floor=botEconFloor(botUrgency());
    let best=-1,bestScore=under?20:36;
    for(let i=0;i<S.shop.length;i++){
      const u=S.shop[i]; if(!u||u.cost>S.gold)continue;
      const sc=botScoring(u,plan), merge=pairCount(u.id)>=2;
      if(S.gold-u.cost<floor&&!merge&&sc<78)continue;
      if(sc>bestScore){bestScore=sc;best=i;}
    }
    if(best<0)break;
    const id=S.shop[best].id;
    if(!botFreeBenchFor(id,plan))break;
    const before=botMembers().length, gold=S.gold;
    buy(best);
    if(S.gold===gold)break;
    bought++;
    if(botMembers().length===before && !pairCount(id))break;
  }
  return bought;
}
function botLevel(){
  if(S.round<=1||S.lvl>=lvlCap()||hasCurse('dreamless'))return;
  { const dm=(typeof dailyMods==='function')?dailyMods():null; if(dm&&dm.buyXp===false)return; }   // 缓慢成长：禁购经验
  const mode=botUrgency(), profile=botProfile(), target=[0,1,2,4,6,9,14,20,27,35,45][S.lvl]||50;
  const timing=profile==='tempo'?target-2:profile==='economy'?target+2:target;
  const behind=S.round>=timing, urgency=mode==='survive'?2:mode==='stabilize'?1:0;
  let reserve=botEconFloor(mode), maxBuys=urgency?8:(profile==='aggressive'?5:3), spent=0;
  if(botCheckpoint()){
    const buys=Math.ceil((xpNeed(S.lvl)-S.xp)/4);
    // Partial XP provides no strength in a battle that can end the run.
    if(buys*5>S.gold-reserve||botMembers().length<=S.lvl)return;
    maxBuys=buys;
  }
  if(profile==='reroll'&&!behind&&mode==='economy')return;
  while(S.lvl<lvlCap()&&S.gold>=5&&spent<maxBuys){
    const need=xpNeed(S.lvl)-S.xp, canLevel=need<=4;
    const latePush=behind||urgency>0||S.gold>=68||botCheckpoint();
    if(!canLevel&&(!latePush||S.gold-5<reserve))break;
    const before=S.lvl; if(!host.buyXp())break; spent++;
    if(S.lvl>before){
      if(S.gold<reserve||!latePush)break;
    } else if(S.gold<reserve)break;
  }
}
function botCombineGear(){
  let changed=true, guard=0;
  while(changed&&guard++<8){
    changed=false;
    for(let i=0;i<S.items.length&&!changed;i++)for(let j=i+1;j<S.items.length;j++){
      if(!comboOf(S.items[i],S.items[j]))continue;
      combineBagPair(i,j); changed=true; break;
    }
  }
}
function botEquipGear(){
  if(S.phase!=='prep')return;
  // Unequipping during preparation is a legal player action. Reclaim items
  // from benched units and re-evaluate holders after every roster change.
  botMembers().forEach(u=>host.unequip(u));
  if(!S.items.length)return;
  botCombineGear();
  const team=botBoard();
  let guard=0;
  while(S.items.length&&guard++<team.length*maxEquip()){
    const item=S.items[0];
    const candidates=team.filter(u=>(u.items||[]).length<maxEquip()).sort((a,b)=>{
      return botGearValue(b,item)-botGearValue(a,item);
    });
    const target=candidates[0];
    if(!target)break;
    if(!host.equip(target,0))break;
  }
}
function botGearValue(u,item){
  const d=byId(u.id);
  return BotEquipmentPolicy.score({hp:u.maxhp||0,atk:u.atk||0,job:d.job,
    passive:isPassive(u),skillScale:u.sks||1,speed:d.spd||1,damageType:d.dtype},ITEMS[item]?.role);
}
function botFormation(){
  if(!botMembers().length)return;
  autoDeployBest();
  if(botFogged())return;   // 🌫 迷雾军情：不针对看不见的敌方站位调整阵型
  const enemies=(S.enemyBoard||[]).filter(Boolean);
  if(!enemies.length)return;
  const rows=[4,5,6,7], front=botBoard().filter(u=>['守护','刀客','狂战'].includes(byId(u.id).job));
  if(!front.length)return;
  const enemyCenter=enemies.reduce((n,u)=>n+(u.x==null?u.uid%8:u.x),0)/enemies.length;
  const cols=[0,1,2,3,4,5,6,7].sort((a,b)=>Math.abs(a-enemyCenter)-Math.abs(b-enemyCenter));
  // Put durable units in the lane with the strongest enemy pressure; keep carries in the rear rows.
  const durable=front.slice().sort((a,b)=>(b.maxhp||0)+(b.ar||0)*5-((a.maxhp||0)+(a.ar||0)*5));
  durable.forEach((u,n)=>{
    const from=S.board.indexOf(u); if(from<0)return;
    let to=-1;
    for(const x of cols){const k=rows[0]*8+x;if(!S.board[k]||S.board[k]===u){to=k;break;}}
    if(to>=0&&to!==from)host.move(u,to);
  });
  const assassinThreat=enemies.filter(u=>byId(u.id).job==='刺客').length;
  if(assassinThreat>=2){
    const carry=botBoard().filter(u=>!['守护','刀客','狂战','刺客'].includes(byId(u.id).job)).sort((a,b)=>botPower(b)-botPower(a))[0];
    if(carry){
      const from=S.board.indexOf(carry), guard=S.board.findIndex((u,i)=>i>=4*8&&u&&['守护','刀客'].includes(byId(u.id).job));
      if(from>=0&&guard>=0&&Math.floor(from/8)===7&&Math.abs(from%8-guard%8)>1){
        const next=7*8+(from%8<4?Math.min(7,from%8+1):Math.max(0,from%8-1));
        if(!S.board[next]||S.board[next]===carry)host.move(carry,next);
      }
    }
  }
}
function botChooseSpend(){
  const plan=botPlan();
  botBuyAvailable(plan,10);
  botLevel();
  botBuyAvailable(plan,4);
  return plan;
}
function botSearch(done){
  const mode=botUrgency(),profile=botProfile(),plan=botPlan();
  const gap=botPressure(), members=botMembers();
  const pairTargets=members.filter(u=>u.star<3&&botPairProgress(u.id)>=3).length;
  let budget=mode==='survive'?12:mode==='stabilize'?7:mode==='strengthen'?5:(pairTargets?3:0);
  if(botCheckpoint())budget=Math.max(budget,18);
  if(profile==='reroll')budget=Math.max(Math.ceil(budget*1.5),mode==='survive'?12:mode==='stabilize'?9:S.round<=6?5:3);
  if(S.arena&&mode==='economy'){
    if(profile==='economy')budget=pairTargets?Math.min(Math.max(budget,3),3):(S.round<=3?1:0);
    else if(profile==='tempo'||profile==='aggressive')budget=Math.max(budget,S.round<=5?2:1);
    else if(profile==='flexible'||profile==='synergy')budget=Math.max(budget,S.round<=3?1:0);
  }
  if(profile==='economy'&&mode==='economy'&&!S.arena)budget=0;
  const floor=botEconFloor(mode);
  let rolls=0;
  const shouldStop=()=>rolls>=budget||S.gold<floor+refreshCost();
  const one=()=>{
    if(shouldStop())return false;
    if(!host.refresh())return false; rolls++;
    botBuyAvailable(plan,5);
    return true;
  };
  if(typeof done==='function'){
    const state=S,round=S.round,run=host.runId();
    const active=()=>host.state()===state&&S.round===round&&S.auto&&S.phase==='prep'&&(run===null||host.runId()===run);
    // Presentation timing must not consume the shop/combat random stream.
    const pace=()=>{S=host.state();if(!active()||!one()){done();return;} renderAll();setTimeout(pace,450);}; pace();
  } else {while(one());}
}
function botLockShop(){
  if(S.lock||S.gold<8)return;
  const plan=botPlan(), floor=botEconFloor(botUrgency());
  const valuable=(S.shop||[]).some(u=>u&&u.cost>S.gold&&u.cost<=S.gold+5&&
    (pairCount(u.id)>=2||botPairProgress(u.id)>=5||botInPlan(u,plan)&&u.cost>=4));
  if(valuable&&S.gold>=floor)host.lock();
}
function botCleanupBench(){
  const plan=botPlan(), cap=Math.min(7,S.lvl+2);
  while(botBench().length>cap){
    let pick=-1,low=Infinity;
    S.bench.forEach((u,i)=>{if(!u||u.star>1||pairCount(u.id)>=2)return;let v=botScoring(u,plan);if(v<low){low=v;pick=i;}});
    if(pick<0||!botSellAt('bench',pick))break;
  }
}
function botAugScore(off){
  const rarity=typeof augRarity==='function'?augRarity(off.id):1;
  let score=rarity===3?42:rarity===2?25:12;
  const carry=botBoard().slice().sort((a,b)=>botPower(b)-botPower(a))[0];
  if(['atk','asp','skillhaste'].includes(off.id)&&carry)score+=18;
  if(['hp','ar','mr','regen','startshield'].includes(off.id)&&S.hp<22)score+=22;
  if(off.id==='gold')score+=S.gold<40?17:6;
  // Economic augments are strongest with enough rounds left to compound.
  if(off.id==='gold')score+=Math.max(0,runLimit()-S.round)*.5;
  if(off.id==='dropplus')score+=Math.max(0,runLimit()-S.round)*.65;
  if(off.id==='skillhaste'){
    const team=botBoard(),casters=team.filter(u=>!isPassive(u)).length;
    score*=team.length?casters/team.length:0;
  }
  if(off.weak)score*=.65;
  return score;
}
function botAugPick(offer){
  let best=0,score=-Infinity;
  (offer||[]).forEach((x,i)=>{const value=botAugScore(x);if(value>score){score=value;best=i;}});
  return best;
}
function botUseTicket(){
  if(!S.tickets || typeof applyTicket!=='function') return false;
  if(botCampaign() && botMembers().some(u=>u.star===4)) return false;
  const target=botMembers().filter(u=>u.star===3).sort((a,b)=>{
    const score=u=>botPower(u)+(u.items||[]).length*35+(botBoard().includes(u)?100:0);
    return score(b)-score(a);
  })[0];
  if(!target) return false;
  const before=S.tickets;
  applyTicket(target.uid);
  return S.tickets<before;
}
function botChooseChallenge(){
  if(typeof challengeAvailable!=='function'||typeof chooseChallenge!=='function'||!challengeAvailable())return false;
  if(S.round<30 || S.hp<34 || S.lossStreak || botRecentDamage()>=2 || botPressure()>-.45)return false;
  chooseChallenge();
  S.botElites=(S.botElites||0)+1;
  return S.challengeRound===S.round;
}
function botPrepSteps(){
  if(S.phase!=='prep')return [];
  return [
    {n:'观察对手与定阵容',fn(){botPlan();S.botDecision={urgency:botUrgency(),gap:botPressure(),round:S.round};botChooseChallenge();}},
    {n:'购买与合成',fn(){botChooseSpend();}},
    {n:'搜牌与追星',fn(done){botSearch(done);}},
    {n:'调整人口与经济',fn(){botLevel();botBuyAvailable(botPlan(),3);}},
    {n:'整理备战席',fn(){botCleanupBench();}},
    {n:'使用升星券',fn(){botUseTicket();}},
    {n:'针对对手布阵',fn(){botFormation();}},
    {n:'合成与分配装备',fn(){botEquipGear();}},
    {n:'保留关键商店',fn(){botLockShop();}}
  ];
}
function botPrep(){
  const steps=botPrepSteps();
  steps.forEach(step=>{if(step.n==='搜牌与追星')step.fn();else step.fn();});
}

    const methods={botMembers,botBoard,botBench,botPower,botLinePower,botFogged,botOpponentPower,botPressure,botProfile,botCampaign,botCheckpoint,botRecentDamage,botUrgency,botTagCounts,botTagValue,botPlan,botInPlan,botPairProgress,botScoring,botEconFloor,botSellAt,botFreeBenchFor,botBuyAvailable,botLevel,botCombineGear,botEquipGear,botGearValue,botFormation,botChooseSpend,botSearch,botLockShop,botCleanupBench,botAugScore,botAugPick,botUseTicket,botChooseChallenge,botPrepSteps,botPrep};
    const planner={};
    for(const [name,fn] of Object.entries(methods))planner[name]=(...args)=>{
      S=host.state();
      const value=fn(...args);
      if(name==='botPrepSteps')return value.map(step=>({...step,fn:step.fn.length
        ? function(done){S=host.state();return step.fn(done);}
        : function(){S=host.state();return step.fn();}}));
      return value;
    };
    return Object.freeze(planner);
  }
  const policy=Object.freeze({version,create});
  root.BotPlanner=policy;
  if(typeof module==='object'&&module.exports)module.exports=policy;
})(typeof globalThis!=='undefined'?globalThis:this);
