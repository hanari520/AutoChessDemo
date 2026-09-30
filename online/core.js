import { MAX_LEVEL, SHOP_ODDS as ODDS, xpNeeded, interestGain, streakGain, sellRefund } from './economy.js';
import { resolveBattle } from './combat.js';
import { EQUIPMENT, recipe } from './equipment.js';

/* Eight-player online rules. Pure serializable data; no DOM or clock.
 * The room service is the sole writer. applyAction mutates on success and throws on
 * invalid input. advancePhase is called by the room clock, not by a client.
 * Actions: buy {slot}, sell {uid}, move {uid,to:{zone,slot}}, reroll, buyXp,
 * equip {uid,itemIndex}, ready. All are only valid in prep; ready locks the seat.
 * Combat uses a deterministic DOM-free resolver on the server. Its ruleset is
 * versioned independently from the solo animation engine; parity remains an
 * explicit validation task as character-specific mechanics are ported.
 */

// Sourced from index.html UNITS (2026-09-19 roster). Keep IDs and printed costs.
const ROSTER = [
  [
    "ein",
    "艾因",
    1,
    "魔道",
    "守护",
    84,
    6
  ],
  [
    "kouichi",
    "光一",
    1,
    "工造",
    "狂战",
    58,
    10
  ],
  [
    "yua",
    "悠亚",
    1,
    "星际",
    "法师",
    44,
    12
  ],
  [
    "goutan",
    "勾檀",
    1,
    "毛茸乐园",
    "守护",
    82,
    6
  ],
  [
    "yujiu",
    "羽啾",
    1,
    "毛茸乐园",
    "游侠",
    40,
    10
  ],
  [
    "songlv",
    "小松绿",
    1,
    "森之国",
    "狂战",
    58,
    10
  ],
  [
    "likou",
    "莉蔻",
    1,
    "学园",
    "医者",
    44,
    9
  ],
  [
    "agari",
    "东爱璃",
    1,
    "P-SP",
    "偶像",
    50,
    7
  ],
  [
    "hoshimi",
    "希侑",
    1,
    "夜幕",
    "刺客",
    69,
    11
  ],
  [
    "chiharu",
    "初濑",
    1,
    "森之国",
    "刀客",
    60,
    11
  ],
  [
    "suiji",
    "岁己",
    2,
    "森之国",
    "歌势",
    48,
    10
  ],
  [
    "kanban",
    "栞栞",
    2,
    "毛茸乐园",
    "守护",
    92,
    6
  ],
  [
    "zhouyi",
    "轴伊",
    2,
    "夜幕",
    "刀客",
    55,
    11
  ],
  [
    "yuji",
    "雨纪",
    2,
    "深海",
    "游侠",
    46,
    10
  ],
  [
    "tiandou",
    "恬豆",
    2,
    "四禧丸子",
    "歌势",
    52,
    10
  ],
  [
    "aza",
    "AZA",
    2,
    "音律",
    "狂战",
    88,
    6
  ],
  [
    "pako",
    "帕可",
    2,
    "深海",
    "医者",
    50,
    9
  ],
  [
    "zhijin",
    "枝堇",
    2,
    "花语",
    "刺客",
    76,
    12
  ],
  [
    "sishi",
    "四时小路",
    5,
    "音律",
    "游侠",
    46,
    11
  ],
  [
    "sumi",
    "礼墨",
    2,
    "P-SP",
    "守护",
    90,
    6
  ],
  [
    "yukie",
    "桃濑雪绘",
    3,
    "工造",
    "刀客",
    62,
    11
  ],
  [
    "miting",
    "米汀",
    2,
    "魔道",
    "咒术",
    46,
    16
  ],
  [
    "xuezhu",
    "雪烛",
    3,
    "夜幕",
    "法师",
    44,
    15
  ],
  [
    "zeyin",
    "泽音",
    3,
    "深海",
    "医者",
    52,
    11
  ],
  [
    "sanli",
    "三理",
    3,
    "音律",
    "法师",
    48,
    15
  ],
  [
    "diansu",
    "点酥",
    3,
    "魔道",
    "刺客",
    55,
    16
  ],
  [
    "lianshiye",
    "恋诗夜",
    3,
    "夜幕",
    "刀客",
    60,
    11
  ],
  [
    "huize",
    "灰泽满",
    3,
    "学园",
    "咒术",
    48,
    16
  ],
  [
    "shengge",
    "笙歌",
    3,
    "P-SP",
    "歌势",
    50,
    12
  ],
  [
    "shadow",
    "李豆沙",
    3,
    "P-SP",
    "刺客",
    78,
    13
  ],
  [
    "nox",
    "诺莺",
    3,
    "毛茸乐园",
    "刺客",
    76,
    13
  ],
  [
    "miyue",
    "弥月",
    4,
    "夜幕",
    "刀客",
    60,
    12
  ],
  [
    "huali",
    "花礼",
    4,
    "花语",
    "偶像",
    52,
    9
  ],
  [
    "youyu",
    "柚雨",
    4,
    "深海",
    "刀客",
    60,
    13
  ],
  [
    "quanrong",
    "犬绒",
    4,
    "毛茸乐园",
    "守护",
    100,
    8
  ],
  [
    "ruiya",
    "瑞娅",
    4,
    "星际",
    "法师",
    46,
    16
  ],
  [
    "mumu",
    "沐霂",
    3,
    "四禧丸子",
    "偶像",
    54,
    10
  ],
  [
    "kroya",
    "克罗雅",
    4,
    "学园",
    "法师",
    46,
    16
  ],
  [
    "shiliu",
    "十六萤",
    4,
    "森之国",
    "刺客",
    80,
    13
  ],
  [
    "seki",
    "星汐",
    4,
    "P-SP",
    "咒术",
    46,
    16
  ],
  [
    "haruka",
    "白神遥",
    4,
    "P-SP",
    "刀客",
    58,
    12
  ],
  [
    "mahiru",
    "真绯瑠",
    5,
    "毛茸乐园",
    "狂战",
    68,
    13
  ],
  [
    "nana7mi",
    "七海",
    5,
    "深海",
    "刀客",
    62,
    12
  ],
  [
    "liAn",
    "梨安",
    5,
    "四禧丸子",
    "法师",
    48,
    17
  ],
  [
    "youyi",
    "又一",
    4,
    "四禧丸子",
    "刺客",
    92,
    13
  ],
  [
    "azi",
    "阿梓",
    5,
    "工造",
    "歌势",
    52,
    15
  ],
  [
    "taodai",
    "桃代",
    4,
    "花语",
    "守护",
    96,
    8
  ],
  [
    "miki",
    "弥希",
    5,
    "星际",
    "医者",
    48,
    13
  ],
  [
    "rei",
    "病院坂灵",
    5,
    "P-SP",
    "医者",
    47,
    15
  ],
  [
    "rinco",
    "秋凛子",
    5,
    "P-SP",
    "狂战",
    62,
    13
  ]
];
const UNITS = Object.fromEntries(ROSTER.map(([id, name, cost, fac, job, hp, atk]) =>
  [id, { id, name, cost: +cost, fac, job, hp: +hp, atk: +atk }]));
