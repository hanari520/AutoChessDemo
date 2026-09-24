const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./solo-modes');

const choose = (s, id, gold = 100) => M.act(s, id, { gold }).state;
const win = s => M.settle(s, { won: true, survivors: 0, allies: 4, playerStartingCount: 4, gold: 6, time: 20 }).state;
const lose = s => M.settle(s, { won: false, survivors: 0, allies: 4 }).state;

test('all mode states and views survive JSON roundtrip and deterministic seeds', () => {
  for (const { id } of M.definitions) {
    const a = M.create(id, 42), b = M.create(id, 42);
    assert.deepEqual(a, b);
    assert.deepEqual(M.view(a, { gold: 10 }), M.view(JSON.parse(JSON.stringify(a)), { gold: 10 }));
    assert.equal(M.view(a).title.length > 0, true);
  }
  assert.throws(() => M.create('unknown', 1));
});

test('expedition traverses 3 x 6 nodes, rewards once, and ends after final boss', () => {
  let s = M.create('expedition', 9);
  let battles = 0, bossMechanics = [];
  for (let c = 1; c <= 3; c++) {
    for (let n = 0; n < 6; n++) {
      const route = M.view(s).choices;
      assert(route.some(x => x.id === (n === 5 ? 'route:boss' : 'route:battle')));
      s = choose(s, n === 5 ? 'route:boss' : 'route:battle');
      const v = M.view(s);
      assert(v.canFight);
      if (n === 5) bossMechanics.push(v.encounter.mechanic);
      const settled = M.settle(s, { won: true, survivors: 3, allies: 4 });
      s = settled.state;
      battles++;
      assert.equal(s.phase, 'reward');
      assert.throws(() => M.settle(s, { won: true }));
      s = choose(s, 'reward:gold');
    }
  }
  assert.equal(battles, 18);
  assert.deepEqual(bossMechanics, ['shield', 'charge', 'summon']);
  assert.equal(s.outcome, 'won');
  assert.equal(s.route.length, 18);
  assert.throws(() => M.act(s, 'reward:gold'));
  assert.equal(M.view(s).finished, true);
});

test('expedition presentation uses virtual idol touring language while preserving choice ids', () => {
  const s = M.create('expedition', 31);
  const intro = M.view(s);
  assert.equal(intro.title, '巡演企划');
  assert.equal(intro.objective, '完成三站巡演，登上终场压轴舞台');
  assert.equal(intro.choices[0].id, 'route:battle');
  assert.match(intro.choices[1].id, /^route:(elite|camp|event|shop)$/);
  assert.equal(intro.choices[0].label, '常规公演');
  const bossRoute = M.view({ ...s, node: 5 });

  const phases = [
    intro,
    M.view({ ...s, phase: 'fight', current: 'battle' }),
    M.view({ ...s, phase: 'fight', current: 'elite' }),
    bossRoute,
    M.view({ ...s, phase: 'fight', current: 'boss', node: 5 }),
    M.view({ ...s, phase: 'reward' }),
    M.view({ ...s, phase: 'camp' }),
    M.view({ ...s, phase: 'event' }),
    M.view({ ...s, phase: 'shop' })
  ];
  const visibleCopy = phases.flatMap(v => [v.title, v.subtitle, v.objective, v.enemyHint, ...v.choices.flatMap(c => [c.label, c.description]), v.encounter && v.encounter.name]).filter(Boolean).join(' ');
  for (const staleTerm of ['远征生命', '遗物', '章末首领', '精英战', '普通战', '精英部队', '巡逻队', '回响护符', '召唤核心', '坚守旗帜', '冒险徽章', '购买补给']) {
    assert.equal(visibleCopy.includes(staleTerm), false, `stale expedition term: ${staleTerm}`);
  }
  assert.equal(phases[1].encounter.name, '巡演公演');
  assert.equal(phases[2].encounter.name, '特别舞台企划');
  assert.equal(bossRoute.choices[0].id, 'route:boss');
  assert.equal(bossRoute.choices[0].label, '终场压轴舞台');
  assert.equal(phases[4].encounter.name, '第1站压轴演出');
  assert(phases[5].choices.some(c => c.id === 'reward:relic' && c.label === '领取应援纪念物'));
  assert(phases[5].choices.some(c => c.id === 'reward:recruit:守护'));
});

