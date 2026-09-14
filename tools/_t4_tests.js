/* Phase 4 断言测试：角色专属暴击（6 人名单、合并规则、封顶 60%、触发率实测）。
   用法：T4=1 node tools/sim.js */
module.exports.run = function (A, driveBattle) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };

  /* ---------- 1. 六人名单静态生效 ---------- */
  console.log('[1] 专属暴击名单静态生效（makeBattleUnit）');
  globalThis.newGame();
  {
    const mkU = (id, items) => ({ uid: A.S.uid++, id, star: 1, sks: 1, hp: 1000, maxhp: 1000, atk: 100, items: items || [] });
    const t = (id) => A.makeBattleUnit(mkU(id), 0, 3, 4);
    const list = [
      ['nox', 0.25, 2.5], ['shadow', 0.20, 2.5], ['zhijin', 0.20, 2.2],
      ['hoshimi', 0.20, 2.2], ['miyue', 0.15, 2.2], ['youyi', 0.15, 2.0],
    ];
    list.forEach(([id, pct, mul]) => {
      const u = t(id);
      ok(u.crit === pct && u.critM === mul && u.ownCrit === true,
        `${id} 专属暴击 ${pct * 100}%/${mul}×（实际 ${u.crit}/${u.critM}，ownCrit=${u.ownCrit}）`);
    });
    // 非名单棋子无专属暴击
    const plain = t('ein');
    ok(plain.crit === 0 && !plain.ownCrit, '非名单棋子无专属暴击（ein crit=0）');
    // 又一：被动吸血/毒伤与暴击共存
    const yy = t('youyi');
    ok(yy.vamp >= 0.3 && !!yy.pAtkDot, '又一被动三件套共存（吸血30%+毒伤+暴击）');
    // 图鉴说明字段
    ok(A.SKILL_VAR.nox.p.critPct === 0.25 && A.SKILL_VAR.youyi.p.critPct === 0.15, 'SKILL_VAR.p 扩展字段就位');
  }

  /* ---------- 2. 叠加规则：率相加封顶 60%、暴伤取最大 ---------- */
  console.log('[2] 叠加规则（专属 + 装备 + 刺客羁绊）');
  {
    globalThis.newGame();
    A.S.bench = Array(8).fill(null);
    A.S.board = Array(64).fill(null);
    const mk = (id, items) => ({ uid: A.S.uid++, id, star: 1, sks: 1, hp: 800, maxhp: 800, atk: 20, items: items || [] });
    A.S.board[4 * 8 + 3] = mk('nox', ['flamejudge']);   // 专属 25% + 装备 20%
    A.S.board[4 * 8 + 4] = mk('hoshimi');               // 凑 3 刺客 → 刺客 T1 +18%
    A.S.board[4 * 8 + 5] = mk('zhijin');
    A.S.lvl = 3; A.S.round = 2; A.S.phase = 'prep';
    globalThis.prepEnemy();
    globalThis.startBattle();
    const arr = globalThis.window.__bu || [];
    const nox = arr.find(u => u.id === 'nox');
    ok(nox.crit === 0.6, `率相加封顶 60%（0.25+0.20+0.18=0.63 → 实际 ${nox.crit}）`);
    ok(nox.critM === 3.5, `暴伤取最大（max(2.5专属, 2.5装备, 3.5刺客T1) → 实际 ${nox.critM}）`);
    driveBattle(700);
  }

  /* ---------- 3. 触发率实测（nox 25%，±5pp） ---------- */
  console.log('[3] 触发率实测（真实战斗计数，nox 单挑木桩）');
  {
    globalThis.newGame();
    let atk = 0, crit = 0;
    for (let round = 0; round < 5; round++) {
      A.S.bench = Array(8).fill(null);
      A.S.board = Array(64).fill(null);
      A.S.board[4 * 8 + 3] = { uid: A.S.uid++, id: 'nox', star: 1, sks: 1, hp: 2000, maxhp: 2000, atk: 20, items: [] };
      A.S.enemyBoard = Array(64).fill(null);
      A.S.enemyBoard[3 * 8 + 3] = { uid: A.S.uid++, id: 'goutan', star: 1, sks: 1, hp: 9999999, maxhp: 9999999, atk: 1, enemy: true };
      A.S.lvl = 1; A.S.round = 2; A.S.phase = 'prep';
      globalThis.startBattle();
      const arr = globalThis.window.__bu || [];
      const tank = arr.find(u => u.side === 1);
      if (tank) { tank.cd = 9999999; tank.skillCd = 9999999; tank.moveCd = 9999999; tank.mana = 0; tank.atk = 1; }   // 木桩不还手
      driveBattle(640);   // 60s 超时结束
      atk += (globalThis.window.__atkN || 0);
      crit += (globalThis.window.__critN || 0);
    }
    const rate = atk ? crit / atk : 0;
    ok(atk >= 200, `样本量足够（普攻 ${atk} 次 ≥200）`);
    ok(Math.abs(rate - 0.25) <= 0.05, `nox 触发率 ${(rate * 100).toFixed(1)}% ≈ 25% ±5pp（${crit}/${atk}）`);
  }

  console.log(fails.length ? '\nFAIL ' + fails.length + ' 项:\n' + fails.map(f => '  ✗ ' + f).join('\n') : '\nALL PASS ✅');
  process.exitCode = fails.length ? 1 : 0;
};