const STOCK = { 1: 50, 2: 40, 3: 30, 4: 20, 5: 10 };
const ITEMS = ['sword', 'staff', 'armor', 'bow', 'vamp', 'mana'];
const BOARD_CELLS = 64, DEPLOY_START = 32, MAX_BOARD_UNITS = MAX_LEVEL;
const BENCH = 8, SHOP = 5, MAX_ROUNDS = 40;

function seed32(value) {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0 || 1;
}
function random(state) {
  let x = state.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0 || 1;
  return state.rng / 4294967296;
}
function integer(state, n) { return Math.floor(random(state) * n); }
function assert(ok, message) { if (!ok) throw new Error(message); }
function seatAt(state, index) {
  assert(Number.isInteger(index) && index >= 0 && index < 8, 'Invalid seat');
  return state.seats[index];
}
function cloneUnit(unit) { return unit ? { ...unit } : null; }
function copyCard(id, uid) { return { ...UNITS[id], uid, star: 1, items: [] }; }
function copyCount(star) { return 3 ** (star - 1); }
function capacity(seat) { return Math.min(MAX_BOARD_UNITS, seat.level); }
function available(state, tier) {
  return ROSTER.filter(([id, , cost]) => +cost === tier && state.pool[id] > 0);
}
function draw(state, level) {
  const weights = ODDS[Math.min(MAX_LEVEL, level)].map((w, i) => available(state, i + 1).length ? w : 0);
  let sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  let r = random(state) * sum, tier = 1;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) { tier = i + 1; break; }
  }
  const options = available(state, tier);
  sum = options.reduce((n, [id]) => n + state.pool[id], 0);
  r = random(state) * sum;
  let id = options.at(-1)[0];
  for (const [candidate] of options) {
    r -= state.pool[candidate];
    if (r < 0) { id = candidate; break; }
  }
  state.pool[id]--;
  return copyCard(id, state.nextUid++);
}
function roll(state, seat) {
  for (const unit of seat.shop) if (unit) state.pool[unit.id]++;
  seat.shop = Array.from({ length: SHOP }, () => draw(state, seat.level));
}
function holdings(seat) {
  return [...seat.board.map((unit, slot) => ({ unit, zone: 'board', slot })),
    ...seat.bench.map((unit, slot) => ({ unit, zone: 'bench', slot }))]
    .filter(x => x.unit);
}
function fuse(seat, id) {
  for (let star = 1; star < 3; star++) {
    const triples = holdings(seat).filter(x => x.unit.id === id && x.unit.star === star).slice(0, 3);
    if (triples.length < 3) continue;
    // Keep the first unit's position and UID so a board upgrade never needs bench space.
    const first = triples[0];
    triples.forEach(x => { seat[x.zone][x.slot] = null; });
    const allItems = triples.flatMap(x => x.unit.items || []);
    seat[first.zone][first.slot] = { ...first.unit, star: star + 1, items: allItems.slice(0, 3) };
    seat.items.push(...allItems.slice(3));
  }
}
function publicUnit(unit) { return unit ? { ...unit, items: [...(unit.items || [])] } : null; }
function pairings(state) {
  const alive = state.seats.filter(s => s.alive).map(s => s.seat);
  // Rotated deterministic order limits immediate repeats without exposing the RNG.
  const offset = alive.length ? integer(state, alive.length) : 0;
  const queue = alive.slice(offset).concat(alive.slice(0, offset));
  const pairs = [];
  while (queue.length > 1) {
    const a = queue.shift();
    let index = queue.findIndex(b => state.seats[a].lastOpponent !== b && state.seats[b].lastOpponent !== a);
    if (index < 0) index = 0;
    const b = queue.splice(index, 1)[0];
    state.seats[a].lastOpponent = b;
    state.seats[b].lastOpponent = a;
    pairs.push({ a, b });
  }
  if (queue.length) pairs.push({ a: queue[0], b: null });
  state.pairings = pairs;
}
function battleFormation(seat, side) {
  return seat.board.flatMap((unit, index) => {
    if (!unit) return [];
    // Both players deploy on their own lower half. Mirror B onto the upper
    // half of the shared combat stage without changing its chosen column.
    const column = index % 8;
    const row = Math.floor(index / 8);
    const battleRow = side === 'A' ? row : 7 - row;
    return [{ unit, slot: battleRow * 8 + column }];
  });
}