test('expedition branches change resources and repeated defeat loses life', () => {
  let s = M.create('expedition', 7);
  const event = { ...s, phase: 'event', current: 'event' };
  const gamble = M.act(event, 'event:risk');
  assert.equal(gamble.effects.hp, -2);
  assert.deepEqual(gamble.effects.items, ['sword']);
  assert.deepEqual(gamble.state.relics, ['冒险徽章']);
  assert(M.view(gamble.state).subtitle.includes('巡演纪念章'));
  assert.equal(gamble.state.node, 1);
  const camp = { ...s, phase: 'camp', current: 'camp', hp: 15 };
  assert.equal(M.act(camp, 'camp:heal').state.hp, 20);
  const shop = { ...s, phase: 'shop', current: 'shop' };
  assert.throws(() => M.act(shop, 'shop:buy', { gold: 4 }));
  const battle = choose(s, 'route:battle');
  const reward = win(battle);
  const recruited = M.act(reward, 'reward:recruit:守护');
  assert.equal(recruited.effects.recruit, '守护');
  const relic = M.act(reward, 'reward:relic');
  assert.equal(relic.state.relics.length, 1);
  const relicLabels = { 回响护符: '返场耳返', 召唤核心: '全息伴舞', 坚守旗帜: '应援手灯' };
  assert(relicLabels[relic.state.relics[0]]);
  assert(M.view(relic.state).subtitle.includes(relicLabels[relic.state.relics[0]]));
  assert(relic.effects.log[0].includes(relicLabels[relic.state.relics[0]]));
  for (let i = 0; i < 7; i++) {
    s = choose(s, 'route:battle');
    s = lose(s);
    if (s.phase === 'finished') break;
  }
  assert.equal(s.outcome, 'lost');
  assert.equal(s.hp, 0);
});

test('hunt has exactly 3 prep actions and retry does not re-award resources', () => {
  let s = M.create('hunt', 3, { bossIndex: 1 });
  assert.equal(s.boss, 'charge');
  const first = M.act(s, 'prep:forge');
  assert(['sword', 'armor', 'mana'].includes(first.effects.items[0]));
  s = first.state;
  s = choose(s, 'prep:scout');
  s = choose(s, 'prep:recruit');
  assert.equal(M.view(s).encounter.modifier, 'scouted');
  assert.throws(() => M.act(s, 'prep:forge'));
  s = lose(s);
  const retry = M.act(s, 'retry:same');
  assert.equal(retry.effects.gold, 0);
  assert.deepEqual(retry.effects.items, []);
  assert.equal(retry.state.prep, 3);
  s = win(retry.state);
  assert.equal(s.outcome, 'won');
  assert.throws(() => M.settle(s, { won: true }));
  let failed = M.create('hunt', 3);
  for (let i = 0; i < 3; i++) failed = choose(failed, 'prep:scout');
  for (let i = 0; i < 3; i++) {
    failed = lose(failed);
    if (i < 2) failed = choose(failed, 'retry:same');
  }
  assert.equal(failed.outcome, 'lost');
});

