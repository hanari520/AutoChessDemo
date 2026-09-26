'use strict';
// Focused integration tests for the real inline combat script. Keep this DOM
// stub aligned with tools/sim.js; no browser or balance simulation is needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DailyCurses = require('./daily-curses.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert(match, 'index.html must contain the inline game script');
const source = match[1];
const runtimeSource = fs.readFileSync(path.join(__dirname, 'bond-runtime.js'), 'utf8');

function element() {
  const el = {
    style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
    dataset: {}, children: [], title: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    removeChild() {}, remove() {},
    querySelector() { return element(); }, querySelectorAll() { return []; },
    addEventListener() {}, setAttribute(k, v) { this[k] = String(v); },
    removeAttribute(k) { delete this[k]; }, hasAttribute(k) { return Object.hasOwn(this, k); }, focus() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 58, height: 58 }; },
    closest() { return null; },
  };
  Object.defineProperty(el, 'innerHTML', { get() { return this._ih || ''; }, set(v) { this._ih = v; } });
  Object.defineProperty(el, 'offsetHeight', { get() { return 40; } });
  Object.defineProperty(el, 'offsetWidth', { get() { return 478; } });
  return el;
}

function game(seed = 41) {
  const elements = new Map();
  const storage = new Map();
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (randomState + 0x6D2B79F5) | 0;
    let t = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const math = Object.create(Math);
  math.random = random;
  const ctx = {
    console, Math: math, Date, JSON, Object, Array, Set, Map, Promise,
    performance: { now() { return 0; } },
    Uint8Array, Number, String, Boolean, RegExp, Error, TypeError,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    innerWidth: 1280, innerHeight: 800, __HEADLESS: true, DailyCurses,
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, elementFromPoint() { return null; }, body: element(),
    },
    localStorage: {
      getItem(k) { return storage.get(k) ?? null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); },
    },
    matchMedia() { return { matches: false }; }, requestAnimationFrame() { return 0; },
    addEventListener() {}, setInterval() { return 0; }, clearInterval() {},
    setTimeout() { return 0; }, clearTimeout() {},
    Worker: class { postMessage() {} terminate() {} }, navigator: {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(runtimeSource, ctx, { filename: 'bond-runtime.js' });
  vm.runInContext(source + '\n;globalThis.BondTestAPI = {\n' +
    'get S(){return S}, setS(v){S=v}, newGame, startBattle, saveGame, loadGame, ' +
    'get FACTIONS(){return FACTIONS}, get CLASSES(){return CLASSES}, get UNITS(){return UNITS}, ' +
    'get currentTick(){return currentTick}, get battleStats(){return battleStats}, ' +
    'boardTierKeys, nbList, dailyMods, makeBattleUnit, dealDamage, castSkill, byId, facsOf, jobsOf, ' +
    'renderSynergy, renderBook, rankedRun, rankedHist, writeRunHistory, ' +
    'get BV(){return BV}, get RND(){return RND}, get BondRuntime(){return BondRuntime}, ' +
    'get BOND_NEW_DESC(){return BOND_NEW_DESC}, bondModern, bondDesc, get boardUnits(){return window.__bu} };', ctx, { filename: 'index.html' });
  return { ctx, api: ctx.BondTestAPI, storage, elements };
}

function piece(api, id) {
  return { uid: api.S.uid++, id, star: 1, sks: 1, hp: 300, maxhp: 300, atk: 30, items: [] };
}

function bondMembers(api, name, kind) {
  return api.UNITS.filter(d => (kind === 'faction' ? api.facsOf(d) : api.jobsOf(d)).includes(name));
}

function setupBattle(api, playerIds, enemyIds, opts = {}) {
  api.newGame();
  api.S.bondRulesVersion = opts.version ?? 2;
  api.S.lvl = Math.max(playerIds.length, 2);
  api.S.bench = Array(8).fill(null);
  api.S.board = Array(64).fill(null);
  api.S.enemyBoard = Array(64).fill(null);
  playerIds.forEach((id, i) => { api.S.board[4 * 8 + i] = piece(api, id); });
  enemyIds.forEach((id, i) => { api.S.enemyBoard[i] = piece(api, id); });
  if (opts.dailyCurse) api.S.dailyCurse = opts.dailyCurse;
  if (opts.bannedBond) api.S.cursesData.nobond = [opts.bannedBond];
  api.S.phase = 'prep';
  api.startBattle();
  return api.boardUnits;
}

