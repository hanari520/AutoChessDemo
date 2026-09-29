import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBattle, SKILLS } from './combat.js';
import { createGame, applyAction, advancePhase } from './core.js';

/* Skills audit for the eight-player deterministic resolver.
 *
 * Layer 1: every one of the 50 roster pieces gets a controlled battle where it
 * must actually fire its kit (cast event, heal/shield output, control probe).
 * Layer 2: a full eight-player game driven through core.js only; every fielded
 * non-passive piece that fights at least two battles must cast at least once.
 *
 * Scenario knobs: opts.initialMana=50 makes every unit cast on tick 0 (side A
 * entries act before side B inside one tick), and board geometry decides which
 * enemies are inside cleave/field/zone radius at that moment. Control probes
 * exploit the same ordering: an enemy sitting at full mana would cast on tick 0,
 * so its first cast moving to >= ccDuration-100ms proves the cc landed. */

const RAW_IDS = [
  'ein','kouichi','yua','goutan','yujiu','songlv','likou','agari','hoshimi','chiharu',
  'suiji','kanban','zhouyi','yuji','tiandou','aza','pako','zhijin','sishi','sumi',
  'yukie','miting','xuezhu','zeyin','sanli','diansu','lianshiye','huize','shengge','shadow',
  'nox','miyue','huali','youyu','quanrong','ruiya','mumu','kroya','shiliu','seki',
  'haruka','mahiru','nana7mi','liAn','youyi','azi','taodai','miki','rei','rinco'
];
const PASSIVE = new Set(['zhouyi', 'yuji', 'youyi']);
const HEAL_MODES = new Set(['heal', 'support', 'team']);
const SHIELD_MODES = new Set(['guard', 'guardLink', 'teamShield']);
const RADIUS_MODES = new Set(['cleave', 'burst', 'field', 'zone']);

const board = (...entries) => {
  const cells = Array(64).fill(null);
  for (const [slot, id, extra] of entries) cells[slot] = { uid: `${id}-${slot}`, id, star: 1, items: [], ...extra };
  return cells;
};
const uid = (id, slot) => `${id}-${slot}`;
const eventsFrom = (events, u) => events.filter(e => e.from === u);
const firstAt = (events, predicate) => events.find(predicate)?.at ?? Infinity;

/* Ranged layout: tested piece at slot 27 (x3,y3), tanking quanrong at 26 and an
 * armored ein at 25 that soaks enemy fire (an injured-but-alive heal target),
 * enemies (melee ein + two ranged yujiu) far enough that cleaves miss on tick 0. */
const rangedBoard = id => board([25, 'ein', { items: ['armor'] }], [26, 'quanrong'], [27, id]);
const rangedEnemies = () => board([36, 'ein'], [44, 'yujiu'], [45, 'yujiu']);

/* Adjacent layout: single enemy ein at slot 35 (x3,y4), distance 1 from the piece. */
const adjacentBoard = id => board([27, id]);
const adjacentEnemies = (extra) => board([35, 'ein', extra]);

const runRanged = (id, opts = {}) =>
  resolveBattle(rangedBoard(id), rangedEnemies(), 20260929, { initialMana: 50, maxTicks: 1200, ...opts });
const runAdjacent = (id, opts = {}) =>
  resolveBattle(adjacentBoard(id), adjacentEnemies(), 20260929, { initialMana: 50, maxTicks: 1200, ...opts });

test('SKILLS covers exactly the 50 roster pieces with the documented passives', () => {
  assert.equal(Object.keys(SKILLS).length, 50);
  assert.deepEqual([...Object.keys(SKILLS)].sort(), [...RAW_IDS].sort());
  for (const id of RAW_IDS) {
    if (PASSIVE.has(id)) assert.equal(SKILLS[id].mode, 'passive', `${id} must be passive`);
    else assert.notEqual(SKILLS[id].mode, 'passive', `${id} must be active`);
  }
});

