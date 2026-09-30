/* Bot players for the eight-player online room service.
 * Bots never hold reconnect tokens and never use the WebSocket action
 * sequence: their moves run on the room's internal path every time the game
 * enters a preparation phase, and every applyAction failure is swallowed so a
 * bot can never break the room. */
import { applyAction } from './core.js';

export const BOT_NAMES = ['阿铁', '阿芯', '啾啾', '蛋黄', '咕咕', '海胆', '金宝', '噜噜', '麻薯', '年糕', '泡芙', '肉丸'];

export function pickBotName(takenNames = []) {
  const taken = new Set(takenNames);
  for (const name of BOT_NAMES) if (!taken.has(name)) return name;
  for (let suffix = 2; suffix < 100; suffix++) {
    for (const name of BOT_NAMES) {
      const candidate = `${name}${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
  return '机器人';
}

// Same xorshift family as online/core.js, seeded per game/seat/round so bot
// decisions are reproducible from the game seed alone (never Math.random).
function seededRandom(seedText) {
  let h = 2166136261;
  for (const char of String(seedText)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  let state = h >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    state = state >>> 0 || 1;
    return state / 4294967296;
  };
}

/** Plays one preparation phase for a bot seat. All failures are ignored. */
export function botPolicy(game, seatIndex) {
  if (!game || game.version !== 1 || game.complete || game.phase !== 'prep') return;
  const seat = game.seats[seatIndex];
  if (!seat || !seat.alive || seat.ready) return;
  const random = seededRandom(`${game.seed}|${seatIndex}|${game.round}`);
  const attempt = action => { try { applyAction(game, seatIndex, action); return true; } catch { return false; } };
  const ownedUnits = () => [...seat.board, ...seat.bench].filter(Boolean);
  const boardCount = () => seat.board.filter(Boolean).length;
  // Deterministic tie-breaker between equally rated pieces.
  const jitter = new Map();
  const rank = unit => {
    if (!jitter.has(unit.uid)) jitter.set(unit.uid, random());
    return unit.star * 1000 + unit.cost * 10 + jitter.get(unit.uid);
  };

  // 0. Opening offer: pick the strongest of the three, mirroring a real player.
  if (!seat.openingGranted && Array.isArray(seat.openingOffer) && seat.openingOffer.length) {
    let best = 0;
    seat.openingOffer.forEach((unit, i) => { if (rank(unit) > rank(seat.openingOffer[best])) best = i; });
    attempt({ type: 'pickOpening', slot: best });
  }

  // 1. Levels: from round 2, spend surplus gold on XP while keeping a buffer.
  if (game.round >= 2 && seat.level < 11) {
    for (let times = 0; times < 2 && seat.gold >= 12; times++) {
      if (!attempt({ type: 'buyXp' })) break;
    }
  }

  const capacity = Math.min(11, seat.level);

  // 2. Shop: keep pairs of owned ids, otherwise fill the bench while the
  //    total roster is still below the board capacity.
  let purchases = 0;
  const buyFromShop = () => {
    for (let slot = 0; slot < seat.shop.length; slot++) {
      const unit = seat.shop[slot];
      if (!unit || seat.gold < unit.cost) continue;
      const pairs = ownedUnits().some(owned => owned.id === unit.id);
      if (!pairs && ownedUnits().length >= capacity) continue;
      if (attempt({ type: 'buy', slot })) purchases++;
    }
  };
  buyFromShop();

  // 3. Items: stack the strongest deployed units first, one piece at a time.
  while (seat.items.length > 0) {
    const target = seat.board
      .filter(unit => unit && unit.items.length < 3)
      .sort((a, b) => rank(b) - rank(a))[0];
    if (!target || !attempt({ type: 'equip', uid: target.uid, itemIndex: 0 })) break;
  }

  // 4. Deploy near the center, keeping each unit's position deterministic.
  const preferredSlots = [51, 52, 43, 44, 59, 60, 50, 53, 42, 45, 58];
  while (boardCount() < capacity) {
    const strongest = seat.bench.filter(Boolean).sort((a, b) => rank(b) - rank(a))[0];
    const slot = preferredSlots.find(index => !seat.board[index]);
    if (!strongest || slot === undefined || !attempt({ type: 'move', uid: strongest.uid, to: { zone: 'board', slot } })) break;
  }

  // 5. Reroll once when the shop offered nothing worth buying.
  if (purchases === 0 && seat.gold >= 6 && game.round >= 2) {
    if (attempt({ type: 'reroll' })) buyFromShop();
  }

  // 6. Lock the seat for this round.
  attempt({ type: 'ready' });
}
