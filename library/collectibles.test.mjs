import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectibles, recordCompletion as recordBuiltInCompletion } from './collectibles.mjs';
import { createStorage } from './storage.mjs';

const STORE_NAMES = ['gameSaves', 'completions', 'collectibles', 'corruptSaves'];
const clone = (value) => structuredClone(value);

function createMemoryTransactionRunner() {
  const stores = new Map(STORE_NAMES.map((name) => [name, new Map()]));
  let queue = Promise.resolve();
  let failWrites = 0;
  function execute(storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      const writable = mode === 'readwrite';
      const local = new Map(storeNames.map((name) => [name, writable ? new Map([...stores.get(name)].map(([key, value]) => [key, clone(value)])) : stores.get(name)]));
      let pending = 0;
      let started = false;
      let settled = false;
      let value;
      let hasValue = false;
      const finishIfReady = () => {
        if (!settled && started && pending === 0) {
          settled = true;
          if (writable) for (const name of storeNames) stores.set(name, local.get(name));
          resolve(hasValue ? value : undefined);
        }
      };
      const api = {
        get(name, key, callback) {
          pending++;
          queueMicrotask(() => {
            try {
              callback(local.get(name).has(key) ? clone(local.get(name).get(key)) : null);
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
              callback([...local.get(name).values()].map(clone));
              pending--;
              finishIfReady();
            } catch (error) {
              settled = true;
              reject(error);
            }
          });
        },
        put(name, record) {
          if (!writable) throw new Error('Readonly transaction.');
          if (failWrites > 0) {
            failWrites--;
            throw new Error('Injected interruption before commit.');
          }
          local.get(name).set(record.key, clone(record));
        },
      };
      try {
        work(api, (result) => { value = result; hasValue = true; });
        started = true;
        finishIfReady();
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
  }
  const runner = (storesForCall, mode, work) => {
    const result = queue.then(() => execute(storesForCall, mode, work));
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  runner.failNextWrite = () => { failWrites++; };
  return runner;
}

const fixtureRewards = {
  schemaVersion: '1',
  games: {
    'fixture-one': [
      { id: 'fixture-one-first', gameId: 'fixture-one', title: 'Fixture One First', image: null },
    ],
    'fixture-two': [
      { id: 'fixture-two-first', gameId: 'fixture-two', title: 'Fixture Two First', image: null },
    ],
  },
};

function completion(gameId, rewardId, completionId = 'finish-001') {
  return {
    gameId,
    runId: 'run-001',
    completionId,
    rulesVersion: '1',
    outcome: { result: 'complete' },
    rewardIds: [rewardId],
  };
}

test('fixture rewards stay isolated by game and completion retries are idempotent', async () => {
  const runner = createMemoryTransactionRunner();
  const collectibles = createCollectibles({ storage: createStorage({ transactionRunner: runner }), rewards: fixtureRewards });
  const first = await collectibles.recordCompletion(completion('fixture-one', 'fixture-one-first'));
  const retry = await collectibles.recordCompletion(completion('fixture-one', 'fixture-one-first'));
  const secondGame = await collectibles.recordCompletion(completion('fixture-two', 'fixture-two-first'));
  assert.equal(first.ok, true);
  assert.equal(first.value.duplicate, false);
  assert.equal(retry.value.duplicate, true);
  assert.equal(secondGame.ok, true);

  const all = await collectibles.listCollectibles();
  assert.deepEqual(all.value.map(({ gameId, id }) => `${gameId}/${id}`), [
    'fixture-one/fixture-one-first',
    'fixture-two/fixture-two-first',
  ]);
  assert.equal(all.value.every((entry) => entry.verification === 'local'), true);
  assert.equal((await collectibles.listCollectibles('fixture-one')).value.length, 1);
});

test('unknown reward IDs and client supplied server trust are rejected', async () => {
  const collectibles = createCollectibles({ storage: createStorage({ transactionRunner: createMemoryTransactionRunner() }), rewards: fixtureRewards });
  assert.equal((await collectibles.recordCompletion(completion('fixture-one', 'not-registered'))).error.code, 'INVALID_REWARD_ID');
  assert.equal((await collectibles.recordCompletion({ ...completion('fixture-one', 'fixture-one-first'), verification: 'server' })).error.code, 'UNTRUSTED_VERIFICATION');
});

test('reusing a completion ID with different result data is rejected', async () => {
  const collectibles = createCollectibles({ storage: createStorage({ transactionRunner: createMemoryTransactionRunner() }), rewards: fixtureRewards });
  await collectibles.recordCompletion(completion('fixture-one', 'fixture-one-first'));
  const changed = { ...completion('fixture-one', 'fixture-one-first'), runId: 'run-002' };
  assert.equal((await collectibles.recordCompletion(changed)).error.code, 'IDEMPOTENCY_KEY_REUSED');
});

test('an interrupted reward transaction can be retried without partial grants', async () => {
  const runner = createMemoryTransactionRunner();
  const collectibles = createCollectibles({ storage: createStorage({ transactionRunner: runner }), rewards: fixtureRewards });
  runner.failNextWrite();
  const interrupted = await collectibles.recordCompletion(completion('fixture-one', 'fixture-one-first'));
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.error.code, 'STORAGE_WRITE_FAILED');
  assert.deepEqual((await collectibles.listCollectibles('fixture-one')).value, []);
  const retry = await collectibles.recordCompletion(completion('fixture-one', 'fixture-one-first'));
  assert.equal(retry.ok, true);
  assert.equal((await collectibles.listCollectibles('fixture-one')).value.length, 1);
});

test('a transient built-in catalog fetch failure can be retried', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error('temporary network failure');
    return {
      ok: true,
      json: async () => ({
        schemaVersion: '1',
        games: {
          'studio-manager': [
            { id: 'studio-first', gameId: 'studio-manager', title: 'First Steps', image: null },
          ],
        },
      }),
    };
  };

  try {
    const completion = {
      gameId: 'studio-manager',
      runId: 'retry-run',
      completionId: 'retry-finish',
      rulesVersion: '1',
      outcome: { result: 'complete' },
      rewardIds: ['studio-first'],
    };
    const first = await recordBuiltInCompletion(completion);
    assert.equal(first.error.code, 'REWARD_CATALOG_UNAVAILABLE');

    const second = await recordBuiltInCompletion(completion);
    // The catalog loaded and validated; storage is intentionally unavailable
    // in this dependency-free Node test environment.
    assert.equal(second.error.code, 'STORAGE_UNAVAILABLE');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