test('headless loader exposes the real 22 bond definitions', () => {
  const { api } = game();
  assert.equal(Object.keys(api.FACTIONS).length, 12);
  assert.equal(Object.keys(api.CLASSES).length, 10);
  for (const [name, cfg] of Object.entries({ ...api.FACTIONS, ...api.CLASSES })) {
    assert(Array.isArray(cfg.need) && cfg.need.length, name + ': missing thresholds');
    assert.equal(cfg.desc.length, cfg.need.length, name + ': one description per tier');
    assert(cfg.desc.every(x => typeof x === 'string' && x.trim()), name + ': empty description');
  }
  assert.equal(Object.keys(api.BOND_NEW_DESC).length, 22);
  for (const [name, cfg] of Object.entries({ ...api.FACTIONS, ...api.CLASSES })) {
    assert.equal(api.BOND_NEW_DESC[name].length, cfg.need.length, name + ': modern tier text count');
    assert(api.BOND_NEW_DESC[name][0] !== cfg.desc[0], name + ': modern text still describes old stat bonus');
  }
});

test('new battle gives matching bond tiers to both sides', () => {
  const { api } = game();
  const members = bondMembers(api, '深海', 'faction').slice(0, 2).map(x => x.id);
  assert.equal(members.length, 2);
  const units = setupBattle(api, members, members);
  assert.equal(api.BV[0]['深海'], 1);
  assert.equal(api.BV[1]['深海'], 1);
  assert.equal(units.filter(u => u.side === 0 && u.bond['深海']).length, 2);
  assert.equal(units.filter(u => u.side === 1 && u.bond['深海']).length, 2);
});

test('all 22 new mechanisms activate from real roster tags on either side', () => {
  const { api } = game();
  for (const [kind, table] of [['faction', api.FACTIONS], ['class', api.CLASSES]]) {
    for (const [name, cfg] of Object.entries(table)) {
      const ids = bondMembers(api, name, kind).slice(0, cfg.need[0]).map(x => x.id);
      assert.equal(ids.length, cfg.need[0], name + ': insufficient roster members');
      const units = setupBattle(api, ids, ids);
      for (const side of [0, 1]) {
        assert.equal(api.BV[side][name], 1, name + ': side ' + side + ' tier');
        assert.equal(units.filter(u => u.side === side && api.BondRuntime.tier(u, name) > 0).length,
          ids.length, name + ': side ' + side + ' recipients');
      }
    }
  }
});

test('sealed and penalized bonds use the same tier decision in UI and combat', () => {
  const { api } = game();
  const ids = bondMembers(api, '深海', 'faction').slice(0, 2).map(x => x.id);
  api.newGame();
  api.S.board = Array(64).fill(null);
  ids.forEach((id, i) => { api.S.board[32 + i] = piece(api, id); });
  api.S.cursesData.nobond = ['深海'];
  assert(!api.boardTierKeys().some(x => x.startsWith('F:深海:')));
  assert(api.nbList().includes('深海'));
  api.S.cursesData.nobond = [];
  const bias = DailyCurses.create(20260926, 'dc_bias');
  bias.focus = '深海';
  api.S.dailyCurse = bias;
  assert.equal(api.dailyMods().synergyPenalty, '深海');
  assert(!api.boardTierKeys().some(x => x.startsWith('F:深海:')));
  api.S.dailyCurse = null;
  assert(api.boardTierKeys().some(x => x === 'F:深海:1'));
  const sealed = setupBattle(api, ids, ids, { bannedBond: '深海' });
  assert.equal(api.BV[0]['深海'], undefined);
  assert.equal(api.BV[1]['深海'], 1, 'legacy seal targets the player only');
  assert(sealed.filter(u => u.side === 0).every(u => !api.BondRuntime.tier(u, '深海')));
  const biased = setupBattle(api, ids, ids, { dailyCurse: bias });
  assert.equal(api.BV[0]['深海'], undefined);
  assert.equal(api.BV[1]['深海'], 1, 'daily threshold penalty targets the player only');
  assert(biased.filter(u => u.side === 0).every(u => !api.BondRuntime.tier(u, '深海')));
});

