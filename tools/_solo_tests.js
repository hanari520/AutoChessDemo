/* 🪑 独木桥商店品质成长测试：由 sim.js 以 T5=1 调起（T5=1 node tools/sim.js），复用其 DOM 桩与 API 导出。
   验证：① 升档公式与下次升档回合；② 满人口后商店 4/5 费随回合解锁（未满人口与早期节奏不变）；
   ③ 跨档战报只在跨档回合出现；④ 顶栏品质倒计时 UI；⑤ 普通模式不受影响；
   ⑥ 提前升档：花金币立即 +1 档（价格递增），排班到点自动追平消耗提前档。 */
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

  console.log('[d] 顶栏 UI：品质倒计时 + 提前升档按钮');
  A.S.lvl = 5; A.S.round = 6; ev('renderAll()');
  const xpText = () => document.getElementById('xpText').textContent;
  const btn = () => document.getElementById('lvlBtn');
  ok(xpText() === '品质 Lv6 · 5回合后升 Lv7', 'r6 顶栏倒计时：' + xpText());
  A.S.round = 10; ev('renderAll()');
  ok(xpText() === '品质 Lv6 · 1回合后升 Lv7', 'r10 倒计时收窄：' + xpText());
  ok(document.getElementById('xpFill').style.width !== '100%', '品质条不再恒满格（按 5→11 进度）: ' + document.getElementById('xpFill').style.width);
  ok(btn().textContent === '提前升档 (F) -10金' && btn().title.includes('立即升到品质 Lv7'), '满人口按钮变提前升档（首档 10 金）：' + btn().textContent);
  ok(btn().disabled === false, '金币充足（30 金）时按钮可用');
  A.S.round = 31; ev('renderAll()');
  ok(xpText() === '品质 Lv11 · 已达最高', '升满后显示已达最高：' + xpText());
  ok(btn().textContent === '品质已满' && btn().disabled === true, '品质满后按钮变「品质已满」并禁用：' + btn().textContent);
  A.S.lvl = 2; A.S.round = 1; ev('renderAll()');
  ok(xpText().includes('经验'), '人口未满时仍显示普通经验位：' + xpText());

  console.log('[e] 回归：普通模式不受影响');
  ev('curseSel=[]; newGame(); renderAll()');
  A.S.round = 6; ev('soloQualityNotice()');
  ok(!lastLog().includes('独木桥'), '普通模式无品质播报');
  ok(xpText().includes('经验'), '普通模式经验位照旧：' + xpText());
  ok(btn().textContent.includes('买经验'), '普通模式买经验按钮照旧：' + btn().textContent);

  console.log('[f] 提前升档：购买/计价递增/品质生效/排班追平消化');
  // toggleCurse 是开关语义：前面用例可能已把 solo 留在勾选区（间接 eval 清不掉 curseSel），
  // 先开一局探测，没生效再补一次 toggle，保证任何执行顺序下都从「solo 已激活」开始
  ev('newGame({custom:true}); renderAll()');
  if(!A.S.curses.includes('solo')) ev('toggleCurse("solo"); newGame({custom:true}); renderAll()');
  ok(A.S.curses.includes('solo'), '[f] 前置：solo 诅咒已激活');
  A.S.lvl = 5; A.S.round = 6; A.S.gold = 100; ev('renderAll()');
  ok(ev('soloBoostCost()') === 10, '首档价格 10 金');
  ok(ev('soloBoostBuy()') === true && A.S.soloBoost === 1 && A.S.gold === 90, '买 1 档：金 100→90，提前档计数 1');
  ok(ev('soloShopLvl()') === 7, 'r6 买档后有效品质 Lv7（排班 6 + 提前 1）：' + ev('soloShopLvl()'));
  ok(lastLog().includes('提前升档 → 7 级概率'), '购买战报：' + lastLog());
  ok(ev('soloBoostCost()') === 15, '第二档价格递增 15 金');
  ok(ev('soloBoostBuy()') === true && ev('soloShopLvl()') === 8, '再买 1 档：有效品质 Lv8');
  ok(ev('soloShopNextR()') === 21, '倒计时按「排班先追平、再下一跳才 +1」计：下次有效升档 r21（实际 ' + ev('soloShopNextR()') + '）');
  ev('renderAll()');
  ok(xpText().includes('已提前2档') && xpText().includes('品质 Lv8'), '顶栏显示已提前档数：' + xpText());
  A.S.round = 11; ev('soloQualityNotice()');
  ok(A.S.soloBoost === 1 && ev('soloShopLvl()') === 8, 'r11 排班追平：消化 1 个提前档，品质维持 Lv8');
  ok(lastLog().includes('追平提前档'), '追平战报：' + lastLog());
  A.S.round = 16; ev('soloQualityNotice()');
  ok(A.S.soloBoost === 0 && ev('soloShopLvl()') === 8, 'r16 再追平：提前档耗尽，品质仍 Lv8');
  A.S.round = 21; ev('soloQualityNotice()');
  ok(ev('soloShopLvl()') === 9 && lastLog().includes('品质自动提升 → 9 级'), 'r21 排班跨档恢复正常播报：' + lastLog());
  A.S.gold = 9; ev('renderAll()');
  ok(btn().disabled === true, '金币不足（9 金 < 10 金）时按钮禁用');
  ok(ev('soloBoostBuy()') === false && A.S.soloBoost === 0, '金币不足购买被拒');
  A.S.gold = 100; A.S.round = 31; ev('renderAll()');
  ok(btn().textContent === '品质已满' && btn().disabled === true, 'r31 品质满 11：按钮禁用');
  ok(ev('soloBoostBuy()') === false, '品质已满购买被拒');
  A.S.lvl = 4; A.S.round = 6; A.S.gold = 100; ev('renderAll()');
  ok(btn().textContent.includes('买经验'), '人口未满 5 时按钮仍是买经验（提前档只对满人口有意义）：' + btn().textContent);

  console.log(fails.length ? '\n✗ ' + fails.length + ' 项失败：\n  - ' + fails.join('\n  - ') : '\n✅ 全部通过');
  if (fails.length) process.exitCode = 1;
};
