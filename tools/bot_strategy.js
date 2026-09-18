/* 页内机器人策略 v2 ——「普通玩家」模型（与 tools/sim.js 同一套逻辑，直接调用游戏全局函数）。
   设计原则：不以"每回合最优"为目标，而是复刻普通玩家的决策习惯——
   看牌定型、白嫖攒钱、节点拉级、触发式搜牌、危机 all-in。改策略只改本文件。
   botPrepSteps(): 一回合运营拆成有序步骤，浏览器托管逐步执行并停顿（肉眼可读）；
   botPrep():      同步跑完全部步骤（模拟器/测试用，行为完全一致）。
   sim.js 依赖：S/byId/pairCount/buy/clickUnit/rollShop/checkLevel/autoDeployBest 会被符号改写，
   其余只允许调用 function 声明（挂 globalThis），不得直接引用顶层 const（如 XP_NEED/FACTIONS）。
   BOT_VER 会在托管开启时打进战报，用于确认浏览器加载的不是缓存的旧策略文件。 */
const BOT_VER='策略 v2.2（普通玩家模型：看牌定型/触发式搜牌/五段经济/节点拉级/危机all-in + 升星券/顶配停刷/诅咒适配 + 无梦禁购经验/紧缩货架读 shopSize）';

/* ---------- 阵容计划：看牌定型 + 粘性 ---------- */
function botTagCount(){   // 牌面（场上+备战席）独特棋子的阵营/职业计数
  const seen=new Set(), fc={}, jc={};
  [...S.board, ...S.bench].filter(Boolean).forEach(u=>{
    if(seen.has(u.id)) return; seen.add(u.id);
    const d=byId(u.id);
    [d.fac, d.fac2].filter(Boolean).forEach(t=>{ fc[t]=(fc[t]||0)+1; });
    [d.job, d.job2].filter(Boolean).forEach(t=>{ jc[t]=(jc[t]||0)+1; });
  });
  return {fc, jc};
}
function botMakePlan(){   // 定型：取牌面最多的 2 阵营 + 2 职业（同分按名字排，避免来回抖动）
  const {fc, jc}=botTagCount();
  const top=cnt=>Object.entries(cnt).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,2).map(e=>e[0]);
  return { facs:top(fc), jobs:top(jc) };
}
function botPlan(){       // 粘性：计划羁绊在牌面还有 ≥2 个独特棋子就沿用；没拿到货才重新定型
  const p=S.botPlan;
  if(p && p.facs && p.jobs){
    const {fc, jc}=botTagCount();
    const alive=[...p.facs,...p.jobs].some(t=>(fc[t]||jc[t]||0)>=2);
    if(alive) return p;
  }
  S.botPlan=botMakePlan();
  return S.botPlan;
}
function botInPlan(u, plan){   // 该棋子是否在计划内
  const d=byId(u.id);
  return plan.facs.includes(d.fac)||plan.facs.includes(d.fac2)
      || plan.jobs.includes(d.job)||plan.jobs.includes(d.job2);
}

/* ---------- 战力/进度工具 ---------- */
function botProg3(id){    // 三星进度（3★=9 份：1★=1 份、2★=3 份）
  return [...S.board, ...S.bench].reduce((n,u)=>n+(u&&u.id===id?(u.star===2?3:(u.star||1)):0), 0);
}
function botMainCarry(){  // 主C：场上非守护中「星²×费用」最高者（装备优先给他）
  let best=null, bv=-1;
  S.board.forEach(u=>{ if(!u) return; const d=byId(u.id); if(d.job==='守护') return;
    const v=Math.pow(u.star||1, 2)*d.cost; if(v>bv){ bv=v; best=u; } });
  return best;
}
function botEconMode(){   // 经济模式（普通玩家的局势判断，优先级从高到低）
  if(S.hp<=15 || (S.lossStreak>=3 && S.hp<=25)) return 'crisis';   // 血线告急：all-in
  if(S.lossStreak>=2) return 'urgent';                             // 连败被血入：适度搜牌稳战力
  if(S.lvl>=10 || (S.lvl>=8 && S.gold>=60)) return 'chase';        // 高等级富余：卡 50 追三
  if(S.gold>=50) return 'healthy';                                 // 吃满利息线：有目标才小搜
  return 'save';                                                   // 攒钱期：白嫖不搜
}