test('puzzle fixes enemy and candidates, gives hints, retries, medals and next question', () => {
  let s = M.create('puzzle', 25, { puzzleIndex: 0 });
  assert.equal(s.budget, 12);
  assert.equal(s.population, 4);
  assert.equal(s.candidates.length, 6);
  const encounter = M.view(s).encounter;
  s = choose(s, 'hint:next');
  assert(M.view(s).enemyHint.includes('提示'));
  s = lose(s);
  assert.equal(s.phase, 'retry');
  const reset = M.act(s, 'retry:edit');
  assert.equal(reset.effects.puzzleReset, true);
  s = reset.state;
  assert.deepEqual(M.view(s).encounter, encounter);
  s = M.settle(s, { won: true, survivors: 0, allies: 4, playerStartingCount: 4, gold: 5, time: 22 }).state;
  assert.deepEqual(s.medals, ['通关', '低预算', '全员存活', '快速通关']);
  assert.equal(s.phase, 'complete');
  s = choose(s, 'puzzle:next');
  assert.equal(s.puzzle, 1);
  assert.notDeepEqual(s.candidates, M.create('puzzle', 25, { puzzleIndex: 0 }).candidates);
  s = win(s);
  s = choose(s, 'puzzle:next');
  s = win(s);
  assert.equal(s.outcome, 'won');
  assert.throws(() => M.act(s, 'puzzle:next'));
});

test('siege construction, risk reward, 15 waves and endless continuation', () => {
  let s = M.create('siege', 4);
  assert.equal(M.view(s, { gold: 0 }).choices.find(c => c.id === 'build:wall').disabled, false);
  const built = M.act(s, 'build:wall', { gold: 0 });
  assert.equal(built.effects.gold, 0);
  assert.equal(built.effects.buildPoints, -2);
  assert.equal(built.state.walls, 1);
  s = win(built.state);
  assert.equal(s.buildPoints, 3);
  assert.equal(s.wave, 2);
  s = choose(s, 'build:risk');
  assert.equal(M.view(s).encounter.modifier, 'risk');
  const risky = M.settle(s, { won: true });
  assert.equal(risky.effects.gold, 7);
  s = risky.state;
  while (s.wave <= 15 && s.phase !== 'complete') s = win(choose(s, 'build:economy'));
  assert.equal(s.outcome, 'won');
  assert.equal(s.wave, 15);
  s = choose(s, 'continue:endless');
  assert.equal(s.wave, 16);
  assert.equal(s.endless, true);
  s = win(choose(s, 'build:economy'));
  assert.equal(s.wave, 17);
  let failed = M.create('siege', 1);
  while (failed.phase !== 'finished') failed = lose(choose(failed, 'build:economy'));
  assert.equal(failed.outcome, 'lost');
  assert.throws(() => M.act({ ...M.create('siege', 1), buildPoints: 0 }, 'build:wall'));
});

// ----- conquest v2 -----

const conquestView = (s, gold = 999) => M.view(s, { gold });
const conquestFirst = s => {
  const c = conquestView(s).choices.find(c => !c.disabled);
  return c ? c.id : null;
};
const conquestWin = s => M.settle(s, { won: true, survivors: 0, allies: 4, deployed: 4, playerStartingCount: 4, time: 25, gold: 60 });
const conquestLose = s => M.settle(s, { won: false, survivors: 3, allies: 0, deployed: 4, playerStartingCount: 4, time: 25, gold: 60 });
const conquestCheckView = (v, tag) => {
  assert.deepEqual(v, JSON.parse(JSON.stringify(v)), `view roundtrip: ${tag}`);
  v.choices.forEach(c => {
    assert.equal(typeof c.id, 'string', `choice id: ${tag}`);
    assert.equal(typeof c.label, 'string', `choice label: ${tag}`);
    assert.equal(typeof c.description, 'string', `choice description: ${tag}`);
    assert.equal(typeof c.disabled, 'boolean', `choice disabled: ${tag}`);
  });
};

