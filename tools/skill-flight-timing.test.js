/* 飞行技能到达后才结算：SKILL_FLIGHT_TEST=1 node tools/sim.js */
const assert = require('node:assert/strict');

module.exports.run = function (A) {
  const setup = (casterId, enemyCount = 1, allyId = null) => {
    globalThis.newGame();
    A.S.board = Array(64).fill(null);
    A.S.enemyBoard = Array(64).fill(null);
    const unit = (id, atk = 100) => ({uid:A.S.uid++, id, star:1, sks:1, hp:4000, maxhp:4000, atk, items:[]});
    A.S.board[4*8+3] = unit(casterId);
    if(allyId) A.S.board[4*8+4] = unit(allyId);
    A.S.enemyBoard[3*8+3] = unit('goutan', 1);
    if(enemyCount > 1) A.S.enemyBoard[3*8+4] = unit('goutan', 1);
    A.S.phase = 'prep';
    globalThis.startBattle();
    const units = globalThis.window.__bu;
    units.forEach(u => {u.cd=999999;u.moveCd=999999;u.skillCd=999999;u.mana=0;u.hp=u.maxhp;});
    for(let i=0;i<8;i++) A.currentTick();
    return {units,caster:units.find(u=>u.side===0&&u.id===casterId),foes:units.filter(u=>u.side===1)};
  };

  {
    const {units,caster,foes:[target]} = setup('yujiu');
    const hp=target.hp;
    A.castSkill(caster,target,units,1);
    assert.equal(target.hp,hp,'飞行物出手时不应立即造成伤害');
    A.currentTick(); A.currentTick();
    assert.equal(target.hp,hp,'飞行物未到达时不应造成伤害');
    for(let i=0;i<6;i++) A.currentTick();
    assert.ok(target.hp<hp,'飞行物到达后应造成伤害');
  }
  {
    const {units,caster,foes:[target]} = setup('haruka');
    const hp=target.hp;
    A.castSkill(caster,target,units,1);
    assert.ok(target.hp<hp,'近战技能仍应即时命中');
  }
  {
    const {units,caster,foes} = setup('sanli',2);
    const hp=foes.map(f=>f.hp+(f.shield||0));
    const remaining=()=>foes.map(f=>f.hp+(f.shield||0));
    A.castSkill(caster,foes[0],units,1);
    assert.deepEqual(remaining(),hp,'连锁技能出手时不应立即命中');
    let firstTick=0,firstCount=0;
    for(let i=1;i<=8;i++){
      A.currentTick();
      const count=remaining().filter((n,j)=>n<hp[j]).length;
      if(count){firstTick=i;firstCount=count;break;}
    }
    assert.ok(firstTick>0,'首跳应在飞行后命中');
    assert.equal(firstCount,1,'第二跳不能与首跳同时结算');
    for(let i=0;i<8;i++) A.currentTick();
    assert.equal(remaining().filter((n,j)=>n<hp[j]).length,2,'第二跳到达后应命中');
  }
  {
    const {units,caster,foes:[target]} = setup('xuezhu');
    const hp=target.hp;
    A.castSkill(caster,target,units,1);
    assert.equal(target.hp,hp,'落点技能的初始伤害应等待投射物');
    for(let i=0;i<8;i++) A.currentTick();
    assert.ok(target.hp<hp,'落点技能应在投射物抵达后命中');
  }
  {
    const {units,caster} = setup('likou',1,'haruka');
    const ally=units.find(u=>u.side===0&&u!==caster);
    ally.hp=ally.maxhp-500;
    const hp=ally.hp;
    A.castSkill(caster,units.find(u=>u.side===1),units,1);
    assert.equal(ally.hp,hp,'治疗飞行物出手时不应立即治疗');
    A.currentTick(); A.currentTick();
    assert.equal(ally.hp,hp,'治疗飞行物未到达时不应治疗');
    for(let i=0;i<6;i++) A.currentTick();
    assert.ok(ally.hp>hp,'治疗飞行物到达后应治疗');
  }
  {
    const {units,caster,foes:[target]} = setup('yujiu');
    target.hp=1;
    A.castSkill(caster,target,units,1);
    caster.hp=0;
    A.currentTick(); A.currentTick();
    assert.equal(A.S.phase,'battle','一方倒下后仍应等待已飞出的技能');
    assert.equal(target.hp,1,'未抵达的技能不能提前决定胜负');
    for(let i=0;i<6;i++) A.currentTick();
    assert.ok(target.hp<=0,'施法者阵亡后已飞出的技能仍应命中');
  }
  console.log('✅ 脱手技能命中与飞行抵达同步；近战即时；连锁逐跳结算；治疗抵达后生效；终局等待飞行物');
};
