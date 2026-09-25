'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const { TextEncoder } = require('node:util');

// Load the real Cloudflare worker entry without Wrangler/network/database credentials.
const workerPath = path.resolve(__dirname, '..', '..', 'autochess-api', 'src', 'index.js');
const source = fs.readFileSync(workerPath, 'utf8').replace('export default {', 'return {');
const worker = new Function('Response', 'URL', 'crypto', 'TextEncoder', 'Date', source)(Response, URL, crypto, TextEncoder, Date);

function todaySeed(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}
function makeEnv(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values, writes,
    LB: {
      async get(key) { return values.has(key) ? values.get(key) : null; },
      async put(key, value, options) { values.set(key, String(value)); writes.push({ key, value: String(value), options }); }
    }
  };
}
async function get(env, query) {
  return worker.fetch(new Request(`https://unit.test/api/top?${query}`), env);
}
async function post(env, body) {
  return worker.fetch(new Request('https://unit.test/api/score', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.24' }, body: JSON.stringify(body)
  }), env);
}
const read = response => response.json();
const validDaily = (overrides = {}) => ({
  name: '每日测试', board: 'daily100', seed: todaySeed(), round: 100, ch: 5,
  kills: 321, curses: 1, rules: 2, lineup: ['unit-a'], ...overrides
});

test('daily100 reads its v2, seed-scoped board, isolated from legacy daily and normal boards', async () => {
  const seed = todaySeed();
  const env = makeEnv({
    [`board:daily:${seed}`]: JSON.stringify([{ n: 'old-daily', r: 99 }]),
    [`board:daily100:${seed}:v2`]: JSON.stringify([{ n: 'new-daily', r: 100, c: 1, rules: 2 }]),
    'board:normal': JSON.stringify([{ n: 'legacy-normal', r: 80 }]),
    // 2026-09-25 经典榜清分：KV 键名已升为 :v2（旧键 board:normal100 保留但不再读写）
    'board:normal100:v2': JSON.stringify([{ n: 'campaign', r: 100, ch: 5 }])
  });
  const [daily, oldDaily, normal, normal100, rejectVersion] = await Promise.all([
    get(env, `board=daily100&seed=${seed}&rules=2`),
    get(env, `board=daily&seed=${seed}`),
    get(env, 'board=normal'),
    get(env, 'board=normal100'),
    get(env, `board=daily100&seed=${seed}&rules=1`)
  ]);
  assert.equal(daily.status, 200);
  assert.deepEqual(await read(daily), { ok: true, board: 'daily100', seed, rules: 2, list: [{ n: 'new-daily', r: 100, c: 1, rules: 2 }] });
  assert.equal((await read(oldDaily)).list[0].n, 'old-daily');
  assert.equal((await read(normal)).list[0].n, 'legacy-normal');
  assert.equal((await read(normal100)).list[0].n, 'campaign');
  assert.equal(rejectVersion.status, 400);
  assert.equal((await read(rejectVersion)).error, 'unsupported daily rules');
  assert.deepEqual(env.writes, [], 'reads must not change or merge stored boards');
});

test('daily100 accepts exactly one curse on a valid 100-round, chapter 5, v2 result', async () => {
  const seed = todaySeed();
  const oldDailyKey = `board:daily:${seed}`;
  const normal100Key = 'board:normal100:v2';   // 2026-09-25 清分后的键名
  const env = makeEnv({ [oldDailyKey]: '[{"n":"keep-old"}]', [normal100Key]: '[{"n":"keep-normal"}]' });
  const response = await post(env, validDaily());
  assert.equal(response.status, 200);
  const result = await read(response);
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  const dailyKey = `board:daily100:${seed}:v2`;
  const stored = JSON.parse(env.values.get(dailyKey));
  assert.equal(stored[0].n, '每日测试');
  assert.equal(stored[0].r, 100);
  assert.equal(stored[0].ch, 5);
  assert.equal(stored[0].c, 1);
  assert.equal(stored[0].rules, 2);
  assert.equal(stored[0].s, seed);
  assert.equal(env.values.get(oldDailyKey), '[{"n":"keep-old"}]');
  assert.equal(env.values.get(normal100Key), '[{"n":"keep-normal"}]');
  assert.deepEqual(env.writes.find(x => x.key === dailyKey).options, { expirationTtl: 8 * 86400 });
  assert.equal(env.writes.some(x => x.key.startsWith('board:normal')), false);
});

test('daily100 also records a loss to the final boss as round 100, chapter 4', async () => {
  const env = makeEnv();
  const response = await post(env, validDaily({ round: 100, ch: 4 }));
  assert.equal(response.status, 200);
  const rows = JSON.parse(env.values.get(`board:daily100:${todaySeed()}:v2`));
  assert.equal(rows[0].r, 100);
  assert.equal(rows[0].ch, 4);
  assert.equal(rows[0].c, 1);
});

test('daily100 rejects mismatched curse count, rule version, round, or chapter without writes', async () => {
  const invalid = [
    { curses: 0 }, { curses: 2 }, { rules: 1 }, { round: 101, ch: 5 },
    { round: 80, ch: 5 }, { round: 26, ch: 1 }, { round: 100, ch: 3 },
    { seed: todaySeed(-3) }
  ];
  for (const change of invalid) {
    const env = makeEnv();
    const response = await post(env, validDaily(change));
    assert.equal(response.status, 400, `accepted invalid result ${JSON.stringify(change)}`);
    assert.equal(env.writes.length, 0, `wrote invalid result ${JSON.stringify(change)}`);
  }
});

test('ordinary boards stay uncursed and separate from daily100', async () => {
  const env = makeEnv();
  const normal = await post(env, { name: '普通', board: 'normal100', round: 100, ch: 5, kills: 10, curses: 0 });
  assert.equal(normal.status, 200);
  const cursedNormal = await post(env, { name: '自定义', board: 'normal100', round: 50, ch: 2, kills: 10, curses: 1 });
  assert.equal(cursedNormal.status, 400);
  assert.equal((await read(cursedNormal)).error, 'invalid campaign result');
  const legacyNormal = await post(env, { name: '自定义旧榜', board: 'normal', round: 50, ch: 2, kills: 10, curses: 1 });
  assert.equal(legacyNormal.status, 400);
  assert.equal((await read(legacyNormal)).error, 'cursed run not ranked');
  assert.equal(env.values.has('board:normal100:v2'), true);   // 2026-09-25 清分后的键名
  assert.equal(env.values.has(`board:daily100:${todaySeed()}:v2`), false);
  const normalTop = await read(await get(env, 'board=normal100'));
  assert.equal(normalTop.list[0].n, '普通');
});
