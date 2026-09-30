import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advancePhase } from '../src/core.js';

const players = () => Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }));
const unit = (uid, id, star = 1, items = []) => ({ uid, id, star, items, cost: 0 });
// Real roster entries: two 深海 cost-2 units and one 夜幕 cost-4 unit.
const deepA = { uid: 101, id: 'yuji', star: 1, items: [], name: '雨纪', cost: 2, fac: '深海', job: '游侠', hp: 46, atk: 10 };
const deepB = { uid: 102, id: 'pako', star: 1, items: [], name: '帕可', cost: 2, fac: '深海', job: '医者', hp: 50, atk: 9 };
const nightBlade = { uid: 103, id: 'miyue', star: 1, items: [], name: '蜜月', cost: 4, fac: '夜幕', job: '刀客', hp: 60, atk: 12 };

test('autoDeploy is bond-aware like the classic lineup scorer', () => {
  const game = createGame({ seed: 'deploy', players: players() });
  const seat = game.seats[0];
  seat.gold = 0; seat.items = [];
  seat.bench = [{ ...deepA }, { ...deepB }, { ...nightBlade }];
  seat.board = Array(64).fill(null);
  applyAction(game, 0, { type: 'autoDeploy' });
  const names = seat.board.filter(Boolean).map(u => u.id).sort();
  assert.deepEqual(names, ['pako', 'yuji'], 'bond pair beats the lone stronger unit');
  const benchIds = seat.bench.filter(Boolean).map(u => u.id);
  assert.deepEqual(benchIds, ['miyue']);
});

test('unequip removes a single worn item when an index is given', () => {
  const game = createGame({ seed: 'unequip', players: players() });
  const seat = game.seats[0];
  seat.items = [];
  seat.bench[0] = { ...deepA, items: ['sword', 'bow'] };
  applyAction(game, 0, { type: 'unequip', uid: 101, index: 1 });
  assert.deepEqual(seat.bench[0].items, ['sword']);
  assert.deepEqual(seat.items, ['bow']);
  applyAction(game, 0, { type: 'unequip', uid: 101 });
  assert.deepEqual(seat.bench[0].items, []);
  assert.deepEqual(seat.items, ['bow', 'sword']);
});

test('reroll is a no-op while the shop is locked', () => {
  const game = createGame({ seed: 'reroll', players: players() });
  const seat = game.seats[0];
  seat.gold = 20;
  const before = seat.shop.map(u => u?.uid);
  applyAction(game, 0, { type: 'lockShop' });
  const view = applyAction(game, 0, { type: 'reroll' });
  assert.equal(seat.gold, 20, 'no gold spent');
  assert.deepEqual(seat.shop.map(u => u?.uid), before, 'shop untouched');
  assert.equal(view.me.shopLocked, true);
  applyAction(game, 0, { type: 'lockShop' });
  applyAction(game, 0, { type: 'reroll' });
  assert.equal(seat.gold, 18, 'reroll charges after unlocking');
});

test('buyXp is blocked in round 1 and allowed afterwards', () => {
  const game = createGame({ seed: 'xp', players: players() });
  const seat = game.seats[0];
  seat.gold = 10;
  assert.throws(() => applyAction(game, 0, { type: 'buyXp' }), /首回合/);
  game.round = 2;
  applyAction(game, 0, { type: 'buyXp' });
  assert.equal(seat.gold, 5);
  assert.equal(seat.level, 4, '4 xp chains level-ups 2→3→4');
});

test('opening offer: pick one free, others return to the pool, auto-grant covers stragglers', () => {
  const game = createGame({ seed: 'opening', players: players() });
  for (const seat of game.seats) {
    assert.ok(Array.isArray(seat.openingOffer) && seat.openingOffer.length === 3, 'three choices offered');
    assert.ok(seat.openingOffer.every(u => u.cost <= 2), 'cheap units only');
  }
  const seat = game.seats[0];
  const offered = seat.openingOffer.map(u => u.id);
  const poolBefore = offered.map(id => game.pool[id]);
  const wanted = seat.openingOffer[1];
  applyAction(game, 0, { type: 'pickOpening', slot: 1 });
  assert.ok(seat.bench.some(u => u.uid === wanted.uid), 'picked unit joins the bench');
  assert.equal(seat.openingOffer, null);
  assert.throws(() => applyAction(game, 0, { type: 'pickOpening', slot: 0 }), /expired/);
  const poolAfter = offered.map(id => game.pool[id]);
  offered.forEach((id, i) => {
    const back = id === wanted.id ? 0 : 1;
    assert.equal(poolAfter[i], poolBefore[i] + back, 'unpicked copies return to the pool');
  });
  advancePhase(game);   // prep → combat: stragglers get the first card
  assert.ok(game.seats[1].openingGranted && game.seats[1].bench.length > 0, 'auto-grant at battle start');
});

test('first-time bond tiers pay +1 gold at round income', () => {
  const game = createGame({ seed: 'synreward', players: players() });
  for (const seat of game.seats) { seat.gold = 0; seat.items = []; seat.openingOffer = null; seat.openingGranted = true; }
  game.seats[0].board = Array(64).fill(null);
  game.seats[0].board[40] = { ...deepA };
  game.seats[0].board[41] = { ...deepB };
  game.phase = 'result';
  advancePhase(game);   // result → prep round 2 with income
  assert.equal(game.round, 2);
  const bonded = game.seats[0];
  assert.ok(bonded.synDone.includes('深海:1'), 'tier key recorded');
  const plain = game.seats[1];
  assert.equal(bonded.gold - plain.gold, 1, 'bond reward is exactly +1 over base income');
});
