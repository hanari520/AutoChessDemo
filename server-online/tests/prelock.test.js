import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createGame, applyAction, advancePhase, viewFor, autoLockForBattle, prepareBattles, PRELOCK_LEAD_MS } from '../src/core.js';
import { RoomManager } from '../src/rooms.js';

const players = () => Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }));

test('ready toggles on and off until the pre-lock freezes lineups', () => {
  const game = createGame({ seed: 'toggle', players: players() });
  let view = applyAction(game, 0, { type: 'ready', ready: true });
  assert.equal(view.players[0].ready, true);
  view = applyAction(game, 0, { type: 'ready', ready: false });
  assert.equal(view.players[0].ready, false, 'unlock restores prep actions');

  applyAction(game, 0, { type: 'ready', ready: true });
  autoLockForBattle(game);
  assert.throws(() => applyAction(game, 0, { type: 'ready', ready: false }), /locked/);
  assert.throws(() => applyAction(game, 1, { type: 'reroll' }), /locked/, 'every action freezes');
});

test('prepareBattles precomputes replays while still in prep; advancePhase reuses them', () => {
  const game = createGame({ seed: 'precompute', players: players() });
  assert.equal(game.battles.length, 0);
  assert.equal(prepareBattles(game), false, 'precompute requires the auto-lock first');
  autoLockForBattle(game);
  assert.equal(prepareBattles(game), true);
  assert.equal(game.phase, 'prep', 'phase stays prep during the window');
  assert.equal(game.battles.length, game.pairings.length);
  assert.throws(() => applyAction(game, 0, { type: 'reroll' }), /locked/);

  const snapshot = JSON.stringify(game.battles);
  advancePhase(game);
  assert.equal(game.phase, 'combat');
  assert.equal(JSON.stringify(game.battles), snapshot, 'precomputed battles are reused, not rerun');
});

test('autoLockForBattle readies everyone and advancePhase resets for the next prep', () => {
  const game = createGame({ seed: 'autolock', players: players() });
  game.seats[3].ready = false;
  assert.equal(autoLockForBattle(game), true);
  assert.equal(game.autoLocked, true);
  assert.ok(game.seats.every(seat => !seat.alive || seat.ready), 'alive seats ready');

  advancePhase(game); // prep → combat (battles resolve here since none precomputed)
  advancePhase(game); // combat → result
  advancePhase(game); // result → next prep
  assert.equal(game.phase, 'prep');
  assert.equal(game.autoLocked, false, 'next prep unlocks');
  assert.equal(game.battles.length, 0);
  assert.equal(viewFor(game, 0).autoLocked, false);
});

class Socket extends EventEmitter {
  messages = [];
  send(value) { this.messages.push(JSON.parse(value)); }
  close(code) { this.code = code; this.emit('close'); }
  receive(value) { this.emit('message', JSON.stringify(value)); }
}

test('room pre-lock fires inside the lead window and broadcasts frozen state', t => {
  const manager = new RoomManager();
  t.after(() => { for (const entry of manager.rooms.values()) entry.destroy(); });
  const owner = manager.create('LOCKDOWN', '房主');
  const entry = manager.get(owner.code);
  const ws = new Socket();
  entry.attach(ws);
  ws.receive({ type: 'auth', token: owner.token });
  entry.addBot(owner.token); entry.addBot(owner.token); entry.addBot(owner.token);
  entry.addBot(owner.token); entry.addBot(owner.token); entry.addBot(owner.token);
  entry.addBot(owner.token);
  ws.receive({ type: 'ready', ready: true });   // last human ready triggers the start check
  // The room starts once every human is ready and connected; real prep phase is 25s.
  assert.equal(entry.room.status, 'playing', '1 human + 7 bots auto-starts the game');
  entry.room.deadline = Date.now() + 100;   // inside the 5s pre-lock window
  entry.tick();
  assert.equal(entry.room.status, 'playing');
  assert.equal(entry.room.game.phase, 'prep', 'pre-lock keeps the prep phase');
  assert.equal(entry.room.game.autoLocked, true, 'auto-lock engaged');
  assert.ok(entry.room.game.battles.length > 0, 'battles precomputed');
  const last = ws.messages.findLast(m => m.type === 'state');
  assert.equal(last.view.autoLocked, true);
  assert.ok(last.view.battles.length > 0, 'precomputed battles are broadcast during prep');
  const precomputed = JSON.stringify(entry.room.game.battles);
  entry.room.deadline = Date.now() - 1;
  entry.tick();
  assert.equal(entry.room.game.phase, 'combat');
  assert.equal(JSON.stringify(entry.room.game.battles), precomputed, 'combat flip reuses precomputed replays');
});
