import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBattle } from './combat.js';

const board = (...entries) => {
  const cells = Array(64).fill(null);
  for (const [slot, id, extra] of entries) cells[slot] = { uid: `${id}-${slot}`, id, star: 1, items: [], ...extra };
  return cells;
};

test('status replay announces control, expires it, and carries finite effective stats', () => {
  const result=resolveBattle(board([27,'liAn']),board([35,'ein']),42,{initialMana:50,maxTicks:100});
  const statuses=result.events.filter(e=>e.type==='status');
  assert.ok(statuses.some(e=>e.statuses.includes('freeze')));
  const frozen=statuses.find(e=>e.statuses.includes('freeze'));
  assert.ok(statuses.some(e=>e.target===frozen.target&&e.at>frozen.at&&!e.statuses.includes('freeze')));
  for(const event of statuses) for(const value of Object.values(event.stats))assert.ok(Number.isFinite(value));
});

test('same seed and formations give byte-identical battle and do not mutate inputs', () => {
  const a = board([9, 'ein'], [18, 'likou']);
  const b = board([45, 'goutan'], [54, 'yujiu']);
  const before = JSON.stringify([a, b]);
  const first = resolveBattle(a, b, 42);
  assert.deepEqual(resolveBattle(a, b, 42), first);
  assert.equal(JSON.stringify([a, b]), before);
  assert.ok(first.events.some(e => e.type === 'attack'));
  assert.ok(first.events.some(e => e.type === 'move'));
  assert.ok(['A', 'B', 'draw'].includes(first.winner));
  assert.equal(first.complete, !first.survivorsA.length || !first.survivorsB.length);
});

test('every active solo combat kit can cast through the deterministic resolver', () => {
  const ids = [
    'ein','kouichi','yua','goutan','yujiu','songlv','likou','agari','hoshimi','chiharu',
    'suiji','kanban','zhouyi','yuji','tiandou','aza','pako','zhijin','sishi','sumi','yukie',
    'miting','xuezhu','zeyin','sanli','diansu','lianshiye','huize','shengge','shadow','nox',
    'miyue','huali','youyu','quanrong','ruiya','mumu','kroya','shiliu','seki','haruka',
    'mahiru','nana7mi','liAn','youyi','azi','taodai','miki','rei','rinco'
  ];
  const passive = new Set(['zhouyi','yuji','youyi']);
  for (const id of ids) {
    const result = resolveBattle(board([27, id]), board([28, 'quanrong', { items: ['aegis'] }]), 19, { initialMana: 50, maxTicks: 1 });
    const casts = result.events.filter(e => e.type === 'cast' && e.from === `${id}-27`);
    assert.equal(casts.length, passive.has(id) ? 0 : 1, `${id} should ${passive.has(id) ? 'remain passive' : 'cast its kit'}`);
  }
});

test('seeded bond procs, healing skills, and equipment triggers are replayable', () => {
  const a = board([9, 'likou', { items: ['sagestaff', 'armor', 'mana'] }], [18, 'agari']);
  const b = board([45, 'goutan'], [54, 'yua']);
  const result = resolveBattle(a, b, 'combat-seed', { initialMana: 50, maxTicks: 40 });
  assert.deepEqual(resolveBattle(a, b, 'combat-seed', { initialMana: 50, maxTicks: 40 }), result);
  assert.ok(result.events.some(e => e.type === 'cast' && e.from === 'likou-9'));
  assert.ok(result.events.some(e => e.type === 'shield' && e.from === 'likou-9'));
  assert.ok(result.events.some(e => e.type === 'mana' && e.reason === 'item-cast'));
  assert.ok(result.events.some(e => e.type === 'attack' || e.type === 'skill'));
});

test('equipment mana burn reports the target mana remaining for replay', () => {
  const result = resolveBattle(board([27, 'yua', { items: ['hexdrinker'] }]), board([28, 'ein']), 1, { initialMana: 50, maxTicks: 10 });
  const burn = result.events.find(e => e.type === 'manaBurn' && e.source === 'item');
  assert.equal(burn?.target, 'ein-28');
  assert.ok(Number.isFinite(burn.mana)&&burn.mana>=0&&burn.mana<=43);
  assert.equal(burn.amount, 7);
});

