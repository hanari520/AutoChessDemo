/* Run: node tools/audio-bank.test.js. Verifies the shipped procedural audio bank. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bankRoot = path.join(root, 'assets', 'audio', 'v3');
const manifest = JSON.parse(fs.readFileSync(path.join(bankRoot, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, 'retro-arcade-v3');
assert.equal(manifest.style.id, 'retro-arcade');
assert.deepEqual(manifest.style.layers, ['square-wave', 'triangle-wave', 'noise-percussion', 'arpeggio', 'pitch-slides', 'bit-reduction']);
assert.match(manifest.method, /deterministic local synthesis/);
assert.equal(manifest.skills.length, 50, 'every playable unit has a signature cue');
assert.ok(manifest.events.length >= 60, 'system and synergy cues are included');

const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'tools', 'battle-audio.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.match(page, /tools\/battle-audio\.js/, 'page still wires the shared sound engine');
assert.match(engine, /const SFX_ASSET_ROOT='assets\/audio\/v3\//);
assert.match(engine, /const SFX_WAV_BANK=false/, 'wav bank stays disabled until explicitly re-enabled (2026-09-29 revert)');
const fallbackDefs = engine.match(/const SFX_DEF=\{[\s\S]*?\n\};/)?.[0];
assert.ok(fallbackDefs, 'fallback sound definitions should be available');
assert.match(fallbackDefs, /type:'sine'/, 'fallback tones keep the original v79 timbre (soft sine waves present)');
assert.match(worker, /const CACHE = 'vcache-v\d+/, 'service worker keeps a versioned cache name (exact name changes every release)');
assert.doesNotMatch(worker, /assets\/audio\//, 'disabled wav bank is not precached by the service worker');
assert.doesNotMatch(worker, /\.\/assets\/audio\/v[12]\//);

const ids = [
  ...manifest.skills.map(id => ['skills', id]),
  ...manifest.events.map(id => ['events', id]),
];
const hashes = new Set();
for (const [group, id] of ids) {
  const file = path.join(bankRoot, group, `${id}.wav`);
  const wav = fs.readFileSync(file);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF', `${group}/${id} is a WAV`);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1, `${group}/${id} uses PCM`);
  assert.equal(wav.readUInt16LE(22), 1, `${group}/${id} is mono`);
  assert.equal(wav.readUInt32LE(24), 24000, `${group}/${id} uses 24kHz`);
  assert.equal(wav.readUInt16LE(34), 16, `${group}/${id} uses 16-bit samples`);
  assert.ok(wav.length > 1000, `${group}/${id} is not empty`);
  let peak = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak > 1000 && peak <= 32767, `${group}/${id} has audible, unclipped samples`);
  hashes.add(crypto.createHash('sha1').update(wav).digest('hex'));
}
assert.equal(hashes.size, ids.length, 'each character and event has its own rendered cue');
console.log(`✅ ${manifest.skills.length} signature cues + ${manifest.events.length} system cues verified`);
