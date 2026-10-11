import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from './storage.mjs';
import { exportSave, importSave, parseSaveImport } from './save-transfer.mjs';

const STORE_NAMES = ['gameSaves', 'completions', 'collectibles', 'corruptSaves'];
const clone = (value) => structuredClone(value);

function createMemoryTransactionRunner() {
  const stores = new Map(STORE_NAMES.map((name) => [name, new Map()]));
  let writeChain = Promise.resolve();
  let failedWritesRemaining = 0;

  function execute(storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      const writable = mode === 'readwrite';
      const working = new Map();
      for (const name of storeNames) {
        const original = stores.get(name);
        if (!original) return reject(new Error(`Unknown test store: ${name}`));
        working.set(name, writable ? new Map([...original].map(([key, value]) => [key, clone(value)])) : original);
      }
      let pending = 0;
      let started = false;
      let hasResult = false;
      let result;
      let settled = false;
      const finishIfReady = () => {
        if (!settled && started && pending === 0) {
          settled = true;
          if (writable) for (const name of storeNames) stores.set(name, working.get(name));
          resolve(hasResult ? result : undefined);
        }
      };
      const api = {
        get(name, key, callback) {
          pending++;
          queueMicrotask(() => {
            try {
              callback(working.get(name).has(key) ? clone(working.get(name).get(key)) : null);
              pending--;
              finishIfReady();
            } catch (error) {
              settled = true;
              reject(error);
            }
          });
        },
        getAll(name, callback) {
          pending++;
          queueMicrotask(() => {
            try {
              callback([...working.get(name).values()].map(clone));
              pending--;
              finishIfReady();
            } catch (error) {
              settled = true;
              reject(error);
            }
          });
        },
        put(name, value) {
          if (!writable) throw new Error('Cannot write in a readonly transaction.');
          if (failedWritesRemaining > 0) {
            failedWritesRemaining--;
            throw new Error('Injected storage write failure.');
          }
          working.get(name).set(value.key, clone(value));
        },
      };
      try {
        work(api, (value) => {
          result = value;
          hasResult = true;
        });
        started = true;
        finishIfReady();
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
  }

  const runner = (storeNames, mode, work) => {
    const operation = writeChain.then(() => execute(storeNames, mode, work));
    writeChain = operation.then(() => undefined, () => undefined);
    return operation;
  };
  runner.seed = (storeName, key, value) => stores.get(storeName).set(key, clone(value));
  runner.entries = (storeName) => [...stores.get(storeName).entries()].map(([key, value]) => [key, clone(value)]);
  runner.failNextWrite = () => { failedWritesRemaining++; };
  return runner;
}

function envelope(gameId, revision, { slotId = 'main', saveVersion = '1' } = {}) {
  return {
    gameId,
    slotId,
    saveVersion,
    rulesVersion: '1',
    contentVersion: '1',
    revision,
    updatedAt: '2026-10-11T00:00:00.000Z',
    payload: { step: revision },
  };
}

test('saves are isolated by game and slot and advance by compare-and-swap revision', async () => {
  const runner = createMemoryTransactionRunner();
  const storage = createStorage({ transactionRunner: runner });
  assert.deepEqual(await storage.loadSave('alpha'), { ok: true, value: null });
  assert.equal((await storage.saveGame(envelope('alpha', 1), 0)).ok, true);
  assert.equal((await storage.saveGame(envelope('beta', 1), 0)).ok, true);
  assert.equal((await storage.saveGame(envelope('alpha', 1, { slotId: 'alternate' }), 0)).ok, true);
  assert.equal((await storage.loadSave('alpha')).value.gameId, 'alpha');
  assert.equal((await storage.loadSave('beta')).value.gameId, 'beta');
  assert.equal((await storage.loadSave('alpha', 'alternate')).value.slotId, 'alternate');
});

test('concurrent writers cannot silently replace the same revision', async () => {
  const runner = createMemoryTransactionRunner();
  const storage = createStorage({ transactionRunner: runner });
  await storage.saveGame(envelope('alpha', 1), 0);
  const outcomes = await Promise.all([
    storage.saveGame({ ...envelope('alpha', 2), payload: { writer: 'one' } }, 1),
    storage.saveGame({ ...envelope('alpha', 2), payload: { writer: 'two' } }, 1),
  ]);
  assert.equal(outcomes.filter((result) => result.ok).length, 1);
  assert.equal(outcomes.find((result) => !result.ok).error.code, 'REVISION_CONFLICT');
  assert.equal((await storage.loadSave('alpha')).value.revision, 2);
});

test('unsupported versions and failed writes preserve the last good save', async () => {
  const runner = createMemoryTransactionRunner();
  const writer = createStorage({ transactionRunner: runner });
  await writer.saveGame(envelope('alpha', 1), 0);
  const reader = createStorage({ transactionRunner: runner, supportedVersions: { alpha: { saveVersion: '2' } } });
  assert.equal((await reader.loadSave('alpha')).error.code, 'UNSUPPORTED_VERSION');
  assert.equal((await writer.loadSave('alpha')).value.revision, 1);

  runner.failNextWrite();
  const failed = await writer.saveGame(envelope('alpha', 2), 1);
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'STORAGE_WRITE_FAILED');
  assert.equal((await writer.loadSave('alpha')).value.revision, 1);
});

