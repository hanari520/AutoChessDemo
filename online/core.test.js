import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advancePhase, viewFor, stateHash } from './core.js';

const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
const game = seed => createGame({ seed, players });
const serialized = value => JSON.stringify(value);

function ownedCount(state, id) {
  return state.seats.reduce((n, s) => n + [...s.shop, ...s.bench, ...s.board]
    .filter(u => u?.id === id).reduce((m, u) => m + 3 ** (u.star - 1), 0), 0);
}
function assertPool(state, stock) {
  for (const [id, initial] of Object.entries(stock)) {
    const remaining = state.pool[id];
    assert.ok(Number.isInteger(remaining) && remaining >= 0, `negative pool ${id}`);
    assert.equal(remaining + ownedCount(state, id), initial, id);
  }
}

test('seed replay, eight seats and private shop/bench', () => {
  const a = game(12345), b = game(12345);
  assert.equal(stateHash(a), stateHash(b));
  assert.equal(a.seats.length, 8);
  assert.equal(a.pairings.length, 4);
  assert.equal(new Set(a.pairings.flatMap(p => [p.a, p.b])).size, 8);
  const own = viewFor(a, 0), other = viewFor(a, 1);
  assert.equal(own.me.shop.length, 5);
  assert.equal(other.me.shop.length, 5);
  assert.equal(own.players[1].shop, undefined);
  assert.equal(own.players[1].bench, undefined);
  assert.equal(own.players[1].gold, undefined);
  assert.equal(serialized(own).includes('"pool"'), false);
  assert.equal(Object.keys(a.pool).length, 50);
  assert.equal(own.ruleset, 'deterministic-battle-v3');
  assert.equal(own.me.items.length, 1);
  assert.equal(own.players[1].items, undefined);
});

test('buy, move, sell conserve shared stock and reject invalid operations atomically', () => {
  const s = game(77), me = s.seats[0], slot = me.shop.findIndex(Boolean);
  const card = me.shop[slot], before = s.pool[card.id];
  const bought = applyAction(s, 0, { type: 'buy', slot });
  assert.equal(bought.me.gold, 5 - card.cost);
  assert.equal(me.shop[slot], null);
  assert.equal(s.pool[card.id], before);
  assert.equal(ownedCount(s, card.id) + s.pool[card.id], { 1: 50, 2: 40, 3: 30, 4: 20, 5: 10 }[card.cost]);
  const uid = me.bench.find(Boolean).uid;
  const firstItem = me.items[0];
  applyAction(s, 0, { type: 'equip', uid, itemIndex: 0 });
  assert.equal(me.bench.find(Boolean).items[0], firstItem);
  assert.equal(me.items.length, 0);
  applyAction(s, 0, { type: 'move', uid, to: { zone: 'board', slot: 0 } });
  assert.equal(me.board[0].uid, uid);
  const snapshot = serialized(s);
  assert.throws(() => applyAction(s, 0, { type: 'buy', slot }), /Empty shop slot/);
  assert.throws(() => applyAction(s, 0, { type: 'move', uid: 9999, to: { zone: 'board', slot: 1 } }), /not owned/);
  assert.equal(serialized(s), snapshot);
  applyAction(s, 0, { type: 'sell', uid });
  assert.equal(me.board[0], null);
  assert.equal(s.pool[card.id], before + 1);
  assert.equal(me.items[0], firstItem);
});

test('phase progression, combat, income, ready lock and end by 40 rounds', () => {
  const s = game(99);
  applyAction(s, 0, { type: 'ready' });
  assert.throws(() => applyAction(s, 0, { type: 'reroll' }), /ready/);
  assert.equal(advancePhase(s), 'combat');
  assert.throws(() => applyAction(s, 1, { type: 'ready' }), /Not in preparation/);
  assert.equal(advancePhase(s), 'result');
  assert.equal(s.results.length, 4);
  assert.ok(s.results.every(r => Number.isInteger(r.damage) && r.damage >= 0));
  assert.equal(advancePhase(s), 'prep');
  assert.equal(s.round, 2);
  assert.equal(s.seats[0].ready, false);
  assert.ok(s.seats[0].gold >= 10);
  for (let n = 0; !s.complete && n < 120; n++) {
    advancePhase(s); advancePhase(s); advancePhase(s);
  }
  assert.equal(s.complete, true);
  assert.equal(s.phase, 'over');
  assert.ok(s.seats.every(x => x.place !== null || x.alive));
  assert.throws(() => advancePhase(s), /Game complete/);
});