test('conquest v2 builds deterministic layered DAG maps with fixed act guarantees', () => {
  assert.deepEqual(M.create('conquest', 77), M.create('conquest', 77));
  for (let seed = 1; seed <= 24; seed++) {
    const s = M.create('conquest', seed * 7);
    const nodes = s.map.nodes;
    const total = nodes.length;
    assert(total >= 8 && total <= 10, `act1 node count ${total} at seed ${seed}`);
    const layers = Math.max(...nodes.map(n => n.layer)) + 1;
    assert(layers >= 6 && layers <= 7, `layer count ${layers} at seed ${seed}`);
    nodes.forEach(n => {
      assert.deepEqual(Object.keys(n).sort(), ['cleared', 'garrison', 'id', 'kind', 'layer', 'links', 'name', 'sub', 'x', 'y'], `node shape ${n.id}`);
      assert(['battle', 'elite', 'stronghold', 'treasure', 'shop', 'event', 'rest', 'boss'].includes(n.kind), `kind ${n.kind}`);
      assert(n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100, `coords ${n.x},${n.y}`);
      n.links.forEach(link => {
        const target = nodes.find(x => x.id === link);
        assert(target, `dangling link ${link}`);
        assert.equal(target.layer, n.layer + 1, `link ${link} must go forward one layer`);
      });
      if (n.layer > 0) assert(nodes.some(x => x.links.includes(n.id)), `unreachable node ${n.id}`);
      if (n.kind === 'stronghold') assert(['mine', 'town', 'fort'].includes(n.sub), `stronghold sub ${n.sub}`);
      else assert.equal(n.sub, null);
    });
    nodes.filter(n => n.layer === 0).forEach(n => assert.equal(n.kind, 'battle', 'first layer is all battles'));
    const bosses = nodes.filter(n => n.kind === 'boss');
    assert.equal(bosses.length, 1, 'exactly one boss');
    assert.equal(bosses[0].layer, layers - 1, 'boss sits on the last layer');
    assert(nodes.filter(n => n.layer === layers - 2).some(n => n.kind === 'rest'), 'penultimate layer has a rest');
    const count = kind => nodes.filter(n => n.kind === kind).length;
    assert(count('stronghold') >= 2, 'at least 2 strongholds');
    assert(count('elite') >= 1, 'at least 1 elite');
    assert(count('shop') >= 1, 'at least 1 shop');
    assert.deepEqual(s.map, JSON.parse(JSON.stringify(s.map)));
    const stripped = JSON.parse(JSON.stringify(s));
    delete stripped.actCheckpoint;
    assert.deepEqual(s.actCheckpoint, stripped);
    assert.equal(s.actCheckpoint.actCheckpoint, undefined);
  }
});

const conquestRun = seed => {
  let s = M.create('conquest', seed);
  let guard = 0, fights = 0;
  const bossFights = [], tiersByAct = { 1: [], 2: [], 3: [], 4: [] };
  const phasesSeen = new Set(), actsSeen = new Set();
  while (s.phase !== 'finished' && guard++ < 900) {
    actsSeen.add(s.act);
    phasesSeen.add(s.phase);
    const v = conquestView(s);
    conquestCheckView(v, `seed ${seed} phase ${s.phase}`);
    assert(s.supply >= 0 && s.supply <= s.maxSupply, `supply ${s.supply}`);
    assert(s.hp >= 0 && s.hp <= s.maxHp, `hp ${s.hp}`);
    if (v.canFight) {
      const e = v.encounter;
      assert(e && e.tier >= 1 && e.seed, 'encounter present');
      tiersByAct[s.act].push(e.tier);
      if (e.boss) bossFights.push({ act: s.act, mechanic: e.mechanic, bossScript: e.bossScript, tier: e.tier });
      s = conquestWin(s).state;
      fights++;
    } else {
      const id = conquestFirst(s);
      assert(id, `stuck in phase ${s.phase}`);
      s = M.act(s, id, { gold: 999 }).state;
    }
  }
  return { s, guard, fights, bossFights, tiersByAct, phasesSeen, actsSeen };
};

