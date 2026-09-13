/* 页内机器人策略（与 tools/sim.js 同一套"普通玩家"逻辑，直接调用游戏全局函数） */
function botPrep() {
  if (S.phase !== 'prep') return;
  const JOB_FRONT = new Set(['守护', '刀客', '狂战']);
  // 羁绊主力标签
  const facCnt = {}, jobCnt = {};
  [...S.board, ...S.bench].filter(Boolean).forEach(u => { const d = byId(u.id); facCnt[d.fac] = (facCnt[d.fac]||0)+1; jobCnt[d.job] = (jobCnt[d.job]||0)+1; });
  const top = cnt => Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0]);
  const mainTags = new Set([...top(facCnt), ...top(jobCnt)]);
  const myTags = new Set(mainTags);
  S.board.filter(Boolean).forEach(u => { const d = byId(u.id); myTags.add(d.fac); myTags.add(d.job); });

  // 1) 穿装备：输出装给高攻主C，防御装给前排
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
  // 卖闲子（备战席满时）
  const sellIdle = () => {
    if (S.bench.filter(x => !x).length > 0) return true;
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
  // 2) 购买
  const keepGold = S.round <= 1 ? 0 : (S.hp >= 12 ? 8 : 2);
  let bought = true, iterGuard = 0;
  while (bought && iterGuard++ < 40) {
    bought = false;
    // 备战席满先卖闲子，仍满则停止购买（buy 需要空位，避免无效循环）
    if (S.bench.filter(x=>!x).length === 0 && !sellIdle()) break;
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
    if (bestI >= 0 && bestSc > 0) { const n0 = S.bench.filter(x=>!x).length; buy(bestI);
      if (S.bench.filter(x=>!x).length !== n0) bought = true; }  // buy 无效（席满）则终止
  }
  // 3) 4 费强卡：腾位也要买
  for (let i = 0; i < S.shop.length; i++) {
    const u = S.shop[i]; if (!u || u.cost !== 4 || u.cost > S.gold - keepGold) continue;
    if (pairCount(u.id) >= 2) continue;
    if (S.bench.filter(x=>!x).length > 0) { buy(i); continue; }
    let bi = -1, bv = -1;
    S.bench.forEach((b2, j) => {
      if (!b2 || b2.star !== 1 || pairCount(b2.id) >= 2) return;
      const bd = byId(b2.id); if (bd.cost >= 4) return;
      const v = (myTags.has(bd.fac)||myTags.has(bd.job) ? 50 : 0) + bd.cost;
      if (v > bv) { bv = v; bi = j; }
    });
    if (bi >= 0) { const b2 = S.bench[bi], bd = byId(b2.id); S.gold += bd.cost; S.pool[b2.id] += 1; S.bench[bi] = null; buy(i); }
  }
  // 4) 升级人口节奏（5 金买 4 经验，每回合自然+1；1 级起步的成长计划）
  const lvlPlan = { 2:2, 3:3, 5:4, 8:5, 12:6, 16:7, 20:8, 23:9, 25:10 };
  const target = lvlPlan[S.round] || S.lvl;
  for (let k = 0; k < 8 && S.lvl < target; k++) {
    if (S.gold >= 5 + (S.hp >= 12 ? 4 : 2)) { S.gold -= 5; S.xp += 4; checkLevel(); } else break;
  }
  // 5) 富余 roll down
  let rolls = 0;
  while (S.gold >= keepGold + 14 && rolls++ < 25) {
    if (!sellIdle() && S.bench.filter(x=>!x).length === 0) break;
    S.gold -= 2; rollShop();
    for (let i = 0; i < S.shop.length; i++) {
      const u = S.shop[i]; if (!u || u.cost > S.gold - keepGold) continue;
      if (pairCount(u.id) >= 2) buy(i);
      else if (S.bench.filter(x=>!x).length > 0 && (u.cost >= 4 || ((mainTags.has(u.fac)||mainTags.has(u.job)) && u.cost <= 3))) buy(i);
    }
    // 金币太多继续升人口（5 金 4 经验）
    if (S.gold >= 30 && S.lvl < 10 && S.gold - 5 >= 14) { S.gold -= 5; S.xp += 4; checkLevel(); }
  }
  // 6) 择优编队：机器人像真人一样主动换人，选出当前最强阵容（按钮的 autoDeploy 只补位不换人）
  autoDeployBest();
  renderAll();
}