function resolveRound(state) {
  // Public lineup intel lags one round: every alive seat's board is frozen here
  // (prep is over, lineups are locked) and views hand out this snapshot only.
  for (const seat of state.seats) if (seat.alive) seat.lastLineup = seat.board.map(publicUnit);
  state.battles = state.pairings.map(({ a, b }) => {
    if (b === null) return { a, b, winner: 'A', events: [], survivorsA: [], survivorsB: [], durationMs: 0, complete: true };
    const seed = seed32(`${state.seed}|${state.round}|${a}|${b}|${state.rng}`);
    const formationA = battleFormation(state.seats[a], 'A');
    const formationB = battleFormation(state.seats[b], 'B');
    const resolved = resolveBattle(
      formationA,
      formationB,
      seed,
      { maxTicks: 360 },
    );
    const events = resolved.events || [];
    return {
      a, b, winner: resolved.winner,
      formationA, formationB,
      survivorsA: resolved.survivorsA || [], survivorsB: resolved.survivorsB || [],
      bonds: resolved.bonds || {}, startingUnits: resolved.startingUnits || [], durationMs: resolved.durationMs || 0,
      complete: !!resolved.complete,
      events,
      eventsTruncated: false,
      eventCount: events.length,
    };
  });
}

function survivorScore(survivors) {
  return survivors.reduce((score, unit) => score + unit.hp / Math.max(1, unit.maxhp) + (unit.shield || 0) / Math.max(1, unit.maxhp), 0);
}