test('conquest v2 walkthrough: deterministic first-choice strategy clears all four acts', () => {
  const run = conquestRun(5);
  assert(run.guard <= 900, 'walkthrough terminated');
  assert.equal(run.s.phase, 'finished');
  assert.equal(run.s.outcome, 'won');
  assert.deepEqual([...run.actsSeen].sort(), [1, 2, 3, 4]);
  assert.deepEqual(run.bossFights.map(b => b.mechanic), ['shield', 'charge', 'summon', 'none']);
  assert.deepEqual(run.bossFights.map(b => b.bossScript), [{ act: 1 }, { act: 2 }, { act: 3 }, { act: 4 }]);
  run.bossFights.forEach(b => assert(b.tier >= b.act + 3, `boss tier ${b.tier} for act ${b.act}`));
  Object.entries(run.tiersByAct).forEach(([act, tiers]) => {
    assert(tiers.length > 0, `act ${act} was fought`);
    assert(Math.min(...tiers) >= Number(act), `act ${act} min tier`);
    assert(Math.max(...tiers) <= Number(act) + 6, `act ${act} max tier`);
  });
  assert(run.fights >= 16 && run.fights <= 80, `reasonable fight count: ${run.fights}`);
  assert.equal(run.s.stats.battles, run.fights);
  assert(run.s.stats.turns >= run.fights, 'turns at least fights');
  ['map', 'fight', 'reward', 'actClear'].forEach(p => assert(run.phasesSeen.has(p), `phase ${p} visited`));
  assert.equal(run.s.stats.losses, 0);
  const second = conquestRun(6);
  assert.equal(second.s.outcome, 'won', 'second seed also clears the campaign');
});

test('conquest v2 map actions: connected attacks, supply, rest, armies and unlock', () => {
  let s = M.create('conquest', 10);
  assert.throws(() => M.act(s, 'attack:a1n999'));
  assert.throws(() => M.act(s, 'attack:boss'));
  const firstId = conquestView(s).choices.find(c => c.id.startsWith('attack:')).id;
  const supplyBefore = s.supply;
  s = M.act(s, firstId, { gold: 50 }).state;
  assert.equal(s.phase, 'fight');
  assert.equal(s.supply, supplyBefore - 1, 'first-layer battles cost 1 supply');
  assert.equal(s.armies[0].ap, 0);
  assert(s.target && s.map.nodes.some(n => n.id === s.target && n.kind === 'battle'));
  const won = conquestWin(s);
  assert.equal(won.effects.gold, 4);
  assert.equal(won.state.phase, 'reward');
  assert.deepEqual(won.state.map.owned, [s.target]);
  const rewarded = M.act(won.state, 'reward:gold', { gold: 50 });
  assert.equal(rewarded.effects.gold, 5);
  s = rewarded.state;
  assert.equal(s.phase, 'map');
  assert.equal(s.armies[0].node, won.state.map.owned[0]);
  assert.equal(s.stats.turns, 2);
  assert.deepEqual(s.telegraph, { node: s.map.owned[0], countdown: 2 });
  assert.throws(() => M.settle(s, { won: true }));
  // armies unlock deterministically on capturing a town/fort stronghold
  const staged = M.create('conquest', 10);
  const stronghold = staged.map.nodes.find(n => n.kind === 'stronghold' && n.sub !== 'mine');
  const parent = staged.map.nodes.find(n => n.links.includes(stronghold.id) && n.kind === 'battle')
    || staged.map.nodes.find(n => n.links.includes(stronghold.id));
  parent.cleared = true;
  const battle = { ...staged, map: { ...staged.map, owned: [parent.id], cursor: [stronghold.id] }, armies: [{ id: 0, node: parent.id, ap: 1 }], activeArmy: 0, supply: 8, telegraph: null, raidWait: 9 };
  const unlockFight = M.act(battle, `attack:${stronghold.id}`, { gold: 999 }).state;
  assert.equal(unlockFight.phase, 'fight');
  const unlockRes = conquestWin(unlockFight);
  assert.equal(unlockRes.effects.armyUnlocked, 1);
  assert.equal(unlockRes.state.armies.length, 2);
  assert.deepEqual(unlockRes.state.armies[1], { id: 1, node: null, ap: 1 });
  s = M.act(unlockRes.state, 'reward:gold', { gold: 999 }).state;
  assert.equal(s.phase, 'map');
  assert.equal(s.armies.length, 2);
  // switch armies and redeploy the fresh one from home base
  const swapped = M.act(s, 'army:switch:1', { gold: 999 });
  assert.deepEqual(swapped.effects.swapArmy, { from: 0, to: 1 });
  assert.equal(swapped.state.activeArmy, 1);
  const dest = swapped.state.map.owned[0];
  const moved = M.act(swapped.state, `move:${dest}`, { gold: 999 });
  assert.equal(moved.state.armies[1].node, dest);
  assert.equal(moved.state.armies[1].ap, 0);
  assert.equal(moved.state.armies[0].ap, 1);
  s = M.act(moved.state, 'army:switch:0', { gold: 999 }).state;
  assert.equal(s.activeArmy, 0);
  // resting feeds supply and home durability and advances the turn
  const tired = { ...s, supply: 0, telegraph: null, raidWait: 9, hp: 5 };
  const rested = M.act(tired, 'map:rest', { gold: 0 });
  assert(rested.state.supply >= 3 && rested.state.supply <= 8, `supply after rest ${rested.state.supply}`);
  assert.equal(rested.effects.hp, 2);
  assert.equal(rested.state.hp, 7);
  assert.equal(rested.state.stats.turns, s.stats.turns + 1);
  const rested2 = M.act(rested.state, 'map:rest', { gold: 0 });
  assert(rested2.state.supply >= rested.state.supply + 2, 'second rest keeps feeding supply');
  assert(conquestView(rested2.state).choices.filter(c => c.id.startsWith('attack:')).every(c => !c.disabled), 'rested supply covers every attack cost');
  // end turn decrements the telegraph countdown
  if (s.telegraph) {
    const tick = M.act(s, 'map:end', { gold: 999 }).state;
    assert.equal(tick.stats.turns, s.stats.turns + 1);
    if (tick.phase === 'map' && tick.telegraph) assert.equal(tick.telegraph.countdown, s.telegraph.countdown - 1);
  }
});