test('a legacy save remains on the legacy bond path after restore', () => {
  const { api, storage } = game();
  api.newGame();
  assert.equal(api.S.bondRulesVersion, 2);
  assert(api.saveGame());
  const key = 'vc_save4';
  const old = JSON.parse(storage.get(key));
  delete old.bondRulesVersion;
  storage.set(key, JSON.stringify(old));
  assert(api.loadGame(key));
  assert.equal(api.S.bondRulesVersion, 1);
  assert.equal(api.bondModern(), false);
  assert.equal(api.bondDesc('深海', api.FACTIONS['深海'])[0], api.FACTIONS['深海'].desc[0]);
  assert.equal(api.rankedRun(), false, 'legacy combat rules must not submit to the new leaderboard');
  assert(api.writeRunHistory(false));
  const history = JSON.parse(storage.get('vc_history'));
  assert.equal(history[0].bondRulesVersion, 1);
  assert.equal(api.rankedHist(history[0]), false,
    'legacy history must not become eligible for a later leaderboard submission');
});

test('modern path does not retain legacy attack, resistance or global shred bonuses', () => {
  for (const [name, kind, field, side, direction] of [
    ['毛茸乐园', 'faction', 'atk', 0, 'greater'],
    ['深海', 'faction', 'mr', 0, 'greater'],
    ['法师', 'class', 'mr', 1, 'less'],
  ]) {
    const build = version => {
      const { api } = game(123);
      const ids = bondMembers(api, name, kind).slice(0, api[kind === 'faction' ? 'FACTIONS' : 'CLASSES'][name].need[0]).map(x => x.id);
      const opponent = bondMembers(api, '花语', 'faction')[0].id;
      const units = setupBattle(api, ids, [opponent], { version });
      return units.find(u => u.side === side && (side === 1 || ids.includes(u.id)))[field];
    };
    const legacy = build(1), modern = build(2);
    if (direction === 'greater') assert(legacy > modern, name + ': old bonus still applied in modern combat');
    else assert(legacy < modern, name + ': old shred still applied in modern combat');
  }
});

test('bond sidebar and codex show the active rules version', () => {
  const { api, elements } = game();
  const ids = bondMembers(api, '深海', 'faction').slice(0, 2).map(x => x.id);
  api.newGame();
  api.S.board = Array(64).fill(null);
  ids.forEach((id, i) => { api.S.board[32 + i] = piece(api, id); });
  api.renderSynergy();
  api.renderBook();
  const sidebar = elements.get('synAll').innerHTML;
  const codex = elements.get('bookSyn').innerHTML;
  assert(sidebar.includes('潮盾') && codex.includes('潮盾'));
  assert(!sidebar.includes('魔法抗性 +12%') && !codex.includes('魔法抗性 +12%'));
  api.S.bondRulesVersion = 1;
  api.renderSynergy();
  api.renderBook();
  assert(elements.get('synAll').innerHTML.includes('魔法抗性 +12%'));
  assert(elements.get('bookSyn').innerHTML.includes('魔法抗性 +12%'));
});

test('first skill hit grants the Deep Sea shield on either side only once', () => {
  const { api } = game();
  const ids = bondMembers(api, '深海', 'faction').slice(0, 2).map(x => x.id);
  const units = setupBattle(api, ids, ids);
  for (const side of [0, 1]) {
    const target = units.find(u => u.side === side && api.BondRuntime.tier(u, '深海'));
    const attacker = units.find(u => u.side !== side);
    attacker._casting = true;
    const initial = target.shield || 0;
    assert.equal(api.BondRuntime.preHit(attacker, target, 30, units, 'magic'), 30);
    assert(target.shield > initial, 'side ' + side + ' should receive tide shield');
    const once = target.shield;
    api.BondRuntime.preHit(attacker, target, 30, units, 'magic');
    assert.equal(target.shield, once, 'side ' + side + ' should not retrigger');
    attacker._casting = false;
  }
});

