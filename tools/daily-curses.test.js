'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Daily = require('./daily-curses');
const EXPECTED_IDS = [
  'dc_seal', 'dc_class', 'dc_faction', 'dc_march', 'dc_debt', 'dc_market', 'dc_nointerest',
  'dc_slowgrowth', 'dc_fog', 'dc_five', 'dc_glass', 'dc_drought', 'dc_armor', 'dc_lightgear'
];

const nonEmpty = value => value != null && (typeof value !== 'string' || value.trim().length > 0);
function createFor(id) {
  let seed = null;
  for (let year = 2026; year <= 2035 && seed == null; year++) {
    for (let month = 1; month <= 12 && seed == null; month++) {
      const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let day = 1; day <= count; day++) {
        const candidate = year * 10000 + month * 100 + day;
        if (Daily.pick(candidate)?.id === id) { seed = candidate; break; }
      }
    }
  }
  assert(seed, `no September 2026 date selects ${id}`);
  return Daily.create(seed);
}
const fire = (state, event, ctx) => Daily.transition(state, event, ctx);
const mods = (state, round, extra = {}) => Daily.modifiers(state, { round, ...extra });
const effectsOf = (result, type) => result.effects.filter(effect => effect.type === type);

test('daily curse pool is a versioned, displayable set of exactly 14 unique rules', () => {
  assert(Array.isArray(Daily.CATALOG), 'DailyCurses.CATALOG must be an array');
  assert.equal(Daily.CATALOG.length, 14);
  const ids = Daily.CATALOG.map(c => c.id);
  assert.equal(new Set(ids).size, 14, 'curse IDs must be unique');
  assert.deepEqual(ids, EXPECTED_IDS, 'the complete, stable 14-rule pool must be present in its documented order');
  for (const curse of Daily.CATALOG) {
    assert.match(curse.id, /^dc_[a-z0-9_]+$/);
    assert(nonEmpty(curse.name), `${curse.id} has no display name`);
    assert(nonEmpty(curse.limit), `${curse.id} has no limit description`);
    assert(nonEmpty(curse.compensation), `${curse.id} has no compensation description`);
    assert(nonEmpty(curse.timing), `${curse.id} has no trigger timing`);
    assert(nonEmpty(Daily.description(curse.id)), `${curse.id} has no player-facing description`);
  }
});

test('same seed picks the same daily rule and serialized run state restores for that seed', () => {
  const a = Daily.pick(20260924);
  const b = Daily.pick(20260924);
  assert.deepEqual(a, b);
  assert(Daily.CATALOG.some(c => c.id === a.id), `picked unknown rule ${a.id}`);
  const state = Daily.create(20260924);
  assert.equal(state.seed, 20260924);
  assert.equal(state.id, a.id);
  assert(state.version, 'daily rules need a pinned version');
  assert.deepEqual(Daily.restore(JSON.parse(JSON.stringify(state)), 20260924), state);
  assert.equal(Daily.restore(state, 20260925), null, 'a state from another day must not be reused');
  const incompatible = { ...state, version: 'unknown-version' };
  assert.equal(Daily.restore(incompatible, 20260924), null,
    'unknown rule versions must be rejected instead of reinterpreted');
});

test('rule modifiers always return a serializable object and never mutate the saved state', () => {
  for (const curse of Daily.CATALOG) {
    const state = createFor(curse.id);
    const before = JSON.stringify(state);
    const modifiers = Daily.modifiers(state, { round: 1, phase: 'prep' });
    assert(modifiers && typeof modifiers === 'object' && !Array.isArray(modifiers), `${curse.id} modifiers must be an object`);
    assert.doesNotThrow(() => JSON.stringify(modifiers));
    assert.equal(JSON.stringify(state), before, `${curse.id} modifiers mutated saved state`);
  }
});