test('conquest v2 defense battles and ungarrisoned raids', () => {
  const captureFirst = seed => {
    let s = M.create('conquest', seed);
    let guard = 0;
    while (!s.map.owned.length && guard++ < 10) {
      const atk = conquestView(s).choices.find(c => c.id.startsWith('attack:') && !c.disabled);
      s = M.act(s, atk.id, { gold: 999 }).state;
      s = conquestWin(s).state;
      if (s.phase === 'reward') s = M.act(s, 'reward:gold', { gold: 999 }).state;
    }
    return s;
  };
  // garrisoned raid -> defense battle; winning keeps the node and pays 4 gold
  let s = captureFirst(11);
  const held = s.map.owned[0];
  assert.equal(s.armies[0].node, held, 'capturing army garrisons the node');
  s = M.act({ ...s, telegraph: { node: held, countdown: 1 } }, 'map:end', { gold: 999 }).state;
  assert.equal(s.phase, 'defense');
  assert.equal(s.target, held);
  const dv = conquestView(s);
  assert.equal(dv.canFight, true);
  assert.equal(dv.encounter.modifier, 'counterattack');
  assert.equal(dv.encounter.garrisonArmy, 0);
  assert.equal(dv.encounter.boss, false);
  const wres = conquestWin(s);
  assert.equal(wres.state.phase, 'map');
  assert(wres.state.map.owned.includes(held), 'win keeps the node');
  assert.equal(wres.effects.gold, 6);
  assert.equal(wres.effects.hp, 0);
  // garrisoned raid lost -> node lost, garrison retreats home, home base -4
  let f = captureFirst(11);
  const lost = f.map.owned[0];
  f = M.act({ ...f, telegraph: { node: lost, countdown: 1 } }, 'map:end', { gold: 999 }).state;
  assert.equal(f.phase, 'defense');
  const lres = conquestLose(f);
  assert.equal(lres.state.phase, 'map');
  assert.equal(lres.state.map.owned.includes(lost), false);
  assert.equal(lres.state.armies[0].node, null);
  assert.equal(lres.effects.hp, -4);
  // ungarrisoned raid -> immediate loss without a battle
  let g = captureFirst(11);
  const raid = g.map.owned[0];
  g = { ...g, armies: g.armies.map(a => ({ ...a, node: null })), telegraph: { node: raid, countdown: 1 } };
  const gres = M.act(g, 'map:end', { gold: 999 });
  assert.equal(gres.state.phase, 'map');
  assert.equal(gres.state.map.owned.includes(raid), false);
  assert.equal(gres.effects.hp, -4);
  assert.equal(gres.state.telegraph, null, 'raid cooldown blocks instant re-arm');
});