test('Deep Sea tier 2 visibly protects a second nearby ally', () => {
  const { api } = game();
  const ids = bondMembers(api, '深海', 'faction').slice(0, 4).map(x => x.id);
  const units = setupBattle(api, ids, ids);
  assert.equal(api.BV[0]['深海'], 2);
  const target = units.find(u => u.side === 0 && api.BondRuntime.tier(u, '深海'));
  const attacker = units.find(u => u.side === 1);
  const allies = units.filter(u => u.side === 0 && u !== target);
  attacker._casting = true;
  api.BondRuntime.preHit(attacker, target, 30, units, 'magic');
  assert(target.shield > 0);
  assert.equal(allies.filter(u => u.shield > 0).length, 1,
    'higher tier should add one visible protected ally');
});

test('Forest members have an intrinsic way to trigger their dodge phantom', () => {
  const { api } = game();
  const ids = bondMembers(api, '森之国', 'faction').slice(0, 3).map(x => x.id);
  const units = setupBattle(api, ids, ids);
  for (const side of [0, 1]) {
    const members = units.filter(u => u.side === side && api.BondRuntime.tier(u, '森之国'));
    assert(members.every(u => u.dodge >= 0.18),
      'side ' + side + ': dodge phantom has no intrinsic trigger');
  }
});

test('different Star casters chain once and incidental bond damage does not recurse', () => {
  const { api } = game();
  const ids = bondMembers(api, '星际', 'faction').slice(0, 2).map(x => x.id);
  const units = setupBattle(api, ids, ids);
  const runtime = api.BondRuntime;
  for (const side of [0, 1]) {
    const casters = units.filter(u => u.side === side && runtime.tier(u, '星际'));
    const foes = units.filter(u => u.side !== side && u.hp > 0);
    assert.equal(casters.length, 2);
    const hp = foes.reduce((n, u) => n + u.hp + (u.shield || 0), 0);
    runtime.cast(casters[0], units);
    assert.equal(foes.reduce((n, u) => n + u.hp + (u.shield || 0), 0), hp,
      'one caster cannot complete the chain');
    runtime.cast(casters[1], units);
    assert(foes.reduce((n, u) => n + u.hp + (u.shield || 0), 0) < hp,
      'second distinct caster deals chain damage');
    assert.equal(runtime.state.depth, 0, 'nested damage guard must unwind');
  }
});

test('P-SP interrupts before casting symmetrically and obeys its tier budget', () => {
  for (const count of [2, 4]) {
    const { api } = game();
    const ids = bondMembers(api, 'P-SP', 'faction').slice(0, count).map(x => x.id);
    const other = bondMembers(api, '深海', 'faction').slice(0, 2).map(x => x.id);
    const max = count === 4 ? 2 : 1;
    for (const ownerSide of [0, 1]) {
      const units = setupBattle(api, ownerSide === 0 ? ids : other, ownerSide === 1 ? ids : other);
      const caster = units.find(u => u.side !== ownerSide && !u.isPassiveFlag);
      assert(caster, 'fixture needs an active enemy caster');
      for (const u of units.filter(u => u.side === caster.side)) u.mana = u === caster ? u.maxmana : 0;
      for (let attempt = 0; attempt < max; attempt++) {
        caster.mana = caster.maxmana;
        assert.equal(api.BondRuntime.beforeCast(caster, units), true,
          `P-SP tier ${max}, side ${ownerSide}, interruption ${attempt + 1}`);
        assert(caster.mana < caster.maxmana && caster.silenceT > 0,
          'interruption must prevent this cast before the skill resolves');
      }
      caster.mana = caster.maxmana;
      assert.equal(api.BondRuntime.beforeCast(caster, units), false,
        `P-SP tier ${max}, side ${ownerSide}, budget exhausted`);
    }
  }
});

