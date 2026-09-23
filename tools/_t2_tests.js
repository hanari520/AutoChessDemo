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
    ok(html.includes('🎁 掉落：'), '野怪回合掉落行存在（替代扣血行）');
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
    const ov = String(global.document.getElementById('ovText').innerHTML);
    ok(ov.includes('经济构成') && ov.includes('全场之最'), '结算 overlay 面板完整');
    const hpTotal = (A.S.stats.hpLog || []).reduce((s, x) => s + x.d, 0);
    ok(hpTotal === 40 - A.S.hp || A.S.hp <= 0, `扣血日志合计 ${hpTotal} 与 40-最终HP ${40 - A.S.hp} 一致`);
  }

  console.log(fails.length ? '\nFAIL ' + fails.length + ' 项:\n' + fails.map(f => '  ✗ ' + f).join('\n') : '\nALL PASS ✅');
  process.exitCode = fails.length ? 1 : 0;
};