test('conquest v2 act checkpoints restore the exact act-start snapshot', () => {
  let s = M.create('conquest', 21);
  const snap1 = JSON.parse(JSON.stringify(s.actCheckpoint));
  let guard = 0;
  while (s.map.owned.length < 2 && guard++ < 12) {
    const atk = conquestView(s).choices.find(c => c.id.startsWith('attack:') && !c.disabled);
    s = M.act(s, atk ? atk.id : 'map:rest', { gold: 999 }).state;
    if (s.phase === 'fight' || s.phase === 'defense') {
      s = conquestWin(s).state;
      if (s.phase === 'reward') s = M.act(s, 'reward:gold', { gold: 999 }).state;
    }
  }
  s = { ...s, supply: 8, hp: 1 };
  const atk = conquestView(s).choices.find(c => c.id.startsWith('attack:') && !c.disabled);
  s = M.act(s, atk.id, { gold: 999 }).state;
  const dead = conquestLose(s).state;
  assert.equal(dead.phase, 'finished');
  assert.equal(dead.outcome, 'lost');
  assert.equal(dead.hp, 0);
  const revived = M.act(dead, 'checkpoint:retry', { gold: 999 });
  assert.equal(revived.state.phase, 'map');
  assert.equal(revived.state.hp, snap1.hp);
  const stripped = JSON.parse(JSON.stringify(revived.state));
  delete stripped.actCheckpoint;
  assert.deepEqual(stripped, snap1);
  assert.deepEqual(JSON.parse(JSON.stringify(revived.state.actCheckpoint)), snap1);
  const again = M.act({ ...revived.state, hp: 1, phase: 'finished', outcome: 'lost' }, 'checkpoint:retry', { gold: 999 }).state;
  assert.equal(again.phase, 'map', 'checkpoint retry stays available after another defeat');
  // entering act 2 snapshots the new act start
  const cleared = { ...M.create('conquest', 21), hp: 9, phase: 'actClear' };
  const advanced = M.act(cleared, 'act:next', { gold: 999 });
  assert.equal(advanced.state.act, 2);
  assert.equal(advanced.state.phase, 'map');
  assert.equal(advanced.effects.hp, 4);
  assert.deepEqual(advanced.state.map.owned, []);
  assert(advanced.state.map.nodes.every(n => n.id.startsWith('a2n')), 'act2 node ids are prefixed');
  assert(advanced.state.armies.every(a => a.node === null), 'armies redeploy from home base');
  const snap2 = JSON.parse(JSON.stringify(advanced.state.actCheckpoint));
  assert.equal(snap2.act, 2);
  assert.equal(snap2.actCheckpoint, undefined);
  assert.deepEqual(snap2.map, JSON.parse(JSON.stringify(advanced.state.map)));
  assert.notDeepEqual(advanced.state.map, M.create('conquest', 21).map);
});

