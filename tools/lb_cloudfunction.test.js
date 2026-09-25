'use strict';

/* CloudBase 云函数 lb 契约测试：加载真实源码 autochess-api/cloudbase-functions/lb/index.js，
   用 fetch 桩模拟 PostgREST 网关（内存表 lb_entries），覆盖 daily100 v3 / normal100v2 规则闸门
   与旧榜（normal/daily）隔离。这是线上真正部署的工件——daily100_backend.test.js 测的是已下线的
   Worker 版，不能替代本文件。 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LB_PATH = path.resolve(__dirname, '..', '..', 'autochess-api', 'cloudbase-functions', 'lb', 'index.js');

function serverDaySeed(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/* 迷你 PostgREST：支持 board/seed 的 eq 过滤、order 多键排序、limit 与 select 投影、POST 插入 */
function makeStub() {
  const rows = [];
  let nextId = 1;
  async function fetch(url, opts = {}) {
    const u = new URL(String(url));
    if (opts.method === 'POST') {
      const row = JSON.parse(opts.body);
      row.id = nextId++;
      row.created_at = new Date().toISOString();
      rows.push(row);
      return { ok: true, status: 201, text: async () => JSON.stringify([row]) };
    }
    const eq = (name) => {
      const raw = u.searchParams.get(name);
      return raw != null && raw.startsWith('eq.') ? raw.slice(3) : null;
    };
    const board = eq('board'), seed = eq('seed');
    const select = (u.searchParams.get('select') || '').split(',').filter(Boolean);
    const limit = Number(u.searchParams.get('limit')) || Infinity;
    let out = rows.filter(r =>
      (board == null || r.board === board) && (seed == null || String(r.seed) === seed));
    const order = (u.searchParams.get('order') || '').split(',').filter(Boolean)
      .map(s => { const [k, d] = s.split('.'); return { k, dir: d === 'desc' ? -1 : 1 }; });
    out.sort((a, b) => {
      for (const o of order) { const x = a[o.k], y = b[o.k]; if (x !== y) return (x < y ? -1 : 1) * o.dir; }
      return 0;
    });
    out = out.slice(0, limit).map(r => select.length ? Object.fromEntries(select.map(f => [f, r[f]])) : r);
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }
  return { fetch, rows };
}

function loadLb(stub) {
  const source = fs.readFileSync(LB_PATH, 'utf8');
  const mod = { exports: {} };
  new Function('module', 'exports', 'fetch', 'process', source)
    (mod, mod.exports, stub.fetch, { env: { LB_PUBKEY: 'unit-test-key' } });
  const main = mod.exports.main;
  const get = q => main({ httpMethod: 'GET', queryStringParameters: q });
  const post = body => main({ httpMethod: 'POST', queryStringParameters: {}, body: JSON.stringify(body) });
  const read = r => JSON.parse(r.body);
  return { main, get, post, read, rows: stub.rows };
}

const validDaily100 = (overrides = {}) => ({
  name: '每日测试', board: 'daily100', round: 100, ch: 5,
  kills: 321, curses: 1, rules: 3, lineup: ['unit-a', 'unit-b'], ...overrides
});

test('daily100 GET serves the v3 seed-scoped board, isolated from legacy daily, normal and other days', async () => {
  const lb = loadLb(makeStub());
  const seed = serverDaySeed();
  lb.rows.push(
    { id: 1, board: 'daily', seed, name: '旧每日', round: 88, ch: 4, kills: 100, curses: 1, created_at: 't1' },
    { id: 2, board: 'daily100v3', seed: 20260101, name: '昨天', round: 100, ch: 5, kills: 999, curses: 1, created_at: 't2' },
    { id: 3, board: 'normal100v2', seed: null, name: '普通', round: 100, ch: 5, kills: 1, curses: 0, created_at: 't3' },
    { id: 4, board: 'daily100v3', seed, name: '今日', round: 100, ch: 5, kills: 50, curses: 1, created_at: 't4' });
  const r = await lb.get({ board: 'daily100', rules: '3' });
  assert.equal(r.statusCode, 200);
  const body = lb.read(r);
  assert.deepEqual([body.ok, body.board, body.rules, body.seed], [true, 'daily100', 3, seed]);
  assert.deepEqual(body.list.map(x => x.name), ['今日']);
});

test('daily100 GET rejects a mismatched rules version without reading', async () => {
  const lb = loadLb(makeStub());
  const r = await lb.get({ board: 'daily100', rules: '2' });
  assert.equal(r.statusCode, 400);
  assert.equal(lb.read(r).error, 'unsupported daily rules');
});

test('daily100 POST ranks a valid v3 win and stamps the server-side day seed and versioned board', async () => {
  const stub = makeStub();
  const lb = loadLb(stub);
  const seed = serverDaySeed();
  const r = await lb.post(validDaily100());
  assert.equal(r.statusCode, 200);
  const body = lb.read(r);
  assert.deepEqual({ ok: body.ok, rank: body.rank, total: body.total, seed: body.seed }, { ok: true, rank: 1, total: 1, seed });
  assert.deepEqual({ board: lb.rows[0].board, seed: lb.rows[0].seed, curses: lb.rows[0].curses },
    { board: 'daily100v3', seed, curses: 1 });
  assert.ok(lb.rows[0].lineup.length <= 6);
});

