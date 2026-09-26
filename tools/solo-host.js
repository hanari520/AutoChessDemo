/* Bridges serializable solo rules to the existing chess, economy and combat engine. */
(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const modes = () => SoloModes.definitions;
  const key = mode => 'vc_solo_v1_' + mode;
  const saveVersion = mode => mode === 'conquest' ? 2 : 1;   // 战役征服 v2 重制：conquest 存档升为 version 2，其余四模式保持 1
  let rendering = false;
  let lastError = '';
  const active = () => !!(S && S.solo);
  const context = () => ({ gold: S.gold, hp: S.hp });
  const view = () => SoloModes.view(S.solo, context());
  function checkpoint() {
    const value = clone(S);
    value.auto = false; value.autoFight = false; value.phase = 'prep';
    value.selUid = null; value.selItem = null;
    return value;
  }
  function read(mode) {
    try {
      const raw = localStorage.getItem(key(mode));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (mode === 'conquest' && data.version === 1) {
        /* 仅在战役自身活跃时提示，避免大厅渲染其他模式时把该消息泄漏进它们的副标题（P1-2） */
        if (active() && S.solo && S.solo.mode === 'conquest') lastError = '战役已重制，请重新开始';
        return null;
      }
      if (data.version !== saveVersion(mode) || !data.state || data.state.solo?.mode !== mode ||
          !Array.isArray(data.state.board) || data.state.board.length !== BOARD_W * BOARD_H ||
          !Array.isArray(data.state.bench) || data.state.bench.length !== BENCH ||
          ![...data.state.board, ...data.state.bench].every(u => !u || UNITS.some(d => d.id === u.id)))
        throw new Error('存档结构无效');
      SoloModes.view(data.state.solo, {gold:data.state.gold});
      return data;
    } catch (error) { lastError = '无法读取此模式存档：' + error.message; return null; }
  }
  function save() {
    if (!active() || S.menuPreview || ['battle','settle'].includes(S.phase)) return false;
    try {
      const data = { version: saveVersion(S.solo.mode), savedAt: Date.now(), state: checkpoint() };
      localStorage.setItem(key(S.solo.mode), JSON.stringify(data));
      const check = JSON.parse(localStorage.getItem(key(S.solo.mode)));
      if (check.state.runId !== S.runId) throw new Error('回读不一致');
      lastError = ''; return true;
    } catch (error) { lastError = '保存失败：' + error.message; return false; }
  }
  function stop() {
    runSessionId++; autoRunId++; autoBusy = false; stopTickLoop(); cancelAutoFight();
    if (chapterAutoTimer) clearTimeout(chapterAutoTimer);
    chapterAutoPending = false; flowPausedSchedulers = null; flowBattleAutoIntent = null;
    S.auto = false; S.autoFight = false;
    document.getElementById('unitLayer')?.remove();
    document.getElementById('aliveBar')?.remove();
  }
  function openHub() {
    if (active() && ['battle','settle'].includes(S.phase)) { log('请等待本场战斗结束后返回模式大厅。'); return false; }
    if (active() && !save()) { log(lastError); return false; }
    render(); SoloUI.openHub(); return true;
  }
  function starter() {
    const candidates = [UNITS.find(d => d.cost === 1 && d.job === '守护'), UNITS.find(d => d.cost === 1 && d.form === 'rg')];
    candidates.forEach((d, i) => {
      d = d || UNITS.filter(x => x.cost === 1)[i];
      S.board[(i ? 6 : 4) * BOARD_W + 3] = makeOwned(d);
      S.pool[d.id] = Math.max(0, S.pool[d.id] - 1);
    });
  }
  function makeOwned(d, star = 1) {
    const m = Math.pow(STAR_M[d.cost] || 1.8, star - 1);
    return {uid:S.uid++, id:d.id, star, sks:Math.pow(SKILL_STAR_M[d.cost] || 1.1, star-1),
      hp:Math.round(d.hp * HP_SCALE * m), maxhp:Math.round(d.hp * HP_SCALE * m), atk:Math.round(d.atk * m), items:[]};
  }
  function start(mode, confirmed = false, options = {}) {
    if (!modes().some(x => x.id === mode) || ['battle','settle'].includes(S?.phase)) return false;
    let existing;
    try { existing = localStorage.getItem(key(mode)); } catch (e) { lastError='浏览器禁止存档，无法安全新建。'; render(); return false; }
    if (existing && !confirmed && !window.confirm('重新开始将覆盖此模式的进度，其他模式存档保留。确定开始？')) return false;
    const state = SoloModes.create(mode, options.seed || Date.now(), options);
    newGame({menuPreview:true}); stop();
    S.solo = state; S.mode = mode; S.menuPreview = false;
    S.runConfig = {mode}; S.soloBattles = 0; S.round = 1; S.lvl = mode === 'puzzle' ? 4 : 3;
    S.gold = mode === 'puzzle' ? (state.budget || 12) : mode === 'hunt' ? 24 : 16;
    S.hp = state.hp; S.maxSoloHp = state.maxHp || state.hp;
    S.board.fill(null); S.bench.fill(null);
    if (mode !== 'puzzle') starter();
    S.items = mode === 'puzzle' ? [] : ['armor', 'sword'];
    rollShop(); prepEnemy();
    SoloUI.closeHub(); hideFlowForGame(false);
    log(mode==='expedition'?'🎤 偶像巡演启程：选择下一站演出，筹备阵容。':'开始' + modes().find(x => x.id === mode).name + '：查看模式面板，选择行动后备战。');
    renderAll(); save(); return true;
  }
  function resume(mode) {
    if (['battle','settle'].includes(S?.phase)) return false;
    const data = read(mode); if (!data) { render(); return false; }
    stop(); S = clone(data.state); ARENA = null;
    S.phase = 'prep'; S.auto = false; S.autoFight = false; S.menuPreview = false;
    applyRNG(); prepEnemy(); SoloUI.closeHub(); hideFlowForGame(false); renderAll(); return true;
  }
  function apply(result, choiceId) {
    const previous = S.solo;
    S.solo = result.state;
    const fx = result.effects || {};
    if (choiceId === 'checkpoint:retry') {
      /* 幕检查点重开：只回滚规则状态（地图/据点/耐久）。绝不套用 soloRetry——那是最后一场战斗开打前的
         完整快照，若期间换过队/防守战自动切过队，会把别支军队的阵容盖在幕初活跃军队上（P1-1）。 */
      const armyBoard = S.soloArmies && S.soloArmies[S.solo.activeArmy];
      if (armyBoard) { S.board = clone(armyBoard.board); S.bench = clone(armyBoard.bench); }
      else { S.board = Array(BOARD_W*BOARD_H).fill(null); S.bench = Array(BENCH).fill(null); starter(); }
      S.soloRetry = null;
    } else if (fx.restore || fx.retry || /retry|restart_puzzle/.test(choiceId || '')) {
      if (S.soloRetry) {
        const rules = S.solo, prior = clone(S.soloRetry);
        Object.assign(S, prior); S.solo = rules; S.soloRetry = prior;
      }
    }
    if (Number.isFinite(fx.gold)) { S.gold = Math.max(0, S.gold + fx.gold); if(fx.gold>0)S.stats.goldEarned += fx.gold; }
    S.hp = S.solo.hp;
    if (Number.isFinite(fx.levelUp)) S.lvl = Math.min(10, S.lvl + fx.levelUp);
    if (fx.items) {
      const items = Array.isArray(fx.items) ? fx.items : Array.from({length:Math.min(5,Number(fx.items)||0)}, () => ['sword','staff','armor','bow','vamp','mana'][Math.floor(rand()*6)]);
      items.forEach(id => { if(ITEMS[id]) S.items.push(id); });
    }
    if (fx.log) (Array.isArray(fx.log) ? fx.log : [fx.log]).forEach(log);
    if (fx.refresh) { S.lock=false; rollShop(); }
    if (fx.swapArmy) {
      S.soloArmies = S.soloArmies || {};
      S.soloArmies[fx.swapArmy.from] = clone({board:S.board,bench:S.bench});
      const next = S.soloArmies[fx.swapArmy.to];
      if (next) {S.board=clone(next.board);S.bench=clone(next.bench);}
      else {S.board=Array(BOARD_W*BOARD_H).fill(null);S.bench=Array(BENCH).fill(null);starter();}
    }
    if (fx.recruit) {
      S.shop.forEach(d=>{if(d)S.pool[d.id]++;});
      const pool=UNITS.filter(d=>jobsOf(d).includes(fx.recruit)&&S.pool[d.id]>0);
      S.shop=Array.from({length:5},(_,i)=>{const d=pool[i%pool.length];if(d&&S.pool[d.id]>0){S.pool[d.id]--;return d;}return null;});
      log('定向招募：本次商店优先提供'+fx.recruit+'棋子。');
    }
    S.phase = 'prep'; S.selUid = null; S.selItem = null;
    if (S.solo.mode === 'conquest' && S.solo.phase === 'finished' && S.solo.outcome === 'won') recordCampaignMeta(S.solo.difficulty);
    if (S.solo.mode === 'puzzle' && (fx.puzzleReset || fx.resetBudget || previous.puzzleIndex !== S.solo.puzzleIndex || previous.puzzle !== S.solo.puzzle)) resetPuzzle();
    prepEnemy(); renderAll(); save();
  }
  /* 通关写入 vc_campaign_meta（大厅难度门控读这里）；写失败静默降级，不影响战役本身 */
  function recordCampaignMeta(difficulty) {
    try {
      const d = Math.max(1, Math.min(3, Number(difficulty) || 1));
      let meta = {};
      try { meta = JSON.parse(localStorage.getItem('vc_campaign_meta')) || {}; } catch (e) { meta = {}; }
      const prev = Math.max(0, Math.min(3, Number(meta.maxClearedDifficulty) || 0));
      meta.maxClearedDifficulty = Math.max(prev, d);
      meta.lastClearedAt = Date.now();
      localStorage.setItem('vc_campaign_meta', JSON.stringify(meta));
    } catch (e) { /* 存储被禁时忽略 */ }
  }
  function action(id) {
    if (!active() || S.phase !== 'prep') return false;
    if (id === '__hub') return openHub();
    if (id === '__restart') return start(S.solo.mode);
    try { apply(SoloModes.act(S.solo, id, context()), id); return true; }
    catch (error) { lastError = error.message; log(lastError); render(); return false; }
  }
  function canFight() { return active() && S.phase === 'prep' && view().canFight; }
  function beforeBattle() {
    const cp = checkpoint(); delete cp.soloRetry;
    S.soloRetry = cp; save();
    S.soloCombatTime = 0;
    S.soloProtectedUid = null;
    if(S.solo.mode==='puzzle'&&S.solo.puzzle===1){
      const protectedEntry=S.board.map((u,i)=>({u,i})).filter(x=>x.u).sort((a,b)=>b.i-a.i)[0];
      S.soloProtectedUid=protectedEntry?.u.uid||null;
      if(protectedEntry)log('本题保护目标：'+byId(protectedEntry.u.id).name+'。该棋子退场即挑战失败。');
    }
    RND = mulberry32(seedHash(String(view().encounter?.seed || S.solo.seed || 1)));
  }
  function settle(won, survivors, allies) {
    if (!active() || !['battle','settle'].includes(S.phase)) return false;
    stopTickLoop();
    // Boss and puzzle objectives require defeating all enemies, not winning a timeout by headcount.
    if ((view().encounter?.boss || S.solo.mode === 'puzzle') && survivors > 0) won = false;
    if(S.solo.mode==='puzzle'&&S.solo.puzzle===1&&S.soloProtectedUid){
      if(!window.__bu?.some(u=>u.uid===S.soloProtectedUid&&u.hp>0))won=false;
    }
    if(S.solo.mode==='puzzle'&&S.solo.puzzle===2&&S.soloCombatTime>30000)won=false;
    S.stats[won ? 'wins' : 'losses']++; S.streak=won?(S.streak||0)+1:0; S.lossStreak=won?0:(S.lossStreak||0)+1; S.soloBattles++;
    S.round = S.soloBattles + 1;
    S.phase = 'prep';
    const result = SoloModes.settle(S.solo, {won, survivors, allies, deployed:S.board.filter(Boolean).length, playerStartingCount:S.soloRetry?.board.filter(Boolean).length||S.board.filter(Boolean).length, time:S.soloCombatTime / 1000, gold:S.gold});
    if (S.solo.mode !== 'puzzle') { S.xp += 3; checkLevel(); }
    log(S.solo.mode==='expedition' ? ('本场公演' + (won ? '圆满完成' : '未能完成') + ' · 我方留场 ' + allies + ' / 对方留场 ' + survivors) : ('本场' + (won ? '胜利' : '失利') + ' · 我方存活 ' + allies + ' / 敌方存活 ' + survivors));
    apply(result);
    return true;
  }
  function finish(won) {
    if (!active() || ['battle','settle'].includes(S.phase)) return false;
    if (S.solo.phase === 'finished' && S.solo.outcome === 'won') { if (window.SoloUI) SoloUI.openHub(); return true; }   // 通关墓碑不可被「结束并结算」改写为失利
    stop(); S.solo.finished = true; S.solo.outcome = won ? 'won' : 'lost'; S.solo.phase = 'finished';
    S.phase = 'prep'; save();
    log(won ? '🏁 挑战完成，已结算（成绩保留在本地存档）。' : '🏁 已结束本局并结算（成绩保留在本地存档）。');
    if (typeof hideFlowForGame === 'function') hideFlowForGame(false);   // 「结束并结算」必须关掉确认弹窗/菜单，不能停在原界面
    renderAll();
    if (window.SoloUI) SoloUI.openHub();   // 大厅对已结算的运行提供「重新开始 / 返回模式大厅」
    return true;
  }
  function resetPuzzle() {
    S.board.fill(null); S.bench.fill(null); S.items=[]; S.gold=S.solo.budget||12; S.soloPuzzlePurchased=[];
    S.lvl=4; S.xp=0; S.soloRetry=null; initPool(); puzzleShop();
  }
  function puzzleShop() {
    S.shop = (S.solo.candidates || []).map(id => (S.soloPuzzlePurchased||[]).includes(id)?null:UNITS.find(d => d.id === id));
    renderShop();
  }
  function enemy() {
    const e = view().encounter, board=Array(BOARD_W*BOARD_H).fill(null);
    if (!e) return board;
    const rng = mulberry32(seedHash(String(e.seed || 1))), tier=Math.max(1,e.tier||1);
    const cap=Math.min(5,Math.max(1,Math.ceil(tier/2)));
    const roles = [];
    if (e.roster && typeof e.roster === 'object') Object.entries(e.roster).forEach(([role,n]) => {for(let i=0;i<n;i++)roles.push(role);});
    const units=[];
    let count=Math.min(12, Math.max(1,e.count||3));
    /* conquest v2：encounter 扩展 difficulty/affixes/bossScript/garrisonArmy（solo-modes 的 conquestEncounter/conquestDefenseEncounter）。
       难度乘数乘进 scale；词缀作用于整支敌军：swift 提速、regen 每秒回血（均由 modifyUnit 消费），split 复用既有双线布阵。 */
    const conquest = S.solo.mode === 'conquest';
    const affixes = conquest && Array.isArray(e.affixes) ? e.affixes : [];
    const diffMul = conquest ? ({1:0.9, 2:1.25, 3:1.5}[e.difficulty] || 1) : 1;   // M5 平衡调整③：难度 I 倍率 1→0.9（仅难度 I 征服；II/III 与其他模式不变）
    const targetNode = conquest ? (S.solo.map?.nodes || []).find(n => n.id === S.solo.target) || null : null;
    const fortGuard = conquest && S.solo.phase === 'fight' && !!targetNode && targetNode.kind === 'stronghold' && targetNode.sub === 'fort';
    for(let i=0;i<count;i++) {
      const role=roles[i] || (i%3===0?'front':i%3===1?'ranged':'support');
      const jobs=role==='front'?['守护','刀客','狂战']:role==='assassin'?['刺客']:role==='support'?['医者','咒术']:['法师','游侠'];
      let candidates=UNITS.filter(d=>jobs.includes(d.job)&&d.cost<=cap);
      if(!candidates.length)candidates=UNITS.filter(d=>d.cost<=cap);
      const d=candidates[Math.floor(rng()*candidates.length)];
      const u=makeOwned(d, tier>=6?2:1);
      const mod=typeof e.modifier==='number'?e.modifier:({elite:1.2,scouted:0.9,risk:1.12,fortified:1.15,highground:1.08,fixed:0.78,counterattack:1.05}[e.modifier]||1);
      let scale=(0.8+tier*0.10)*mod;
      if(conquest)scale*=diffMul;   // 难度乘数只作用于战役征服（其余模式 scale 数值不变）
      u.hp=u.maxhp=Math.round(u.maxhp*scale); u.atk=Math.round(u.atk*scale); u.enemy=true;
      if(fortGuard){u.hp=u.maxhp=Math.round(u.maxhp*1.1);u.atk=Math.round(u.atk*.95);}   // 进攻要塞亚型据点：守军偏防御（+10% 生命 / -5% 攻击，自由裁量微调）
      u.boss=!!e.boss&&i===0; u.soloMechanic=u.boss?e.mechanic:null;
      if(S.solo.mode==='puzzle'&&S.solo.puzzle===0&&i<2)u.soloMechanic='shield';
      if(S.solo.mode==='puzzle'&&S.solo.puzzle===2){
        if(i===count-1){const healer=UNITS.find(x=>x.id==='likou');u.id=healer.id;u.soloMechanic='support';}
        else if(i<2)u.soloMechanic='shield';
      }
      if(e.mechanic==='flank'&&i>=count-2){const assassin=UNITS.find(x=>x.job==='刺客'&&x.cost<=cap)||UNITS.find(x=>x.job==='刺客');Object.assign(u,{id:assassin.id});}
      if(affixes.includes('swift'))u.soloAffixSwift=true;
      if(affixes.includes('regen'))u.soloAffixRegen=true;
      if(e.modifier==='split'||affixes.includes('split'))u.soloLane=i%2;
      /* M5 平衡调整②：boss 生命倍率表——conquest 1.4，其他模式维持 2.4 不变。
         before: 统一 2.4（conquest 幕 boss 在 tier 缩放+随从护盾减伤之上再乘 2.4，难度 I 下无法击穿，形成无限重试磨局）
         after : conquest 幕 boss 1.4（配合调整①的 2+act 编制）。 */
      if(u.boss){const hpMul=conquest?1.4:2.4;u.maxhp=Math.round(u.maxhp*hpMul);u.hp=u.maxhp;u.atk=Math.round(u.atk*1.15);if(e.bossScript)u.soloBossAct=e.bossScript.act;}   // 幕 Boss 多阶段脚本编号随单位带入 tick
      units.push(u);
    }
    placeFormation(board,[3,2,1,0],units,[]);
    if(e.modifier==='split'||affixes.includes('split')){board.fill(null);units.forEach((u,i)=>{const lane=i%2?6:1;board[(3-Math.floor(i/4))*BOARD_W+lane+(Math.floor(i/2)%2)]=u;});}
    S.enemyComp={round:S.round,name:e.name,mix:{}};
    return board;
  }
  function modifyUnit(b) {
    if(b.side===0) {
      const relics=S.solo.relics||[];
      if(relics.includes('坚守旗帜')&&b.y<=5)b.dmgReduce=Math.max(b.dmgReduce,.15);
      if(relics.includes('冒险徽章'))b.itemKillMana=(b.itemKillMana||0)+15;
      if(S.solo.mode==='siege') {
        b.ar += (S.solo.walls||0)*2;
        b.augRegen=(b.augRegen||0)+Math.min(3,S.solo.healers||0);
      }
    }
    if(b.side===1&&S.solo.mode==='siege')b.spdMul*=Math.max(.65,1-(S.solo.snares||0)*.08);
    if(b.side===1&&S.solo.mode==='conquest') {
      if(b.soloAffixSwift)b.spdMul*=1.2;                                   // 词缀·迅捷：攻速 ×1.2（makeBattleUnit 会重置 spdMul，只能在这里生效）
      if(b.soloAffixRegen)b.regen=(b.regen||0)+Math.round(b.maxhp*.015);   // 词缀·回生：每秒回复 1.5% 最大生命（引擎 currentTick 每秒消费 regen）
    }
    if(S.solo.mode==='conquest'&&window.CAMPAIGN_FAST){const f=Number(window.CAMPAIGN_FAST);b.spdMul*=f>1?f:3;}   // CAMPAIGN_FAST 测试钩子：战役战斗双方同倍提速（默认关闭；置 1 即 ×3，可置具体倍数）
    if(b.soloMechanic==='shield') b.shield=Math.round(b.maxhp*(b.boss?.35:.18));
    if(b.soloMechanic==='support')b.regen=Math.round(b.maxhp*.02);
  }
  function onCast(u,units) {
    if(u.side!==0)return;
    const relics=S.solo.relics||[];
    if(relics.includes('回响护符'))v3AddShield(u,Math.round(u.maxhp*.08));
    if(relics.includes('召唤核心')&&!u.soloRelicSummoned) {
      u.soloRelicSummoned=true;
      const pos=[{x:u.x-1,y:u.y},{x:u.x+1,y:u.y},{x:u.x,y:u.y+1}].find(p=>p.x>=0&&p.x<BOARD_W&&p.y<BOARD_H&&!units.some(v=>v.hp>0&&v.x===p.x&&v.y===p.y));
      if(pos){const d=UNITS.find(x=>x.job==='守护'&&x.cost===1)||UNITS[0];const raw=makeOwned(d);raw.maxhp=Math.round(u.maxhp*.18);raw.hp=raw.maxhp;raw.atk=Math.round(u.atk*.3);const ally=makeBattleUnit(raw,0,pos.x,pos.y);ally.soloRelicSummoned=true;units.push(ally);}
    }
  }
  function battleWon(allies,enemies) {
    if(S.solo.mode==='puzzle') {
      if(S.solo.puzzle===1&&S.soloProtectedUid&&window.__bu&&!window.__bu.some(u=>u.uid===S.soloProtectedUid&&u.hp>0))return false;
      if(S.solo.puzzle===2&&S.soloCombatTime>30000)return false;
    }
    if(view().encounter?.boss||S.solo.mode==='puzzle')return allies>0&&enemies===0;
    return allies>0&&allies>=enemies;
  }
  function tick(units,t,dt) {
    S.soloCombatTime=t;
    if(S.solo.mode==='puzzle'&&S.solo.puzzle===2&&t%4000===0){
      const support=units.find(u=>u.side===1&&u.hp>0&&u.soloMechanic==='support');
      if(support){units.filter(u=>u.side===1&&u.hp>0).forEach(u=>{u.hp=Math.min(u.maxhp,u.hp+Math.round(u.maxhp*.04));u.shield=(u.shield||0)+Math.round(u.maxhp*.03);});log('对方治疗与护盾循环生效。');}
    }
    for(const boss of units.filter(u=>u.side===1&&u.boss&&u.hp>0)) {
      const ratio=boss.hp/boss.maxhp;
      if(ratio<0.5&&!boss.soloEnraged){boss.soloEnraged=true;boss.spdMul*=1.25;log(S.solo.mode==='expedition'?'压轴嘉宾进入返场环节：演出节奏加快。':'首领进入第二阶段：攻击节奏加快。');}
      if(boss.soloBossAct===4) {   // 深渊之主三阶段脚本：66% 觉醒护盾、33% 开始蓄力，蓄力释放后召唤援军（复用 soloMechanic 通道）
        if(!boss.soloAct4Stage&&ratio<=0.66){boss.soloAct4Stage=1;boss.soloMechanic='shield';boss.shield=(boss.shield||0)+Math.round(boss.maxhp*.25);log('深渊之主展开深渊护盾：先清理护卫或快速破盾。');}
        if(boss.soloAct4Stage===1&&ratio<=0.33){boss.soloAct4Stage=2;boss.soloMechanic='charge';boss.dmgReduce=0;boss.soloCharge=2500;log('深渊之主开始蓄力：控制或沉默可以打断。');}
        if(boss.soloAct4Stage===2&&boss.soloChargeDone){boss.soloAct4Stage=3;boss.soloChargeDone=false;boss.soloMechanic='summon';boss.soloSummoned=false;boss.dmgReduce=0;}   // 召唤日志由通用 summon 分支输出
      }
      if(boss.soloMechanic==='shield') {
        const guards=units.some(u=>u.side===1&&!u.boss&&u.hp>0);
        boss.dmgReduce=guards?0.3:0;
      }
      if(boss.soloMechanic==='charge') {
        if(!boss.soloCharge&&t%8000===0){boss.soloCharge=2500;log(S.solo.mode==='expedition'?'压轴嘉宾正在准备高光曲目：控制或沉默可打断。':'首领正在蓄力：控制或沉默可以打断。');}
        if(boss.soloCharge>0) {
          if(boss.stun>0||boss.frozen>0||boss.silenceT>0||boss.hexT>0){boss.soloCharge=0;log(S.solo.mode==='expedition'?'高光曲目被打断。':'蓄力已被打断。');}
          else {boss.soloCharge-=dt;if(boss.soloCharge<=0){units.filter(u=>u.side===0&&u.hp>0).forEach(u=>dealDamage(boss,u,Math.round(boss.atk*1.5),units,'magic'));if(boss.soloBossAct===4)boss.soloChargeDone=true;}}
        }
      }
      if(boss.soloMechanic==='summon'&&!boss.soloSummoned&&ratio<0.65) {
        boss.soloSummoned=true;
        const positions=[{x:0,y:0},{x:7,y:0}].filter(p=>!units.some(u=>u.hp>0&&u.x===p.x&&u.y===p.y));
        positions.forEach(p=>{const d=UNITS.find(x=>x.cost===1&&x.job==='刀客')||UNITS[0];const u=makeOwned(d);u.enemy=true;u.hp=u.maxhp=Math.round(boss.maxhp*.12);u.atk=Math.round(boss.atk*.45);units.push(makeBattleUnit(u,1,p.x,p.y));});
        log(S.solo.mode==='expedition'?'全息伴舞登场：范围演出效果可以快速应对。':'首领召唤援军：范围伤害可以快速清理。');
      }
    }
  }
  function render() {
    if(rendering||!window.SoloUI)return;
    rendering=true;
    try {
      const saves={};modes().forEach(d=>{
        const record=read(d.id);
        if(record){saves[d.id]={savedAt:record.savedAt,finished:record.state.solo.phase==='finished',summary:SoloModes.view(record.state.solo,{gold:record.state.gold}).subtitle};return;}
        if(d.id!=='conquest')return;
        try{const raw=localStorage.getItem(key('conquest'));if(raw&&JSON.parse(raw).version===1)saves.conquest={savedAt:0,finished:true,summary:'旧版战役存档已失效（战役已重制），重新开始开启新战役'};}catch(e){}
      });
      let v=active()?view():null;
      if(v) {
        v={...v,inBattle:['battle','settle'].includes(S.phase),canFight:S.phase==='prep'&&v.canFight,choices:(v.choices||[]).map(c=>({...c,disabled:c.disabled||S.phase!=='prep'}))};
        if(['battle','settle'].includes(S.phase))v.subtitle=S.solo.mode==='expedition'?'公演进行中 · 行程将在谢幕后开放':'自动战斗进行中 · 行动将在结算后开放';
        if(S.solo.mode==='conquest') {   // 战役征服 v2 新阶段文案：actClear/defense；treasure/shop/rest/event 沿用规则层 view 的 subtitle/objective/enemyHint
          if(S.solo.phase==='actClear')v.subtitle='第'+S.solo.act+'幕攻克 · 下一幕的大门已经开启';
          else if(S.solo.phase==='defense')v.subtitle=['battle','settle'].includes(S.phase)?'防守战进行中 · 击退敌军即可保住据点':'防守战 · 胜利保住据点，失败则据点失守、本营受损';
        }
        if(lastError)v.subtitle+=' · '+lastError;
        if(v.finished && !v.choices.length)v.choices=[{id:'__restart',label:'重新开始',description:'开始新的挑战'},{id:'__hub',label:'返回模式大厅',description:'选择其他玩法'}];
      }
      SoloUI.render({active:active()&&flowPage==='game',mode:S?.solo?.mode,state:S?.solo,phase:S?.phase,view:v,saves,gold:S?.gold,hp:S?.hp});
      if(active()) {
        $('fightBtn').disabled=!canFight(); $('fightBtn').textContent=S.solo.mode==='expedition'?(['battle','settle'].includes(S.phase)?'公演进行中':v.canFight?'登台演出':'先选择行程'):(S.solo.mode==='conquest'&&S.solo.phase==='defense'?(['battle','settle'].includes(S.phase)?'防守战中':'开始防守战'):('battle'===S.phase||'settle'===S.phase?'战斗中':v.canFight?'开始战斗':'先选择行动'));
        $('roundMax').textContent='/'+modes().find(d=>d.id===S.solo.mode).name;
        $('enemyInfo').textContent=v.encounter ? v.encounter.name+' · '+v.enemyHint : v.objective;
        const statTitle=$('statBar')?.parentElement?.querySelector('h3');if(statTitle)statTitle.textContent=S.solo.mode==='expedition'?'演出数据':'战斗统计';
        const logTitle=$('log')?.parentElement?.querySelector('h3');if(logTitle)logTitle.textContent=S.solo.mode==='expedition'?'演出纪要':'战报';
        const hpTitle=$('resHp')?.querySelector('.rl');if(hpTitle)hpTitle.textContent=S.solo.mode==='expedition'?'体力':'生命';
        const streakTitle=$('resStreak')?.querySelector('.rl');if(streakTitle)streakTitle.textContent=S.solo.mode==='expedition'?'连场':'连胜';
        $('tempBuffBox').hidden=S.solo.mode==='puzzle';
        if(S.solo.mode!=='puzzle'){ $('lvlBtn').textContent='买经验 +4 / 5金'; $('lvlBtn').disabled=S.phase!=='prep'||S.lvl>=10||S.gold<5; }
        $('interest').textContent=''; $('resGold').title='金币用于招募和升级；本模式不计算存款利息。';$('goldChip').title='当前金币（本模式不计算存款利息）';
        $('autoBtn').disabled=true; if($('autoFightBtn'))$('autoFightBtn').disabled=true;
        if(S.solo.mode==='puzzle'){$('lvlBtn').disabled=true;$('refreshBtn').disabled=true;}
      } else { const statTitle=$('statBar')?.parentElement?.querySelector('h3');if(statTitle)statTitle.textContent='战斗统计';const logTitle=$('log')?.parentElement?.querySelector('h3');if(logTitle)logTitle.textContent='战报';const hpTitle=$('resHp')?.querySelector('.rl');if(hpTitle)hpTitle.textContent='生命';const streakTitle=$('resStreak')?.querySelector('.rl');if(streakTitle)streakTitle.textContent='连胜';$('tempBuffBox').hidden=false;$('fightBtn').textContent='开战';$('resGold').title='利息：每10金+1，上限3。下回合利息预览见绿色数字';$('goldChip').title='当前金币（利息：每10金+1，上限3）'; $('autoBtn').disabled=false; if($('autoFightBtn'))$('autoFightBtn').disabled=false; }
    } finally {rendering=false;}
  }
  window.SoloHost={start,resume,action,settle,save,openHub,canFight,beforeBattle,enemy,modifyUnit,tick,onCast,battleWon,render,finish,puzzleShop,
    limit:()=>S.solo.mode==='siege'?15:S.solo.mode==='expedition'?18:S.solo.mode==='hunt'?4:S.solo.mode==='puzzle'?1:30,
    get lastError(){return lastError;}};
  SoloUI.mount({onStart:start,onContinue:resume,onAction:action,onFight:startBattle,onExit:openHub,onRetry:()=>start(S.solo.mode)});
  const oldNew=$('homeNew').onclick;
  /* 首页主推经典挑战：原「新建对局」按钮回到经典入口主位（升主按钮样式）；单人玩法缩为次级小按钮 */
  $('homeNew').textContent='经典挑战 / 八人竞技'; $('homeNew').classList.remove('flow-secondary'); $('homeNew').classList.add('flow-primary'); $('homeNew').onclick=oldNew;
  const soloEntry=document.createElement('button');soloEntry.id='homeSolo';soloEntry.type='button';soloEntry.className='flow-secondary';soloEntry.textContent='单人玩法';
  soloEntry.title='巡演企划、首领狩猎、战术解题、守城生存、战役征服';
  soloEntry.style.cssText='font-size:12px;padding:6px 14px;min-width:0;opacity:.85';
  soloEntry.onclick=openHub;$('homeNew').after(soloEntry);
  const oldReset=$('resetBtn').onclick; $('resetBtn').onclick=()=>active()?openHub():oldReset?.();
  const oldSave=$('menuSaveHome').onclick; $('menuSaveHome').onclick=()=>active()?openHub():oldSave?.();
  const oldRestart=$('menuRestart').onclick; $('menuRestart').onclick=()=>active()?start(S.solo.mode):oldRestart?.();
  const oldEnd=$('menuEnd').onclick; $('menuEnd').onclick=()=>active()?finish(false):oldEnd?.();
  document.addEventListener('keydown',e=>{if(active()&&S.solo.mode==='puzzle'&&['d','f'].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();}},true);
  render();
})();
