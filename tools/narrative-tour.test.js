const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const N = require('./narrative-tour');

const unitIds = (() => {
  const start = html.indexOf('const UNITS = [');
  const block = html.slice(start, html.indexOf('];', start));
  return new Set([...block.matchAll(/id:'([A-Za-z0-9_]+)'/g)].map(m => m[1]));
})();
const sfxKeys = (() => {
  const start = html.indexOf('const SFX_DEF={');
  const block = html.slice(start, html.indexOf('\n};', start));
  return new Set([...block.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{/g)].map(m => m[1]));
})();
const BANNED = ['远征生命', '遗物', '章末首领', '精英战', '普通战', '精英部队', '巡逻队', '回响护符', '召唤核心', '坚守旗帜', '冒险徽章', '购买补给'];
const WB_BANNED = ['打败', '消灭', '邪恶', '深渊的爪牙', '拯救世界', '牺牲', '复仇'];

const collectLines = root => {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (typeof v.text === 'string' && 'who' in v) return out.push(v);
      Object.values(v).forEach(walk);
    }
  };
  walk(root);
  return out;
};

test('narrative tour data is pure and roundtrips', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(N)), N);
  assert.equal(Object.keys(N.STATIONS).length, 3);
  assert.equal(N.EVENTS.length, 6);
});

test('every narrative line references a real unit, a real sfx, and no banned term', () => {
  const lines = collectLines(N.STATIONS).concat(collectLines(N.FINALE), collectLines(N.EVENTS.map(e => e.after)));
  assert(lines.length >= 100, `enough lines: ${lines.length}`);
  for (const line of lines) {
    if (line.who !== null) assert(unitIds.has(line.who), `unknown unit: ${line.who}`);
    else assert(['旁白', '静默'].includes(line.name), `null who must be 旁白/静默: ${line.name}`);
    if (line.sfx) assert(sfxKeys.has(line.sfx), `unknown sfx: ${line.sfx}`);
    for (const term of BANNED.concat(WB_BANNED)) {
      assert.equal(String(line.text).includes(term), false, `banned term "${term}" in: ${line.text}`);
    }
  }
});

test('narrative COPY is mirrored verbatim into the rules layer', () => {
  const src = fs.readFileSync(path.join(__dirname, 'solo-modes.js'), 'utf8');
  const strings = [];
  const push = v => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(push); };
  push(N.COPY);
  N.EVENTS.forEach(e => { strings.push(e.title, e.situation, e.safe.action, e.risk.action); });
  for (const s of strings) assert(src.includes(s), `solo-modes.js is missing narrative copy: ${s}`);
});

test('stations do not leak each other landmarks', () => {
  const bag = n => JSON.stringify(N.STATIONS[n]);
  assert.equal(/霓虹街|长夜台/.test(bag(1)), false, 'station 1 leaks 2/3');
  assert.equal(/灯塔|长夜台/.test(bag(2)), false, 'station 2 leaks 1/3');
  assert.equal(/霓虹街|灯塔/.test(bag(3)), false, 'station 3 leaks 1/2');
});

test('finale exposes three distinct outcomes', () => {
  ['opening', 'encore', 'curtain', 'resume'].forEach(k => {
    assert(Array.isArray(N.FINALE[k]) && N.FINALE[k].length > 0, `finale.${k}`);
  });
});