test('default game version policy only accepts the declared v1 envelope', async () => {
  const storage = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  assert.equal((await storage.saveGame(envelope('studio-manager', 1), 0)).ok, true);
  const futureVersion = await storage.saveGame({ ...envelope('studio-manager', 1), saveVersion: '2' }, 0);
  assert.equal(futureVersion.error.code, 'UNSUPPORTED_VERSION');
});

test('corrupt data is quarantined and the stored source is left intact', async () => {
  const runner = createMemoryTransactionRunner();
  const key = 'vtlib:alpha:main';
  const original = { key, gameId: 'alpha', slotId: 'main', envelope: { payload: 'broken' } };
  runner.seed('gameSaves', key, original);
  const storage = createStorage({ transactionRunner: runner });
  const loaded = await storage.loadSave('alpha');
  assert.equal(loaded.error.code, 'CORRUPT_SAVE');
  assert.deepEqual(runner.entries('gameSaves')[0][1], original);
  assert.equal(runner.entries('corruptSaves').length, 1);
  const backup = await exportSave('alpha', 'main', { storage });
  assert.equal(backup.ok, true);
  assert.equal(parseSaveImport(backup.value, { expectedGameId: 'alpha' }).error.code, 'CORRUPT_IMPORT');
});

test('missing IndexedDB returns a clear storage error instead of a fake success', async () => {
  const storage = createStorage({ indexedDB: null });
  const result = await storage.loadSave('alpha');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STORAGE_UNAVAILABLE');
});

test('save export/import validates JSON and game identity, then rebases revision', async () => {
  const directExport = exportSave(envelope('alpha', 1));
  assert.equal(directExport.ok, true);
  const source = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  const destination = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  await source.saveGame(envelope('alpha', 1), 0);
  const exported = await exportSave('alpha', 'main', { storage: source, now: () => new Date('2026-10-11T01:00:00.000Z') });
  assert.equal(exported.ok, true);
  assert.equal(parseSaveImport(exported.value, { expectedGameId: 'beta' }).error.code, 'GAME_ID_MISMATCH');
  assert.equal(parseSaveImport('{broken').error.code, 'INVALID_JSON');
  assert.equal((await importSave(exported.value, { storage: destination, expectedGameId: 'alpha', expectedRevision: 0, now: () => new Date('2026-10-11T02:00:00.000Z') })).value.revision, 1);
  assert.equal((await destination.loadSave('alpha')).value.updatedAt, '2026-10-11T02:00:00.000Z');
  assert.equal((await importSave(exported.value, { storage: destination, expectedGameId: 'alpha' })).error.code, 'INVALID_REVISION');
});

