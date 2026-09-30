import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudBaseRoomStore } from '../src/cloudbase-store.js';

// A serial transactional database with the Node SDK doc result shapes. Writes
// become visible only at commit, so failures must leave both fence and room intact.
function database() {
  const documents = new Map();
  let tail = Promise.resolve();
  return {
    documents, failWrite: false,
    runTransaction(callback) {
      const job = tail.then(async () => {
        const staged = new Map(structuredClone([...documents]));
        const result = await callback({collection: name => ({doc: id => ({
          get: async () => ({data: staged.get(`${name}/${id}`) ?? null}),
          set: async value => {
            if (this.failWrite) return {code: 'DATABASE_REQUEST_FAILED'};
            staged.set(`${name}/${id}`, structuredClone(value)); return {updated:1};
          },
          remove: async () => { staged.delete(`${name}/${id}`); return {deleted:1}; },
        })})});
        documents.clear(); for (const pair of staged) documents.set(...pair);
        return result;
      });
      tail = job.catch(() => {});
      return job;
    },
  };
}

test('CloudBase snapshots survive owner handoff and removed rooms do not resurrect', async t => {
  const db = database();
  const first = new CloudBaseRoomStore({database:db});
  assert.deepEqual(await first.open(), []);
  await first.save({code:'ABCDEFGH', players:[{tokenHash:'digest', lastSeq:4}], game:{phase:'prep',round:2}});
  await first.save({code:'JKLMNPQR', players:[]});
  await first.remove('JKLMNPQR');
  await first.close();
  const second = new CloudBaseRoomStore({database:db}); t.after(() => second.close());
  const rooms = await second.open();
  assert.equal(rooms.length, 1); assert.equal(rooms[0].players[0].lastSeq, 4);
  assert.equal(rooms[0].game.round, 2);
});

test('overlapping deployment is rejected and expired owner cannot write after takeover', async t => {
  const db = database(); let time = 100_000;
  const options = {database:db, leaseMs:60_000, now:()=>time};
  const old = new CloudBaseRoomStore(options); await old.open();
  const blocked = new CloudBaseRoomStore(options);
  await assert.rejects(blocked.open(), /Another room service/);
  clearTimeout(old.timer); // simulate crashed process: no heartbeat or close
  time += 60_001;
  const replacement = new CloudBaseRoomStore(options); await replacement.open();
  t.after(() => replacement.close());
  await replacement.save({code:'ABCDEFGH', value:'new-owner'});
  await assert.rejects(old.save({code:'ABCDEFGH',value:'stale-owner'}), /writes stopped/);
  await old.close();
  assert.equal(replacement.health().healthy, true);
  assert.equal(JSON.parse(db.documents.get('online_room_state/room-ABCDEFGH').snapshot).value, 'new-owner');
});

test('failed CloudBase transaction preserves saved state and blocks later writes', async () => {
  const db = database(); const store = new CloudBaseRoomStore({database:db}); await store.open();
  await store.save({code:'ABCDEFGH', value:1}); db.failWrite = true;
  await assert.rejects(store.save({code:'ABCDEFGH', value:2}), /writes stopped/);
  assert.equal(JSON.parse(db.documents.get('online_room_state/room-ABCDEFGH').snapshot).value, 1);
  assert.equal(store.health().healthy, false);
  await assert.rejects(store.save({code:'ABCDEFGH', value:3}), /unavailable/);
  db.failWrite = false; await store.close();
});
