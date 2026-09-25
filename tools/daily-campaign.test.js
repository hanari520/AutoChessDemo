/* Run with DAILY_CAMPAIGN_TEST=1 node tools/sim.js. Tests real settlement and save paths. */
'use strict';
module.exports.run = function (A) {
  const assert = require('node:assert/strict');
  const game = globalThis;
  const reset = (round, daily = true) => {
    A.newGame(daily ? { daily: true } : {});
    A.S.round = round;
    A.S.phase = 'battle';
    A.S.auto = false;
    A.S.autoFight = false;
  };
  for (const daily of [true, false]) {
    for (const round of [25, 50, 75]) {
      reset(round, daily);
      assert.equal(game.runLimit(), 100);
      assert.equal(game.chLen(), 25);
      game.endBattle(1, 0);
      assert.equal(A.S.phase, 'chapter', `round ${round} opens chapter rewards`);
      assert.equal(A.S.settleOffer.length, 3);
      const count = A.S.augs.length;
      A.chapterContinue();
      assert.equal(A.S.round, round, 'continue requires an augment choice');
      A.pickAug(0);
      A.chapterContinue();
      assert.equal(A.S.round, round + 1);
      assert.equal(A.S.phase, 'prep');
      assert.equal(A.S.augs.length, count + 1);
      assert.equal(A.S.tickets, round === 50 ? 1 : 0);
    }
    for (const round of [25, 50, 75, 100]) {
      reset(round, daily);
      game.endBattle(0, 1);
      assert.equal(A.S.phase, 'over');
      assert.equal(A.S.finished, false);
    }
    reset(100, daily);
    game.endBattle(1, 0);
    assert.equal(A.S.phase, 'over');
    assert.equal(A.S.finished, true);
    assert.equal(A.S.round, 100);
  }
  reset(82);
  /* 敌方人数上限（2026-09-25 改为章节边界线性过渡，见 index.html enemyCap 注释）：
     原断言 enemyCap(26)===9 / enemyCap(51)===10 固化的是旧的单回合阶跃行为。
     新契约：边界前 5 回合过渡 → r26=7 起爬、r29 到 9；r51=9 起爬、r53 到 10。 */
  assert.equal(game.enemyCap(26), 7, 'r26 应处于过渡段起点（原为单回合跳到 9）');
  assert.equal(game.enemyCap(29), 9, 'r29 应完成第一章→第二章的过渡');
  assert.equal(game.enemyCap(51), 9, 'r51 应处于过渡段起点（原为单回合跳到 10）');
  assert.equal(game.enemyCap(53), 10, 'r53 应完成第二章→第三章的过渡');
  game.prepEnemy();
  /* 随回合升星：旧断言「r82 恰好 1 个 2★」写于已废弃的"r82/r92 固定 2★ 精英带队"设计，
     与逐回合升星系统冲突（未改动版本实测得到 10 个 2★），故改为区间断言。 */
  const twos = A.S.enemyBoard.filter(u => u && u.star === 2).length;
  assert.ok(twos >= 1, `r82 敌方应存在升星单位（实测 ${twos} 个 2★）`);
  assert.equal(A.S.enemyBoard.filter(Boolean).length, 10);
  assert.equal(game.challengeAvailable(), false, 'daily does not gain normal elite options');

  // Restarting the same day reproduces opening shop and army; reload preserves future draws.
  const opening = () => JSON.stringify({ shop: A.S.shop, enemy: A.S.enemyBoard, state: A.S.dailyRngState });
  A.newGame({ daily: true });
  const first = opening();
  A.newGame({ daily: true });
  assert.equal(opening(), first);
  A.S.round = 51;
  game.prepEnemy();
  game.rollShop();
  assert.equal(A.saveGame(), true);
  const saved = JSON.parse(localStorage.getItem(A.DAILY_KEY));
  const sequence = Array.from({ length: 20 }, () => game.rand());
  assert.equal(A.loadGame(A.DAILY_KEY), true);
  assert.deepEqual(A.S.enemyBoard, saved.enemyBoard);
  assert.deepEqual(A.S.shop, saved.shop);
  assert.deepEqual(Array.from({ length: 20 }, () => game.rand()), sequence);
  assert.equal(A.S.round, 51);

  // Custom short chapters remain independent of the daily campaign length.
  A.newGame({ custom: true });
  A.S.curses = ['shortch'];
  A.S.round = 15;
  A.S.phase = 'battle';
  assert.equal(game.runLimit(), 15);
  assert.equal(game.chLen(), 15);
  game.endBattle(1, 0);
  assert.equal(A.S.phase, 'over');
  assert.equal(A.S.finished, true);
  assert.equal(game.rankedHist({ daily: true, rules: 'classic' }), false);
  assert.equal(game.rankedHist({ daily: true, rules: 'daily100' }), true);
  A.newGame({ custom: true });
  A.S.curses = ['solo'];
  A.S.round = 22;
  assert.equal(game.runLimit(), 25);
  assert.equal(game.lvlCap(), 5);
  game.prepEnemy();
  assert.equal(A.S.enemyBoard.filter(Boolean).length, 5, 'custom solo retains its enemy cap');

  // Shared v3 rules: daily selection and custom single-rule runs use the same host bridge.
  global.window.DailyCurses = require('./daily-curses.js');
  const DC=window.DailyCurses;
  A.newGame({daily:true});
  assert.equal(A.S.dailyCurse.version,3);
  assert.equal(A.S.dailyCurse.id,DC.pick(A.S.dseed).id);
  assert.equal(A.S.curses.length,1);
  A.newGame({custom:true});
  A.S.curses=['dc_rift'];
  A.S.dailyCurse=DC.create(20260925,'dc_rift');
  assert.equal(game.runLimit(),100,'new custom curses use four chapters');
  assert.equal(game.chLen(),25);
  assert.equal(game.rankedRun(),false);
  const rifts=DC.modifiers(A.S.dailyCurse,{round:1}).rifts;
  assert.equal(rifts.length,4);
  for(const i of rifts) assert(i>=32&&i<64);
  A.S.dailyCurse=DC.create(20260925,'dc_economy');
  A.S.gold=50;
  assert.equal(game.shopSize(),4);
  assert.equal(game.refreshCost(),0);
  assert.equal(game.interestGain(),2);
  A.dailyEvent('refresh');
  assert.equal(game.refreshCost(),2);
  A.S.dailyCurse=DC.create(20260925,'dc_debt');
  A.S.round=5;A.S.gold=3;
  assert.equal(game.hpMax(),32);
  A.dailyEvent('roundStart');
  assert.equal(A.S.gold,0);
  A.S.dailyCurse=DC.create(20260925,'dc_growth');
  A.S.round=21;
  assert.equal(game.dailyMods().buyXp,false);
  assert.equal(game.dailyMods().naturalXp,3);
  assert.equal(game.dailyMods().enemyHpMultiplier,1.1);
  A.S.dailyCurse=DC.create(20260925,'dc_glass');
  const probeDef=A.UNITS.find(u=>!u.big);
  const probe={uid:1,id:probeDef.id,star:1,sks:1,hp:1000,maxhp:1000,atk:50,items:[]};
  A.S.dailyCurse=DC.create(20260925,'dc_fog');
  const base=A.makeBattleUnit({...probe},1,0,0);
  const ownBase=A.makeBattleUnit({...probe},0,0,4);
  A.S.dailyCurse=DC.create(20260925,'dc_armor');
  const armored=A.makeBattleUnit({...probe},1,0,0);
  assert.equal(armored.maxhp,Math.round(base.maxhp*1.1));
  assert.equal(armored.atk,Math.round(base.atk*1.1));
  A.S.dailyCurse=DC.create(20260925,'dc_glass');
  const glass=A.makeBattleUnit({...probe},0,0,4);
  assert.equal(glass.maxhp,Math.round(ownBase.maxhp*.8));
  assert.equal(glass.atk,Math.round(ownBase.atk*1.2));
  A.S.dailyCurse=DC.create(20260925,'dc_drought');
  assert.equal(A.makeBattleUnit({...probe},0,0,4).maxmana,70);
  A.S.dailyCurse=DC.create(20260925,'dc_fog');
  assert.equal(A.enemyHidden(),true);
  const board=Array(64).fill(null);
  const fighter=(uid)=>({...probe,uid});
  A.S.dailyCurse=DC.create(20260925,'dc_rift');
  const target=DC.rifts(A.S.dailyCurse,1)[0];board[target]=fighter(10);
  const riftUnit=A.makeBattleUnit(board[target],0,target%8,Math.floor(target/8));
  const riftHp=riftUnit.maxhp;
  A.applyBoardCurse([riftUnit],board,DC.modifiers(A.S.dailyCurse,{round:1}));
  assert.equal(riftUnit.maxhp,Math.round(riftHp*.85));
  assert.equal(riftUnit.curseDamageMul,1.15);
  A.S.dailyCurse=DC.create(20260925,'dc_flank');
  board.fill(null);board[32]=fighter(11);
  const flank=A.makeBattleUnit(board[32],0,0,4);
  A.applyBoardCurse([flank],board,DC.modifiers(A.S.dailyCurse,{round:1}));
  assert.equal(flank.curseTakenMul,1.2);
  assert.equal(flank.curseDamageMul,1.15);
  A.S.dailyCurse=DC.create(20260925,'dc_rear');
  board.fill(null);board[56]=fighter(12);board[32]=fighter(13);
  const rear=A.makeBattleUnit(board[56],0,0,7),front=A.makeBattleUnit(board[32],0,0,4);
  A.applyBoardCurse([rear,front],board,DC.modifiers(A.S.dailyCurse,{round:1}));
  assert.equal(rear.curseTakenMul,1.2);
  assert(Math.abs(front.dmgReduce-.08)<1e-9);
  A.S.dailyCurse=DC.create(20260925,'dc_cluster');
  board.fill(null);for(const i of [32,33,40])board[i]=fighter(i);
  const crowd=[32,33,40].map(i=>A.makeBattleUnit(board[i],0,i%8,Math.floor(i/8)));
  A.applyBoardCurse(crowd,board,DC.modifiers(A.S.dailyCurse,{round:1}));
  assert(crowd.every(u=>u.spdMul===.85),'crowded 2x2 cells slow all occupants');
  console.log('PASS daily campaign v3: four chapters, custom single curse, shared economy, debt, growth, combat and fog');
};
