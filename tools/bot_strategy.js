/* 页内机器人策略（与 tools/sim.js 同一套"普通玩家"逻辑，直接调用游戏全局函数）。
   botPrepSteps(): 把一回合运营拆成有序步骤——浏览器托管逐步执行并停顿（肉眼可读、像真人操作节奏）；
   botPrep():      同步跑完全部步骤（模拟器/测试用，行为完全一致）。改策略只改本文件。 */
function botPrepSteps() {
  if (S.phase !== 'prep') return [];
  const JOB_FRONT = new Set(['守护', '刀客', '狂战']);
  // 羁绊主力标签
  const facCnt = {}, jobCnt = {};
  [...S.board, ...S.bench].filter(Boolean).forEach(u => { const d = byId(u.id); facCnt[d.fac] = (facCnt[d.fac]||0)+1; jobCnt[d.job] = (jobCnt[d.job]||0)+1; });
  const top = cnt => Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0]);
  const mainTags = new Set([...top(facCnt), ...top(jobCnt)]);
  const myTags = new Set(mainTags);
  S.board.filter(Boolean).forEach(u => { const d = byId(u.id); myTags.add(d.fac); myTags.add(d.job); });
  // 经济红线：50 金=最高利息线（每 10 金 +1，封顶 5）。
  // 三段策略（用户设定）：①前期(<50金)攒钱——不刷新、不买经验，商店自然刷出的好牌照买；
  // ②连败(≥2)不买经验、适度搜牌稳战力（不全花光）；③存满 50 后溢出全部用于升级人口（优先，冲 11 级）与刷新追三/凑羁绊。
  const banked = S.gold >= 50;
  const keepGold = S.round <= 1 ? 0 : (banked ? 50 : (S.hp >= 12 ? 8 : 2));
  const freeBench = () => S.bench.filter(x=>!x).length;
  // 卖闲子（备战席满时）：卖到有空位为止，返回是否成功腾位
  const sellIdle = () => {
    if (freeBench() > 0) return true;
    let bi = -1, bv = 1e9;
    S.bench.forEach((u, i) => {
      if (!u || u.star !== 1 || pairCount(u.id) >= 2) return;
      const d = byId(u.id);
      const v = (myTags.has(d.fac)||myTags.has(d.job) ? 100 : 0) + d.cost;
      if (v < bv) { bv = v; bi = i; }
    });
    if (bi < 0 || bv >= 103) return false;
    const u = S.bench[bi], d = byId(u.id);
    S.gold += d.cost; S.pool[u.id] += 1; S.bench[bi] = null; return true;
  };

  const steps = [];
  // ① 装备：背包/已佩戴可合成的先合成成品，再按「输出装给高攻主C、防御装给前排」穿戴
  steps.push({ n:'装备', fn(){
    if (typeof botCombineItems === 'function') botCombineItems();
    let guard = 0;
    while (S.items.length > 0 && guard++ < 10) {
      const it = S.items[0];
      const dmgItem = (typeof isDmgItem === 'function') ? isDmgItem(it) : ['sword','staff','bow','vamp'].includes(it);
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
  }});
  // ② 购买：对子 > 主力标签 > 副标签 > 低费填缝；备战席满先卖闲子。
  //    攒钱期照买不误——攒钱省的是「刷新」和「买经验」两大开销，商店里自然刷出的好牌不该放过
  steps.push({ n:'购买', fn(){
    let bought = true, iterGuard = 0;
    while (bought && iterGuard++ < 40) {
      bought = false;
      if (freeBench() === 0 && !sellIdle()) break;
      let bestI = -1, bestSc = -1;
      for (let i = 0; i < S.shop.length; i++) {
        const u = S.shop[i]; if (!u || u.cost > S.gold - keepGold) continue;
        const pc = pairCount(u.id);
        let sc = 0;
        if (pc >= 2) sc = 100 + u.cost;
        else if (mainTags.has(u.fac)||mainTags.has(u.job)) sc = 60 + u.cost;
        else if (myTags.has(u.fac)||myTags.has(u.job)) sc = 30 + u.cost;
        else if (u.cost <= 2) sc = 10 + u.cost;
        if (sc > bestSc) { bestSc = sc; bestI = i; }
      }
      if (bestI >= 0 && bestSc > 0) { const n0 = freeBench(); buy(bestI);
        if (freeBench() !== n0) bought = true; }   // buy 无效（席满）则终止
    }
    // 4 费强卡：腾位也要买
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || u.cost !== 4 || u.cost > S.gold - keepGold) continue;
      if (pairCount(u.id) >= 2) continue;
      if (freeBench() > 0) { buy(i); continue; }
      let bi = -1, bv = -1;
      S.bench.forEach((b2, j) => {
        if (!b2 || b2.star !== 1 || pairCount(b2.id) >= 2) return;
        const bd = byId(b2.id); if (bd.cost >= 4) return;
        const v = (myTags.has(bd.fac)||myTags.has(bd.job) ? 50 : 0) + bd.cost;
        if (v > bv) { bv = v; bi = j; }
      });
      if (bi >= 0) { const b2 = S.bench[bi], bd = byId(b2.id); S.gold += bd.cost; S.pool[b2.id] += 1; S.bench[bi] = null; buy(i); }
    }
  }});
  // ③ 升级人口：前期(<50金)攒钱不买经验（吃利息滚钱，等级靠自然经验）；连败先搜牌不买经验；
  //    存满 50 后溢出全部优先冲人口（11 级封顶）
  steps.push({ n:'升级', fn(){
    if (S.lossStreak >= 2) return;   // 连败：先搜牌稳战力
    if (S.gold < 50) return;         // 攒钱期：吃利息
    for (let k = 0; k < 14 && S.lvl < 11 && S.gold >= 55; k++) { S.gold -= 5; S.xp += 4; checkLevel(); }
  }});
  // ④ 换血：把棋盘与备战席上明显战力跟不上的 1★ 出售换钱（收入交给下一步「刷新」边刷边搜花到 50）
  //    判定：战力低于头部均值 45%；2★/3★ 保留（升星成本沉没）；对子材料保留（升星本钱）
  steps.push({ n:'换血', fn(){
    const members=S.board.filter(Boolean);
    if(members.length < 3) return;   // 人太少没有"头部均值"
    const pw=u=>Math.pow(u.star||1,2)*u.maxhp+u.atk*(u.star||1)*4;
    const sorted=members.map(pw).sort((a,b)=>b-a);
    const topN=Math.max(1,Math.floor(sorted.length*0.6));
    const topAvg=sorted.slice(0,topN).reduce((a,b)=>a+b,0)/topN;
    const weak=u=>(u.star||1)===1 && pw(u) < topAvg*0.45;
    // 备战席弱子：直接卖（腾位+换钱）；对子材料保留，非连败时主力标签留着凑羁绊
    S.bench.forEach((u,i)=>{
      if(!u||!weak(u)||pairCount(u.id)>=2) return;
      const d=byId(u.id);
      if(S.lossStreak<2 && (mainTags.has(d.fac)||mainTags.has(d.job))) return;
      S.selUid=u.uid; sellSelected();   // 统一出口：金币/卡池回收
    });
    // 棋盘弱子：满员时卖，且商店里得有买得起的补位牌（绝不空人口）；单回合最多换 3 人防拆队
    if(members.length>=S.lvl){
      let sold=0;
      for(const u of members.filter(weak)){
        if(sold>=3) break;
        const pos=findUnit(u.uid); if(!pos||pos[0]!=='board') continue;
        const refund=sellRefund(u);
        let pick=-1,best=-1;
        for(let i=0;i<S.shop.length;i++){ const su=S.shop[i]; if(!su) continue;
          if(su.cost > S.gold + refund) continue;
          const sc=(mainTags.has(su.fac)||mainTags.has(su.job)?2:0)+(pairCount(su.id)>=2?3:su.cost>=3?1:0);
          if(sc>best){best=sc;pick=i;} }
        if(pick<0 || !S.shop[pick]) continue;   // 商店没有换得起的牌：不卖，保持满员
        S.selUid=u.uid; sellSelected(); sold++;
        if(S.shop[pick]) buy(pick);
      }
    }
  }});
  // ⑤ 刷新追牌：连败时适度搜牌（地板抬高 10 金、≤20 次，提升战力但不花光）；存满 50 后溢出滚动追三/凑羁绊；攒钱期不刷新。
  //    换血卖子的收入在这里被「边刷边搜」花掉——地板 50+2，进入战斗时刚好只剩 50-51 金吃满利息。
  //    浏览器托管（传入 done 回调）：一刷一停（320-580ms）让肉眼跟上；模拟器（无 done）：同步跑完，行为一致
  steps.push({ n:'刷新', fn(done){
    const losing = S.lossStreak >= 2;
    const bnk = S.gold >= 50;
    if (!bnk && !losing) { if(typeof done==='function') done(); return; }   // 攒钱期：靠自然刷新与对子购买
    const myCosts = [...S.board, ...S.bench].filter(Boolean).map(u => byId(u.id).cost).sort((a,b)=>a-b);
    const medCost = myCosts.length ? myCosts[Math.floor(myCosts.length/2)] : 2;
    const deepRun = medCost <= 2;
    const floor = keepGold + (losing ? 10 : 0);   // 连败适度搜：地板抬高，留更多余钱；存满后刷到刚好剩 50-51
    const cap = losing ? 20 : bnk ? 60 : deepRun ? 50 : 35;
    let rolls = 0;
    // 三星进度（3★=9 份：1★=1 份、2★=3 份）：差 ≤4 张(≥5份)的牌值得腾位去追
    const prog3 = id => [...S.board, ...S.bench].reduce((n,u)=> n + (u&&u.id===id ? (u.star===2?3:(u.star||1)) : 0), 0);
    const makeRoom = (newId) => {   // 席满腾位：卖掉「距三星最远」的 1★ 席位子——只有当新牌比它更接近三星才腾
      let wi=-1, wp=1e9;
      S.bench.forEach((u,i)=>{ if(!u||u.star!==1) return;
        const pp=prog3(u.id); if(pp<wp && pairCount(u.id)<2){ wp=pp; wi=i; } });
      if (wi<0) return false;
      if (prog3(newId) <= wp) return false;   // 新牌并不更接近三星：不腾
      const u=S.bench[wi], d=byId(u.id);
      (u.items||[]).forEach(k=>S.items.push(k));
      S.gold += d.cost; S.pool[u.id]+=1; S.bench[wi]=null;
      return true;
    };
    const oneRoll = () => {   // 执行一次「刷新+拾取」，返回是否还应继续刷
      if (S.gold < floor + 2 || rolls++ >= cap) return false;
      sellIdle();                                  // 能腾位先腾
      const jammed = freeBench() === 0;            // 席满（都是对子材料腾不动）：不停刷，按三星进度取舍
      S.gold -= 2; rollShop();
      for (let i = 0; i < S.shop.length; i++) {
        const u = S.shop[i]; if (!u || u.cost > S.gold - keepGold) continue;
        const rev = mainTags.has(u.fac)||mainTags.has(u.job)||myTags.has(u.fac)||myTags.has(u.job);
        if (jammed) {                              // 席满：对子立即超编合成；差≤4张到三星的腾位追
          if (pairCount(u.id) >= 2) buy(i);
          else if (prog3(u.id) >= 5 && makeRoom(u.id)) buy(i);
          continue;
        }
        if (pairCount(u.id) >= 2) buy(i);
        else if (freeBench() > 0 && (deepRun || bnk || losing || rev || u.cost >= 3)) buy(i);
      }
      if (!losing && S.gold >= 20 && S.lvl < 10 && S.gold - 5 >= keepGold) { S.gold -= 5; S.xp += 4; checkLevel(); }
      return true;
    };
    if (typeof done === 'function') {              // 浏览器托管：逐刷可见
      (function pace(){
        try{
          if(!S.auto || S.phase!=='prep'){ done(); return; }   // 中途关托管/手动开战：立即收尾
          if(!oneRoll()){ renderAll(); done(); return; }
          renderAll();                           // 展示这一轮刷新结果
          setTimeout(pace, 320+Math.random()*260);
        }catch(e){ try{ log('⚠️ 托管异常：'+((e&&e.message)||e)) }catch(_){} done(); }
      })();
    } else { while(oneRoll()); }                   // 模拟器：同步跑完
  }});
  // ⑤ 锁定：货架上有下回合想要、但现钱买不起的牌（能升星的对子或 4-5 费核心）时锁住商店
  steps.push({ n:'锁定', fn(){
    let lockWorthy = false;
    for (const u of S.shop) {
      if (!u) continue;
      if (u.cost > S.gold - Math.min(keepGold, 5) && (pairCount(u.id) >= 2 || u.cost >= 4)) { lockWorthy = true; break; }
    }
    if (lockWorthy && !S.lock) S.lock = true;
  }});
  // ⑥ 择优编队：像真人一样主动换人，选出当前最强阵容
  steps.push({ n:'编队', fn(){ autoDeployBest(); renderAll(); }});
  return steps;
}
function botPrep() { const ss = botPrepSteps(); ss.forEach(s => s.fn()); }
