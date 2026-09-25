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
  /* 2026-09-25 契约变更：施法闸门由「单个全局 lastCastAt」改为「分边闸门」。
     旧契约：全场每 800ms 至多 1 次技能 → 4 个棋子（每方 2 个）需要 4 个窗口，落点 8,16,24,32；
             一场 6–8 秒战斗上限仅 6–9 次，技能覆盖率约 45%。
     新契约：每方各自 800ms 一次 → 同样 4 个棋子只需 2 个窗口，落点 8,9,16,17，吞吐 2×；
             同一 tick 仍只释放一个技能（沿用 nextCaster 单值，保证特效与跳字不堆叠）。 */
  assert.deepEqual(casts.map(c=>c.tick),[8,9,16,17], '每方各自 800ms 一次：同样 4 个棋子从 4 个窗口压缩到 2 个（吞吐 2×）');
  assert.ok(casts.every(c=>c.count===1), '同一 tick 仍只释放一个技能（表现层不堆叠）');
  assert.ok(casts.every((c,i)=>i===0||c.side!==casts[i-1].side), '两侧交替施法');
  console.log('✅ 固定速度：开战 800ms 缓冲，每方各自 800ms 错峰（同样单位数只占一半窗口，吞吐 2×），两侧交替、同一 tick 仅 1 次');
};