/* ---------- 商店评分：普通玩家的"心动程度" ---------- */
function botScoreShop(u, plan){
  const pc=pairCount(u.id);
  if(pc>=2) return 100+u.cost;           // 能立即合成升星——最心动
  if(has2star(u.id)) return 80+u.cost;   // 已有 2★ 同名：买它就是追三
  const p3=botProg3(u.id);
  if(p3>=5 && !has3star(u.id)) return 88+u.cost;   // 三星在望（差 ≤4 张）
  if(botInPlan(u, plan)) return 60+u.cost;         // 计划内的牌
  if(u.cost<=2) return 15+u.cost;                  // 廉价过渡垫场
  return 0;                                        // 无关的高费散牌：不买
}

function botPrepSteps() {
  if (S.phase !== 'prep') return [];
  const JOB_FRONT = new Set(['守护', '刀客', '狂战']);
  const plan = botPlan();
  const freeBench = () => S.bench.filter(x=>!x).length;

  // 卖闲子（备战席满时腾位）：只卖 1★、非对子材料、与计划最无关的低费棋子
  const sellIdle = () => {
    if (freeBench() > 0) return true;
    let bi=-1, bv=1e9;
    S.bench.forEach((u, i) => {
      if (!u || u.star !== 1 || pairCount(u.id) >= 2) return;
      const d = byId(u.id);
      const v = (botInPlan(u, plan) ? 100 : 0) + d.cost;
      if (v < bv) { bv=v; bi=i; }
    });
    if (bi < 0 || bv >= 100) return false;   // 全是计划内的对子材料：不腾
    const u = S.bench[bi], d = byId(u.id);
    S.gold += d.cost; S.pool[u.id] += 1; S.bench[bi] = null;
    return true;
  };
  // 腾位追三星：卖掉「距三星最远」的 1★ 席位子——只有当新牌更接近三星才腾
  const makeRoom = (newId) => {
    let wi=-1, wp=1e9;
    S.bench.forEach((u,i)=>{ if(!u||u.star!==1) return;
      const pp=botProg3(u.id); if(pp<wp && pairCount(u.id)<2){ wp=pp; wi=i; } });
    if (wi<0) return false;
    if (botProg3(newId) <= wp) return false;
    const u=S.bench[wi], d=byId(u.id);
    (u.items||[]).forEach(k=>S.items.push(k));
    S.gold += d.cost; S.pool[u.id]+=1; S.bench[wi]=null;
    return true;
  };

  const steps = [];
  // ⓪ 升星券：有券且有 3★ 就直接用（守关胜利奖励；普通玩家拿到就花在战力最高的三星上）
  steps.push({ n:'升星', fn(){
    if((S.tickets||0) <= 0 || S.phase !== 'prep') return;
    let best=null, bv=-1;
    [...S.board, ...S.bench].forEach(u=>{
      if(!u || u.star !== 3) return;
      const d=byId(u.id); const v=Math.pow(u.star,2)*d.cost;
      if(v>bv){ bv=v; best=u; }
    });
    if(best && typeof applyTicket==='function') applyTicket(best.uid);
  }});
  // ① 买牌（白嫖先拿）：普通玩家进备战先看商店——能升星的、计划内的、追三进度的先买下，
  //    这是"不花钱刷新也照常变强"的部分。席满先卖闲子腾位。
  //    人口未满时低费过渡也给买（开局/掉人后先凑战力，等不了"计划"成型）。
  steps.push({ n:'购买', fn(){
    let bought=true, iter=0;
    const underpop = S.board.filter(Boolean).length < S.lvl;
    while(bought && iter++<40){
      bought=false;
      if(freeBench()===0 && !sellIdle()) break;
      let bestI=-1, bestSc=underpop?10:24;   // 满员 ≥25 分才买；缺人 ≥10 分（低费过渡）也买
      for(let i=0;i<S.shop.length;i++){
        const u=S.shop[i]; if(!u) continue;
        if(u.cost>S.gold) continue;
        const sc=botScoreShop(u, plan);
        if(sc>bestSc){ bestSc=sc; bestI=i; }
      }
      if(bestI>=0){ const n0=freeBench(); buy(bestI); if(freeBench()!==n0) bought=true; }
    }
    // 4 费强卡：即使计划外也值得腾位买（后期战力天花板）
    for(let i=0;i<S.shop.length;i++){
      const u=S.shop[i]; if(!u||u.cost!==4||u.cost>S.gold) continue;
      if(pairCount(u.id)>=2) continue;
      if(freeBench()>0){ buy(i); continue; }
      let bi=-1, bv=-1;
      S.bench.forEach((b2,j)=>{
        if(!b2||b2.star!==1||pairCount(b2.id)>=2) return;
        const bd=byId(b2.id); if(bd.cost>=4) return;
        const v=(botInPlan(b2,plan)?50:0)+bd.cost;
        if(v>bv){ bv=v; bi=j; }
      });
      if(bi>=0){ const b2=S.bench[bi], bd=byId(b2.id); S.gold+=bd.cost; S.pool[b2.id]+=1; S.bench[bi]=null; buy(i); }
    }
  }});
  // ② 升级（节点化拉级）：普通玩家的经验永远"买完就升级"不浪费——
  //    存满 50 后连买到升一级就停（节点冲刺，剩余存着攒下一节点）；
  //    攒钱期只在「一步到位」时买，金币能真正爬到 50 吃满利息。
  steps.push({ n:'升级', fn(){
    const mode=botEconMode();
    if(mode==='crisis'||mode==='urgent') return;   // 有命才有钱：先稳战力不买经验
    if(S.round===1) return;                        // 首回合禁购经验
    if(typeof hasCurse==='function' && hasCurse('dreamless')) return;   // 💤 无梦：本局禁购经验（不能绕过按钮直接改 S.xp）
    const cap=(typeof lvlCap==='function')?lvlCap():11;   // 🪑 独木桥诅咒：上限 5
    if(S.lvl>=cap) return;
    if(S.gold>=50){
      let g=0;
      while(S.lvl<cap && S.gold>=55 && g++<12){
        const b=S.lvl; S.gold-=5; S.xp+=4; checkLevel();
        if(S.lvl>b) break;                         // 升一级就停——像人一样一次拉一个节点
      }
    } else if(S.gold>=30 && S.xp+4>=xpNeed(S.lvl)){
      S.gold-=5; S.xp+=4; checkLevel();
    }
  }});
  // ③ 装备：先合成（对子出成品），输出装给主C、防御装给前排——普通玩家的默认分配
  steps.push({ n:'装备', fn(){
    if (typeof botCombineItems === 'function') botCombineItems();
    const carry=botMainCarry();
    const carryIdx=()=>S.board.indexOf(carry);
    let guard=0;
    while(S.items.length>0 && guard++<10){
      const it=S.items[0];
      const dmgItem=(typeof isDmgItem==='function')?isDmgItem(it):['sword','staff','bow','vamp'].includes(it);
      let ti=-1, best=-1;
      if(dmgItem && carry && (carry.items||[]).length < (typeof maxEquip==='function'?maxEquip():2) && carryIdx()>=0){
        ti=carryIdx();                                    // 输出装优先主C
      } else {
        S.board.forEach((u,i)=>{
          if(!u) return; if(!u.items) u.items=[];
          if(u.items.length >= (typeof maxEquip==='function'?maxEquip():2)) return;
          const d=byId(u.id);
          if(dmgItem && d.job!=='守护' && u.atk>best){ best=u.atk; ti=i; }
          if(!dmgItem && JOB_FRONT.has(d.job) && u.maxhp>best){ best=u.maxhp; ti=i; }
        });
      }
      if(ti<0) S.board.forEach((u,i)=>{ if(u&&(!u.items||u.items.length < (typeof maxEquip==='function'?maxEquip():2))&&ti<0) ti=i; });
      if(ti<0) break;
      S.selItem=0; clickUnit('board', ti);
    }
  }});
  // ④ 换血：满员时把明显跟不上的 1★ 卖掉换钱/腾位——普通玩家的"汰旧换新"，≤3 人/回合防拆队
  steps.push({ n:'换血', fn(){
    const members=S.board.filter(Boolean);
    if(members.length<3) return;
    const pw=u=>Math.pow(u.star||1,2)*u.maxhp+u.atk*(u.star||1)*4;
    const sorted=members.map(pw).sort((a,b)=>b-a);
    const topN=Math.max(1,Math.floor(sorted.length*0.6));
    const topAvg=sorted.slice(0,topN).reduce((a,b)=>a+b,0)/topN;
    const weak=u=>(u.star||1)===1 && pw(u)<topAvg*0.45;
    S.bench.forEach((u,i)=>{
      if(!u||!weak(u)||pairCount(u.id)>=2) return;
      if(botInPlan(u,plan)) return;                       // 计划内的留着凑羁绊
      S.selUid=u.uid; sellSelected();
    });
    if(members.length>=S.lvl){
      let sold=0;
      for(const u of members.filter(weak)){
        if(sold>=3) break;
        const pos=findUnit(u.uid); if(!pos||pos[0]!=='board') continue;
        const refund=sellRefund(u);
        let pick=-1, best=-1;
        for(let i=0;i<S.shop.length;i++){
          const su=S.shop[i]; if(!su) continue;
          if(su.cost>S.gold+refund) continue;
          const sc=(botInPlan(su,plan)?2:0)+(pairCount(su.id)>=2?3:su.cost>=3?1:0);
          if(sc>best){ best=sc; pick=i; }
        }
        if(pick<0||!S.shop[pick]) continue;               // 商店没有换得起的牌：不卖，保持满员
        S.selUid=u.uid; sellSelected(); sold++;
        if(S.shop[pick]) buy(pick);
      }
    }
  }});
  // ⑤ 搜牌（触发式，不再习惯性 roll-down）：普通玩家只在有理由时才 D——
  //    危机 all-in / 连败适度搜 / 多面听小搜 / 满级卡 50 追三；攒钱期与健康白嫖期都不刷。
  steps.push({ n:'搜牌', fn(done){
    // 顶配停刷：场上全员 3★+ 时商店已无提升空间——停止无意义刷新，金币只吃利息
    const onB=S.board.filter(Boolean);
    if(onB.length>0 && onB.every(u=>(u.star||1)>=3)){ if(typeof done==='function') done(); return; }
    const mode=botEconMode();
    let floor, max, keep=50;
    if(mode==='crisis'){ floor=2; max=40; keep=0; }
    else if(mode==='urgent'){ floor=15; max=20; }
    else if(mode==='chase'){ floor=50; max=30; }
    else if(mode==='healthy'){
      // 有目标才小搜：存在"三星在望"目标，或本金囤太多（≥65）时花一点——普通玩家不守财奴
      const ids=new Set([...S.board,...S.bench].filter(Boolean).map(u=>u.id));
      let listens=0; ids.forEach(id=>{ if(botProg3(id)>=5&&!has3star(id)) listens++; });
      if(listens<1 && S.gold<65){ if(typeof done==='function') done(); return; }
      floor=52; max=10;
    }
    else { if(typeof done==='function') done(); return; }   // 攒钱期：靠白嫖
    let rolls=0;
    const rc=(typeof refreshCost==='function')?refreshCost():2;   // 📈 通胀诅咒：刷新 3 金
    const oneRoll=()=>{
      if(S.gold<floor+rc || rolls++>=max) return false;
      sellIdle();
      const jammed=freeBench()===0;      // 席满（都是对子材料）：不停刷，只收能立即合成的/腾位追三星
      S.gold-=rc; rollShop();
      for(let i=0;i<S.shop.length;i++){
        const u=S.shop[i]; if(!u) continue;
        if(u.cost>S.gold-keep) continue;
        if(jammed){
          if(pairCount(u.id)>=2) buy(i);
          else if(botProg3(u.id)>=5 && makeRoom(u.id)) buy(i);
          continue;
        }
        if(botScoreShop(u,plan)>=25 && freeBench()>0) buy(i);
      }
      return true;
    };
    if(typeof done==='function'){              // 浏览器托管：一刷一停（320-580ms），肉眼可读
      (function pace(){
        try{
          if(!S.auto || S.phase!=='prep'){ done(); return; }
          if(!oneRoll()){ renderAll(); done(); return; }
          renderAll();
          setTimeout(pace, 320+Math.random()*260);
        }catch(e){ try{ log('⚠️ 托管异常：'+((e&&e.message)||e)) }catch(_){} done(); }
      })();
    } else { while(oneRoll()); }               // 模拟器：同步跑完
  }});
  // ⑥ 锁定：货架上有现在买不起、但下回合想要的好牌（对子或 4 费核心）时锁住商店
  steps.push({ n:'锁定', fn(){
    const onB=S.board.filter(Boolean);
    if(onB.length>0 && onB.every(u=>(u.star||1)>=3)) return;   // 顶配：无可追，不锁
    let worthy=false;
    for(const u of S.shop){
      if(!u) continue;
      if(u.cost>S.gold-Math.min(5,S.gold>50?5:2) && (pairCount(u.id)>=2||u.cost>=4)){ worthy=true; break; }
    }
    if(worthy && !S.lock) S.lock=true;
  }});
  // ⑦ 择优编队：按羁绊收益+战力选最强阵容布阵
  steps.push({ n:'编队', fn(){ autoDeployBest(); renderAll(); }});
  return steps;
}
function botPrep() { const ss = botPrepSteps(); ss.forEach(s => s.fn()); }
