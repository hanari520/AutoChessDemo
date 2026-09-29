import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, advancePhase, viewFor } from '../src/core.js';
import { BOT_NAMES, botPolicy, pickBotName } from '../src/bots.js';

test('bot name pool serves unused names first and numbers repeats', () => {
  assert.equal(pickBotName([]), '阿铁');
  assert.equal(pickBotName(['阿铁']), '阿芯');
  assert.equal(pickBotName([...BOT_NAMES.slice(0, 3)]), BOT_NAMES[3]);
  assert.equal(pickBotName([...BOT_NAMES]), '阿铁2');
  assert.equal(pickBotName([...BOT_NAMES, '阿铁2']), '阿芯2');
});

test('bot decisions are deterministic for a given game seed', () => {
  const players = Array.from({ length: 8 }, (_, i) =>
    (i === 0 ? { id: 'p0', name: '人类' } : { id: `b${i}`, name: `机器人${i}`, bot: true }));
  const run = () => {
    const game = createGame({ seed: 'determinism', players });
    for (let seat = 1; seat < 8; seat++) botPolicy(game, seat);
    return JSON.stringify(game);
  };
  assert.equal(run(), run());
});

test('bots play a full game to completion without escaping errors', () => {
  const players = Array.from({ length: 8 }, (_, i) =>
    (i === 0 ? { id: 'p0', name: '人类' } : { id: `b${i}`, name: `机器人${i}`, bot: true }));
  const game = createGame({ seed: 'bots-full-game', players });

  // The bot flag is passed through the rules core for presentation.
  assert.ok(game.seats.slice(1).every(seat => seat.bot === true));
  assert.equal(game.seats[0].bot, false);
  assert.equal(viewFor(game, 0).players[5].bot, true);
  assert.equal(viewFor(game, 0).players[0].bot, false);

  let castEvents = 0;
  let rounds = 0;

  const humanPlays = () => {
    const seat = game.seats[0];
    if (!seat.alive || seat.ready) return;
    const slot = seat.shop.findIndex(unit => unit && unit.cost <= seat.gold && seat.bench.includes(null));
    if (slot >= 0) applyAction(game, 0, { type: 'buy', slot });
    const benchUnit = seat.bench.find(Boolean);
    if (benchUnit && seat.board.filter(Boolean).length < Math.min(8, seat.level)) {
      applyAction(game, 0, { type: 'move', uid: benchUnit.uid, to: { zone: 'board', slot: seat.board.indexOf(null) } });
    }
    applyAction(game, 0, { type: 'ready' });
  };

  while (!game.complete && rounds < 60) {
    rounds++;
    for (let seat = 1; seat < 8; seat++) botPolicy(game, seat);

    if (rounds === 1) {
      // Every bot bought and deployed during the opening prep window.
      for (let seat = 1; seat < 8; seat++) {
        assert.ok(game.seats[seat].board.filter(Boolean).length >= 1, `bot ${seat} deployed a unit`);
        assert.ok(game.seats[seat].gold < 5, `bot ${seat} spent opening gold`);
        assert.equal(game.seats[seat].ready, true, `bot ${seat} locked in`);
      }
    }

    humanPlays();
    assert.equal(advancePhase(game), 'combat');
    castEvents += game.battles.reduce((count, battle) =>
      count + battle.events.filter(event => event.type === 'cast').length, 0);
    assert.equal(advancePhase(game), 'result');
    advancePhase(game);
  }

  assert.equal(game.complete, true);
  assert.equal(game.phase, 'over');
  assert.ok(rounds <= 40, `game ended within the 40-round cap (took ${rounds})`);
  assert.ok(game.seats.every(seat => Number.isInteger(seat.place) && seat.place >= 1 && seat.place <= 8),
    'all eight seats are ranked');
  // Simultaneous eliminations share a place (see settleCombat), so the places
  // are a non-strict ranking rather than a permutation of 1..8.
  assert.equal(game.seats.filter(seat => seat.place === 1).length, 1, 'exactly one winner');
  assert.ok(castEvents > 0, 'skills were cast across the game');
  assert.ok(game.seats.slice(1).some(seat => seat.wins > 0), 'bots won battles');
});
