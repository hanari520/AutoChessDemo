import test from 'node:test';
import assert from 'node:assert/strict';
import { PgRoomStore } from '../src/pg-room-store.js';

test('PostgreSQL request errors fail closed and release preserves the owner fence', async () => {
  const calls = [];
  const database = { rpc(name, args) {
    calls.push({ name, args });
    return { abortSignal(signal) {
      assert.ok(signal instanceof AbortSignal);
      if (args.p_operation === 'acquire') return Promise.resolve({ data: { epoch: 7, rooms: [] }, error: null });
      if (args.p_operation === 'save') return Promise.resolve({ data: null, error: { code: 'storage_outage' } });
      return Promise.resolve({ data: {}, error: null });
    } };
  } };
  const store = new PgRoomStore({ database });
  await store.open();
  await assert.rejects(store.save({ code: 'TEST123' }), /writes stopped/);
  assert.equal(store.health().healthy, false);
  const count = calls.length;
  await assert.rejects(store.save({ code: 'TEST123' }), /unavailable/);
  assert.equal(calls.length, count);
  await store.close();
  assert.equal(calls.at(-1).args.p_operation, 'release');
  assert.equal(calls.at(-1).args.p_epoch, 7);
  assert.equal(calls.at(-1).args.p_owner, calls[0].args.p_owner);
});

test('PostgreSQL restore rejects a snapshot with a different room identity', async () => {
  const database = { rpc(name, args) {
    return { abortSignal() { return Promise.resolve({ error: null, data:
      args.p_operation === 'acquire' ? { epoch: 1, rooms: ['TEST123'] } :
      args.p_operation === 'load' ? { snapshot: '{"code":"OTHER123"}' } : {},
    }); } };
  } };
  const store = new PgRoomStore({ database });
  await assert.rejects(store.open(), /identity mismatch/);
  assert.equal(store.health().healthy, false);
});