test('every active piece casts and produces its mode signature output', () => {
  const problems = [];
  for (const id of RAW_IDS) {
    if (PASSIVE.has(id)) continue;
    const mode = SKILLS[id].mode;
    const result = RADIUS_MODES.has(mode) ? runAdjacent(id) : runRanged(id);
    const me = uid(id, 27);
    const casts = eventsFrom(result.events, me).filter(e => e.type === 'cast');
    if (!casts.length) { problems.push(`${id}: no cast event`); continue; }
    if (HEAL_MODES.has(mode) && !eventsFrom(result.events, me).some(e => e.type === 'heal'))
      problems.push(`${id}: cast but never healed`);
    if (SHIELD_MODES.has(mode) && !eventsFrom(result.events, me).some(e => e.type === 'shield'))
      problems.push(`${id}: cast but raised no shield`);
    if (!HEAL_MODES.has(mode) && !SHIELD_MODES.has(mode)
      && !eventsFrom(result.events, me).some(e => e.type === 'skill'))
      problems.push(`${id}: cast but landed no skill damage`);
  }
  assert.deepEqual(problems, [], 'every active kit must cast and produce output');
});

/* Control probes: enemy ein starts adjacent at full mana and would cast its guard
 * on tick 0; each hard-cc kit pushes that first cast out by its duration. */
const CC_PROBES = {
  yukie: 450, songlv: 800, sanli: 600, shiliu: 600, azi: 1500,
  diansu: 2200, xuezhu: 2000, ruiya: 2400, liAn: 1400
};
const SILENCE_PROBES = { yua: 1800, lianshiye: 3000, seki: 2600, rei: 2400, rinco: 1800 };

test('hard control kits (stun/freeze/petrify) freeze the enemy timeline', () => {
  const problems = [];
  for (const [id, duration] of Object.entries(CC_PROBES)) {
    const result = runAdjacent(id);
    const enemy = uid('ein', 35);
    const firstEnemyCast = firstAt(result.events, e => e.type === 'cast' && e.from === enemy);
    const firstEnemyAttack = firstAt(result.events, e => e.type === 'attack' && e.from === enemy);
    if (firstEnemyCast < duration - 100) problems.push(`${id}: enemy cast at ${firstEnemyCast} < ${duration - 100}`);
    if (firstEnemyAttack < duration - 100) problems.push(`${id}: enemy attacked at ${firstEnemyAttack} < ${duration - 100}`);
  }
  assert.deepEqual(problems, []);
});

test('silence kits delay the enemy cast past the silence duration', () => {
  const problems = [];
  for (const [id, duration] of Object.entries(SILENCE_PROBES)) {
    const result = runAdjacent(id);
    const firstEnemyCast = firstAt(result.events, e => e.type === 'cast' && e.from === uid('ein', 35));
    if (firstEnemyCast < duration - 100) problems.push(`${id}: enemy cast at ${firstEnemyCast} < ${duration - 100}`);
  }
  assert.deepEqual(problems, []);
});

test('mana burn kits emit manaBurn and strip enemy mana', () => {
  for (const id of ['yua', 'lianshiye', 'seki']) {
    const result = RADIUS_MODES.has(SKILLS[id].mode) ? runAdjacent(id) : runRanged(id);
    assert.ok(eventsFrom(result.events, uid(id, 27)).some(e => e.type === 'manaBurn'),
      `${id} should burn mana on cast`);
  }
});

/* Slow probes: the adjacent ein (speed .8, base swing 1812ms) must swing slower
 * while the kit slow is active; a stretched post-cast gap proves slowPct works.
 * The probe target stacks aegis+armor so it survives at least two slowed swings. */
test('slow kits stretch the enemy swing timer', () => {
  for (const [id, pct] of [['huize', .4], ['nana7mi', .35]]) {
    const result = resolveBattle(adjacentBoard(id), board([35, 'ein', { items: ['aegis', 'armor'] }]),
      20260929, { initialMana: 50, maxTicks: 1200 });
    const swings = eventsFrom(result.events, uid('ein', 35)).filter(e => e.type === 'attack').map(e => e.at);
    assert.ok(swings.length >= 2, `${id}: enemy swung ${swings.length} times`);
    const gaps = swings.slice(1).map((at, i) => at - swings[i]);
    const stretched = Math.floor(1450 / .8 * (1 + pct));
    assert.ok(gaps.some(gap => gap >= stretched - 250),
      `${id}: no swing gap >= ${stretched - 250}ms (gaps ${gaps})`);
  }
});

