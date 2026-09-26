/* Phase 2 断言测试：战斗统计插桩 / 结构化结算块 / 总结分区面板。
   用法：T2=1 node tools/sim.js */
module.exports.run = function (A, driveBattle) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };
  const logHtml = () => global.document.getElementById('log').innerHTML;

  /* ---------- a. dealDamage 统计插桩（战斗中读容器） ---------- */
  console.log('[a] dealDamage 统计插桩');
  {
    globalThis.newGame();
    A.S.lvl = 3;
    const mk = (id) => ({ uid: A.S.uid++, id, star: 1, sks: 1, hp: 300, maxhp: 300, atk: 30, items: [] });
    A.S.bench = Array(8).fill(null);
    ['ein', 'chiharu', 'sanli'].forEach((id, i) => A.S.bench[i] = mk(id));
    A.S.board = Array(64).fill(null);
    A.S.phase = 'prep';
    globalThis.startBattle();          // 开战自动补位会上满 3 人
    for (let i = 0; i < 60; i++) A.currentTick();   // 手动推 6 秒战斗（不 drain 定时器）
    const bs = A.battleStats;
    const sides = new Set(Object.values(bs ? bs.units : {}).map(x => x.side));
    ok(bs && sides.has(0) && sides.has(1), '战斗中统计容器存在且已覆盖双方（' + Object.keys(bs.units).length + ' 个单位有记录）');
    const vals = Object.values(bs.units);
    const dealSum = vals.reduce((s, x) => s + x.deal, 0), takeSum = vals.reduce((s, x) => s + x.take, 0);
    ok(dealSum === takeSum && dealSum > 0, `每笔伤害同时计入两侧（deal 合计=${dealSum} == take 合计=${takeSum}）`);
    driveBattle(700);
    ok(!A.battleStats, 'endBattle 后统计容器已释放');
    const mvp = A.S.stats.mvp || {};
    const dealt = Object.values(mvp).reduce((s, x) => s + x.deal, 0);
    ok(dealt > 0, '全场之最 MVP 已累计（我方输出合计 ' + dealt + '）');
    const gb = A.S.stats.goldBy || {};
    ok((gb.base || 0) >= 2, `经济分类记账生效: base=${gb.base} interest=${gb.interest} win=${gb.win}`);
  }

  /* ---------- b. 结构化结算块（胜局 / 败局 / 野怪回合） ---------- */
  console.log('[b] 战报结构化结算块');
  const runBattles = (n) => {
    for (let k = 0; k < n && A.S.phase !== 'over'; k++) {
      globalThis.botPrep();
      globalThis.startBattle();
      driveBattle(700);
    }
  };
  const findBlock = () => {
    const html = logHtml();
    const iHead = html.indexOf('回合结算：');
    return { html, iHead, iDmg: html.indexOf('扣血明细', iHead), iDrop: html.indexOf('🎁 掉落', iHead),
      iBest: html.indexOf('本场之最', iHead), iNext: html.indexOf('下回合：', iHead),
      iEcon: html.indexOf('金币（', iHead) };
  };
  {
    globalThis.newGame(); globalThis.renderAll();
    runBattles(6);   // 打到第 7 回合（含 r5 野怪）
    ok(A.S.round >= 6, '已打 ' + (A.S.round - 1) + ' 回合');
    let fb = findBlock();
    const html = fb.html;
    ok(fb.iHead >= 0 && fb.iBest > fb.iHead && fb.iNext > fb.iBest, '结算块顺序：结算头 → … → 本场之最 → 下回合（位置 ' + fb.iHead + '/' + fb.iBest + '/' + fb.iNext + '）');
    ok(/我方存活 \d+ · 敌方存活 \d+/.test(html), '比分行（我方存活·敌方存活）存在');
    ok(fb.iEcon > fb.iHead, '经济逐项在块内');
    ok(html.includes('本场之最：输出'), '本场之最（输出）存在');
    ok(/下回合：难度/.test(html), '下回合难度预告存在');
    // 野怪回合：掉落行替代扣血行
    ok(html.includes('🎁 装备到手'), '野怪回合掉落信息存在（替代扣血行）');
    // 野怪块：该块的结算头与下回合行之间不应出现扣血明细（掉落行替代）
    const iCreep = html.indexOf('击败【');
    const iHeadC = html.lastIndexOf('回合结算', iCreep);
    const iNextC = html.indexOf('下回合：', iCreep);
    ok(iCreep > 0 && iHeadC >= 0 && !html.slice(iHeadC, iNextC > 0 ? iNextC : iCreep + 800).includes('扣血明细'),
      '野怪结算块内无扣血明细（掉落行替代）');
  }
  // 败局结算块（连败若干轮制造败局）
  {
    globalThis.newGame(); globalThis.renderAll();
    for (let k = 0; k < 30 && A.S.phase !== 'over'; k++) {
      // 削弱玩家制造败局：每回合清空场上只留 1 人
      A.S.board = Array(64).fill(null);
      const u = { uid: A.S.uid++, id: 'ein', star: 1, sks: 1, hp: 150, maxhp: 150, atk: 8, items: [] };
      A.S.board[4 * 8 + 3] = u;
      A.S.bench = Array(8).fill(null);
      globalThis.startBattle();
      driveBattle(700);
    }
    const html = logHtml();
    const iDmg = html.indexOf('扣血明细：敌方存活');
    ok(iDmg >= 0 && /扣 \d+ 血（剩余 \d+\/40）/.test(html), '败局扣血明细格式正确（含剩余/40）');
    ok(html.includes('本场之最：输出'), '败局块同样有本场之最');
  }

  /* ---------- c. 总结分区面板（胜/败两种） ---------- */
  console.log('[c] 一局总结分区面板');
  {
    // 败局面板（上面那局已 over 或血量见底）：直接构造（场上放人，羁绊档位才有内容）
    A.S.phase = 'over';
    A.S.board = Array(64).fill(null);
    A.S.board[4 * 8 + 3] = { uid: A.S.uid++, id: 'ein', star: 1, sks: 1, hp: 150, maxhp: 150, atk: 8, items: ['sword'] };
    A.S.board[4 * 8 + 4] = { uid: A.S.uid++, id: 'goutan', star: 1, sks: 1, hp: 150, maxhp: 150, atk: 8, items: [] };
    const htmlLose = globalThis.reportHTML('lose');
    ok(htmlLose.includes('经济构成'), '面板含 经济构成');
    ok(htmlLose.includes('阶段扣血'), '面板含 阶段扣血');
    ok(htmlLose.includes('最终阵容'), '面板含 最终阵容');
    ok(htmlLose.includes('羁绊档位'), '面板含 羁绊档位');
    ok(htmlLose.includes('全场之最'), '面板含 全场之最 Top3');
    ok(htmlLose.includes('败局简析'), '败局面板含 败局简析');
    const htmlWin = globalThis.reportHTML('win');
    ok(!htmlWin.includes('败局简析'), '胜局面板无败局简析');
    ok(/第1章/.test(htmlLose) && /第4章/.test(htmlLose), '普通模式扣血按四章展示');
  }

  /* ---------- d. 一整局 bot 冒烟（面板数据贯通） ---------- */
  console.log('[d] 完整一局冒烟（结算/统计/总结贯通）');
  {
    globalThis.newGame(); globalThis.renderAll();
    let settled = false;
    for (let k = 0; k < 40 && A.S.phase !== 'over'; k++) {
      if (A.S.phase === 'chapter') {   // 章节结算：验证 3 选 1 与增强入账，然后在下一章备战期收兵
        settled = true;
        ok(Array.isArray(A.S.settleOffer) && A.S.settleOffer.length === 3, '章节结算提供 3 选 1 全局增强');
        if (typeof globalThis.pickAug === 'function') globalThis.pickAug(0);
        ok((A.S.augs || []).length === 1, '选择后增强已入账（augs=' + (A.S.augs || []).length + '）');
        globalThis.chapterContinue();
        globalThis.endRunEarly();
        break;
      }
      globalThis.botPrep();
      globalThis.startBattle();
      driveBattle(700);
    }
    ok(settled || A.S.phase === 'over' || A.S.round > 25, '一局结束（round=' + A.S.round + ' phase=' + A.S.phase + '）');
    // 结算内容现在写入 #finalReport（旧 ovText 容器已移除，见 showFinalResult）
    const ov = String(global.document.getElementById('finalReport').innerHTML);
    ok(ov.includes('经济构成') && ov.includes('全场之最'), '结算 overlay 面板完整');
    const hpTotal = (A.S.stats.hpLog || []).reduce((s, x) => s + x.d, 0);
    ok(hpTotal === 40 - A.S.hp || A.S.hp <= 0, `扣血日志合计 ${hpTotal} 与 40-最终HP ${40 - A.S.hp} 一致`);

    /* 羁绊档位解析（2026-09-25 修复）：boardTierKeys() 的 key 是「F:名称:档位」三段式
       （由 push(key+':'+(i+1)) 拼出），历史上结算面板取 p[3] 会渲染成「音律 Tundefined」。 */
    const tierKeys = globalThis.boardTierKeys();
    const malformed = tierKeys.filter(k => k.split(':').length !== 3);
    ok(malformed.length === 0, `羁绊档位 key 均为「类型:名称:档位」三段式${malformed.length ? '（异常：' + malformed.join('、') + '）' : ''}`);
    A.S.board[0] = { uid: A.S.uid++, id: 'sanli', star: 1, sks: 1, hp: 100, maxhp: 100, atk: 10, items: [] };
    A.S.board[1] = { uid: A.S.uid++, id: 'aza', star: 1, sks: 1, hp: 100, maxhp: 100, atk: 10, items: [] };
    const rep2 = String(globalThis.reportHTML('win'));
    ok(/音律 T1/.test(rep2), '结算面板正确显示羁绊档位（音律 T1）');
    ok(!/Tundefined/.test(rep2), '结算面板不出现 Tundefined（档位索引越界）');
    ok(!/undefined/.test(rep2), '结算面板整体不含 undefined 字样');

    /* 首次上手引导（E5）：无头模拟器里必须永不弹出，否则会顶掉开局招募、
       让「玩家实力」被系统性低估（开局少一名棋子）。 */
    ok(typeof globalThis.maybeShowGuide === 'function', 'maybeShowGuide 已导出到全局');
    ok(globalThis.maybeShowGuide(() => {}) === false, '__HEADLESS 下不弹出上手引导');
  }

  /* ---------- 立绘收集层（2026-09-25 · F5）----------
     两条底线：① 终局要把上场棋子记进 vc_codex；② 记录里【不得出现任何数值字段】——
     一旦收集层能加战力，每新增一份内容都要重测全部难度基线，红线必须由断言守住。 */
  {
    ok(typeof globalThis.codexRecord === 'function', 'codexRecord 已导出到全局');
    const store = () => JSON.parse((global.localStorage._s || {}).vc_codex || '{}');
    // 隔离本用例：清空累积集合，避免受 T2 前面那局的影响
    A.S.codexSeen = {}; A.S.board = Array(64).fill(null); A.S.bench = Array(8).fill(null);
    A.S.board[0] = { uid: A.S.uid++, id: 'sanli', star: 1, sks: 1, hp: 100, maxhp: 100, atk: 10, items: [] };
    globalThis.codexMark();
    globalThis.codexRecord(true);
    const e1 = store().sanli;
    ok(!!e1 && e1.used >= 1, `终局收录上场棋子（sanli 登场 ${e1 && e1.used} 场）`);
    globalThis.codexRecord(false);
    const e2 = store().sanli;
    ok(e2.used > e1.used, `再次结算会累加登场次数（${e1.used} → ${e2.used}）`);
    ok(e2.win === e1.win, '失败局不增加胜场');

    /* 关键回归：只在终局记 S.board 会漏掉「中途买过又卖掉」的棋子，
       而玩家一局真正经手的往往远多于终局阵容 —— 那些同样要收录。 */
    A.S.codexSeen = {}; A.S.board = Array(64).fill(null); A.S.bench = Array(8).fill(null);
    A.S.bench[0] = { uid: A.S.uid++, id: 'ein', star: 1, sks: 1, hp: 100, maxhp: 100, atk: 10, items: [] };
    globalThis.codexMark();          // 第 N 回合经手
    A.S.bench[0] = null;             // 随后卖掉，终局时已不在棋盘/备战席上
    globalThis.codexRecord(true);
    const e3 = store().ein;
    ok(!!e3 && e3.used >= 1, '中途买过又卖掉的棋子也会被收录（不只看终局阵容）');
    ok(Object.keys(e2).every(k => ['used', 'win', 'first', 'casts', 'damage', 'bestDamage', 'kills'].includes(k)),
      `收集记录只含展示字段（used/win/first + 只读聚合的施法/伤害/击杀统计），不含可回流战斗的数值字段（实际：${Object.keys(e2).join('/')}）`);
    const cs = globalThis.codexStat();
    ok(cs.total === A.UNITS.length, `收集总数与棋子表一致（${cs.collected}/${cs.total}）`);
    ok(typeof globalThis.codexTitle(cs.total) === 'string', '里程碑称号可生成');
  }

  /* ---------- 本命标记（2026-09-25 · G3）----------
     本命是「我推」的身份展示，只存一个棋子 id；同样不得带来任何数值影响。 */
  {
    ok(typeof globalThis.myosGet === 'function' && typeof globalThis.myosSet === 'function', '本命读写函数已导出');
    globalThis.myosSet('sanli');
    ok(globalThis.myosGet() === 'sanli', '本命可设置');
    globalThis.myosSet('');
    ok(globalThis.myosGet() === '', '本命可取消');
    globalThis.myosSet('no-such-unit');
    ok(globalThis.myosGet() === '', '非法棋子 id 不会被写入（避免脏数据）');
  }

  /* ---------- 技能一句话定位（2026-09-25 · E3）----------
     50 枚棋子的定位标签由 kit.mode + 原型标签自动生成；这里守住三条底线：
     ① 全员非空；② 不能有任何一枚落到兜底文案（说明有 mode 未映射）；③ 不出现 undefined。 */
  {
    const role = globalThis.skillRole;
    ok(typeof role === 'function', 'skillRole 已导出到全局');
    if (typeof role === 'function') {
      const rows = A.UNITS.map(d => ({ id: d.id, name: d.name, r: String(role(d) || '') }));
      const empty = rows.filter(x => !x.r.trim());
      const fallback = rows.filter(x => x.r.includes('专属技能'));
      const bad = rows.filter(x => /undefined|null|NaN/.test(x.r));
      ok(empty.length === 0, `全部 ${rows.length} 枚棋子都有定位标签${empty.length ? '（缺失：' + empty.map(x => x.name).join('、') + '）' : ''}`);
      ok(fallback.length === 0, `没有棋子落到兜底文案（未映射的 mode：${fallback.length ? fallback.map(x => x.name + '=' + x.r).join('、') : '无'}）`);
      ok(bad.length === 0, `定位标签不含 undefined/null/NaN${bad.length ? '（异常：' + bad.map(x => x.name).join('、') + '）' : ''}`);
    }
  }

  /* ---------- 羁绊档位可达性（2026-09-25 · A1）----------
     羁绊按【去重棋子 id】计数（boardTierKeys 用 new Set(ids).size），所以某档位的门槛一旦超过
     该羁绊的成员总数，这一档在数学上永远凑不齐，而 UI 仍会把它显示成「还差 1 名」的陷阱档位。
     修正前的越界项：音律/魔道/工造 need[2,4]（成员 3）、森之国 need[3,6]（成员 4）、游侠 need[3,4]（成员 3）。 */
  {
    const size = {};
    A.UNITS.forEach(u => {
      (size['F:' + u.fac] = size['F:' + u.fac] || new Set()).add(u.id);
      (size['J:' + u.job] = size['J:' + u.job] || new Set()).add(u.id);
    });
    const rows = [];
    Object.entries(A.FACTIONS).forEach(([k, c]) => rows.push(['F:' + k, '阵营·' + k, c.need]));
    Object.entries(A.CLASSES).forEach(([k, c]) => rows.push(['J:' + k, '职业·' + k, c.need]));
    const capOf = key => (size[key] ? size[key].size : 0);
    const over = rows.filter(([key, , need]) => need[need.length - 1] > capOf(key));
    ok(over.length === 0, `全部 ${rows.length} 个羁绊的顶档门槛均不超过其成员总数` +
      (over.length ? '（越界：' + over.map(([key, label, need]) => `${label} 顶档需${need[need.length - 1]}人但只有${capOf(key)}名成员`).join('；') + '）' : ''));
    const badShape = rows.filter(([, , need]) => !need.length || need.some((x, i) => i > 0 && x <= need[i - 1]));
    ok(badShape.length === 0, `羁绊档位数组均为非空且严格递增` +
      (badShape.length ? '（异常：' + badShape.map(r => r[1] + '=' + JSON.stringify(r[2])).join('；') + '）' : ''));
  }

  /* ---------- P0-1 体验遥测与 P0-2 死亡回合统计 ---------- */
  console.log('[e] P0 遥测与死亡分布工具');
  {
    const metrics=require('./sim-metrics.js');
    try{global.localStorage.removeItem('vc_tele_v1');}catch(e){}
    globalThis.__HEADLESS=true;
    globalThis.newGame();
    A.S.round=10;A.S.phase='prep';A.S.enemyBoard=[{id:'xuezhu',hp:100,maxhp:100,atk:10}];
    A.chooseChallenge();
    A.S.phase='chapter';A.S.settleOffer=[{id:'synres',weak:false}];A.S.settlePick=null;A.S.settleWon=true;
    A.pickAug(0);
    const choices=A.S.stats.tele._events||[];
    ok(A.S.stats.tele.eliteAccept===1&&A.S.stats.tele['augPick.synres']===1&&
      choices.some(e=>e.name==='eliteAccept'&&e.round===10&&e.health===40)&&
      choices.some(e=>e.name==='augPick'&&e.id==='synres'&&e.rarity===3),
      '精英选择与增强选择保留回合/生命/增强稀有度');
    A.flushTelemetry();
    ok(!Object.prototype.hasOwnProperty.call(global.localStorage._s,'vc_tele_v1'),
      '__HEADLESS 下 flushTelemetry 不写 localStorage');

    globalThis.__HEADLESS=false;A.S.auto=true;
    const notice=global.document.getElementById('levelGuideModal');notice.style.display='none';
    const autoShown=A.showLevelNotice({kind:'forecast',title:'测试',body:'测试'});
    A.S.auto=false;A.S.autoFight=true;
    const autoFightShown=A.showLevelNotice({kind:'recipe',title:'测试',body:'测试'});
    A.S.autoFight=false;globalThis.__HEADLESS=true;
    ok(!autoShown&&!autoFightShown&&notice.style.display==='none',
      'S.auto 与 S.autoFight 下教学自动兑现，不弹窗阻塞');

    const dist=metrics.deathHistogram([
      {round:25,win:false},{round:25,win:false},{round:50,win:false},
      {round:100,win:true},{round:100,win:false,truncated:true},
    ],100);
    ok(dist.rows.length===100&&dist.rows[24].deaths===2&&dist.total===3,
      '死亡直方图固定 100 行，只统计真实终局失败并排除截断样本');
    ok(dist.top5[0].round===25&&dist.top5[0].highlighted&&metrics.deathReport([{round:25,win:false}]).includes('卡关点 Top5'),
      'Top5 按死亡数排序并标记达到均值 2× 的回合');
    ok(Object.keys(metrics.mergeTelemetryTotals({},A.S.stats.tele)).includes('eliteAccept'),
      'sim 聚合器读取各局 S.stats.tele 数字计数');

    globalThis.newGame();
    A.S.teleLastSaveAt=1000;A.recordSaveTelemetry(4,2500);
    const saveEvents=A.S.stats.tele._events||[];
    ok(A.S.stats.tele.sessionDurationMs===1500&&saveEvents.some(e=>e.kind==='save'&&e.savedRound===4)&&
      !Object.keys(A.S.stats.tele).some(k=>k.startsWith('exitRound.')),
      '存档记录间隔与回合快照，不把重复存档误算成退出');
    A.S.round=7;globalThis.gameOver(false);
    const exitEvents=A.S.stats.tele._events||[];
    ok(A.S.stats.tele['exitRound.7']===1&&exitEvents.some(e=>e.kind==='exit'&&e.savedRound===7),
      '终局只记录一次真实退出回合');
  }

  /* ---------- P0-4 / P0-5 / P0-6 展示字段、评级與信息边界 ---------- */
  console.log('[f] P0 展示与信息层断言');
  {
    globalThis.newGame();
    A.S.round=6;A.S.phase='prep';A.S.lvl=3;A.S.board[0]={id:'kanban',star:2};

    A.S.round=5;A.S.challengeRound=null;A.renderTop();
    const restTag=global.document.getElementById('restTag');
    ok(restTag.style.display!=='none','普通野怪回合显示休整标识');
    A.S.round=25;A.renderTop();
    ok(restTag.style.display==='none','守关回合不显示“失败不扣血”的休整标识');
    A.S.round=10;A.S.challengeRound=10;A.renderTop();
    ok(restTag.style.display==='none','接受精英挑战后隐藏普通野怪休整标识');

    const card=A.gearDropCardsHTML(['sword']);
    ok(card.includes(A.ITEMS.sword.e)&&card.includes(A.ITEMS.sword.n)&&card.includes('装备到手'),'装备卡片复用装备图标与名称');

    A.S.round=24;A.S.phase='prep';A.S.ms.forecastRounds=[];
    const modal=global.document.getElementById('levelGuideModal');modal.style.display='none';
    A.renderRoundNotice();
    ok(A.S.ms.forecastRounds.includes(24)&&A.S.phase==='prep'&&modal.style.display==='none','无头守关预告只记标记、不弹窗或阻塞备战');
    A.S.round=49;A.S.ms.ticketGuidePending=0;A.S.tickets=0;A.S.ms.forecastRounds=[];
    A.renderRoundNotice();
    ok(A.S.ms.forecastRounds.includes(49)&&modal.style.display==='none','r49守关预告不弹窗阻塞无头备战');
    A.S.round=51;A.S.tickets=1;A.S.ms.ticketGuidePending=1;A.renderRoundNotice();
    ok(A.S.ms.ticketGuidePending===0&&A.S.phase==='prep','无头升星券教学自动兑现，不阻塞备战');

    A.S.round=25;A.S.enemyBoard=[{id:'xuezhu',star:1}];
    const ch1=A.enemyThreatHTML(A.S.enemyBoard,false);
    A.S.round=26;const ch2=A.enemyThreatHTML(A.S.enemyBoard,true);
    ok(ch1.includes('法师')&&!ch1.includes('主要威胁'),
      '首章敌方预览显示职业且隐藏威胁标签：'+ch1);
    ok(/主要威胁：<b>(?:控制|爆发|持续伤害)<\/b>/.test(ch2),
      '后续章节敌方预览显示主要威胁标签：'+ch2);
    A.S.curses=['fog'];
    ok(A.enemyThreatHTML(A.S.enemyBoard,true)===''&&A.poolGuideHTML()==='',
      '迷雾下隐藏威胁与卡池可视化');
    A.S.curses=[];A.S.round=26;
    const pool=A.poolGuideHTML();
    ok(!/undefined|null/.test(pool)&&pool.includes('池中'),'羁绊卡池提示包含候选棋子剩余张数且无空值');

    const s={chapterReview:{healthValue:25,failures:3,tier2BondCount:3}};
    const a={chapterReview:{healthValue:12,failures:8,tier2BondCount:0}};
    const b={chapterReview:{healthValue:11,failures:9,tier2BondCount:0}};
    ok(A.chapterRating(s)==='S'&&A.chapterRating(a)==='A'&&A.chapterRating(b)==='B',
      '章末评级按集中定义的 S/A/B 门槛计算');
    A.recordChapterReview();
    const displayState={start:A.S.stats.chapterStart,review:A.S.stats.chapterReview,tele:A.S.stats.tele||{}};
    const keys=[];(function walk(value){if(!value||typeof value!=='object')return;Object.entries(value).forEach(([key,child])=>{keys.push(key);walk(child);});})(displayState);
    const badKeys=keys.filter(key=>key!=='lvlDisplay'&&/(^|[._-])(atk|hp|maxhp|ar|mr|asp|mana|crit|dmg|lvl|cost)(?=$|[._-])/i.test(key));
    ok(!badKeys.length,'评级/成长/遥测数据没有战斗字段名'+(badKeys.length?'（'+badKeys.join(',')+'）':''));
  }

  console.log(fails.length ? '\nFAIL ' + fails.length + ' 项:\n' + fails.map(f => '  ✗ ' + f).join('\n') : '\nALL PASS ✅');
  process.exitCode = fails.length ? 1 : 0;
};
