/* 固定战斗节奏回归：PACE_TEST=1 node tools/sim.js */
const assert = require('node:assert/strict');

module.exports.run = function (A) {
  globalThis.newGame();
  A.S.board = Array(64).fill(null);
  A.S.enemyBoard = Array(64).fill(null);
  const put = (board, pos, id) => {
    board[pos] = {uid:A.S.uid++, id, star:1, sks:1, hp:20000, maxhp:20000, atk:1, items:[]};
  };
  put(A.S.board, 4*8+2, 'ein');
  put(A.S.board, 4*8+4, 'agari');
  put(A.S.enemyBoard, 3*8+2, 'goutan');
  put(A.S.enemyBoard, 3*8+4, 'sumi');
  A.S.lvl = 2;
  A.S.phase = 'prep';
  globalThis.startBattle();
  const units = globalThis.window.__bu;
  assert.equal(units.length, 4);
  units.forEach(u => {u.mana=u.maxmana;u.cd=999999;u.skillCd=0;u.atk=1;u.hp=u.maxhp;});
  const casts=[];
  for(let tick=1;tick<=35;tick++){
    const before=A.S.log.filter(line=>line.includes('发动【')).length;
    A.currentTick();
    const fresh=A.S.log.filter(line=>line.includes('发动【'));
    if(fresh.length>before)casts.push({tick,side:fresh[0].includes('我方')?0:1,count:fresh.length-before});
  }
  assert.deepEqual(casts.map(c=>c.tick),[8,16,24,32], '技能应在开战缓冲后每 800ms 释放一次');
  assert.deepEqual(casts.map(c=>c.side),[casts[0].side,1-casts[0].side,casts[0].side,1-casts[0].side], '双方应轮流取得施法优先权');
  assert.ok(casts.every(c=>c.count===1), '同一时刻只能释放一个技能');
  console.log('✅ 固定速度：开战 800ms 缓冲，技能每 800ms 错峰，双方交替施法');
};
