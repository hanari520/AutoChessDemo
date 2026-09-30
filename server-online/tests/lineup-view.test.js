import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advancePhase, viewFor } from '../src/core.js';

const players = () => Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }));

test('views expose only the lineup locked for the previous round', () => {
  const game = createGame({ seed: 'lineup-view', players: players() });

  // Round 1 prep: no battle fought yet, other seats expose no lineup.
  game.seats[1].board[0] = { uid: 900, id: 'ein', star: 1, cost: 1, items: [] };
  let view = viewFor(game, 0);
  assert.equal(view.players[1].board.filter(Boolean).length, 0, 'no lineup before the first battle');
  assert.equal(view.me.board.length, 64, 'own board stays live for the actor');

  advancePhase(game); // prep → combat: lineups lock and become public intel
  view = viewFor(game, 0);
  assert.ok(view.players[1].board[0], 'locked lineup visible once combat starts');

  advancePhase(game); // combat → result
  advancePhase(game); // result → next round prep (income, reroll)

  // Round 2 prep: seat 1 rearranges; seat 0 still sees the round-1 snapshot only.
  game.seats[1].board[0] = null;
  game.seats[1].board[1] = { uid: 901, id: 'ein', star: 1, cost: 1, items: [] };
  view = viewFor(game, 0);
  assert.ok(view.players[1].board[0], 'previous-round lineup retained');
  assert.equal(view.players[1].board[1], null, 'live rearrangement not exposed to others');
  assert.ok(view.me.board.length === 64, 'own board still live');
});