test('conquest v2 difficulty scales durability, encounter tiers and gold rewards', () => {
  const states = [1, 2, 3].map(d => M.create('conquest', 42, { difficulty: d }));
  assert.deepEqual(states.map(x => x.maxHp), [15, 12, 10]);
  assert.deepEqual(states.map(x => x.hp), [15, 12, 10]);
  assert.deepEqual(states.map(x => x.difficulty), [1, 2, 3]);
  assert.equal(M.create('conquest', 42, { difficulty: 9 }).difficulty, 1, 'invalid difficulty falls back to 1');
  const tiers = [], golds = [];
  states.forEach(s => {
    const atk = conquestView(s).choices.find(c => c.id.startsWith('attack:') && !c.disabled);
    const fight = M.act(s, atk.id, { gold: 999 }).state;
    tiers.push(M.view(fight, { gold: 999 }).encounter.tier);
    golds.push(conquestWin(fight).effects.gold);
  });
  assert.deepEqual(tiers, [1, 2, 3], 'first-layer battle tier grows with difficulty');
  assert.deepEqual(golds, [4, 5, 6], 'battle gold scales 1 / 1.3 / 1.6 (M5 reward table: baseline 4)');
  const elite = states[0].map.nodes.find(n => n.kind === 'elite');
  const boss = states[0].map.nodes.find(n => n.kind === 'boss');
  const fightView = (d, n) => M.view({ ...M.create('conquest', 42, { difficulty: d }), phase: 'fight', target: n.id }, { gold: 999 });
  assert.deepEqual([1, 2, 3].map(d => fightView(d, elite).encounter.affixes.length), [0, 1, 2], 'elite affix count scales');
  assert.equal(fightView(3, elite).encounter.tier - fightView(1, elite).encounter.tier, 2);
  assert(fightView(1, boss).encounter.tier >= 4, 'act1 boss tier at least 4');
  const bossView = fightView(1, boss);
  assert.equal(bossView.encounter.boss, true);
  assert.deepEqual(bossView.encounter.bossScript, { act: 1 });
  assert.equal(bossView.encounter.mechanic, 'shield');
});

test('conquest v2 renders every phase with serializable views and valid choices', () => {
  const fresh = M.create('conquest', 33);
  const atk = conquestView(fresh).choices.find(c => c.id.startsWith('attack:'));
  const fightState = M.act(fresh, atk.id, { gold: 999 }).state;
  const won = conquestWin(fightState).state;
  const heldNode = won.map.owned[0];
  const variants = {
    map: fresh,
    fight: fightState,
    defense: { ...won, phase: 'defense', target: heldNode },
    reward: won,
    treasure: { ...won, phase: 'treasure', target: heldNode },
    shop: { ...won, phase: 'shop', target: heldNode },
    rest: { ...won, phase: 'rest', target: heldNode },
    event: { ...won, phase: 'event', target: heldNode },
    actClear: { ...won, phase: 'actClear' },
    finishedWon: { ...won, phase: 'finished', outcome: 'won', target: null },
    finishedLost: { ...won, phase: 'finished', outcome: 'lost', hp: 0 }
  };
  for (const [name, st] of Object.entries(variants)) {
    const v = M.view(st, { gold: 999 });
    conquestCheckView(v, name);
    assert.equal(typeof v.title, 'string');
    assert.equal(typeof v.subtitle, 'string');
    assert.equal(typeof v.objective, 'string');
    assert.equal(typeof v.enemyHint, 'string');
    assert.equal(typeof v.canFight, 'boolean');
    assert.equal(v.finished, name.startsWith('finished'), `finished flag: ${name}`);
    if (name === 'fight' || name === 'defense') {
      assert.equal(v.canFight, true);
      assert(v.encounter && v.encounter.name && v.encounter.tier >= 1, `encounter: ${name}`);
    }
  }
  const shopPoor = M.view(variants.shop, { gold: 3 });
  assert.equal(shopPoor.choices.find(c => c.id === 'shop:buy:0').disabled, true);
  assert.equal(shopPoor.choices.find(c => c.id === 'shop:buy:1').disabled, true);
  assert.equal(shopPoor.choices.find(c => c.id === 'shop:leave').disabled, false);
  const hoarder = { ...variants.treasure, relics: ['回响护符', '召唤核心', '坚守旗帜', '冒险徽章'] };
  const hoardView = M.view(hoarder, { gold: 999 });
  assert.equal(hoardView.choices.some(c => c.id === 'treasure:relic'), false, 'no duplicate relic offer when all collected');
  assert(hoardView.choices.some(c => c.id === 'treasure:item'));
  assert(hoardView.choices.some(c => c.id === 'treasure:gold'));
});
