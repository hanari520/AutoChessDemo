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

test('conquest connected attacks, supply, enemy telegraph, capital win and home loss', () => {
  let s = M.create('conquest', 10);
  assert.throws(() => M.act(s, 'attack:capital'));
  s = choose(s, 'attack:mine');
  assert.equal(s.supply, 2);
  s = win(s);
  assert(s.owned.includes('mine'));
  assert.equal(s.turn, 2);
  assert.equal(s.armies[0].position, 'mine');
  s = choose(s, 'attack:pass');
  s = win(s);
  assert.equal(s.turn, 3);
  assert(M.view(s).enemyHint.includes('敌军下一轮目标'));
  if (M.view(s).choices.find(c => c.id === 'attack:capital').disabled) s = choose(s, 'map:rest');
  s = choose(s, 'attack:capital');
  assert.equal(M.view(s).encounter.boss, true);
  s = win(s);
  assert.equal(s.outcome, 'won');
  let multi = M.create('conquest', 2);
  multi = win(choose(multi, 'attack:town'));
  assert.equal(multi.armies.length, 2);
  const swapped = M.act(multi, 'army:switch:1');
  assert.deepEqual(swapped.effects.swapArmy, { from: 0, to: 1 });
  assert.equal(swapped.state.activeArmy, 1);
  assert.equal(swapped.state.armies[1].position, 'home');
  const back = M.act(swapped.state, 'army:switch:0').state;
  const third = M.settle(choose(back, 'attack:fort'), { won: true }).state;
  assert.equal(third.armies.length, 3);
  let failed = M.create('conquest', 9);
  for (let i = 0; i < 5 && failed.phase !== 'finished'; i++) failed = lose(choose(failed, 'attack:mine'));
  assert.equal(failed.outcome, 'lost');
});
