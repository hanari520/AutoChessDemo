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
  assert.equal(game.enemyCap(26), 9);
  assert.equal(game.enemyCap(51), 10);
  game.prepEnemy();
  assert.equal(A.S.enemyBoard.filter(u => u && u.star === 2).length, 1);
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

  // ---- Daily curse v2 host wiring: state creation, event chain, modifier consumption ----
  global.window.DailyCurses = require('./daily-curses.js');   // host reads window.DailyCurses dynamically, so late injection works
  const DC = window.DailyCurses;
  const stateFor = id => ({ version: 2, id, seed: A.S.dseed, done: {}, refreshes: 0, refreshRound: 0, freeRefreshRound: 0, freeBuffRound: 0, seal: null });

  A.newGame({ daily: true });
  assert.ok(A.S.dailyCurse && A.S.dailyCurse.version === 2, 'newGame creates the v2 daily state');
  assert.equal(A.S.dailyCurse.id, DC.pick(A.S.dseed).id, 'daily state follows the date pick');
  const START_GOLD = { dc_debt: 12, dc_slowgrowth: 6, dc_five: 16, dc_drought: 6 };
  A.newGame({ daily: true });
  assert.equal(A.S.gold, 10 + (START_GOLD[A.S.dailyCurse.id] || 0), 'start gold compensation is granted through dailyEvent');
  assert.equal(A.S.tickets, A.S.dailyCurse.id === 'dc_march' ? 1 : 0, 'march start ticket is granted');
  assert.equal(A.S.curses.length, 1, 'daily keeps exactly one catalog id for the rank contract');

  // Every rule drives the shared host read points (hp/shop/refresh/cap/equip).
  for (const rule of DC.CATALOG.map(c => c.id)) {
    A.newGame({ daily: true });
    A.S.dailyCurse = stateFor(rule);
    A.S.gold = 50;
    const dm = DC.modifiers(A.S.dailyCurse, { round: A.S.round });
    assert.equal(game.hpMax(), dm.maxHp, rule + ' hpMax follows modifiers');
    assert.equal(game.shopSize(), dm.shopSize, rule + ' shopSize follows modifiers');
    assert.equal(game.refreshCost(), dm.refreshCost, rule + ' refreshCost follows modifiers');
    assert.equal(game.lvlCap(), dm.cap, rule + ' lvlCap follows modifiers');
    if (typeof dm.maxEquip === 'number') assert.equal(game.maxEquip(), dm.maxEquip, rule + ' maxEquip follows modifiers');
    assert.equal(game.interestGain(), dm.interestMultiplier * Math.min(5, Math.floor(50 / 10)), rule + ' interestGain follows modifiers');
  }

  // Battle-unit multipliers: enemy +12% (armor), enemy +15% pressure window (march), ally -25%/+25% (glass), mana 75 (drought).
  A.newGame({ daily: true });
  const probeDef = A.UNITS.find(u => !u.big);
  const probe = { uid: 1, id: probeDef.id, star: 1, sks: 1, hp: 1000, maxhp: 1000, atk: 50, items: [] };
  A.S.dailyCurse = stateFor('dc_nointerest');
  const b0 = A.makeBattleUnit({ ...probe }, 0, 0, 0), b1 = A.makeBattleUnit({ ...probe }, 1, 0, 0);
  assert.equal(b0.maxmana, 50, 'own mana cost stays 50 outside drought');
  A.S.dailyCurse = stateFor('dc_armor');
  const armored = A.makeBattleUnit({ ...probe }, 1, 0, 0);
  assert.equal(armored.maxhp, Math.round(b1.maxhp * 1.12), 'armor enemy hp +12%');
  assert.equal(armored.atk, Math.round(b1.atk * 1.12), 'armor enemy atk +12%');
  A.S.dailyCurse = stateFor('dc_march');
  A.S.round = 22;
  const marched = A.makeBattleUnit({ ...probe }, 1, 0, 0);
  assert.equal(marched.maxhp, Math.round(b1.maxhp * 1.15), 'march pressure window enemy hp +15%');
  A.S.round = 2;
  const calm = A.makeBattleUnit({ ...probe }, 1, 0, 0);
  assert.equal(calm.maxhp, b1.maxhp, 'march outside the pressure window leaves enemies untouched');
  A.S.dailyCurse = stateFor('dc_glass');
  const glassy = A.makeBattleUnit({ ...probe }, 0, 0, 0);
  assert.equal(glassy.maxhp, Math.round(b0.maxhp * 0.75), 'glass ally hp -25%');
  assert.equal(glassy.atk, Math.round(b0.atk * 1.25), 'glass ally atk +25%');
  A.S.dailyCurse = stateFor('dc_drought');
  assert.equal(A.makeBattleUnit({ ...probe }, 0, 0, 0).maxmana, 75, 'drought own mana cost 75');

  // Per-rule event machines through the real dailyEvent bridge.
  A.newGame({ daily: true });
  A.S.dailyCurse = stateFor('dc_market');
  assert.equal(game.refreshCost(), 0, 'market first refresh is free');
  A.dailyEvent('refresh');
  assert.equal(game.refreshCost(), 2, 'market second refresh costs the normal 2');
  A.dailyEvent('refresh');
  assert.equal(game.refreshCost(), 3, 'market third refresh costs 3');

  A.newGame({ daily: true });
  A.S.dailyCurse = stateFor('dc_seal');
  A.dailyEvent('roundStart');
  assert.ok(A.S.dailyCurse.seal && game.nbList().includes(A.S.dailyCurse.seal), 'seal joins the shared bond-ban list');
  assert.equal(game.refreshCost(), 0, 'seal round grants the free refresh');

  A.newGame({ daily: true });
  A.S.dailyCurse = stateFor('dc_debt');
  A.S.hp = game.hpMax();   // debt caps max hp at 30
  A.S.round = 5; A.S.gold = 100;
  assert.ok(A.dailyEvent('roundStart'));
  assert.equal(A.S.gold, 98, 'debt pays 4 and refunds 2 on time');
  A.dailyEvent('roundStart');
  assert.equal(A.S.gold, 98, 'debt events are idempotent per round');
  A.S.round = 10; A.S.gold = 0;
  const hpBefore = A.S.hp;
  assert.ok(A.dailyEvent('roundStart'));
  assert.equal(A.S.hp, hpBefore - 3, 'unpaid debt costs 3 life');

  A.newGame({ daily: true });
  A.S.dailyCurse = stateFor('dc_fog');
  A.S.round = 5;
  A.dailyEvent('roundStart');
  assert.equal(A.enemyHidden(), true, 'fog hides the prep enemy preview');
  assert.equal(A.S.tempBuff, 'hp', 'fog grants the round-limited free temp buff');

  A.newGame({ daily: true });
  A.S.dailyCurse = stateFor('dc_nointerest');
  assert.equal(game.enemyHidden(), false, 'other rules keep the enemy preview visible');

  console.log('PASS daily campaign: four chapters, rewards, boss losses, completion, army scaling, deterministic restart/reload, custom boundaries, historical board isolation, daily v2 effect wiring');
};