function settleCombat(state) {
  const results = [];
  for (const battle of state.battles || []) {
    const { a, b } = battle;
    if (b === null) {
      results.push({ a, b, winner: a, loser: null, damage: 0, battle: { durationMs: 0, survivorsA: 0, survivorsB: 0 } });
      continue;
    }
    const sa = state.seats[a], sb = state.seats[b];
    const scoreA = survivorScore(battle.survivorsA), scoreB = survivorScore(battle.survivorsB);
    const winner = battle.winner === 'A' ? a : battle.winner === 'B' ? b
      : scoreA === scoreB ? (integer(state, 2) ? b : a) : scoreA > scoreB ? a : b;
    const loser = winner === a ? b : a;
    const survivors = winner === a ? battle.survivorsA : battle.survivorsB;
    const remainingStars = survivors.reduce((sum, unit) => sum + (state.seats[winner].board.find(card => card && String(card.uid) === String(unit.uid))?.star || 1), 0);
    const damage = 2 + Math.floor((state.round - 1) / 5) + Math.min(5, remainingStars);
    const win = state.seats[winner], lose = state.seats[loser];
    win.wins++; win.streak = Math.max(1, win.streak + 1);
    lose.losses++; lose.streak = Math.min(-1, lose.streak - 1);
    lose.hp = Math.max(0, lose.hp - damage);
    results.push({ a, b, winner, loser, damage, battle: {
      durationMs: battle.durationMs, survivorsA: battle.survivorsA.length,
      survivorsB: battle.survivorsB.length, eventsTruncated: battle.eventsTruncated,
    } });
  }
  const eliminated = state.seats.filter(s => s.alive && s.hp === 0);
  eliminated.sort((a, b) => a.seat - b.seat);
  const sharedPlace = state.seats.filter(s => s.alive).length - eliminated.length + 1;
  for (const seat of eliminated) {
    seat.alive = false;
    seat.place = sharedPlace;
    for (const unit of [...seat.shop, ...seat.bench, ...seat.board]) {
      if (unit) state.pool[unit.id] += copyCount(unit.star);
    }
    seat.items = [];
    seat.shop.fill(null); seat.bench.fill(null); seat.board.fill(null);
  }
  state.results = results;
}
function income(seat, state) {
  const streak = streakGain(seat.streak);
  const beforeInterest=seat.gold+streak+(seat.streak>0?2:0)+Math.min(state.round,5);
  seat.gold=beforeInterest+interestGain(beforeInterest);
  seat.xp += 2;
  while (seat.level < MAX_LEVEL && seat.xp >= xpNeeded(seat.level)) {
    seat.xp -= xpNeeded(seat.level);
    seat.level++;
  }
  seat.ready = false;
}

export function createGame({ seed, players } = {}) {
  assert(Array.isArray(players) && players.length === 8, 'Exactly eight players required');
  assert(players.every(p => p && typeof p.id === 'string' && p.id.length && typeof p.name === 'string' && p.name.length), 'Invalid player');
  assert(new Set(players.map(p => p.id)).size === 8, 'Duplicate player id');
  const state = {
    version: 1, ruleset: 'deterministic-battle-v6',
    seed: String(seed ?? 'online'), rng: seed32(seed ?? 'online'),
    phase: 'prep', round: 1, complete: false, nextUid: 1,
    pool: Object.fromEntries(ROSTER.map(([id, , cost]) => [id, STOCK[+cost]])),
    pairings: [], battles: [], results: [], seats: players.map((p, seat) => ({
      seat, id: p.id, name: p.name.slice(0, 32), bot: !!p.bot, hp: 40, gold: 5, level: 2, xp: 0,
      alive: true, place: null, ready: false, wins: 0, losses: 0, streak: 0,
      lastOpponent: null, items: [], lastLineup: [],
      shop: Array(SHOP).fill(null),
      bench: Array(BENCH).fill(null), board: Array(BOARD_CELLS).fill(null)
    }))
  };
  for (const seat of state.seats) {
    seat.items.push(ITEMS[integer(state, ITEMS.length)]);
    roll(state, seat);
  }
  pairings(state);
  return state;
}