test('shield interaction kits: shiliu steals, diansu shatters, zhouyi strips passively', () => {
  // Enemy carries an armor component: opening shield is live from tick 0.
  const steal = resolveBattle(adjacentBoard('shiliu'), board([35, 'ein', { items: ['armor'] }]), 20260929,
    { initialMana: 50, maxTicks: 1200 });
  const shatter = resolveBattle(adjacentBoard('diansu'), board([35, 'ein', { items: ['armor'] }]), 20260929,
    { initialMana: 50, maxTicks: 1200 });
  assert.ok(eventsFrom(shatter.events, uid('diansu', 27)).some(e => e.type === 'shieldBreak')
    || shatter.events.some(e => e.type === 'shieldBreak' && e.by === uid('diansu', 27)),
    'diansu should shatter the opening shield');
  assert.ok(eventsFrom(steal.events, uid('shiliu', 27)).some(e => e.type === 'shield' && e.target === uid('shiliu', 27)),
    'shiliu should steal the opening shield onto itself');

  // zhouyi is passive: no cast ever, but attacks strip shields and emit shieldBreak.
  const strip = resolveBattle(adjacentBoard('zhouyi'), adjacentEnemies({ items: ['armor'] }), 20260929,
    { maxTicks: 1200 });
  assert.ok(!eventsFrom(strip.events, uid('zhouyi', 27)).some(e => e.type === 'cast'));
  assert.ok(strip.events.some(e => e.type === 'shieldBreak' && e.by === uid('zhouyi', 27)),
    'zhouyi should strip shields on attack');
});

test('yuji rainveil: builds rain stacks, converts them into guaranteed dodges and shields', () => {
  const result = resolveBattle(board([27, 'yuji']), board([11, 'ein']), 20260929, { maxTicks: 1200 });
  const me = uid('yuji', 27);
  const rainDodges = result.events.filter(e => e.type === 'dodge' && e.target === me && e.reason === 'rainveil');
  const rainShields = eventsFrom(result.events, me).filter(e => e.type === 'shield');
  assert.ok(rainDodges.length >= 1, 'rainveil should convert a rain stack into a dodge');
  assert.ok(rainShields.length >= 1, 'each rainveil dodge should raise an 8% shield');
  assert.ok(!eventsFrom(result.events, me).some(e => e.type === 'cast'), 'yuji stays passive');
});

test('youyi soulmate: attacks heal self and the lowest ally', () => {
  const result = resolveBattle(board([26, 'ein'], [27, 'youyi']), adjacentEnemies(), 20260929, { maxTicks: 1200 });
  const me = uid('youyi', 27);
  assert.ok(!eventsFrom(result.events, me).some(e => e.type === 'cast'), 'youyi stays passive');
  assert.ok(eventsFrom(result.events, me).some(e => e.type === 'heal'),
    'soulmate should heal on attack');
});

test('miting reflectSkill punishes the next enemy skill', () => {
  // kroya opens with a damaging magic skill at full mana; reflect must fire back.
  const result = resolveBattle(board([27, 'miting']), board([44, 'kroya']), 20260929,
    { initialMana: 50, maxTicks: 600 });
  assert.ok(result.events.some(e => e.type === 'cast' && e.from === uid('miting', 27)));
  assert.ok(result.events.some(e => e.type === 'reflect'), 'kroya skill should backlash via reflect');
});

test('skill power follows the solo cost/star curve (star-2 hits harder, cost curves intact)', () => {
  const hit = star => resolveBattle(board([27, 'yua', { star }]), board([44, 'ein']), 7,
    { initialMana: 50, maxTicks: 1 }).events.find(e => e.type === 'skill' && e.from === uid('yua', 27))?.amount;
  assert.ok(hit(1) > 0 && hit(2) > hit(1), `star scaling broken: ${hit(1)} -> ${hit(2)}`);
});

/* ---------------------------------------------------------------------------
 * Layer 2: full eight-player game through core.js only.
 * Policy: every alive seat recycles leftover bench units (keeps gold flowing and
 * the shared pool diverse), buys what it can afford, benches move onto empty
 * board slots up to level capacity, everyone readies. Battles are re-resolved
 * with the identical seed (captured before the prep->combat transition) so the
 * per-piece cast statistics use untruncated event streams.
 * ------------------------------------------------------------------------- */
function seed32(value) {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0 || 1;
}

