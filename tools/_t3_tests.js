/* Phase 3 断言测试：装备合成系统。逐件成品「真实生效」验证（防空转）。
   用法：T3=1 node tools/sim.js */
module.exports.run = function (A, driveBattle) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };
  const ITEMS = A.ITEMS;
  const close = (v, t, tol, msg) => ok(Math.abs(v - t) <= tol, msg + `（实际 ${v} / 目标 ${t}±${tol}）`);

  globalThis.newGame();

  /* ---------- 1. 配方表完整性 ---------- */
  console.log('[1] 合成表：≥10 件成品，成品不进掉落池');
  {
    const products = Object.keys(ITEMS).filter(k => ITEMS[k].crafted);
    ok(products.length >= 10, `成品 ${products.length} 件（≥10）`);
    const froms = products.filter(k => Array.isArray(ITEMS[k].from) && ITEMS[k].from.length === 2);
    ok(froms.length === products.length, '每件成品都有两件基础装配方');
    // 野怪掉落只抽基础装：模拟掉落池（成品不进池）
    const dropPool = Object.keys(ITEMS).filter(k => !ITEMS[k].crafted);
    ok(dropPool.length === 6, '掉落池仍为 6 件基础装（成品不进池）');
  }

  /* ---------- 2. 逐件成品静态生效（makeBattleUnit 通道） ---------- */
  console.log('[2] 逐件成品静态生效（makeBattleUnit）');
  const mkU = (id, items) => ({ uid: A.S.uid++, id, star: 1, sks: 1, hp: 1000, maxhp: 1000, atk: 100, items: items || [] });
  const base = (id) => A.makeBattleUnit(mkU(id), 0, 3, 4);
  const withIt = (id, k) => A.makeBattleUnit(mkU(id, [k]), 0, 3, 4);
  {
    const b0 = base('ein');   // ein 无装备基准：atkMul 已乘入 b.atk
    const t = (k) => withIt('ein', k);
    close(t('flamejudge').atk, b0.atk * 1.8, 1, '炽焰裁决剑 +80% 攻击');
    ok(t('flamejudge').crit >= 0.2 && t('flamejudge').critM >= 2.5, '炽焰裁决剑 暴击 20%/暴伤 2.5×');
    close(t('galehunt').atk, b0.atk * 1.25, 1, '疾风猎杀 +25% 攻击');
    close(t('galehunt').spdMul, 1.35, 0.001, '疾风猎杀 +35% 攻速');
    close(t('soulblade').atk, b0.atk * 1.4, 1, '饮魂战刃 +40% 攻击');
    ok(t('soulblade').vamp >= 0.2 && t('soulblade').killHeal === 0.15, '饮魂战刃 吸血20% + 击杀回复15%');
    close(t('sagestaff').atk, b0.atk * 1.5, 1, '贤者遗杖 +50% 攻击');
    ok(t('sagestaff').skMul >= 1.18, '贤者遗杖 技伤 +18%');
    ok(t('hexdrinker').skillVamp === 0.15, '噬魔之拥 技能吸血 15%');
    close(t('tidejewel').mana, 20, 0, '蓝玉潮涌 开局 +20 蓝');
    close(t('aegis').maxhp, b0.maxhp * 1.45, 1, '不朽圣盾 +45% 生命');
    ok(t('aegis').shieldTick === 0.08, '不朽圣盾 周期护盾 8%/3s');
    close(t('bramble').maxhp, b0.maxhp * 1.3, 1, '荆棘反甲 +30% 生命');
    ok(t('bramble').thorns >= 0.04, '荆棘反甲 反伤 4%');
    ok(t('windmail').dodge >= 0.12 && t('windmail').spdMul >= 1.35, '灵风甲胄 闪避12% + 攻速35%');
    ok(t('twinbows').spdMul >= 1.7 && t('twinbows').bounceP >= 0.25, '旋风连弩 攻速70% + 弹射25%');
    ok(t('swiftecho').manaPerSec === 3, '迅影回响 每秒回 3 蓝');
    ok(t('bloodcore').vamp >= 0.35 && t('bloodcore').skillVamp === 0.15, '血魔之心 吸血35% + 技能吸血15%');
    ok(t('twinshell').manaRegenMul === 3, '双生海螺 回蓝效率 ×3');
    ok(withIt('ein', 'mana').manaRegenMul === 2, '基础法螺 回蓝效率 ×2（不回归）');
  }

  /* ---------- 3. 动态生效（战斗行为验证） ---------- */
  console.log('[3] 逐件成品动态生效（行为验证）');
  {
    // 3a. 技能吸血（噬魔之拥）：施法期间 dealDamage 回血
    A.S.phase = 'battle';
    const u1 = A.makeBattleUnit(mkU('sanli', ['hexdrinker']), 0, 3, 4);
    const e1 = A.makeBattleUnit(mkU('ein'), 1, 3, 3);
    u1.hp = 100; u1._casting = true;   // 模拟施法期间
    const dealt = globalThis.dealDamage(u1, e1, 200, [u1, e1], 'pure');
    ok(u1.hp > 100, `技能吸血生效：施法中 100 → ${u1.hp}（回复 ~${Math.round(dealt * 0.15)}）`);
    u1._casting = false;
    const hp0 = u1.hp;
    globalThis.dealDamage(u1, e1, 200, [u1, e1], 'pure');
    ok(u1.hp === hp0 + Math.round(200 * 0), `非施法期技能吸血不触发（vamp 普适通道另算：${hp0}→${u1.hp} 不含 15% 技能吸血增量）`);
    // 3b. 击杀回复（饮魂战刃）
    const u2 = A.makeBattleUnit(mkU('ein', ['soulblade']), 0, 3, 4);
    const e2 = A.makeBattleUnit(mkU('chiharu'), 1, 3, 3);
    e2.hp = 1; u2.hp = 200;
    globalThis.dealDamage(u2, e2, 999, [u2, e2], 'pure');
    ok(u2.hp > 200, `击杀回复生效：200 → ${u2.hp}（+15%×${u2.maxhp}）`);
    // 3c. 反伤（荆棘反甲）：攻击者掉血
    const u3 = A.makeBattleUnit(mkU('chiharu'), 0, 3, 4);
    const e3 = A.makeBattleUnit(mkU('ein', ['bramble']), 1, 3, 3);
    const hpA = u3.hp;
    globalThis.dealDamage(u3, e3, 150, [u3, e3], 'pure');
    ok(u3.hp < hpA, `反伤生效：攻击者 ${hpA} → ${u3.hp}（反弹 4%×${e3.maxhp}=${Math.round(e3.maxhp * 0.04)}）`);
    A.S.phase = 'prep';
  }
  {
    // 3d. 周期护盾/每秒回蓝：真实小规模战斗驱动（round4=3 名敌人、我方低攻保证战斗持续过 3 秒）
    A.S.bench = Array(8).fill(null);
    A.S.board = Array(64).fill(null);
    A.S.board[4 * 8 + 3] = { uid: A.S.uid++, id: 'ein', star: 1, sks: 1, hp: 1200, maxhp: 1200, atk: 2, items: ['aegis'] };
    A.S.board[4 * 8 + 4] = { uid: A.S.uid++, id: 'sanli', star: 1, sks: 1, hp: 900, maxhp: 900, atk: 2, items: ['swiftecho'] };
    A.S.round = 4; A.S.lvl = 2; A.S.phase = 'prep';
    globalThis.prepEnemy();
    globalThis.startBattle();
    const arr = globalThis.window.__bu || [];
    const aeg = arr.find(u => u.items && u.items[0] === 'aegis');
    const swi = arr.find(u => u.items && u.items[0] === 'swiftecho');
    ok(aeg && swi, '战斗单位已生成');
    ok(swi.spdMul >= 1.35 && swi.manaPerSec === 3, `迅影回响通道在真实战斗单位上生效（spdMul=${swi.spdMul}, mana/s=${swi.manaPerSec}）`);
    const mana0 = swi.mana;
    for (let i = 0; i < 35; i++) A.currentTick();   // 推 3.5 秒（前 8 tick 为开战观察时间）
    ok(swi.mana > mana0 + 8, `每秒回蓝生效（${mana0} → ${swi.mana}，含每秒 +3）`);
    ok(aeg && aeg.shield > 0, `不朽圣盾 3 秒护盾生效（shield=${aeg ? aeg.shield : 'n/a'}）`);
    driveBattle(700);
  }
  {
    // 3e. 弹射（旋风连弩）：真实战斗中强制 bounceP=1，验证普攻弹射结算路径
    A.S.bench = Array(8).fill(null);
    A.S.board = Array(64).fill(null);
    A.S.board[4 * 8 + 4] = { uid: A.S.uid++, id: 'sishi', star: 1, sks: 1, hp: 1500, maxhp: 1500, atk: 30, items: ['twinbows'] };
    A.S.round = 4; A.S.lvl = 1; A.S.phase = 'prep';
    globalThis.prepEnemy();
    globalThis.startBattle();
    const arr = globalThis.window.__bu || [];
    const me = arr.find(u => u.id === 'sishi');
    const foes = arr.filter(u => u.side === 1);
    if (me && foes.length >= 1) {
      me.bounceP = 1; me.cd = 0; me.skillCd = 99999; me.mana = 0;   // 强制下一击必弹射、不放技能
      foes.forEach(f => { f.cd = 999999; f.skillCd = 99999; f.mana = 0; f.atk = 1; });   // 敌方不还手
      for (let i = 0; i < 15; i++) A.currentTick();  // 1.5s：越过 0.8s 开战缓冲，首击落地
      const hit = foes.filter(f => f.hp < f.maxhp).length;
      ok(hit >= 1, `普攻主目标受伤（受击 ${hit}/${foes.length}）`);
      ok(foes.length < 2 || hit >= 2, `弹射结算路径生效（受击敌人数 ${hit}/${foes.length}，bounceP=1 强制）`);
    } else ok(false, '弹射用例场景未建立');
    driveBattle(700);
  }

  /* ---------- 4. 合成操作与 UI 数据层 ---------- */
  console.log('[4] 合成操作（背包/就地/bot）');
  {
    globalThis.newGame();
    A.S.phase = 'prep';
    A.S.items = ['sword', 'sword', 'bow', 'vamp'];
    const p = globalThis.combineBagPair(0, 1);
    ok(p === 'flamejudge' && A.S.items.includes('flamejudge') && A.S.items.filter(x => x === 'sword').length === 0,
      '背包合成 sword+sword → 炽焰裁决剑');
    // 所有基础装两两组合已有配方；成品与基础装不直接合成
    ok(!globalThis.comboOf('flamejudge', 'vamp'), '成品+基础装无直接配方');
    const len = A.S.items.length;
    const p2 = globalThis.combineBagPair(A.S.items.indexOf('flamejudge'), A.S.items.indexOf('vamp'));
    ok(p2 === null && A.S.items.length === len, '无配方组合合成返回 null、物品不动');
    // 就地合成（佩戴中）
    const u = { uid: A.S.uid++, id: 'ein', star: 1, sks: 1, hp: 500, maxhp: 500, atk: 20, items: ['staff', 'mana'] };
    A.S.board[4 * 8 + 3] = u; A.S.items = [];
    const w = globalThis.combineWorn(u);
    ok(w === 'tidejewel' && u.items.length === 1 && u.items[0] === 'tidejewel', '佩戴两件就地合成 → 蓝玉潮涌（腾出 1 格）');
    // bot 全量合成
    A.S.items = ['armor', 'armor', 'bow', 'bow', 'mana', 'mana'];
    A.S.bench = Array(8).fill(null);
    const n = globalThis.botCombineItems();
    ok(n >= 3 && A.S.items.filter(k => ITEMS[k].crafted).length >= 3, `bot 全量合成 ${n} 次（aegis/twinbows/twinshell）`);
    ok(A.S.log.some(l => l.includes('装备合成')), '合成日志在案');
  }

  /* ---------- 5. bot 穿装链路 + sim 冒烟 ---------- */
  console.log('[5] bot 链路与掉落池');
  {
    globalThis.newGame();
    let crafted = 0, guard = 0;
    while (guard++ < 40 && A.S.phase !== 'over') {
      globalThis.botPrep();
      // 统计 bot 佩戴/背包中的成品
      [...A.S.board, ...A.S.bench].forEach(u => { if (u) u.items.forEach(k => { if (ITEMS[k].crafted) crafted++; }); });
      A.S.items.forEach(k => { if (ITEMS[k].crafted) crafted++; });
      globalThis.startBattle();
      driveBattle(700);
    }
    ok(crafted > 0, `bot 在真实对局中合成并持有成品（${crafted} 件次）`);
    const drops = (A.S.items || []).filter(k => ITEMS[k].crafted);
    console.log(`  ℹ 局末背包成品 ${drops.length} 件 · 打到 r${A.S.round}`);
  }

  console.log(fails.length ? '\nFAIL ' + fails.length + ' 项:\n' + fails.map(f => '  ✗ ' + f).join('\n') : '\nALL PASS ✅');
  process.exitCode = fails.length ? 1 : 0;
};