export function applyAction(state, seatIndex, action) {
  assert(state && state.version === 1 && !state.complete && state.phase === 'prep', 'Not in preparation');
  const seat = seatAt(state, seatIndex);
  assert(seat.alive, 'Seat eliminated');
  assert(action && typeof action === 'object' && typeof action.type === 'string', 'Invalid action');
  const { type } = action;
  if (type === 'ready') { seat.ready = true; return viewFor(state, seatIndex); }
  assert(!seat.ready, 'Seat is ready');
  if (type === 'buy') {
    const slot = action.slot;
    assert(Number.isInteger(slot) && slot >= 0 && slot < SHOP, 'Invalid shop slot');
    const unit = seat.shop[slot];
    assert(unit, 'Empty shop slot');
    assert(seat.gold >= unit.cost, 'Insufficient gold');
    const free = seat.bench.indexOf(null);
    assert(free >= 0, 'Bench full');
    seat.gold -= unit.cost;
    seat.shop[slot] = null;
    seat.bench[free] = unit;
    fuse(seat, unit.id);
  } else if (type === 'sell') {
    assert(Number.isInteger(action.uid), 'Invalid UID');
    const found = holdings(seat).find(x => x.unit.uid === action.uid);
    assert(found, 'Unit not owned');
    seat[found.zone][found.slot] = null;
    state.pool[found.unit.id] += copyCount(found.unit.star);
    seat.items.push(...(found.unit.items || []));
    seat.gold += sellRefund(found.unit);
  } else if (type === 'equip') {
    assert(Number.isInteger(action.uid), 'Invalid UID');
    assert(Number.isInteger(action.itemIndex) && action.itemIndex >= 0 && action.itemIndex < seat.items.length, 'Invalid item index');
    const found = holdings(seat).find(x => x.unit.uid === action.uid);
    assert(found, 'Unit not owned');
    assert((found.unit.items || []).length < 3, 'Equipment slots full');
    const [item] = seat.items.splice(action.itemIndex, 1);
    found.unit.items.push(item);
  } else if (type === 'unequip') {
    assert(Number.isInteger(action.uid), 'Invalid UID');
    const found = holdings(seat).find(x => x.unit.uid === action.uid);
    assert(found, 'Unit not owned');
    seat.items.push(...found.unit.items);
    found.unit.items = [];
  } else if (type === 'autoEquip') {
    const team = seat.board.filter(Boolean);
    assert(team.length, 'Deploy units first');
    for (let i=0;i<seat.items.length;i++) {
      const j=seat.items.findIndex((item,j)=>j>i && recipe(seat.items[i],item));
      if(j>=0){const result=recipe(seat.items[i],seat.items[j]);seat.items.splice(j,1);seat.items.splice(i,1,result);}
    }
    const power = unit => unit.star ** 2 * unit.cost;
    const carry = [...team].sort((a,b) => (a.job === '守护') - (b.job === '守护') || power(b)-power(a) || a.uid-b.uid);
    const fronts = [...team].sort((a,b) => (!['守护','刀客','狂战'].includes(a.job))-(!['守护','刀客','狂战'].includes(b.job)) || b.hp*b.star-a.hp*a.star || a.uid-b.uid);
    const remaining = [];
    for (const item of seat.items) {
      const candidates = EQUIPMENT[item]?.role === 'guard' ? fronts : carry;
      const unit = candidates.find(unit => unit.items.length < 3);
      if (unit) unit.items.push(item); else remaining.push(item);
    }
    seat.items = remaining;
  } else if (type === 'combine') {
    const {a,b}=action;
    assert(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<seat.items.length&&b<seat.items.length&&a!==b,'Invalid item indices');
    const result=recipe(seat.items[a],seat.items[b]);assert(result,'No recipe');
    seat.items.splice(Math.max(a,b),1);seat.items.splice(Math.min(a,b),1,result);
  } else if (type === 'combineWorn') {
    assert(Number.isInteger(action.uid),'Invalid UID');
    const found=holdings(seat).find(x=>x.unit.uid===action.uid);assert(found,'Unit not owned');
    const result=recipe(found.unit.items[0],found.unit.items[1]);assert(result,'No recipe');
    found.unit.items.splice(0,2,result);
  } else if (type === 'tidy') {
    const groups = new Map();
    for (const unit of seat.bench.filter(Boolean)) {
      groups.set(unit.id, Math.max(groups.get(unit.id) || 0, unit.star));
    }
    const ordered = seat.bench.filter(Boolean).sort((a,b) => groups.get(b.id)-groups.get(a.id) || a.id.localeCompare(b.id) || b.star-a.star || a.uid-b.uid);
    seat.bench = [...ordered,...Array(BENCH-ordered.length).fill(null)];
  } else if (type === 'autoDeploy') {
    const owned = holdings(seat).map(x => x.unit);
    const team = [...owned].sort((a,b) => b.star**2*b.cost-a.star**2*a.cost || a.uid-b.uid).slice(0,capacity(seat));
    const chosen = new Set(team.map(unit => unit.uid));
    const rest = owned.filter(unit => !chosen.has(unit.uid));
    assert(rest.length <= BENCH, 'Bench full');
    const board = seat.board.map(unit => chosen.has(unit?.uid) ? unit : null);
    for (const unit of team) {
      if (board.includes(unit)) continue;
      const melee = ['守护','刀客','狂战'].includes(unit.job);
      const slots = Array.from({length:32},(_,i) => melee ? DEPLOY_START+i : BOARD_CELLS-1-i);
      board[slots.find(slot => !board[slot])] = unit;
    }
    seat.board = board;
    seat.bench = [...rest,...Array(BENCH-rest.length).fill(null)];
  } else if (type === 'lockShop') {
    seat.shopLocked = !seat.shopLocked;
  } else if (type === 'move') {
    assert(Number.isInteger(action.uid), 'Invalid UID');
    const found = holdings(seat).find(x => x.unit.uid === action.uid);
    assert(found, 'Unit not owned');
    const to = action.to;
    assert(to && (to.zone === 'bench' || to.zone === 'board') && Number.isInteger(to.slot) &&
      to.slot >= (to.zone === 'board' ? DEPLOY_START : 0) &&
      to.slot < (to.zone === 'board' ? BOARD_CELLS : BENCH), 'Invalid destination');
    if (found.zone !== 'board' && to.zone === 'board' && !seat.board[to.slot]) {
      assert(seat.board.filter(Boolean).length < capacity(seat), 'Board level limit');
    }
    const other = seat[to.zone][to.slot];
    seat[to.zone][to.slot] = found.unit;
    seat[found.zone][found.slot] = other;
  } else if (type === 'reroll') {
    assert(seat.gold >= 2, 'Insufficient gold');
    seat.gold -= 2;
    roll(state, seat);
  } else if (type === 'buyXp') {
    assert(seat.level < MAX_LEVEL, 'Maximum level');
    assert(seat.gold >= 5, 'Insufficient gold');
    seat.gold -= 5;
    seat.xp += 4;
    while (seat.level < MAX_LEVEL && seat.xp >= xpNeeded(seat.level)) {
      seat.xp -= xpNeeded(seat.level); seat.level++;
    }
  } else throw new Error('Unknown action');
  return viewFor(state, seatIndex);
}