test('explicit recovery preserves the quarantine copy and replaces only the unchanged corrupt revision', async () => {
  const source = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  const destinationRunner = createMemoryTransactionRunner();
  const destination = createStorage({ transactionRunner: destinationRunner });
  await source.saveGame(envelope('alpha', 1), 0);
  const exported = await exportSave('alpha', 'main', { storage: source });
  const key = 'vtlib:alpha:main';
  const damaged = {
    key,
    gameId: 'alpha',
    slotId: 'main',
    envelope: { ...envelope('alpha', 4), payload: 'not-an-object' },
  };
  destinationRunner.seed('gameSaves', key, damaged);

  const loaded = await destination.loadSave('alpha');
  assert.equal(loaded.error.code, 'CORRUPT_SAVE');
  assert.equal(loaded.error.details.currentRevision, 4);
  const quarantineId = loaded.error.details.quarantineId;
  const ordinaryImport = await importSave(exported.value, { storage: destination, expectedGameId: 'alpha', expectedRevision: 4 });
  assert.equal(ordinaryImport.error.code, 'CORRUPT_SAVE');

  const recovered = await importSave(exported.value, {
    storage: destination,
    expectedGameId: 'alpha',
    expectedRevision: 4,
    recoveryId: quarantineId,
    now: () => new Date('2026-10-11T03:00:00.000Z'),
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value.revision, 5);
  assert.deepEqual(destinationRunner.entries('corruptSaves')[0][1].rawRecord, damaged);
  assert.equal((await destination.loadSave('alpha')).value.revision, 5);
});

test('future save versions can only be restored explicitly after a quarantined backup', async () => {
  const source = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  const destinationRunner = createMemoryTransactionRunner();
  const destination = createStorage({ transactionRunner: destinationRunner });
  await source.saveGame(envelope('studio-manager', 1), 0);
  const exported = await exportSave('studio-manager', 'main', { storage: source });
  assert.equal(exported.ok, true);

  const key = 'vtlib:studio-manager:main';
  const future = { key, gameId: 'studio-manager', slotId: 'main', envelope: envelope('studio-manager', 2, { saveVersion: '2' }) };
  destinationRunner.seed('gameSaves', key, future);
  const loaded = await destination.loadSave('studio-manager');
  assert.equal(loaded.error.code, 'UNSUPPORTED_VERSION');
  assert.equal(loaded.error.details.currentRevision, 2);
  assert.equal(loaded.error.details.field, 'saveVersion');
  const quarantineId = loaded.error.details.quarantineId;

  const ordinaryImport = await importSave(exported.value, {
    storage: destination,
    expectedGameId: 'studio-manager',
    expectedRevision: 2,
  });
  assert.equal(ordinaryImport.error.code, 'UNSUPPORTED_VERSION');
  assert.deepEqual(destinationRunner.entries('gameSaves')[0][1], future);

  const recovered = await importSave(exported.value, {
    storage: destination,
    expectedGameId: 'studio-manager',
    expectedRevision: 2,
    recoveryId: quarantineId,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.value.revision, 3);
  assert.deepEqual(destinationRunner.entries('corruptSaves')[0][1].rawRecord, future);
  assert.equal((await destination.loadSave('studio-manager')).value.saveVersion, '1');
});

test('stale recovery revisions and changed raw records are rejected', async () => {
  const source = createStorage({ transactionRunner: createMemoryTransactionRunner() });
  const runner = createMemoryTransactionRunner();
  const destination = createStorage({ transactionRunner: runner });
  await source.saveGame(envelope('alpha', 1), 0);
  const exported = await exportSave('alpha', 'main', { storage: source });
  const key = 'vtlib:alpha:main';
  const damaged = { key, gameId: 'alpha', slotId: 'main', envelope: { ...envelope('alpha', 2), payload: 'broken' } };
  runner.seed('gameSaves', key, damaged);
  const loaded = await destination.loadSave('alpha');
  const recoveryId = loaded.error.details.quarantineId;

  const staleRevision = await importSave(exported.value, { storage: destination, expectedGameId: 'alpha', expectedRevision: 1, recoveryId });
  assert.equal(staleRevision.error.code, 'REVISION_CONFLICT');
  const changed = { ...damaged, envelope: { ...damaged.envelope, payload: 'changed-after-load' } };
  runner.seed('gameSaves', key, changed);
  const staleToken = await importSave(exported.value, { storage: destination, expectedGameId: 'alpha', expectedRevision: 2, recoveryId });
  assert.equal(staleToken.error.code, 'RECOVERY_STALE');
  assert.deepEqual(runner.entries('gameSaves')[0][1], changed);
});
