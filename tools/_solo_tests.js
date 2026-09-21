/* 🪑 独木桥商店品质成长测试：由 sim.js 以 T5=1 调起（T5=1 node tools/sim.js），复用其 DOM 桩与 API 导出。
   验证：① 升档公式与下次升档回合；② 满人口后商店 4/5 费随回合解锁（未满人口与早期节奏不变）；
   ③ 跨档战报只在跨档回合出现；④ 顶栏品质倒计时 UI；⑤ 普通模式不受影响。 */
module.exports.run = function (A) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };
  const ev = s => (0, eval)(s);
  const counts = () => {   // 滚动刷新统计费用分布：rollShop 未购买自动返池，卡池量守恒，可无限抽样
    const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 300; i++) { A.rollShop(); A.S.shop.forEach(u => { if (u) c[u.cost]++; }); }
    return c;
  };

  console.log('[a] 升档公式 soloShopLvl / soloShopNextR（r1-40）');
  // 勾选走游戏自己的 toggleCurse 入口：indirect eval 顶层 let（curseSel）不可从外部 eval 直接赋值
  ev('toggleCurse("solo"); newGame({custom:true}); renderAll()');
  ok(A.S.curses.includes('solo') && A.S.gold === 30, 'solo 开局：诅咒生效，10+20=30 金（实际 ' + A.S.gold + '）');
  {
    const bad = [];
    for (let r = 1; r <= 40; r++) {
      A.S.round = r;
      const q = ev('soloShopLvl()'), nx = ev('soloShopNextR()');
      const want = Math.min(11, 5 + Math.floor((r - 1) / 5));
      if (q !== want) bad.push('r' + r + ' q=' + q);
      if ((want < 11 && nx !== (want - 4) * 5 + 1) || (want >= 11 && nx !== 0)) bad.push('r' + r + ' nx=' + nx);
    }
    ok(!bad.length, '品质 5→11 每 5 回合 +1、下次升档回合与封顶标记全部正确' + (bad.length ? '：' + bad.slice(0, 5).join(' ') : ''));
  }

  console.log('[b] 概率解锁：满人口后 4/5 费随回合出现，未满人口前按真实等级');
  A.S.lvl = 2; A.S.round = 1; A.S.lock = false;
  let c = counts();
  ok(c[4] === 0 && c[5] === 0, '开局 Lv2（未满人口）抽 1500 张无 4/5 费：4费×' + c[4] + ' 5费×' + c[5]);
  A.S.lvl = 5;
  c = counts();
  ok(c[4] > 0 && c[4] < 150 && c[5] === 0, '满人口 r1 品质 Lv5：4费 2% 左右（×' + c[4] + '/1500）、仍无 5 费');
  A.S.round = 6;
  c = counts();
  ok(c[4] > 40 && c[5] === 0, 'r6 品质 Lv6：4费 ≈7%（×' + c[4] + '/1500）、5 费仍为 0');
  A.S.round = 16;
  c = counts();
  ok(c[4] > 120 && c[5] > 0 && c[5] < 200, 'r16 品质 Lv8：4费 ≈16%（×' + c[4] + '）、5费 ≈4%（×' + c[5] + '）');
  A.S.round = 31;
  c = counts();
  ok(c[4] > 300 && c[5] > 120, 'r31 品质 Lv11（封顶）：4费 ≈32%（×' + c[4] + '）、5费 ≈16%（×' + c[5] + '）');

  console.log('[c] 跨档战报：只在真正跨档的回合出现');
  const lastLog = () => A.S.log[0] || '';
  A.S.round = 6; ev('soloQualityNotice()');
  ok(lastLog().includes('品质自动提升 → 6 级概率') && lastLog().includes('4费 7%'), 'r6 播报升到 6 级（4费 7%）：' + lastLog());
  const snap = lastLog();
  A.S.round = 7; ev('soloQualityNotice()');
  ok(lastLog() === snap, 'r7 非跨档回合不播报');
  A.S.round = 31; ev('soloQualityNotice()');
  ok(lastLog().includes('已达最高') && lastLog().includes('5费 16%'), 'r31 播报升满 11 级');
  A.S.lvl = 4; A.S.round = 6; ev('soloQualityNotice()');
  ok(lastLog().includes('已达最高'), '人口未满 5 时不播报（升档只对满人口有意义）');

  console.log('[d] 顶栏 UI：品质倒计时替代经验位');
  A.S.lvl = 5; A.S.round = 6; ev('renderAll()');
  const xpText = () => document.getElementById('xpText').textContent;
  const btn = () => document.getElementById('lvlBtn');
  ok(xpText() === '🪑 品质 Lv6 · 5回合后升 Lv7', 'r6 顶栏倒计时：' + xpText());
  A.S.round = 10; ev('renderAll()');
  ok(xpText() === '🪑 品质 Lv6 · 1回合后升 Lv7', 'r10 倒计时收窄：' + xpText());
  ok(document.getElementById('xpFill').style.width !== '100%', '品质条不再恒满格（按 5→11 进度）: ' + document.getElementById('xpFill').style.width);
  ok(btn().textContent === '人口已满' && btn().title.includes('第 11 回合'), '买经验按钮提示第 11 回合自动升档：' + btn().title);
  A.S.round = 31; ev('renderAll()');
  ok(xpText() === '🪑 品质 Lv11 · 已达最高', '升满后显示已达最高：' + xpText());
  A.S.lvl = 2; A.S.round = 1; ev('renderAll()');
  ok(xpText().includes('经验'), '人口未满时仍显示普通经验位：' + xpText());

  console.log('[e] 回归：普通模式不受影响');
  ev('curseSel=[]; newGame(); renderAll()');
  A.S.round = 6; ev('soloQualityNotice()');
  ok(!lastLog().includes('独木桥'), '普通模式无品质播报');
  ok(xpText().includes('经验'), '普通模式经验位照旧：' + xpText());
  ok(btn().textContent.includes('买经验'), '普通模式买经验按钮照旧：' + btn().textContent);

  console.log(fails.length ? '\n✗ ' + fails.length + ' 项失败：\n  - ' + fails.join('\n  - ') : '\n✅ 全部通过');
  if (fails.length) process.exitCode = 1;
};