export function advancePhase(state) {
  assert(state && state.version === 1 && !state.complete, 'Game complete');
  if (state.phase === 'prep') { resolveRound(state); state.phase = 'combat'; }
  else if (state.phase === 'combat') { settleCombat(state); state.phase = 'result'; }
  else if (state.phase === 'result') {
    const alive = state.seats.filter(s => s.alive);
    if (alive.length <= 1 || state.round >= MAX_ROUNDS) {
      if (alive.length === 1) alive[0].place = 1;
      else alive.sort((a, b) => b.hp - a.hp || b.wins - a.wins || a.seat - b.seat)
        .forEach((s, i) => { s.place = i + 1; });
      state.complete = true; state.phase = 'over';
    } else {
      state.round++;
      for (const seat of alive) {
        income(seat, state);
        if (state.round % 5 === 0) seat.items.push(ITEMS[integer(state, ITEMS.length)]);
        if (!seat.shopLocked) roll(state, seat);
        seat.shopLocked = false;
      }
      state.results = [];
      state.battles = [];
      pairings(state);
      state.phase = 'prep';
    }
  } else throw new Error('Invalid phase');
  return state.phase;
}

export function viewFor(state, seatIndex) {
  const me = seatAt(state, seatIndex);
  return {
    ruleset: state.ruleset, round: state.round, phase: state.phase,
    complete: state.complete, seat: seatIndex,
    players: state.seats.map(s => ({ seat: s.seat, id: s.id, name: s.name, bot: !!s.bot,
      hp: s.hp, level: s.level, alive: s.alive, place: s.place, ready: s.ready,
      wins: s.wins, losses: s.losses,
      board: (s.lastLineup || []).map(publicUnit) })),   // 上回合锁定阵容快照：实时棋盘只发给本人
    me: { gold: me.gold, hp: me.hp, level: me.level, xp: me.xp, streak:me.streak, shopLocked: !!me.shopLocked,
      items: [...me.items],
      shop: me.shop.map(publicUnit), bench: me.bench.map(publicUnit), board: me.board.map(publicUnit) },
    pairings: state.pairings.map(p => ({ ...p })),
    results: state.results.map(r => ({ ...r })),
    battles: ['combat', 'result', 'over'].includes(state.phase)
      ? state.battles.map(b => structuredClone(b)) : []
  };
}

// Stable replay checksum. Do not use as authentication or as a secret commitment.
export function stateHash(state) {
  const json = JSON.stringify(state);
  return seed32(json).toString(16).padStart(8, '0');
}