test('adjacent Four Xi sharing is bounded to one hop and releases the recursion guard', () => {
  const { api } = game();
  const ids = bondMembers(api, '四禧丸子', 'faction').slice(0, 2).map(x => x.id);
  const units = setupBattle(api, ids, ids);
  const runtime = api.BondRuntime;
  const target = units.find(u => u.side === 0 && runtime.tier(u, '四禧丸子'));
  const mate = units.find(u => u.side === 0 && u !== target && runtime.tier(u, '四禧丸子'));
  const attacker = units.find(u => u.side === 1);
  const hp = mate.hp;
  const original = 40;
  const remaining = runtime.preHit(attacker, target, original, units, 'phys');
  assert(remaining < original && remaining > 0, 'some damage should redirect');
  assert(mate.hp < hp, 'adjacent member should take redirected damage');
  assert.equal(runtime.state.depth, 0);
});

test('Medic triage is reserved for actual lethal damage after mitigation', () => {
  const { api } = game();
  const ids = bondMembers(api, '医者', 'class').slice(0, 2).map(x => x.id);
  const enemy = bondMembers(api, '学园', 'faction')[0].id;
  const units = setupBattle(api, ids, [enemy]);
  const target = units.find(u => u.side === 0 && api.BondRuntime.tier(u, '医者'));
  const attacker = units.find(u => u.side === 1);
  target.hp = 40;
  target.ar = 200;
  api.dealDamage(attacker, target, 50, units, 'phys');
  assert(target.hp > 0, 'mitigated hit is not lethal');
  assert.equal(api.BondRuntime.state.rescued[0], false,
    'nonlethal hit must not consume the one per battle triage');
  target.ar = 0;
  target.hp = 25;
  api.dealDamage(attacker, target, 500, units, 'pure');
  assert.equal(api.BondRuntime.state.rescued[0], true);
  assert.equal(target.hp, 1, 'fatal hit should leave the rescued ally alive');
});

test('Medic triage also catches lethal poison and thorn damage', () => {
  const idsFor = api => bondMembers(api, '医者', 'class').slice(0, 2).map(x => x.id);
  {
    const { api } = game();
    const enemy = bondMembers(api, '学园', 'faction')[0].id;
    const units = setupBattle(api, idsFor(api), [enemy]);
    const target = units.find(u => u.side === 0 && api.BondRuntime.tier(u, '医者'));
    for (const u of units) { u.cd = 1e9; u.moveCd = 1e9; }
    target.hp = 20; target.poisonT = 1000; target.poisonDmg = 30;
    for (let i = 0; i < 10; i++) api.currentTick();
    assert(target.hp > 0, 'lethal poison should trigger triage');
  }
  {
    const { api } = game();
    const enemy = bondMembers(api, '学园', 'faction')[0].id;
    const units = setupBattle(api, idsFor(api), [enemy]);
    const attacker = units.find(u => u.side === 0 && api.BondRuntime.tier(u, '医者'));
    const target = units.find(u => u.side === 1);
    attacker.hp = 20; target.thorns = 0.4;
    api.dealDamage(attacker, target, 10, units, 'phys');
    assert(attacker.hp > 0, 'lethal thorns should trigger triage; hp=' + attacker.hp +
      ' maxhp=' + attacker.maxhp + ' healer=' + units.filter(u => u.side === 0 && u !== attacker).map(u => u.hp + '/' + api.BondRuntime.tier(u, '医者')) +
      ' tier=' + api.BV[0]['医者'] + ' rescued=' + api.BondRuntime.state.rescued[0]);
  }
});

test('same seed and lineup produce identical short combat trace', () => {
  function trace() {
    const { api } = game(20260926);
    const ids = bondMembers(api, '游侠', 'class').slice(0, 2).map(x => x.id);
    const units = setupBattle(api, ids, ids);
    for (let i = 0; i < 55 && api.S.phase === 'battle'; i++) api.currentTick();
    return units.map(u => [u.uid, u.side, u.hp, u.mana, u.shield || 0, u.x, u.y]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(trace())), JSON.parse(JSON.stringify(trace())));
});