function playFullGame(seed) {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `bot${i}`, name: `Bot ${i}` }));
  const state = createGame({ seed, players });
  const castCount = {}, fought = {}, rounds = [];
  let guard = 0;
  while (!state.complete && guard++ < 130) {
    for (const seat of state.seats) {
      if (!seat.alive) continue;
      for (const unit of [...seat.bench]) {
        if (unit) applyAction(state, seat.seat, { type: 'sell', uid: unit.uid });
      }
      if (seat.gold >= 12 && seat.level < 8) {
        try { applyAction(state, seat.seat, { type: 'buyXp' }); } catch { /* at level cap */ }
      }
      // Buy the richest cards first so 4/5-cost kits are actually fielded when offered.
      const slots = seat.shop.map((card, slot) => ({ card, slot }))
        .filter(s => s.card).sort((a, b) => b.card.cost - a.card.cost || a.slot - b.slot);
      for (const { card, slot } of slots) {
        if (card && seat.gold >= card.cost && seat.bench.includes(null)) {
          try { applyAction(state, seat.seat, { type: 'buy', slot }); } catch { /* bench filled by fuse */ }
        }
      }
      const cap = Math.min(8, seat.level);
      for (let b = 0; b < seat.bench.length; b++) {
        const unit = seat.bench[b];
        if (!unit) continue;
        const empty = seat.board.findIndex(u => !u);
        if (empty < 0 || seat.board.filter(Boolean).length >= cap) break;
        try { applyAction(state, seat.seat, { type: 'move', uid: unit.uid, to: { zone: 'board', slot: empty } }); } catch { break; }
      }
      applyAction(state, seat.seat, { type: 'ready' });
    }
    const rngBefore = state.rng;
    assert.equal(advancePhase(state), 'combat');
    for (const battle of state.battles) {
      if (battle.b === null) continue;
      const seed2 = seed32(`${state.seed}|${state.round}|${battle.a}|${battle.b}|${rngBefore}`);
      const full = resolveBattle(battle.formationA, battle.formationB, seed2, { maxTicks: 360 });
      assert.equal(full.winner, battle.winner, 're-resolved battle must match the room result');
      for (const { unit } of [...battle.formationA, ...battle.formationB])
        fought[unit.id] = (fought[unit.id] || 0) + 1;
      for (const e of full.events) if (e.type === 'cast') castCount[e.skill] = (castCount[e.skill] || 0) + 1;
    }
    rounds.push(state.round);
    advancePhase(state);
    advancePhase(state);
  }
  return { state, castCount, fought, roundsPlayed: rounds.length };
}

test('full eight-player game: fielded non-passive pieces cast across the season', () => {
  // Three independent full games (fresh shops/economies) merged so roster-wide
  // coverage is not hostage to one seed's shop offers.
  const merged = { castCount: {}, fought: {}, roundsPlayed: 0, games: 0 };
  for (const seed of ['skills-audit-2026-09-29-a', 'skills-audit-2026-09-29-b', 'skills-audit-2026-09-29-c',
    'skills-audit-2026-09-29-d', 'skills-audit-2026-09-29-e']) {
    const { state, castCount, fought, roundsPlayed } = playFullGame(seed);
    assert.ok(state.complete, 'game must terminate');
    assert.ok(roundsPlayed >= 5, `game lasted only ${roundsPlayed} rounds`);
    merged.games++; merged.roundsPlayed += roundsPlayed;
    for (const [id, n] of Object.entries(castCount)) merged.castCount[id] = (merged.castCount[id] || 0) + n;
    for (const [id, n] of Object.entries(fought)) merged.fought[id] = (merged.fought[id] || 0) + n;
  }

  const stats = RAW_IDS.map(id => ({
    id, mode: SKILLS[id].mode, battles: merged.fought[id] || 0, casts: merged.castCount[id] || 0
  })).sort((a, b) => a.casts - b.casts || b.battles - a.battles);

  console.log('\n=== full-game cast statistics (piece | mode | battles | casts) ===');
  for (const row of stats) console.log(`${row.id.padEnd(10)} ${row.mode.padEnd(10)} battles=${String(row.battles).padStart(3)} casts=${String(row.casts).padStart(3)}`);
  const totalCasts = Object.values(merged.castCount).reduce((a, b) => a + b, 0);
  const fielded = stats.filter(s => s.battles > 0).length;
  console.log(`games=${merged.games} rounds=${merged.roundsPlayed} totalCasts=${totalCasts} fielded=${fielded}/50`);

  const silenced = stats.filter(s => !PASSIVE.has(s.id) && s.battles >= 2 && s.casts === 0);
  assert.deepEqual(silenced.map(s => s.id), [],
    `pieces with >=2 battles and zero casts: ${JSON.stringify(silenced)}`);

  const neverFielded = stats.filter(s => s.battles === 0).map(s => s.id);
  console.log(`never fielded: ${neverFielded.join(',') || 'none'}`);
});
