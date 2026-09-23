/* 50 棋子与全部装备的真实结算冒烟测试。运行：EFFECT_TEST=1 node tools/sim.js */
const assert = require('node:assert/strict');

module.exports.run = function (A, driveBattle) {
  const mk = (id, side = 0, x = 3, y = side ? 3 : 4, items = []) => {
    const b = A.makeBattleUnit({uid: A.S.uid++, id, star: 1, sks: 1, hp: 4000, maxhp: 4000, atk: 100, items}, side, x, y);
    b.hp = Math.round(b.maxhp * .55);
    b.mana = 30;
    return b;
  };
  const state = us => JSON.stringify(us.map(u => [u.hp, u.shield, u.mana, u.x, u.y, u.stun, u.frozen,
    u.silenceT, u.slowT, u.poisonT, u.healDownT, u.atkDownT, u.tauntT, u.phaseT, u.v3CastEcho,
    u.v3Afterimage, u.v3LinkT, u.v3VulnT, u.v3HealLockT, u.v3AtkBuffT, u.v3HasteT, u.v3DrT]));
  globalThis.newGame();
  assert.equal(Object.keys(A.COMBAT_KITS).length, 50);
  assert.deepEqual(Object.keys(A.COMBAT_KITS).sort(), A.UNITS.map(u=>u.id).sort(), '全部棋子均有独立战斗技能配置');
  const changed = [], failed = [];
  for (const id of Object.keys(A.COMBAT_KITS)) {
    const kit = A.COMBAT_KITS[id];
    if (kit.passive) continue;
    const u = mk(id), allies = [mk('ein', 0, 4, 5), mk('likou', 0, 2, 5)];
    const foes = [mk('goutan', 1, 3, 3), mk('kanban', 1, 4, 3), mk('ein', 1, 2, 3)];
    const us = [u, ...allies, ...foes], before = state(us);
    try {
      A.castSkill(u, foes[0], us, 1);
      assert.equal(u._casting, false, `${id} 施法标志应复位`);
      assert.ok(us.every(v => Number.isFinite(v.hp) && Number.isFinite(v.shield)), `${id} 产生非法生命/护盾`);
      if (state(us) === before) failed.push(id);
      else changed.push(id);
    } catch (e) { failed.push(`${id}: ${e.message}`); }
  }
  assert.deepEqual(failed, [], `主动技能必须改变战斗状态：${failed.join(', ')}`);
  console.log(`✅ ${changed.length} 个主动技能逐一施法，全部改变战斗状态`);

  {
    const breaker=mk('zhouyi'), rain=mk('yuji'), soulmate=mk('youyi');
    const foe=mk('goutan',1), mate=mk('ein',0,4,5);
    assert.equal(A.v3AttackOf(breaker).onHit,'shieldbreak');
    breaker.v3BreakReady=true;
    A.v3RainTrigger(rain);
    assert.ok(rain.shield>0 && rain.v3RainReady);
    A.applyV3Attack(rain,foe,A.v3AttackOf(rain),[rain,foe],1,100);
    assert.ok(foe.slowT>0 && !rain.v3RainReady);
    const before=soulmate.hp+mate.hp;
    A.applyV3Attack(soulmate,foe,A.v3AttackOf(soulmate),[soulmate,mate,foe],1,100);
    assert.ok(soulmate.hp+mate.hp>before);
    console.log('✅ 3 个被动技能的普攻/格挡战斗钩子生效');
  }

  for (const id of Object.keys(A.ITEMS)) {
    const plain = mk('ein');
    const equipped = mk('ein', 0, 3, 4, [id]);
    assert.ok(A.ITEM_FX[id], `${id} 缺少数值效果`);
    assert.ok(state([equipped]) !== state([plain]) || equipped.atk !== plain.atk || equipped.maxhp !== plain.maxhp ||
      equipped.spdMul !== plain.spdMul || equipped.vamp !== plain.vamp || equipped.manaRegenMul !== plain.manaRegenMul ||
      equipped.crit !== plain.crit || equipped.bounceP !== plain.bounceP || equipped.dodge !== plain.dodge,
      `${id} 穿戴后没有任何战斗属性变化`);
  }
  console.log(`✅ ${Object.keys(A.ITEMS).length} 件装备逐一穿戴，全部改变战斗属性`);
  assert.equal(Object.keys(A.ITEM_SPECIAL).length, 24, '24 件成品与神器有额外触发机制；不朽圣盾的周期护盾由数值效果直接实现');

  {
    const attacker = mk('ein'), target = mk('goutan', 1);
    target.noShieldT = 2000;
    A.v3AddShield(target, 300);
    assert.equal(target.shield, 0, '禁盾阻止技能加盾');
    target.shield = 300;
    A.dealDamage(attacker, target, 100, [attacker, target], 'pure');
    assert.equal(target.shield, 0, '禁盾阻止已有护盾吸收伤害');
    console.log('✅ 禁盾作用于直接加盾与伤害吸收');
  }
  {
    const attacker = mk('ein', 0, 3, 4, ['bloodcore']);
    const target = mk('goutan', 1); attacker.hp = attacker.maxhp;
    attacker._basicAttack = true;
    A.dealDamage(attacker, target, 100, [attacker, target], 'pure');
    attacker._basicAttack = false;
    assert.ok(attacker.shield > 0, '满血攻击吸血溢出应形成护盾');
    const shield = attacker.shield;
    attacker._casting = true;
    A.dealDamage(attacker, target, 100, [attacker, target], 'pure');
    attacker._casting = false;
    assert.equal(attacker.shield, shield, '攻击吸血不能被技能伤害触发');
    console.log('✅ 攻击吸血与技能吸血分流，满血溢出护盾生效');
  }
  {
    const singer = mk('shengge'), clean = mk('ein', 0, 4, 5), normal = mk('likou', 0, 2, 5);
    const foe = mk('goutan', 1); clean.stun = 1000;
    A.castSkill(singer, foe, [singer, clean, normal, foe], 1);
    assert.equal(clean.stun, 0);
    assert.ok(clean.v3HasteMul > 1);
    assert.ok(!normal.v3HasteMul || normal.v3HasteMul === 1);
    console.log('✅ 净音祷歌仅给成功净化的队友加攻速');
  }
  {
    const bard = mk('lianshiye'), foe = mk('shadow', 1);
    A.castSkill(bard, foe, [bard, foe], 1);
    const hp = foe.hp;
    A.castSkill(foe, bard, [bard, foe], 1);
    const once = foe.hp;
    A.castSkill(foe, bard, [bard, foe], 1);
    assert.ok(once < hp && foe.hp < once, `失忆挽歌应反复响应目标施法：${hp} → ${once} → ${foe.hp}，标记 ${JSON.stringify(foe.v3CastEcho)}`);
    console.log('✅ 失忆挽歌有效期内每次施法均产生回响');
  }
  {
    const seer = mk('miting'), foe = mk('shadow', 1);
    A.castSkill(seer, foe, [seer, foe], 1);
    assert.ok(foe.v3ReflectT > 0);
    const hp = foe.hp;
    A.castSkill(foe, seer, [seer, foe], 1);
    assert.ok(foe.hp < hp && foe.v3ReflectT === 0, '看破真相应在目标施法时反噬目标');
    console.log('✅ 看破真相反噬被标记者下一次施法');
  }
  {
    const sanli=mk('sanli'), foes=[mk('goutan',1,3,3),mk('kanban',1,4,3),mk('ein',1,2,3)];
    A.castSkill(sanli,foes[0],[sanli,...foes],1);
    assert.equal(foes.filter(u=>u.stun>0).length,1,'梦境三拍仅最后一跳眩晕');
    const chiharu=mk('chiharu'), target=mk('goutan',1);
    A.castSkill(chiharu,target,[chiharu,target],1);
    assert.ok(target.v3VulnBasicOnly && target.v3VulnT>0);
    A.dealDamage(chiharu,target,50,[chiharu,target],'pure');
    assert.ok(target.v3VulnT>0,'夜岚易伤不应被技能伤害消耗');
    chiharu._basicAttack=true;A.dealDamage(chiharu,target,50,[chiharu,target],'pure');chiharu._basicAttack=false;
    assert.equal(target.v3VulnT,0,'夜岚易伤由下一次普攻消耗');
    console.log('✅ 梦境三拍末跳眩晕、夜岚易伤仅由普攻消耗');
  }
  {
    const guard = mk('sumi'), ally = mk('ein', 0, 4, 5), foe = mk('goutan', 1);
    A.castSkill(guard, foe, [guard, ally, foe], 1);
    assert.equal(ally.v3ControlWard, 1);
    ally.stun = 1000;
    A.S.board = Array(64).fill(null); A.S.enemyBoard = Array(64).fill(null);
    A.S.board[4 * 8 + 3] = {uid: A.S.uid++, id:'sumi', star:1, sks:1, hp:4000, maxhp:4000, atk:100, items:[]};
    A.S.enemyBoard[3 * 8 + 3] = {uid: A.S.uid++, id:'goutan', star:1, sks:1, hp:4000, maxhp:4000, atk:1, items:[]};
    A.S.phase='prep'; globalThis.startBattle();
    const us=globalThis.window.__bu, caster=us.find(u=>u.id==='sumi'), enemy=us.find(u=>u.side===1);
    enemy.cd=999999;enemy.skillCd=999999;caster.cd=999999;caster.skillCd=999999;
    A.castSkill(caster, enemy, us, 1);
    caster.stun=1000;driveBattle(12);
    assert.equal(caster.stun, 0);
    assert.equal(caster.v3ControlWard, 0);
    console.log('✅ 墨龙护盾抵消一次后续控制');
  }
  {
    globalThis.newGame();
    A.S.board=Array(64).fill(null);A.S.enemyBoard=Array(64).fill(null);
    A.S.board[4*8+3]={uid:A.S.uid++,id:'seki',star:1,sks:1,hp:4000,maxhp:4000,atk:100,items:[]};
    A.S.enemyBoard[3*8+3]={uid:A.S.uid++,id:'goutan',star:1,sks:1,hp:4000,maxhp:4000,atk:1,items:[]};
    A.S.phase='prep';globalThis.startBattle();
    const us=globalThis.window.__bu,caster=us.find(u=>u.id==='seki'),enemy=us.find(u=>u.side===1);
    caster.cd=999999;caster.skillCd=999999;enemy.cd=999999;enemy.skillCd=999999;
    enemy.mana=40;A.castSkill(caster,enemy,us,1);
    const afterCast=enemy.mana;driveBattle(25);
    assert.ok(enemy.mana<afterCast, `星蚀领域持续烧蓝：${afterCast} → ${enemy.mana}`);
    console.log('✅ 星蚀领域施法后持续烧蓝');
  }
  {
    globalThis.newGame();
    A.S.board=Array(64).fill(null);A.S.enemyBoard=Array(64).fill(null);
    A.S.board[4*8+3]={uid:A.S.uid++,id:'haruka',star:1,sks:1,hp:4000,maxhp:4000,atk:100,items:[]};
    A.S.enemyBoard[3*8+3]={uid:A.S.uid++,id:'goutan',star:1,sks:1,hp:4000,maxhp:4000,atk:10,items:[]};
    A.S.phase='prep';globalThis.startBattle();
    const us=globalThis.window.__bu,caster=us.find(u=>u.id==='haruka'),enemy=us.find(u=>u.side===1);
    caster.cd=999999;caster.skillCd=999999;caster.mana=0;caster.silenceT=999999;
    enemy.mana=0;enemy.maxmana=999999;enemy.v3WeakenBy=caster.uid;enemy.atkDownA=.25;enemy.atkDownT=3500;
    driveBattle(16);
    assert.ok(caster.mana>=4, `白神遥应从削弱目标的普攻回蓝，实际 ${caster.mana}`);
    console.log('✅ 白神遥削弱目标普攻时回蓝');
  }
  console.log('ALL EFFECT TESTS PASS');
};