test('incomplete rounds retain both survivor lists; a knockout marks the result complete', () => {
  const liveRound = resolveBattle(board([27, 'yua']), board([28, 'ein']), 5, { maxTicks: 1 });
  assert.equal(liveRound.complete, false);
  assert.equal(liveRound.survivorsA.length, 1);
  assert.equal(liveRound.survivorsB.length, 1);

  const finished = resolveBattle(board([27, 'shadow']), board([28, 'ein']), 5, { initialMana: 50 });
  assert.equal(finished.complete, true);
  assert.equal(finished.winner, 'A');
  assert.equal(finished.survivorsA.length, 1);
  assert.equal(finished.survivorsB.length, 0);
});

test('real 8x8 placement changes the travel path and rejects overlapping anchors', () => {
  const close = resolveBattle(board([27, 'ein']), board([28, 'goutan']), 7);
  const far = resolveBattle(board([0, 'ein']), board([63, 'goutan']), 7);
  assert.ok(far.events.filter(e => e.type === 'move').length > close.events.filter(e => e.type === 'move').length);
  assert.throws(() => resolveBattle([{ slot: 1, unit: { id: 'ein', uid: 1 } }, { slot: 1, unit: { id: 'goutan', uid: 2 } }], board([63, 'yua']), 1), /occupied/i);
});

test('assassins jump behind the enemy, dash skills reposition, and occupied cells block walking', () => {
  const jump = resolveBattle(board([56,'hoshimi']),board([0,'yua']),1,{maxTicks:1});
  const leap = jump.events.find(e => e.type === 'move' && e.unit === 'hoshimi-56');
  assert.equal(leap.kind,'jump');
  assert.ok(leap.y <= 3);
  assert.notDeepEqual([leap.x,leap.y],[0,0]);
  const dash = resolveBattle(board([56,'kouichi']),board([0,'yua']),1,{initialMana:50,maxTicks:1});
  const rush = dash.events.find(e => e.type === 'move' && e.unit === 'kouichi-56');
  assert.equal(rush.kind,'dash');
  assert.equal(Math.abs(rush.x - 0) + Math.abs(rush.y - 0),1);
  assert.ok(dash.events.some(e => e.type === 'skill' && e.from === 'kouichi-56'));
  const crowded = resolveBattle(board([51,'ein'],[19,'goutan'],[26,'kanban'],[28,'sumi'],[35,'taodai']),board([27,'yua'],[7,'likou']),1,{maxTicks:1});
  const move = crowded.events.find(e => e.type === 'move' && e.unit === 'ein-51');
  assert.equal(move?.kind,'walk');
  const occupied = new Set([19,26,28,35,27,7]);
  assert.ok(!occupied.has(move.y * 8 + move.x));
  assert.ok(!crowded.events.some(e => e.type === 'attack' && e.from === 'ein-51'));
});

test('solo armor, item and distinct-ID bond calculations affect combat events', () => {
  const plain = resolveBattle(board([27, 'ein']), board([28, 'goutan']), 3);
  const armed = resolveBattle(board([27, 'ein', { items: ['sword', 'armor'] }]), board([28, 'goutan']), 3);
  const firstHit = result => result.events.find(e => e.type === 'attack' && e.from === 'ein-27')?.amount;
  assert.ok(firstHit(armed) > firstHit(plain));
  assert.ok(armed.survivorsA[0]?.maxhp > plain.survivorsA[0]?.maxhp || armed.events.find(e => e.type === 'death' && e.target === 'ein-27')?.at > plain.events.find(e => e.type === 'death' && e.target === 'ein-27')?.at);
  const bonded = resolveBattle(board([9, 'goutan'], [18, 'yujiu']), board([45, 'ein']), 3);
  assert.equal(bonded.bonds.A['毛茸乐园'], 1);
  const duplicated = resolveBattle(board([9, 'goutan'], [18, 'goutan']), board([45, 'ein']), 3);
  assert.equal(duplicated.bonds.A['毛茸乐园'] ?? 0, 0);
});

test('invalid IDs, item IDs, and board lengths fail closed', () => {
  assert.throws(() => resolveBattle(board([0, 'missing']), board([63, 'ein']), 1), /unknown unit/i);
  assert.throws(() => resolveBattle(board([0, 'ein', { items: ['missing'] }]), board([63, 'ein']), 1), /unknown item/i);
  assert.throws(() => resolveBattle([null], board([63, 'ein']), 1), /64 cells/i);
});
