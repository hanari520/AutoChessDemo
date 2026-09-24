/* Run: node tools/sound-system.test.js. Exercises the page's real sound engine in a small VM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('/* ================= 声音系统');
const end = html.indexOf('function byId(', begin);
assert.ok(begin >= 0 && end > begin, '声音引擎范围应可定位');
const soundCode = html.slice(begin, end);
const assetDeclaration = html.match(/const V3_ASSET=\{[^\n]+;/)?.[0];
assert.ok(assetDeclaration, 'V3 asset palette should be available to sound mapping');

function harness({ muted = false, audio = true } = {}) {
  const sources = [];
  let battleDraws = 0, dailyDraws = 0, mode = 'battle';
  const ctx = {
    currentTime: 1, state: 'running', sampleRate: 1000, destination: {},
    createBuffer(_channels, length) { return { getChannelData() { return new Float32Array(length); } }; },
    createBufferSource() { return source(); },
    createOscillator() { return Object.assign(source(), { frequency: {} }); },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
  };
  function source() {
    const s = { starts: [], stopped: false, connect() {}, start(t) { this.starts.push(t); },
      stop() { this.stopped = true; } };
    sources.push(s); return s;
  }
  const store = { vc_sfx: muted ? '0' : '1' };
  const sandbox = {
    ARENA_SILENT: false, SPEED: 1,
    $() { return { textContent: '', title: '', setAttribute() {}, classList: { toggle() {} } }; },
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    document: { addEventListener() {} },
    rand() { if (mode === 'daily') dailyDraws++; else battleDraws++; return .42; },
  };
  sandbox.window = { __sfxCount: {}, __sfxPlayed: 0 };
  if (audio) sandbox.window.AudioContext = class { constructor() { return ctx; } };
  vm.createContext(sandbox);
  vm.runInContext(`${assetDeclaration}\n${soundCode}`, sandbox, { filename: 'index.html:sound' });
  const evalIn = code => vm.runInContext(code, sandbox);
  return { sandbox, ctx, sources, store, evalIn,
    setMode(v) { mode = v; }, draws() { return { battleDraws, dailyDraws }; } };
}

{
  const h = harness();
  h.evalIn("sfx('merge3'); sfx('spellFire'); sfx('roll');");
  h.setMode('daily');
  h.ctx.currentTime = 1.5;
  h.evalIn("sfx('spellIce'); sfx('impactArc');");
  assert.deepEqual(h.draws(), { battleDraws: 0, dailyDraws: 0 }, '声音合成不得调用战斗或每日随机数');
  assert.ok(h.sources.some(s => s.starts.length), '测试音频桩应实际接到发声源');
  console.log('✅ 声音合成不推进普通战斗或每日挑战 RNG');
}

{
  const h = harness();
  h.evalIn("sfx('merge3')");
  assert.equal(h.evalIn('_sfxVoices'), 1, '多音琶音应只占一个事件槽位');
  h.evalIn("['buy','sell','roll','lvlup','equip','deploy','tidy'].forEach(sfx)");
  assert.equal(h.evalIn('_sfxVoices'), 8, '其他声音仍可占用余下七个槽位');
  assert.equal(h.sandbox.window.__sfxPlayed, 8);
  assert.ok(h.sources.length > 8, '并发按音效事件而非振荡器数量计算');
  console.log('✅ 多音音效不独占全局并发');
}

{
  const h = harness();
  h.evalIn("sfx('buy'); sfx('buy')");
  assert.equal(h.sandbox.window.__sfxPlayed, 1, '限流后的重复请求不计为已播放');
  assert.equal(h.sandbox.window.__sfxCount.buy, 1);
  h.ctx.currentTime += .12;
  h.evalIn("sfx('buy')");
  assert.equal(h.sandbox.window.__sfxPlayed, 2);
  h.evalIn("['sell','roll','lvlup','equip','deploy','tidy'].forEach(sfx)");
  const before = h.sandbox.window.__sfxPlayed;
  h.evalIn("sfx('drag')");
  assert.equal(h.sandbox.window.__sfxPlayed, before, '容量拒绝后的请求不计为已播放');
  console.log('✅ 调试已播放计数只统计通过限流与容量检查的事件');
}

{
  const muted = harness({ muted: true });
  muted.evalIn("sfx('buy')");
  assert.equal(muted.sandbox.window.__sfxPlayed, 0);
  assert.equal(muted.sources.length, 0);
  const noAudio = harness({ audio: false });
  assert.doesNotThrow(() => noAudio.evalIn("sfx('buy'); sfx('spellFire')"));
  assert.equal(noAudio.sandbox.window.__sfxPlayed, 0);
  assert.equal(noAudio.sources.length, 0);
  const pending = harness();
  pending.evalIn("skillSound('shield'); toggleSfx()");
  assert.equal(pending.evalIn('_sfxVoices'), 0, '切换静音应停止已排程声音');
  assert.ok(pending.sources.every(s => s.stopped));
  assert.equal(pending.store.vc_sfx, '0');
  console.log('✅ 静音和无 AudioContext 均安全静默');
}

{
  const h = harness();
  h.evalIn("sfx('merge3')");
  assert.equal(h.evalIn('_sfxVoices'), 1);
  h.evalIn('_sfxActive[0].tail.onended()');
  assert.equal(h.evalIn('_sfxVoices'), 0, '最后结束的音源应回收事件槽位');
  assert.equal(h.evalIn('_sfxActive.length'), 0);
  h.evalIn('_sfxActive[0]?.tail?.onended?.()');
  assert.equal(h.evalIn('_sfxVoices'), 0, '重复结束通知不得将槽位计数减成负数');
  console.log('✅ 尾音结束后回收并发槽位');
}

{
  const h = harness();
  h.evalIn("['buy','sell','roll','lvlup','equip','deploy','tidy','drag'].forEach(sfx)");
  assert.equal(h.evalIn('_sfxVoices'), 8);
  const old = h.evalIn('_sfxActive.slice()');
  h.evalIn("sfx('win')");
  assert.equal(h.evalIn('_sfxVoices'), 8, '高优先级结算音应抢占而不超过容量');
  assert.equal(old.filter(e => e.ended).length, 1, '应只抢占一个低优先级事件');
  assert.equal(h.evalIn('_sfxActive.filter(e => e.priority === 5).length'), 1);
  const played = h.sandbox.window.__sfxPlayed;
  h.evalIn("sfx('sellhint')");
  assert.equal(h.sandbox.window.__sfxPlayed, played, '同优先级声音不能强制挤占');
  console.log('✅ 高优先级结算音安全抢占容量');
}

{
  // Read real V3 kit data, then observe the same skillSound(v3Impact(k)) event path used by castV3Skill.
  const kitStart = html.indexOf('const V3_ASSET=');
  const kitEnd = html.indexOf('\n};', html.indexOf('const COMBAT_KITS=', kitStart)) + 3;
  assert.ok(kitStart >= 0 && kitEnd > kitStart);
  const kits = vm.runInNewContext(`${html.slice(kitStart, kitEnd)}; COMBAT_KITS`);
  const cases = [
    ['ein', 'shield', .06], ['goutan', 'shield', .06], ['sumi', 'shield', .06], ['taodai', 'shield', .06],
    ['likou', 'heal', .07], ['xuezhu', 'spellIce', .045], ['diansu', 'stunHit', 0],
    ['kouichi', 'impactBlade', 0], ['yujiu', 'spellZap', 0],
  ];
  for (const [id, expected, delay] of cases) {
    assert.ok(kits[id], `${id} V3 kit must exist`);
    const h = harness();
    const actual = h.evalIn(`v3Impact(${JSON.stringify(kits[id])},{id:${JSON.stringify(id)}})`);
    assert.equal(actual, expected, `${id} V3 impact timbre`);
    h.evalIn(`skillSound(v3Impact(${JSON.stringify(kits[id])},{id:${JSON.stringify(id)}}))`);
    assert.equal(h.sandbox.window.__sfxCount.cast, 1, `${id} charge cue`);
    assert.equal(h.sandbox.window.__sfxCount[expected], 1, `${id} impact cue`);
    const starts = h.evalIn('_sfxActive.map(e => e.sources[0].starts[0])');
    assert.equal(starts.length, 2, `${id} charge and impact must be separate events`);
    assert.ok(Math.abs(starts[0] - 1) < 1e-6, `${id} charge starts with ring`);
    assert.ok(Math.abs(starts[1] - (1 + delay)) < 1e-6, `${id} impact should match effect onset`);
    assert.ok(starts[1] < 1.1, `${id} synchronous effect must sound before 260ms charge ring finishes`);
  }
  assert.match(html, /castV3Skill[\s\S]*?skillSound\(v3Impact\(k,u\)\)/, 'V3 cast must emit mapped sound');
  assert.match(html, /function castSkill[\s\S]*?skillSound\(skillImpact\(arch\)\)/, 'legacy cast must emit mapped sound');
  console.log('✅ V3 护盾、治疗、冰、控制、近战、雷击音色及同步效果落点');
}

{
  const h = harness();
  h.evalIn("skillSound('zone')");
  let starts = h.evalIn('_sfxActive.map(e => e.sources[0].starts[0])');
  assert.ok(Math.abs(starts[1] - 1.03) < 1e-6, '区域音应在创建动画初段响起');
  assert.match(html, /function spawnZone[\s\S]*?vfxAoe\([^;]+; sfx\('zone'\)/, '持续区域应在生成时触发一次声音');
  h.ctx.currentTime = 1.2;
  h.evalIn("sfx('zone')");
  assert.equal(h.sandbox.window.__sfxCount.zone, 2, '后续独立区域生成仍可触发');
  const fast = harness();
  fast.sandbox.SPEED = 2;
  fast.evalIn("skillSound('shield')");
  starts = fast.evalIn('_sfxActive.map(e => e.sources[0].starts[0])');
  assert.ok(Math.abs(starts[1] - 1.03) < 1e-6, '2 倍速时护盾声音落点随视觉缩放');
  console.log('✅ 区域生成音与战斗速度缩放的落点');
}

{
  // Execute the actual result banner's sound prelude without constructing its DOM/timers.
  const resultStart = html.indexOf('function showResultBanner(won,cb){');
  const resultDom = html.indexOf('const el=document.createElement', resultStart);
  assert.ok(resultStart >= 0 && resultDom > resultStart);
  const h = harness();
  h.sandbox.S = { phase: 'battle' };
  h.evalIn(`${html.slice(resultStart, resultDom)}}`);
  h.evalIn("skillSound('impactBlade'); sfx('crit')");
  const [charge, impact, crit] = h.evalIn('_sfxActive.slice()');
  assert.ok(impact.finishOnResult && !crit.finishOnResult);
  h.evalIn('showResultBanner(true)');
  assert.equal(charge.ended, true, '结算时结束次要蓄力提示');
  assert.equal(crit.ended, true, '结算时结束次要战斗声');
  assert.equal(impact.ended, false, '结算时保留已调度的技能命中声');
  assert.equal(h.evalIn('_sfxActive.length'), 2, '技能命中与胜利主题同时保留');
  const starts = h.evalIn('_sfxActive.map(e => e.sources[0].starts[0])');
  assert.ok(Math.abs(starts[0] - 1) < 1e-6 && Math.abs(starts[1] - 1.12) < 1e-6);
  console.log('✅ 立即结算保留技能命中声，清除次要声并延后胜利主题');
}

{
  const sourceChecks = [
    [/sfx\(S\.round%5===0\?'horn':'battleStart'\)/, 'battleStart'],
    [/sfx\(S\.round%5===0\?'horn':'battleStart'\)/, 'horn'],
    [/sfx\(won\?'win':'lose',\{delay:\.12\}\)/, 'win'],
    [/if\(win\)sfx\('finalWin'\)/, 'finalWin'],
    [/sfx\('settle'\)/, 'settle'],
  ];
  for (const [site, key] of sourceChecks) {
    assert.match(html, site, `${key} system event must remain wired`);
    const h = harness();
    h.evalIn(`sfx(${JSON.stringify(key)})`);
    assert.equal(h.sandbox.window.__sfxCount[key], 1, `${key} must emit an audible event`);
  }
  console.log('✅ 开战、野怪、胜负及结算系统事件保持接线且可发声');
}