test('daily100 POST accepts a loss to the round-100 boss as chapter 4', async () => {
  const lb = loadLb(makeStub());
  const r = await lb.post(validDaily100({ round: 100, ch: 4, kills: 900 }));
  assert.equal(r.statusCode, 200);
  assert.equal(lb.read(r).ok, true);
});

test('daily100 POST rejects mismatched rules, curse count, round or chapter without writing', async () => {
  const stub = makeStub();
  const lb = loadLb(stub);
  const bads = [
    validDaily100({ rules: 2 }),
    validDaily100({ curses: 0 }),
    validDaily100({ curses: 2 }),
    validDaily100({ round: 101, ch: 5 }),
    validDaily100({ round: 90, ch: 3 }),          // ceil(90/25)=4，ch 必须为 4
    validDaily100({ round: 60, ch: 2 }),          // ceil(60/25)=3，ch=2 不匹配
  ];
  for (const body of bads) {
    const r = await lb.post(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.match(lb.read(r).error, /invalid daily100 result|unsupported daily rules/);
  }
  assert.equal(stub.rows.length, 0);
});

test('daily100 rank follows ch.desc, round.desc, kills.desc across two submissions', async () => {
  const lb = loadLb(makeStub());
  const first = lb.read(await lb.post(validDaily100({ name: '甲', kills: 20 })));
  const second = lb.read(await lb.post(validDaily100({ name: '乙', kills: 10 })));
  assert.deepEqual([first.rank, second.rank], [1, 2]);   // 后提交但击杀更低者排在已有成绩之后
});

test('normal100 board reads normal100v2 only and enforces the campaign rules gate', async () => {
  const stub = makeStub();
  const lb = loadLb(stub);
  lb.rows.push(
    { id: 1, board: 'normal100', name: '旧版成绩', round: 100, ch: 5, kills: 1, curses: 0, created_at: 't1' },
    { id: 2, board: 'normal100v2', name: '新版成绩', round: 100, ch: 5, kills: 2, curses: 0, created_at: 't2' });
  const r = await lb.get({ board: 'normal100', rules: '2' });
  const body = lb.read(r);
  assert.deepEqual([body.board, body.rules], ['normal100', 2]);
  assert.deepEqual(body.list.map(x => x.name), ['新版成绩']);
  const rejected = await lb.get({ board: 'normal100', rules: '1' });
  assert.equal(rejected.statusCode, 400);
  assert.equal(lb.read(rejected).error, 'unsupported campaign rules');
});

test('normal100 POST stores normal100v2, rejects stale rules, cursed runs and impossible chapters', async () => {
  const stub = makeStub();
  const lb = loadLb(stub);
  const ok = lb.read(await lb.post({ name: '普通', board: 'normal100', round: 100, ch: 5, kills: 50, curses: 0, rules: 2 }));
  assert.deepEqual({ ok: ok.ok, rank: ok.rank }, { ok: true, rank: 1 });
  assert.equal(stub.rows[0].board, 'normal100v2');
  assert.equal(stub.rows[0].seed, null);
  // 不带 rules 的旧客户端照常放行（渐进升级），新写入同样落到 normal100v2
  const legacy = lb.read(await lb.post({ name: '旧客户端', board: 'normal100', round: 90, ch: 4, kills: 3, curses: 0 }));
  assert.equal(legacy.ok, true);
  assert.equal(stub.rows[1].board, 'normal100v2');
  const bads = [
    { name: '旧规则', board: 'normal100', round: 100, ch: 5, kills: 1, curses: 0, rules: 1 },
    { name: '诅咒成绩', board: 'normal100', round: 80, ch: 4, kills: 1, curses: 1, rules: 2 },
    { name: '假通关', board: 'normal100', round: 80, ch: 5, kills: 1, curses: 0, rules: 2 },
    { name: '超章', board: 'normal100', round: 80, ch: 6, kills: 1, curses: 0, rules: 2 },
  ];
  for (const body of bads) {
    const r = await lb.post(body);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(stub.rows.length, 2);
});

test('legacy normal and daily boards keep working alongside the versioned boards', async () => {
  const lb = loadLb(makeStub());
  lb.rows.push(
    { id: 1, board: 'normal', seed: null, name: '旧普通', round: 93, ch: 4, kills: 667, curses: 0, created_at: 't1' },
    { id: 2, board: 'daily', seed: serverDaySeed(), name: '旧每日', round: 88, ch: 4, kills: 10, curses: 1, created_at: 't2' });
  const normal = lb.read(await lb.get({ board: 'normal' }));
  const daily = lb.read(await lb.get({ board: 'daily' }));
  assert.deepEqual(normal.list.map(x => x.name), ['旧普通']);
  assert.deepEqual(daily.list.map(x => x.name), ['旧每日']);
  assert.equal(daily.seed, serverDaySeed());
});

test('submission hygiene: name is trimmed to 12 chars and unknown boards are rejected', async () => {
  const stub = makeStub();
  const lb = loadLb(stub);
  const long = lb.read(await lb.post(validDaily100({ name: '一二三四五六七八九十甲乙丙' })));
  assert.equal(long.ok, true);
  assert.equal([...stub.rows.at(-1).name].length, 12);
  const ghost = await lb.post(validDaily100({ board: 'normal999' }));
  assert.equal(ghost.statusCode, 400);
  assert.equal(lb.read(ghost).error, 'board required');
  assert.equal(stub.rows.length, 1);
});
