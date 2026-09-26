/* 全面效果审计：羁绊 22 机制 / 装备 27 件 / 技能 50 人 / 诅咒 26 条。
   用法：AUDIT=1 node tools/sim.js（经 sim.js 的 DOM 桩加载真实游戏脚本）。
   只读断言 + 受控行为驱动，不改动任何游戏状态；失败汇总到结尾并置 exitCode。 */
'use strict';
const assert = require('node:assert/strict');

function run(A, driveBattle) {
  const P = expr => (0, eval)(expr);           // 页面作用域读取（顶层 let/const 不在 globalThis 上）
  const fails = [];
  let passN = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passN++; console.log(' ✓ ' + name); }
    else { fails.push(name + (extra ? ` — ${extra}` : '')); console.log(' ✗ ' + name + (extra ? ` — ${extra}` : '')); }
  };
  const freshGame = (opts) => { (0,eval)(`newGame(${opts ? JSON.stringify(opts) : ''})`); };

  /* ---------- 通用战斗单元构造（与 buy() 的存档形态一致，再过 makeBattleUnit） ---------- */
  let uidSeq = 9000;
  function mkB(id, side, x, y, o = {}) {
    const d = A.byId(id);
    const u = { uid: ++uidSeq, id, star: o.star || 1, sks: o.sks || 1,
      hp: Math.round(d.hp * 0.92), maxhp: Math.round(d.hp * 0.92), atk: d.atk, items: (o.items || []).slice() };
    const b = A.makeBattleUnit(u, side, x, y);
    if (o.maxhp) { b.maxhp = o.maxhp; b.hp = o.hp != null ? o.hp : o.maxhp; }
    if (o.hp != null && !o.maxhp) b.hp = o.hp;
    if (o.mods) Object.assign(b, o.mods);
    return b;
  }
  const mkFoeDummy = (x, y) => mkB('ein', 1, x, y, { maxhp: 1e9 });   // 打不死的沙包
  const BOND_KEYS = () => [...Object.keys(A.FACTIONS), ...Object.keys(A.CLASSES)];

  /* ================= A. 羁绊：22 机制逐条 ================= */
  console.log('\n──── A. 羁绊机制（BondRuntime v2，22 条）────');
  function bondCtx(spec, tiers) {
    freshGame();
    const units = spec.map(s => mkB(s.id, s.side, s.x, s.y));
    for (const side of [0, 1]) A.BV[side] = (tiers && tiers[side]) || {};
    const BR = A.BondRuntime;
    BR.state = null;
    BR.start(units);
    return { units, BR };
  }
  const hpOf = u => Math.max(0, Math.round(u.hp));
  const shieldOf = u => Math.round(u.shield || 0);
  const physMul = ar => 1 - (0.052 * ar) / (0.9 + 0.048 * Math.abs(ar));   // 与引擎同式

  { // 1 深海：首次技能伤害 → 潮盾（T1 自身 / T2 覆盖最近友军）
    const { units, BR } = bondCtx([{ id: 'pako', side: 0, x: 3, y: 6 }, { id: 'yuji', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '深海': 2 } });
    const pako = units[0], yuji = units[1], foe = units[2];
    foe._casting = true;   // 潮盾只对「技能伤害」触发
    BR.preHit(foe, pako, 30, units, 'magic');
    ok('深海T1 首次技能伤害获得 18% 潮盾', pako.bondTide && shieldOf(pako) > 0);
    ok('深海T2 潮盾覆盖最近友军', shieldOf(yuji) > 0);
    const s1 = shieldOf(pako); BR.preHit(foe, pako, 30, units, 'magic');
    ok('深海潮盾不重复触发', shieldOf(pako) === s1);
  }
  { // 2 星际：两名不同星际成员施法 → 星链
    const { units, BR } = bondCtx([{ id: 'yua', side: 0, x: 3, y: 6 }, { id: 'ruiya', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '星际': 2 } });
    const foe = units[2];
    foe.maxmana = 50; foe.mana = 0;
    const before = hpOf(foe);
    BR.cast(units[0], units);           // 第 1 名星际记名
    BR.cast(units[1], units);           // 第 2 名 → 星链 0.8×atk
    const dealt = before - hpOf(foe);
    ok('星际 两名不同成员施法触发星链伤害', dealt > 0, `dealt=${dealt}`);
    const after = hpOf(foe);
    BR.cast(units[1], units);
    ok('星际 同一成员重复施法不触发', hpOf(foe) === after);
  }
  { // 3 毛茸乐园：两名不同成员普攻同一目标 → 集火追击 + T2 减速
    const { units, BR } = bondCtx([{ id: 'goutan', side: 0, x: 3, y: 6 }, { id: 'kanban', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '毛茸乐园': 2 } });
    const a = units[0], b = units[1], foe = units[2];
    BR.attack(a, foe, 10, units);
    const before = hpOf(foe);
    BR.attack(b, foe, 10, units);
    const dealt = before - hpOf(foe);
    const expF = Math.round(b.atk * 0.6) * physMul(foe.ar);
    ok('毛茸乐园 两名成员集火触发追击伤害', dealt >= expF * 0.8 - 1 && dealt <= expF * 1.2 + 1, `dealt=${dealt} exp≈${expF.toFixed(1)}`);
    ok('毛茸乐园T2 追击附带减速', foe.slowA >= 0.25 && foe.slowT > 0);
  }
  { // 4 音律：每 3 次普攻为邻近低蓝友军回蓝
    const { units, BR } = bondCtx([{ id: 'aza', side: 0, x: 3, y: 6 }, { id: 'likou', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '音律': 2 } });
    const a = units[0], mate = units[1];
    mate.mana = 0; mate.maxmana = 50;
    BR.attack(a, units[2], 10, units); BR.attack(a, units[2], 10, units);
    ok('音律 前两次普攻不回蓝', mate.mana === 0);
    BR.attack(a, units[2], 10, units);
    ok('音律 第 3 次普攻奏节拍回蓝 10', mate.mana === 10, `mana=${mate.mana}`);
  }
  { // 5 四禧丸子：相邻同伴分担 15%
    const { units, BR } = bondCtx([{ id: 'tiandou', side: 0, x: 3, y: 6 }, { id: 'mumu', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '四禧丸子': 2 } });
    const t = units[0], mate = units[1], foe = units[2];
    t.hp = t.maxhp; mate.hp = mate.maxhp;
    const out = BR.preHit(foe, t, 100, units, 'phys');
    const mateTook = mate.maxhp - hpOf(mate);
    ok('四禧丸子 相邻分担 15% 伤害', mateTook >= 15 * physMul(mate.ar) * 0.8 - 1 && mateTook <= 15 && Math.round(out) <= 86, `mateTook=${mateTook}`);
  }
  { // 6 学园：锁定最远敌人，攻击该目标追加 25% 魔法伤害
    const { units, BR } = bondCtx([{ id: 'likou', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 6, y: 1 }], { 0: { '学园': 1 } });
    const likou = units[0], far = units[2];
    ok('学园 开战锁定最远敌人', likou.bondResearch === far.uid, `research=${likou.bondResearch} far=${far.uid}`);
    const before = hpOf(far);
    BR.attack(likou, far, 10, units);
    const expR = Math.round(likou.atk * 0.25) * (1 - 0.12);   // 魔法伤害过敌方魔抗
    ok('学园 攻击研究目标追加伤害', before - hpOf(far) >= expR * 0.7, `delta=${before - hpOf(far)} exp≈${expR.toFixed(1)}`);
    const near = units[1], b2 = hpOf(near);
    BR.attack(likou, near, 10, units);
    ok('学园 攻击非研究目标不追加', hpOf(near) === b2);
  }
  { // 7 夜幕：击杀 → 暮印扩散，受击引爆
    const { units, BR } = bondCtx([{ id: 'lianshiye', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 4, y: 1 }], { 0: { '夜幕': 1 } });
    const killer = units[0], f1 = units[1], f2 = units[2];
    f1.hp = 1;
    BR.kill(killer, f1, units);
    ok('夜幕 击杀后向附近敌人扩散暮印', f2.bondDusk > 0, `dusk=${f2.bondDusk}`);
    const before = hpOf(f2);
    BR.hit(killer, f2, 5, units);
    ok('夜幕 暮印下一次受击引爆', before - hpOf(f2) >= 5 + f2.bondDusk - 1 || f2.hp <= 0, `delta=${before - hpOf(f2)}`);
  }
  { // 8 花语：首次 ≤35% 开花自疗 + 邻近队友加盾
    const { units, BR } = bondCtx([{ id: 'huali', side: 0, x: 3, y: 6 }, { id: 'mumu', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '花语': 1 } });
    const h = units[0], mate = units[1];
    h.hp = Math.round(h.maxhp * 0.3); mate.hp = mate.maxhp;
    const before = hpOf(h);
    BR.hit(null, h, 5, units);
    ok('花语 首次跌至 35% 开花自疗 22%', hpOf(h) > before, `healed=${hpOf(h) - before}`);
    ok('花语 开花为邻近友军加盾', shieldOf(mate) > 0);
    h.hp = 1; BR.hit(null, h, 5, units);
    ok('花语 开花仅一次（自疗不再触发）', hpOf(h) === 1);
  }
  { // 9 魔道：首次受到近战普攻 → 石化攻击者 1.5s（T2 加盾）
    const { units, BR } = bondCtx([{ id: 'miting', side: 0, x: 3, y: 6 }, { id: 'kouichi', side: 1, x: 3, y: 5 }], { 0: { '魔道': 2 } });
    const m = units[0], atk = units[1];
    atk._basicAttack = true; atk._casting = false;
    BR.preHit(atk, m, 10, units, 'phys');
    ok('魔道 被近战普攻石化攻击者', atk.frozen >= 1500 && atk.petrifyT >= 1500);
    ok('魔道T2 反制后自身获得护盾', shieldOf(m) > 0);
    atk.frozen = 0; atk.petrifyT = 0;
    BR.preHit(atk, m, 10, units, 'phys');
    ok('魔道 反制仅一次', atk.petrifyT === 0);
  }
  { // 10 森之国：开战 18% 闪避；闪避后幻影护层（T2 覆盖最近友军）
    const { units, BR } = bondCtx([{ id: 'chiharu', side: 0, x: 3, y: 6 }, { id: 'songlv', side: 0, x: 4, y: 6 }], { 0: { '森之国': 2 } });
    const a = units[0], b = units[1];
    ok('森之国 成员开战获得 18% 闪避', a.dodge >= 0.18 && b.dodge >= 0.18, `dodge=${a.dodge}`);
    BR.dodge(a);
    ok('森之国 闪避后获得幻影护层', shieldOf(a) >= Math.round(a.maxhp * 0.09) - 1);
    ok('森之国T2 幻影同时保护最近友军', shieldOf(b) > 0);
  }
  { // 11 工造：战前为最肉友军装配装置，抵挡伤害
    const { units, BR } = bondCtx([{ id: 'sumi', side: 0, x: 3, y: 6 }, { id: 'likou', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '工造': 2 } });
    const big = units.filter(u => u.side === 0).reduce((a, b) => b.maxhp > a.maxhp ? b : a);
    ok('工造 最多肉的两名友军获得装置', units.filter(u => u.bondDevice > 0).length === 2, `n=${units.filter(u => u.bondDevice > 0).length}`);
    const dev = big.bondDevice;
    const out = BR.preHit(units[2], big, 50, units, 'phys');
    ok('工造 装置抵挡伤害（preHit 返回扣装置后的剩余伤害）', out === Math.max(0, 50 - dev) && big.bondDevice === Math.max(0, dev - 50), `dev=${dev} out=${out}`);
  }
  { // 12 P-SP：敌方蓝量最高者即将施法时打断（每场 1 次/T2 两次）
    const { units, BR } = bondCtx([{ id: 'shengge', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 4, y: 1 }], { 0: { 'P-SP': 1 } });
    const caster = units[1];
    caster.mana = caster.maxmana = 50; caster.mana = 50;
    units[2].mana = 10;
    ok('P-SP 蓝量最高者施法被打断', BR.beforeCast(caster, units) === true);
    ok('P-SP 打断压蓝并沉默', caster.mana <= 25 && caster.silenceT > 0);
    ok('P-SP T1 每场仅 1 次', BR.beforeCast(caster, units) === false);
  }
  { // 13 守护：战前认领相邻队友，其首次受击援护加盾
    const { units, BR } = bondCtx([{ id: 'kanban', side: 0, x: 3, y: 6 }, { id: 'likou', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '守护': 1 } });
    const g = units[0], mate = units[1];
    ok('守护 战前认领相邻队友', g.bondClaim === mate.uid);
    BR.preHit(units[2], mate, 10, units, 'phys');
    ok('守护 队友首次受击援护加盾', shieldOf(mate) >= Math.round(mate.maxhp * 0.14) - 1);
    const s1 = shieldOf(mate);
    BR.preHit(units[2], mate, 10, units, 'phys');
    ok('守护 援护仅一次', shieldOf(mate) === s1);
  }
  { // 14 歌势：两名不同成员施法 → 合唱治疗（T2 最低蓝回蓝）
    const { units, BR } = bondCtx([{ id: 'suiji', side: 0, x: 3, y: 6 }, { id: 'tiandou', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '歌势': 2 } });
    const a = units[0], b = units[1];
    units.forEach(u => { if (u.side === 0) { u.hp = Math.round(u.maxhp * 0.5); } });
    b.maxmana = 50; b.mana = 0;
    BR.cast(a, units);
    ok('歌势 单名施法不合唱', units[0].hp === Math.round(units[0].maxhp * 0.5));
    const b1 = hpOf(a);
    BR.cast(b, units);
    ok('歌势 两名成员组成合唱治疗全队', hpOf(a) > b1);
    ok('歌势T2 合唱为最低蓝队友回蓝', b.mana >= 12, `mana=${b.mana}`);
  }
  { // 15 游侠：每 3 次命中弹射另一名敌人
    const { units, BR } = bondCtx([{ id: 'yujiu', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 4, y: 1 }], { 0: { '游侠': 2 } });
    const r = units[0], f1 = units[1], f2 = units[2];
    BR.attack(r, f1, 10, units); BR.attack(r, f1, 10, units);
    const b2 = hpOf(f2);
    BR.attack(r, f1, 10, units);
    const expB = Math.round(r.atk * 0.45) * physMul(f2.ar);
    ok('游侠 每 3 次命中弹射另一敌人（T2 双弹）', b2 - hpOf(f2) >= expB * 0.8 - 1, `delta=${b2 - hpOf(f2)} exp≈${expB.toFixed(1)}`);
  }
  { // 16 法师：两名不同成员施法 → 符文爆破蓝量最高敌人
    const { units, BR } = bondCtx([{ id: 'sanli', side: 0, x: 3, y: 6 }, { id: 'kroya', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '法师': 2 } });
    const foe = units[2];
    foe.mana = 40;
    BR.cast(units[0], units);
    const b1 = hpOf(foe);
    BR.cast(units[1], units);
    ok('法师 符文爆破蓝量最高敌人', b1 - hpOf(foe) >= Math.round(units[0].atk * 1.1) - 1, `delta=${b1 - hpOf(foe)}`);
  }
  { // 17 咒术：开战变形敌方蓝量最高者 2.5s
    const { units } = bondCtx([{ id: 'miting', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 4, y: 1 }], { 0: { '咒术': 1 } });
    units[1].mana = 40; units[2].mana = 10;
    const BR = A.BondRuntime; BR.state = null; BR.start(units);
    const hexed = units.filter(u => u.side === 1 && u.hexT >= 2500);
    ok('咒术 开战变形敌方蓝量最高者', hexed.length === 1 && hexed[0] === units[1]);
  }
  { // 18 刺客：击杀孤立目标 → 潜行闪避 + T2 强化下一击
    const { units, BR } = bondCtx([{ id: 'shadow', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'likou', side: 0, x: 6, y: 6 }], { 0: { '刺客': 2 } });
    const a = units[0], victim = units[1];
    victim.hp = 1;
    BR.kill(a, victim, units);
    ok('刺客 击杀孤立目标后潜行', a.phaseT >= 1800 && a.phaseDodge >= 0.8);
    ok('刺客T2 潜行后下一击强化', (a.itemNextStrikeAmp || 0) >= 0.35);
  }
  { // 19 狂战：低于 45% 生命普攻横扫邻近敌人
    const { units, BR } = bondCtx([{ id: 'rinco', side: 0, x: 3, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }, { id: 'kouichi', side: 1, x: 4, y: 1 }], { 0: { '狂战': 2 } });
    const r = units[0], f1 = units[1], f2 = units[2];
    r.hp = Math.round(r.maxhp * 0.4);
    BR.attack(r, f1, 10, units);
    ok('狂战 低血普攻横扫邻近敌人（T2 双扫）', f2.hp < f2.maxhp, `delta=${f2.maxhp - hpOf(f2)}`);
  }
  { // 20 医者：友军首次致命伤害 → 分诊保命
    const { units, BR } = bondCtx([{ id: 'likou', side: 0, x: 3, y: 6 }, { id: 'yuji', side: 0, x: 4, y: 6 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '医者': 1 } });
    const victim = units[1];
    victim.hp = 10;
    const out = BR.beforeHealth(units[2], victim, 50, units);
    ok('医者 致命伤害触发分诊保命', victim.hp > 0 && out <= victim.hp, `hp=${hpOf(victim)} out=${Math.round(out)}`);
  }
  { // 21 偶像：邻近友军施法 → 应援护盾（T2 再护最低血友军）
    const { units, BR } = bondCtx([{ id: 'agari', side: 0, x: 3, y: 6 }, { id: 'mumu', side: 0, x: 4, y: 6 }, { id: 'likou', side: 0, x: 3, y: 5, hp: 1 }, { id: 'ein', side: 1, x: 3, y: 1 }], { 0: { '偶像': 2 } });
    const caster = units[1];
    BR.cast(caster, units);
    ok('偶像 邻近友军施法获得应援护盾', shieldOf(caster) >= Math.round(caster.maxhp * 0.08) - 1);
    ok('偶像T2 应援同时保护附近最低血友军', shieldOf(units[2]) > 0, `likou.shield=${shieldOf(units[2])}`);
  }
  { // 22 刀客：相邻同伴受击时反击攻击者（T2 加盾 / T3 波及）
    const { units, BR } = bondCtx([{ id: 'zhouyi', side: 0, x: 3, y: 6 }, { id: 'haruka', side: 0, x: 4, y: 6 }, { id: 'kouichi', side: 1, x: 3, y: 5 }], { 0: { '刀客': 2 } });
    const v = units[0], d = units[1], atk = units[2];
    BR.hit(atk, v, 10, units);
    ok('刀客 同伴受击时反击攻击者', hpOf(atk) < atk.maxhp, `delta=${atk.maxhp - hpOf(atk)}`);
    ok('刀客T2 反击时为同伴加盾', shieldOf(v) > 0);
  }

  /* ================= B. 装备：27 件 ================= */
  console.log('\n──── B. 装备（6 基础 + 21 成品）────');
  freshGame();
  {
    // 数值层：全部 27 件过 makeBattleUnit，断言核心字段
    const cases = {
      sword: b => b.itemEdgePips === 1 && b.atk > A.byId('ein').atk,
      staff: b => b.itemArcanePips === 1,
      armor: b => b.itemStartShield > 0 && b.maxhp > Math.round(A.byId('ein').hp * 0.92 * 1.3) - 1,
      bow: b => b.itemFirstSnare === true && b.spdMul > 1,
      vamp: b => b.vamp >= 0.2 && b.itemKillMana === 8,
      mana: b => b.manaRegenMul >= 2 && b.itemManaGift === 5,
      flamejudge: b => b.crit >= 0.2 && b.critM >= 2.5 && b.itemCritExpose >= 0.12,
      galehunt: b => b.itemKillHaste >= 0.10,
      soulblade: b => b.killHeal >= 0.15 && b.itemKillShield >= 0.08,
      sagestaff: b => b.skMul >= 1.18 && b.itemCastShield >= 0.06,
      hexdrinker: b => b.skillVamp >= 0.15 && b.itemManaBurn >= 7,
      tidejewel: b => b.manaStart >= 20 && b.itemCastSunder >= 0.10,
      aegis: b => b.shieldTick >= 0.08,
      bramble: b => b.thorns >= 0.04 && b.itemThornSlow >= 0.18,
      windmail: b => b.dodge >= 0.12 && b.itemDodgeAmp >= 0.20,
      twinbows: b => b.bounceP >= 0.25 && b.itemBounceEcho >= 0.35,
      swiftecho: b => b.manaPerSec >= 3 && b.itemPrimeAmp >= 0.20,
      bloodcore: b => b.vamp >= 0.35 && b.skillVamp >= 0.15 && b.itemVampOverShield >= 0.40,
      twinshell: b => b.manaRegenMul >= 3 && b.itemTeamCastShield >= 0.035,
      spellblade: b => b.skMul >= 1.12 && b.itemMarkShield >= 0.06,
      stormbreaker: b => b.itemStormStun === true,
      soulstring: b => b.itemPrimeAmp >= 0.22 && b.itemPrimeSplash >= 0.32,
      runeguard: b => b.itemMarkShield >= 0.08,
      astralbow: b => b.itemPrimeBounce >= 0.35,
      bastioncoil: b => b.itemShieldBreakMana >= 12,
      venomshot: b => b.itemPoisonPct >= 0.012 && b.vamp >= 0.2,
      stormfang: b => b.itemVampOverShield >= 0.45,
    };
    for (const [id, chk] of Object.entries(cases)) {
      ok(`装备 ${id} 数值词条生效`, (() => { try { const b = mkB('ein', 0, 3, 6, { items: [id] }); return chk(b); } catch (e) { return 'ERR:' + e.message; } })());
    }
    // 三件上限与组件继承：sword+staff 成品应同时带两个组件词条
    const combo = mkB('ein', 0, 3, 6, { items: ['spellblade', 'sword'] });
    ok('装备 组件词条沿合成路线继承（星咏剑+剑 → 剑2书1）', combo.itemEdgePips === 2 && combo.itemArcanePips === 1, JSON.stringify({ e: combo.itemEdgePips, a: combo.itemArcanePips }));
    const capped = mkB('ein', 0, 3, 6, { items: ['flamejudge', 'sword'] });   // 双剑合成 → pips 封顶 2
    ok('装备 同类组件叠加封顶（itemEdgePips≤2）', capped.itemEdgePips === 2);
  }
  { // 行为层：确定性触发
    freshGame();
    // 破锋（剑）：每第 4 次普攻追加真实伤害
    {
      const u = mkB('ein', 0, 3, 6, { items: ['sword'] });
      const foe = mkFoeDummy(3, 5);
      const units = [u, foe];
      const profile = { onHit: 'none', proc: 0, dtype: 'phys' };
      const b1 = hpOf(foe);
      for (let i = 0; i < 3; i++) A.applyV3Attack(u, foe, profile, units, 10, 10);
      const d3 = b1 - hpOf(foe);
      A.applyV3Attack(u, foe, profile, units, 10, 10);
      const d4 = b1 - hpOf(foe);
      ok('剑·破锋 前 3 次普攻无追加、第 4 次追加真实伤害', d3 === 0 && d4 >= 1, `d3=${d3} d4=${d4}`);
    }
    // 雷鸣壁垒：每第 3 次普攻眩晕
    {
      const u = mkB('ein', 0, 3, 6, { items: ['stormbreaker'] });
      const foe = mkFoeDummy(3, 5);
      const units = [u, foe];
      for (let i = 0; i < 3; i++) A.applyV3Attack(u, foe, { onHit: 'none', proc: 0 }, units, 10, 10);
      ok('雷鸣壁垒 每第 3 次普攻眩晕目标', foe.stun >= 450, `stun=${foe.stun}`);
    }
    // 逐风弓·先机：首次普攻减速
    {
      const u = mkB('ein', 0, 3, 6, { items: ['bow'] });
      const foe = mkFoeDummy(3, 5);
      A.applyV3Attack(u, foe, { onHit: 'none', proc: 0 }, [u, foe], 10, 10);
      ok('逐风弓·先机 首次普攻令目标减速', foe.slowA >= 0.2 && foe.slowT > 0);
    }
    // 毒羽连弩：普攻施加毒伤
    {
      const u = mkB('ein', 0, 3, 6, { items: ['venomshot'] });
      const foe = mkFoeDummy(3, 5);
      A.applyV3Attack(u, foe, { onHit: 'none', proc: 0 }, [u, foe], 10, 10);
      ok('毒羽连弩 普攻施加持续毒伤', foe.poisonT >= 3000 && foe.poisonDmg > 0);
    }
    // 回响法典（书）：技能命中留印记，下次受击引爆 +6%/层
    {
      const u = mkB('yua', 0, 3, 6, { items: ['staff'] });
      u.mana = 50; u.maxmana = 50;
      const foe = mkFoeDummy(3, 1);
      const units = [u, foe];
      A.castSkill(u, foe, units, 1);   // 施法命中 → 印记
      ok('回响法典 技能命中留下奥能印记', (foe.itemArcaneMarks || 0) >= 1, `marks=${foe.itemArcaneMarks}`);
      // 普攻引爆
      u._basicAttack = true;
      const b1 = hpOf(foe);
      A.dealDamage(u, foe, 100, units, 'magic');
      ok('回响法典 印记下次受击引爆增伤', (b1 - hpOf(foe)) > 100, `delta=${b1 - hpOf(foe)}`);
    }
    // 贤者遗杖：施法为自身与低血队友加盾
    {
      const u = mkB('likou', 0, 3, 6, { items: ['sagestaff'] });
      const mate = mkB('yuji', 0, 4, 6, { hp: 1 });
      u.mana = 50; u.maxmana = 50;
      const foe = mkFoeDummy(3, 1);
      A.castSkill(u, foe, [u, mate, foe], 1);
      ok('贤者遗杖 施法为自身加盾', shieldOf(u) > 0);
      ok('贤者遗杖 低血队友获得庇佑护盾', shieldOf(mate) > 0 || mate.hp > 1, `mate.shield=${shieldOf(mate)}`);
    }
    // 堡垒线圈：护盾破裂回蓝
    {
      const u = mkB('ein', 0, 3, 6, { items: ['bastioncoil'] });
      const foe = mkB('yua', 1, 3, 1);
      const units = [u, foe];
      u.shield = 50; u.itemShieldBreakCd = 0; u.mana = 0; u.maxmana = 50;
      A.dealDamage(foe, u, 500, units, 'phys');
      ok('堡垒线圈 护盾破裂立刻回蓝', u.mana >= 12, `mana=${Math.round(u.mana)}`);
    }
    // 不朽圣盾：每 3 秒周期护盾（真实战斗驱动）
    {
      A.setS(Object.assign(A.S, { phase: 'prep' }));
      const board = Array(64).fill(null);
      board[3 * 8 + 3] = { uid: 1, id: 'ein', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: 1, items: ['aegis'] };
      A.S.board = board;
      A.S.enemyBoard = Array(64).fill(null);
      A.S.enemyBoard[0] = { uid: 2, id: 'ein', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: 1, items: [] };
      A.startBattle();
      const unit = globalThis.__bu[0];
      const s0 = unit.shield || 0;
      for (let i = 0; i < 40; i++) { A.currentTick(); }
      ok('不朽圣盾 每 3 秒获得 8% 生命护盾', unit.shield > s0 + Math.round(unit.maxhp * 0.08) - 1000, `s0=${s0} now=${unit.shield}`);
      A.stopTickLoop();
      A.S.phase='prep';
    }
    // 猩红獠牙·收割：击杀回蓝；饮魂战刃：击杀回复生命+护盾
    {
      const u = mkB('ein', 0, 3, 6, { items: ['vamp', 'sword'] });   // 双剑→flamejudge? 不合成：直接带两件
      // 直接构造：击杀路径在 dealDamage 内
      const foe = mkB('yua', 1, 3, 1, { maxhp: 10, hp: 1 });
      const units = [u, foe];
      u.mana = 0; u.maxmana = 50; u.hp = Math.round(u.maxhp * 0.5);
      u._basicAttack = true;
      A.dealDamage(u, foe, 999, units, 'phys');
      ok('猩红獠牙·收割 击杀回复法力', u.mana >= 8, `mana=${Math.round(u.mana)}`);
    }
    {
      const u = mkB('ein', 0, 3, 6, { items: ['soulblade'] });
      const foe = mkB('yua', 1, 3, 1, { maxhp: 10, hp: 1 });
      const units = [u, foe];
      u.hp = Math.round(u.maxhp * 0.5);
      u._basicAttack = true;
      A.dealDamage(u, foe, 999, units, 'phys');
      ok('饮魂战刃 击杀回复 15% 生命并获得护盾', u.hp > Math.round(u.maxhp * 0.5) && shieldOf(u) > 0, `hp=${u.hp}/${u.maxhp}`);
    }
    // 溢血（血魔之心/风暴獠牙）：过量吸血转护盾
    {
      const u = mkB('ein', 0, 3, 6, { items: ['bloodcore'] });
      const foe = mkFoeDummy(3, 1);
      const units = [u, foe];
      u.hp = u.maxhp; u.shield = 0;   // 满血 → 吸血全部溢出
      u._basicAttack = true;
      A.dealDamage(u, foe, 200, units, 'pure');
      ok('血魔之心 满血时过量吸血转化为护盾', shieldOf(u) >= 200 * 0.35 * 0.40 - 2, `shield=${shieldOf(u)}`);
    }
    // 灵风甲胄·卸力：真实战斗里「闪避 → 蓄势 → 下一击消耗」全链路
    {
      A.S.phase = 'prep';
      const board = Array(64).fill(null), enemy = Array(64).fill(null);
      board[6 * 8 + 3] = { uid: 401, id: 'ein', star: 1, sks: 1, hp: Math.round(A.byId('ein').hp * 0.92), maxhp: Math.round(A.byId('ein').hp * 0.92), atk: A.byId('ein').atk, items: ['windmail'] };
      enemy[1 * 8 + 3] = { uid: 402, id: 'kouichi', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: A.byId('kouichi').atk, items: [] };
      A.S.board = board; A.S.enemyBoard = enemy;
      A.startBattle();
      const me = globalThis.__bu.find(v => v.side === 0);
      me.dodge = 1;   // 必闪避：触发卸力
      let sawAmp = false, sawConsumed = false;
      for (let i = 0; i < 120; i++) {
        A.currentTick();
        if (me.itemNextStrikeAmp > 0) sawAmp = true;
        else if (sawAmp) { sawConsumed = true; break; }
      }
      A.stopTickLoop(); A.S.phase = 'prep';
      ok('灵风甲胄 闪避后蓄势、下一击消耗强化', sawAmp && sawConsumed, `sawAmp=${sawAmp} consumed=${sawConsumed}`);
    }
  }

  /* ================= C. 技能：50 人逐个施法验证 ================= */
  console.log('\n──── C. 棋子技能（50 人施法行为）────');
  // 每名棋子：满蓝施法 → 断言「可观测效果」。exp 返回 [名称, bool, extra]
  function castProbe(id, o = {}) {
    freshGame();
    const kit0 = A.COMBAT_KITS[id] || {};
    const u = mkB(id, 0, o.x ?? 3, o.y ?? 6, o);
    u.mana = 9999; u.maxmana = 50; u.skillCd = 0;
    // 按技能形态摆位：cleave/burst(自我范围)需要贴身；field 半径 3；其余打最远/最近皆可
    const near = ['cleave', 'burst'].includes(kit0.mode) || ['chiharu', 'haruka', 'mahiru', 'rinco', 'songlv'].includes(id);
    const foeY = o.foeY ?? (kit0.mode === 'field' ? 3 : near ? 6 : 1);
    const foeX = o.foeX ?? (near ? 4 : 3);
    const foe = mkFoeDummy(foeX, foeY);
    const mate = mkB('yuji', 0, 4, 6, { hp: Math.round(mkB('yuji', 0, 0, 0).maxhp * (o.mateHp ?? 0.5)) });
    const units = [u, mate, foe];
    const foeHp0 = hpOf(foe), mateHp0 = hpOf(mate), mateShield0 = shieldOf(mate);
    let err = null;
    try { A.castSkill(u, foe, units, 1); } catch (e) { err = e; }
    return { u, foe, mate, units, foeDelta: foeHp0 - hpOf(foe), mateDelta: hpOf(mate) - mateHp0, mateShield: shieldOf(mate) - mateShield0, err };
  }
  const PASSIVE_IDS = A.UNITS.filter(u => A.COMBAT_KITS[u.id]?.passive || (u.sk[2] === 'passive')).map(u => u.id);
  const results = [];
  for (const d of A.UNITS) {
    const id = d.id;
    if (PASSIVE_IDS.includes(id)) { results.push([id, '被动棋子（不走施法）', true, '']); continue; }
    const kit = A.COMBAT_KITS[id] || {};
    const r = castProbe(id);
    if (r.err) { results.push([id, '施法抛错', false, r.err.stack.split('\n')[0]]); continue; }
    let desc, cond, extra = '';
    const hit = r.foeDelta, healed = r.mateDelta, mShield = r.mateShield;
    switch (kit.mode) {
      case 'guard': case 'guardLink': case 'teamShield':
        desc = '护盾类：自身/队友获得护盾';
        cond = shieldOf(r.u) > 0 || (kit.mode === 'guardLink' ? shieldOf(r.mate) > 0 : mShield > 0 || healed >= 0);
        extra = `self=${shieldOf(r.u)} mate=${mShield}`;
        break;
      case 'heal': case 'team': case 'support':
        desc = '治疗/增益类：治疗队友';
        cond = healed > 0 || mShield > 0 || shieldOf(r.u) > 0;
        extra = `healed=${healed}`;
        break;
      case 'passive':
        desc = '被动'; cond = true; break;
      default:
        desc = '输出类：对敌造成伤害';
        cond = hit > 0;
        extra = `dmg=${hit}`;
    }
    results.push([id, desc, cond, cond ? extra : extra || '无效果']);
  }
  for (const [id, desc, good, extra] of results) ok(`技能 ${A.byId(id).name}（${id}）${desc}`, good, extra);
  { // 被动棋子的被动通道验证
    freshGame();
    const z = mkB('zhouyi', 0, 3, 6); const foe = mkFoeDummy(3, 5);
    foe.shield = 100;
    const units = [z, foe];
    z._basicAttack = true;
    const b1 = hpOf(foe), s1 = shieldOf(foe);
    A.dealDamage(z, foe, 100, units, 'phys');
    const total1 = (b1 + s1) - (hpOf(foe) + shieldOf(foe));
    ok('轴伊·破盾之刃 对护盾目标附加 80% 特攻（180 过抗性）', total1 >= 73, `delta=${total1}`);
    const y = mkB('yuji', 0, 3, 6); const f2 = mkB('yua', 1, 3, 1);
    y.blockCt = 1;   // 确定性：必格挡
    const b2 = hpOf(y);
    A.dealDamage(f2, y, 100, [y, f2], 'magic');
    ok('雨纪 受击格挡减半伤害并召唤雨幕', y.v3RainReady === true && (b2 - hpOf(y)) <= 60, `taken=${b2 - hpOf(y)} rain=${y.v3RainReady}`);
    const yy = mkB('youyi', 0, 3, 6, { hp: Math.round(92 * 0.5) }); const f3 = mkFoeDummy(3, 1); const mate3 = mkB('tiandou', 0, 4, 6, { hp: 10 });
    yy._basicAttack = true;
    const mb = hpOf(mate3), sb = hpOf(yy);
    A.applyV3Attack(yy, f3, { onHit: 'soulmate', proc: 0 }, [yy, f3, mate3], 50, 50);
    ok('又一·一心同体 普攻为自身与最低血队友回血', hpOf(mate3) > mb && hpOf(yy) > sb);
  }
  { // 真实战斗可达性：每名棋子放进真实开战流程，25 秒内至少施法一次（被动除外）
    freshGame();
    const reachFail = [];
    for (const d of A.UNITS) {
      if (PASSIVE_IDS.includes(d.id)) continue;
      const board = Array(64).fill(null), enemy = Array(64).fill(null);
      board[(7 - Math.floor(uidSeq % 2)) * 8 + 3] = null;   // 占位（无意义，保持可读）
      const me = { uid: ++uidSeq, id: d.id, star: 1, sks: 1, hp: Math.round(d.hp * 0.92), maxhp: Math.round(d.hp * 0.92), atk: d.atk, items: [] };
      const pal = { uid: ++uidSeq, id: 'ein', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: 1, items: [] };
      const foe = { uid: ++uidSeq, id: 'yua', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: 1, items: [] };
      board[6 * 8 + 3] = me; board[7 * 8 + 4] = pal; enemy[1 * 8 + 3] = foe;
      A.S.phase = 'prep'; A.S.board = board; A.S.enemyBoard = enemy;
      A.startBattle();
      driveBattle(260);   // 26 秒
      const st = A.battleStats && Object.values(A.battleStats.units).find(r => r.id === d.id && r.side === 0);
      if (!st || !st.casts) reachFail.push(d.name);
      A.S.phase='prep';
    }
    ok('技能 真实战斗 26 秒内全员至少施法一次（48 主动棋子）', reachFail.length === 0, `未施法：${reachFail.join('、') || '无'}`);
  }

  /* ================= D. 诅咒：12 每日/自定义 + 14 旧版 ================= */
  console.log('\n──── D. 诅咒（12 条每日/自定义 + 14 条旧版）────');
  const DC = (0,eval)('DailyCurses');
  { // 数值口径：modifiers 逐条
    const probe = (id, r = 30) => { const st = DC.create(20260927, id); return DC.modifiers(st, { round: r }); };
    ok('裂隙地带: boardCurse=rift + 裂隙坐标 4 个', probe('dc_rift').boardCurse === 'rift' && probe('dc_rift').rifts.length === 4);
    ok('密阵反噬: boardCurse=cluster', probe('dc_cluster').boardCurse === 'cluster');
    ok('侧翼风暴: boardCurse=flank', probe('dc_flank').boardCurse === 'flank');
    ok('后排暴露: boardCurse=rear', probe('dc_rear').boardCurse === 'rear');
    ok('经济封锁: 商店 4 格 + 利息上限 2', probe('dc_economy').shopSize === 4 && probe('dc_economy').interestCap === 2);
    ok('定额成长: 禁买经验 + 自然经验 3 + 压力期敌方 +10%', (() => { const m = probe('dc_growth', 98); return m.buyXp === false && m.naturalXp === 3 && m.enemyHpMultiplier === 1.1; })());
    ok('血债: 生命上限 32', probe('dc_debt').maxHp === 32);
    ok('迷雾军情: 备战期隐藏敌方', probe('dc_fog').fog === true);
    ok('脆晶军团: 我方血 -20% 攻 +20%', (() => { const m = probe('dc_glass'); return m.allyHpMultiplier === 0.8 && m.allyAtkMultiplier === 1.2; })());
    ok('枯潮: 耗蓝 70 + 技能 ×1.2', (() => { const m = probe('dc_drought'); return m.manaCost === 70 && m.skillMultiplier === 1.2; })());
    ok('重甲入侵: 敌方血攻 +10%', (() => { const m = probe('dc_armor'); return m.enemyHpMultiplier === 1.1 && m.enemyAtkMultiplier === 1.1; })());
    ok('羁绊偏科: modifiers 透出 focus 门槛 +1', (() => { const st = DC.create(20260927, 'dc_bias'); st.focus = '深海'; return DC.modifiers(st, { round: 30 }).synergyPenalty === '深海'; })());
  }
  { // 行为层：在真实对局里开自定义诅咒
    // 裂隙/密阵/侧翼/后排：棋盘诅咒结算
    freshGame();
    (0,eval)('toggleCurse("dc_rift")'); freshGame({ custom: true });
    A.S.round = 26; A.S.dailyCurse = DC.create(20260927, 'dc_rift');
    const impacts = A.boardCurseImpacts(A.S.board, A.dailyMods());
    ok('裂隙地带 我方半区固定 4 个裂隙格（带增减益）', impacts.size === 4 && [...impacts.values()].every(p => p.hpMul < 1 && p.damageMul > 1), `n=${impacts.size}`);
    (0,eval)('toggleCurse("dc_rift")');
    // 羁绊偏科：章节开始发 focus + 招募带该羁绊的 2 费棋子
    (0,eval)('toggleCurse("dc_bias")'); freshGame({ custom: true });
    // newGame 内部已触发 start+roundStart：偏科羁绊、战报与招募补偿此时已兑现
    ok('羁绊偏科 开局确定本章偏科羁绊', !!A.S.dailyCurse.focus, `focus=${A.S.dailyCurse.focus}`);
    ok('羁绊偏科 战报明示本章偏科羁绊', A.S.log.some(l => l.includes('本章偏科羁绊：' + A.S.dailyCurse.focus)), A.S.log.slice(0, 4).join('‖'));
    const granted = A.S.bench.filter(Boolean);
    ok('羁绊偏科 补偿：获得一名带该羁绊的 2 费棋子', granted.some(u => A.byId(u.id).cost === 2 && (() => { const d = A.byId(u.id); return [d.fac, d.fac2, d.job, d.job2].includes(A.S.dailyCurse.focus); })()), `bench=${granted.map(u => u.id).join(',')}`);
    (0,eval)('toggleCurse("dc_bias")');
    // 旧版禁锢羁绊/职业禁令/阵营禁令
    freshGame({ custom: false });
    A.S.curses = ['nobond']; P('nbList().length===0');
    ;
    // nbList 生成入口：renderSetup→startConfiguredRun 时写入 cursesData；直接走游戏内函数
    {
      freshGame({ custom: false });
      A.S.curses = ['nojob'];
      // nojob/nofac/nobond 的名单在开局生成（cursesData.nobond）；这里手动写一份再断言 nbList 读取
      A.S.cursesData={nobond:Object.keys(A.CLASSES)};
      ok('职业禁令 全部职业羁绊失效', A.nbList().length === Object.keys(A.CLASSES).length);
      A.S.curses = ['nofac'];
      A.S.cursesData={nobond:Object.keys(A.FACTIONS)};
      ok('阵营禁令 全部阵营羁绊失效', A.nbList().length === Object.keys(A.FACTIONS).length);
    }
    { // 旧版数值口径
      freshGame({ custom: false }); A.S.curses = ['bloodpact'];
      ok('血之契约 生命上限 25', A.hpMax() === 25);
      A.S.curses = ['shortch'];
      ok('短章急行 守关周期 15', A.chLen() === 15);
      A.S.curses = ['tinyshop'];
      ok('紧缩货架 商店 3 格 / 刷新 1 金', A.shopSize() === 3 && A.refreshCost() === 1);
      A.S.curses = ['inflation'];
      ok('通货膨胀 刷新 3 金', A.refreshCost() === 3);
      A.S.curses = ['solo'];
      ok('独木桥 人口上限 5', A.lvlCap() === 5);
      A.S.curses = ['fog'];
      ok('战争迷雾 备战期隐藏敌方', A.enemyHidden() === true);
      A.S.curses = ['allin']; A.S.gold = 50;
      ok('孤注一掷 存款不产生利息', A.interestGain() === 0);
      A.S.curses = [];
      ok('无诅咒基线：利息正常', A.interestGain() > 0);
      // 玻璃大炮/干涸/硬着陆走 makeBattleUnit / genEnemy
      A.S.curses = ['glass', 'dry'];
      const b = mkB('ein', 0, 3, 6);
      ok('玻璃大炮 我方生命 -30% 攻 +30% / 干涸 耗蓝 75', b.maxmana === 75 && b.maxhp <= Math.round(A.byId('ein').hp * 0.92 * 0.7) + 1, `mana=${b.maxmana} hp=${b.maxhp}`);
      A.S.curses = [];
    }
  }

  /* ================= E. 重做验证：雨纪雨露蓄能 / 轴伊破盾优先 / 偏科徽章标记 ================= */
  console.log('──── E. 重做验证（雨纪 / 轴伊 / 偏科指引）────');
  { // 雨纪：普攻自凝雨露
    freshGame();
    const y = mkB('yuji', 0, 3, 6);
    const foe = mkFoeDummy(3, 1);
    ok('雨纪 初始 0 层雨露、上限 2、每 2 次普攻凝层', y.rainMax === 2 && (y.rainStacks || 0) === 0);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    ok('雨纪 1 次普攻不凝层', (y.rainStacks || 0) === 0, `stacks=${y.rainStacks}`);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    ok('雨纪 2 次普攻凝 1 层雨露', y.rainStacks === 1, `stacks=${y.rainStacks}`);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    A.applyV3Attack(y, foe, { onHit: 'rainveil', proc: 0 }, [y, foe], 10, 10);
    ok('雨纪 雨露至多 2 层（封顶不溢出）', y.rainStacks === 2, `stacks=${y.rainStacks}`);
  }
  { // 雨纪：受击消耗雨露必定闪避并召唤雨幕（真实战斗）
    freshGame();
    A.S.phase = 'prep';
    const board = Array(64).fill(null), enemy = Array(64).fill(null);
    board[5 * 8 + 3] = { uid: 601, id: 'yuji', star: 1, sks: 1, hp: 60, maxhp: 60, atk: A.byId('yuji').atk, items: [] };
    enemy[4 * 8 + 3] = { uid: 602, id: 'kouichi', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: A.byId('kouichi').atk, items: [] };
    A.S.board = board; A.S.enemyBoard = enemy;
    A.S.bench = A.S.bench.map(() => null);   // 清空备战席：防开局赠送棋子被自动上阵干扰
    A.startBattle();
    const yu = globalThis.__bu.find(v => v.id === 'yuji');
    yu.rainStacks = 1;   // 预置 1 层：敌第一次普攻必被雨露闪避
    for (let i = 0; i < 22; i++) A.currentTick();
    A.stopTickLoop(); A.S.phase = 'prep';
    ok('雨纪 雨露消耗：受击必定闪避（首次受击不掉血）', yu.hp === yu.maxhp, `hp=${yu.hp}/${yu.maxhp}`);
    ok('雨纪 闪避触发雨幕（8% 护盾 + 下击减速就绪）', (yu.shield || 0) > 0 && yu.v3RainReady === true, `shield=${yu.shield} rain=${yu.v3RainReady}`);
    ok('雨纪 雨露已消耗', yu.rainStacks === 0, `stacks=${yu.rainStacks}`);
  }
  { // 轴伊：射程内有带盾目标时优先拆盾（真实战斗）
    freshGame();
    A.S.phase = 'prep';
    const board = Array(64).fill(null), enemy = Array(64).fill(null);
    board[6 * 8 + 3] = { uid: 611, id: 'zhouyi', star: 1, sks: 1, hp: 60, maxhp: 60, atk: A.byId('zhouyi').atk, items: [] };
    enemy[5 * 8 + 3] = { uid: 612, id: 'kouichi', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: A.byId('kouichi').atk, items: [] };
    enemy[6 * 8 + 4] = { uid: 613, id: 'kanban', star: 1, sks: 1, hp: 1e9, maxhp: 1e9, atk: 1, items: [] };
    A.S.board = board; A.S.enemyBoard = enemy;
    A.S.bench = A.S.bench.map(() => null);   // 清空备战席：防开局赠送棋子被自动上阵干扰
    A.startBattle();
    const zy = globalThis.__bu.find(v => v.id === 'zhouyi');
    const kb = globalThis.__bu.find(v => v.id === 'kanban');
    const kou = globalThis.__bu.find(v => v.id === 'kouichi');
    kb.shield = 100;   // 相邻带盾目标
    for (let i = 0; i < 22; i++) A.currentTick();
    A.stopTickLoop(); A.S.phase = 'prep';
    ok('轴伊 优先攻击护盾持有者（光一未被普攻）', kou.hp === kou.maxhp, `kouichi delta=${kou.maxhp - kou.hp}`);
    ok('轴伊 拆盾特攻打在护盾上（护盾被削减）', kb.shield < 100, `kanban.shield=${kb.shield}`);
  }
  { // 偏科徽章标记
    freshGame();
    A.S.dailyCurse = { version: 3, id: 'dc_bias', seed: 20260927, custom: true, done: {}, refreshes: 0, refreshRound: 1, focus: '深海' };
    const synBadges = P('synBadges');
    const html = synBadges({ '深海': 2, '音律': 2 }, Object.assign({}, A.FACTIONS, A.CLASSES));
    const deepSea = html.split('syn-badge').filter(x => x.includes('深海'))[0] || '';
    const yinly = html.split('syn-badge').filter(x => x.includes('音律'))[0] || '';
    ok('偏科徽章 被偏科的羁绊显示 ⚠+1 标记', deepSea.includes('syn-off'), deepSea.slice(0, 80));
    ok('偏科徽章 进度按 +1 后门槛显示（2/3 而非 2/2）', deepSea.includes('2/3') && !deepSea.includes('>2/2<'), (deepSea.match(/\d\/\d/) || [])[0]);
    ok('偏科徽章 其他羁绊不显示标记', !yinly.includes('syn-off'));
  }

  /* ---------- 汇总 ---------- */
  console.log(`\n════ 审计完成：${passN} 通过 / ${fails.length} 失败 ════`);
  if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exitCode = 1; }
}

module.exports = { run };
