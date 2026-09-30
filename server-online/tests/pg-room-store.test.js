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

test('PostgreSQL restore drops an unrecoverable snapshot instead of failing startup', async () => {
  const operations = [];
  const database = { rpc(name, args) {
    operations.push({ operation: args.p_operation, code: args.p_code });
    return { abortSignal() { return Promise.resolve({ error: null, data:
      args.p_operation === 'acquire' ? { epoch: 1, rooms: ['TEST123', 'GOOD1234'] } :
      args.p_operation === 'load' ? { snapshot: args.p_code === 'TEST123' ? '{"code":"OTHER123"}' : JSON.stringify({ code: 'GOOD1234', players: [] }) } : {},
    }); } };
  } };
  const store = new PgRoomStore({ database });
  const rooms = await store.open();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].code, 'GOOD1234');
  assert.ok(operations.some(entry => entry.operation === 'remove' && entry.code === 'TEST123'), 'corrupt room is dropped from storage');
  assert.equal(store.health().healthy, true);
  await store.close();
});