test('curse transitions are immutable and return explicit state/effects', () => {
  const state = Daily.create(20260924);
  const before = JSON.stringify(state);
  const result = Daily.transition(state, 'start', {});
  assert(result && result.state && typeof result.state === 'object', 'transition must return state');
  assert(result.effects && typeof result.effects === 'object', 'transition must return effects');
  assert.equal(JSON.stringify(state), before, 'transition mutated its input state');
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('all 14 rules apply their individual modifiers and first compensation triggers', () => {
  let s = createFor('dc_seal');
  let tr = fire(s, 'roundStart', { round: 1, synergies: ['学园', '守护'] });
  assert(tr.state.seal);
  assert.equal(mods(tr.state, 1).bannedSynergy, tr.state.seal);
  assert.equal(mods(tr.state, 1).refreshCost, 0);
  assert(effectsOf(tr, 'log').some(e => /封印/.test(e.text)));
  tr = fire(tr.state, 'refresh', { round: 1 });
  assert.equal(mods(tr.state, 1).refreshCost, 2, 'free seal refresh is one-shot');

  s = createFor('dc_class');
  assert.equal(mods(s, 1).synergyClassOffset, 1);
  tr = fire(s, 'start', { round: 1, units: [
    {id:'a',cost:2,job:'守护'}, {id:'b',cost:2,job:'刺客'}, {id:'c',cost:2,job:'法师'}
  ] });
  assert.equal(effectsOf(tr, 'unit').length, 1);
  assert.equal(effectsOf(tr, 'unit')[0].options.length, 3);

  s = createFor('dc_faction');
  assert.equal(mods(s, 1).synergyFactionOffset, 1);
  tr = fire(s, 'start', { round: 1, units: [
    {id:'a',cost:2,fac:'学园'}, {id:'b',cost:2,fac:'星际'}, {id:'c',cost:2,fac:'夜幕'}
  ] });
  assert.equal(effectsOf(tr, 'unit').length, 1);
  assert.equal(effectsOf(tr, 'unit')[0].options.length, 3);

  s = createFor('dc_march');
  assert.equal(mods(s, 20).enemyHpMultiplier, 1.15);
  assert.equal(mods(s, 20).enemyAtkMultiplier, 1.15);
  assert.equal(mods(s, 1).naturalXp, 3);
  assert.equal(mods(s, 11).naturalXp, 2);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'ticket').length, 1);

  s = createFor('dc_debt');
  assert.equal(mods(s, 1).maxHp, 30);
  tr = fire(s, 'roundStart', { round: 5, gold: 10 });
  assert.deepEqual(effectsOf(tr, 'gold').map(e => e.amount), [-4, 2]);
  tr = fire(s, 'roundStart', { round: 10, gold: 3 });
  assert.deepEqual(effectsOf(tr, 'hp').map(e => e.amount), [-3]);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'gold')[0].amount, 12);

  s = createFor('dc_market');
  assert.equal(mods(s, 1).shopSize, 4);
  assert.equal(mods(s, 1).refreshCost, 0);
  tr = fire(s, 'refresh', { round: 1 }); assert.equal(mods(tr.state, 1).refreshCost, 2);
  tr = fire(tr.state, 'refresh', { round: 1 }); assert.equal(mods(tr.state, 1).refreshCost, 3);
  tr = fire(tr.state, 'refresh', { round: 1 }); assert.equal(mods(tr.state, 1).refreshCost, 3);

  s = createFor('dc_nointerest');
  assert.equal(mods(s, 1).interestMultiplier, 0);
  assert.equal(effectsOf(fire(s, 'result', { round: 1, won: true, ordinary: true }), 'gold').some(e => e.amount === 2), true);
  for (const context of [
    { round: 5, won: true, ordinary: true, creep: true },
    { round: 25, won: true, ordinary: true, boss: true },
    { round: 1, won: false, ordinary: true }
  ]) assert.equal(effectsOf(fire(s, 'result', context), 'gold').some(e => e.amount === 2), false);

  s = createFor('dc_slowgrowth');
  assert.equal(mods(s, 1).naturalXp, 3);
  assert.equal(mods(s, 1).buyXp, false);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'gold')[0].amount, 6);
  assert.equal(effectsOf(fire(s, 'roundStart', { round: 26 }), 'gold')[0].amount, 4);

  s = createFor('dc_fog');
  assert.equal(mods(s, 5).fog, true);
  tr = fire(s, 'roundStart', { round: 5 });
  assert.equal(mods(tr.state, 5).freeTempBuff, true);
  assert.equal(effectsOf(tr, 'freeBuff').length, 1);
  tr = fire(tr.state, 'result', { round: 5, won: true });
  assert.equal(mods(tr.state, 5).freeTempBuff, false, 'temporary buff expires at result');

  s = createFor('dc_five');
  assert.equal(mods(s, 1).cap, 5);
  assert.equal(mods(s, 1).shopLevelByRound, true);
  assert.equal(mods(s, 1).shopLevel, 5);
  assert.equal(mods(s, 31).shopLevel, 11);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'gold')[0].amount, 16);
  assert.equal(effectsOf(fire(s, 'roundStart', { round: 10 }), 'item').length, 1);

  s = createFor('dc_glass');
  assert.equal(mods(s, 1).allyHpMultiplier, .75);
  assert.equal(mods(s, 1).allyAtkMultiplier, 1.25);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'item')[0].key, 'armor');
  assert.equal(effectsOf(fire(s, 'roundStart', { round: 26 }), 'item')[0].key, 'armor');

  s = createFor('dc_drought');
  assert.equal(mods(s, 1).manaCost, 75);
  assert.equal(mods(s, 1).skillMultiplier, 1.2);
  assert.equal(effectsOf(fire(s, 'start', { round: 1 }), 'gold')[0].amount, 6);
  assert.equal(effectsOf(fire(s, 'roundStart', { round: 26 }), 'gold')[0].amount, 4);

  s = createFor('dc_armor');
  assert.equal(mods(s, 1).enemyHpMultiplier, 1.12);
  assert.equal(mods(s, 1).enemyAtkMultiplier, 1.12);
  tr = fire(s, 'result', { round: 1, won: true, ordinary: true });
  assert.equal(effectsOf(tr, 'gold')[0].amount, 5);
  tr = fire(tr.state, 'result', { round: 2, won: true, ordinary: true });
  assert.equal(effectsOf(tr, 'gold').length, 0, 'only one bounty per five-round block');
  for (const context of [
    { round: 5, won: true, ordinary: true, creep: true },
    { round: 5, won: true, ordinary: true, boss: true },
    { round: 5, won: false, ordinary: true }
  ]) assert.equal(effectsOf(fire(s, 'result', context), 'gold').length, 0);

  s = createFor('dc_lightgear');
  assert.equal(mods(s, 1).maxEquip, 1);
  assert.equal(effectsOf(fire(s, 'result', { round: 5, won: true, creep: true }), 'item').length, 1);
  assert.equal(effectsOf(fire(s, 'result', { round: 10, won: false, creep: true }), 'item').length, 1,
    'extra equipment also drops after a lost creep battle');
  assert.equal(effectsOf(fire(s, 'result', { round: 25, won: true, creep: true, boss: true }), 'item').length, 0,
    'chapter bosses do not receive light-gear creep rewards');
});

test('one-time events deduplicate and result context excludes special battles and losses', () => {
  for (const curse of Daily.CATALOG) {
    const state = createFor(curse.id);
    const first = fire(state, 'roundStart', { round: 1, gold: 0, synergies: ['学园'], units: [] });
    const again = fire(first.state, 'roundStart', { round: 1, gold: 0, synergies: ['学园'], units: [] });
    assert.deepEqual(again.effects, [], `${curse.id} duplicated a once-per-round effect`);
    assert.deepEqual(again.state, first.state, `${curse.id} mutated state on duplicate event`);
  }
});
