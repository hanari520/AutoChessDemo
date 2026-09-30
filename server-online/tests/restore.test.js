import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../src/rooms.js';
import { MemoryRoomStore } from '../src/room-store.js';

// Restore must isolate snapshots that can never be recovered instead of
// failing startup: one leftover old-ruleset room (e.g. after a crash plus a
// rules upgrade) or one corrupt entry must not crash-loop the whole service.
function waitingRoom(code) {
  return {
    code, status: 'waiting', hostSeat: 0, createdAt: Date.now(), deadline: null, finishedAt: null, game: null,
    players: [{ seat: 0, id: 'p0', name: '房主', tokenHash: 'a'.repeat(64), ready: false, lastSeq: 0, lastActionId: null }],
  };
}

test('restore quarantines invalid and unsupported snapshots and keeps healthy rooms', async t => {
  const store = new MemoryRoomStore();
  store.rooms.set('GOODABCD', waitingRoom('GOODABCD'));
  const legacy = waitingRoom('OLDRULE1');
  legacy.status = 'playing';
  legacy.game = { version: 1, ruleset: 'deterministic-battle-v5', phase: 'prep' };   // pre-v6 rules: unloadable
  store.rooms.set('OLDRULE1', legacy);
  store.rooms.set('JUNKROOM', null);   // structurally invalid entry
  const manager = new RoomManager(store);
  t.after(() => { for (const entry of manager.rooms.values()) entry.destroy(); });
  await manager.restore();
  assert.deepEqual([...manager.rooms.keys()], ['GOODABCD']);
  assert.equal(store.rooms.has('OLDRULE1'), false, 'unsupported room dropped from storage');
  assert.equal(store.rooms.has('GOODABCD'), true);
});