test('combat phase resolves deterministic battles with skill events on the server', () => {
  const arrange = () => {
    const s = game('skills-on');
    const { a, b } = s.pairings[0];
    const unit = (uid) => ({ id: 'kroya', name: '克罗娅', cost: 4, fac: '学园', job: '法师',
      hp: 46, atk: 16, uid, star: 1, items: [] });
    s.seats[a].board[0] = unit(`a-${a}`);
    s.seats[b].board[0] = unit(`b-${b}`);
    return { s, a, b };
  };
  const left = arrange(), right = arrange();
  assert.equal(advancePhase(left.s), 'combat');
  assert.equal(advancePhase(right.s), 'combat');
  assert.equal(stateHash(left.s), stateHash(right.s));
  assert.equal(left.s.battles.length, 4);
  const battle = left.s.battles.find(x => x.a === left.a || x.b === left.a);
  assert.ok(battle.events.some(event => event.type === 'cast'), 'unit skill should resolve before result phase');
  assert.ok(battle.events.some(event => event.type === 'attack'));
  assert.equal(viewFor(left.s, left.a).battles.length, 1);
  assert.ok(viewFor(left.s, left.a).battles[0].events.length > 0);
  const spectatorSeat = left.s.seats.find(seat => seat.seat !== left.a && seat.seat !== left.b).seat;
  left.s.seats[spectatorSeat].alive = false;
  assert.equal(viewFor(left.s, spectatorSeat).battles.length, 4, 'eliminated seats can spectate every match');
  const battleCount = left.s.battles.length;
  viewFor(left.s, spectatorSeat).battles[0].events.push({type:'tamper'});
  assert.equal(left.s.battles.length, battleCount);
  assert.equal(left.s.battles[0].events.some(event => event.type === 'tamper'), false, 'battle logs are copied before sending to clients');
  assert.equal(advancePhase(left.s), 'result');
  assert.equal(left.s.results.length, 4);
  assert.ok(left.s.results.every(result => result.battle && Number.isInteger(result.battle.durationMs) && result.winner !== null));
});

test('same command log produces identical combat and pool state', () => {
  const run = () => {
    const s = game('replay-A');
    for (let i = 0; i < 8; i++) {
      const slot = s.seats[i].shop.findIndex(u => u && u.cost <= 5);
      if (slot >= 0) {
        applyAction(s, i, { type: 'buy', slot });
        const uid = s.seats[i].bench.find(Boolean).uid;
        applyAction(s, i, { type: 'move', uid, to: { zone: 'board', slot: 0 } });
      }
    }
    for (let round = 0; round < 4 && !s.complete; round++) {
      advancePhase(s); advancePhase(s); advancePhase(s);
    }
    return s;
  };
  assert.equal(stateHash(run()), stateHash(run()));
});

test('rerolls and elimination return every copy to the finite shared pool', () => {
  const s = game(2301);
  const stock = Object.fromEntries(Object.keys(s.pool).map(id => [id, s.pool[id] + ownedCount(s, id)]));
  assertPool(s, stock);
  for (let n = 0; n < 3; n++) {
    for (let seat = 0; seat < 8; seat++) applyAction(s, seat, { type: 'reroll' });
    assertPool(s, stock);
    advancePhase(s); advancePhase(s); advancePhase(s);
    assertPool(s, stock);
  }
  while (!s.complete) {
    advancePhase(s); advancePhase(s); advancePhase(s);
    assertPool(s, stock);
  }
});

test('three matching copies fuse and selling upgraded unit returns three cards', () => {
  const s = game(818), seat = s.seats[0], target = 'ein';
  const initial = s.pool[target] + ownedCount(s, target);
  seat.gold = 1000; // Focus this test on card accounting, not economy duration.
  let bought = 0;
  for (let attempt = 0; attempt < 200 && bought < 3; attempt++) {
    for (let slot = 0; slot < seat.shop.length && bought < 3; slot++) {
      if (seat.shop[slot]?.id === target) {
        applyAction(s, 0, { type: 'buy', slot });
        bought++;
      }
    }
    if (bought < 3) applyAction(s, 0, { type: 'reroll' });
  }
  assert.equal(bought, 3);
  const upgraded = [...seat.bench, ...seat.board].find(u => u?.id === target && u.star === 2);
  assert.ok(upgraded);
  assert.equal(s.pool[target] + ownedCount(s, target), initial);
  applyAction(s, 0, { type: 'sell', uid: upgraded.uid });
  assert.equal(s.pool[target] + ownedCount(s, target), initial);
  assert.equal([...seat.bench, ...seat.board].some(u => u?.id === target), false);
});

test('board population cannot exceed level and views cannot mutate room inventory', () => {
  const s = game(402), seat = s.seats[0];
  seat.gold = 100;
  for (let n = 0; n < 3; n++) {
    const slot = seat.shop.findIndex(Boolean);
    assert.ok(slot >= 0);
    applyAction(s, 0, { type: 'buy', slot });
  }
  const ids = seat.bench.filter(Boolean).map(u => u.uid);
  applyAction(s, 0, { type: 'move', uid: ids[0], to: { zone: 'board', slot: 0 } });
  applyAction(s, 0, { type: 'move', uid: ids[1], to: { zone: 'board', slot: 1 } });
  const before = serialized(s);
  assert.throws(() => applyAction(s, 0, { type: 'move', uid: ids[2], to: { zone: 'board', slot: 2 } }), /Board level limit/);
  assert.equal(serialized(s), before);
  const view = viewFor(s, 0);
  view.me.items.push('sword');
  view.me.board[0].items.push('armor');
  assert.equal(seat.items.length, 1);
  assert.equal(seat.board[0].items.length, 0);
});
