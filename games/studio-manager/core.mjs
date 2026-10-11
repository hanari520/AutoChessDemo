import { MEMBERS, PROGRAMS, EVENTS, EQUIPMENT } from './content.mjs';

export const RULES_VERSION = 'g1-rules-0.1.0';
export const STARTING_FUNDS = 100;
export const STARTING_ENERGY = 80;
export const MAX_ENERGY = 100;
export const MAX_HYPE = 100;

const MEMBER_BY_ID = Object.fromEntries(MEMBERS.map((member) => [member.id, member]));
const PROGRAM_BY_ID = Object.fromEntries(PROGRAMS.map((program) => [program.id, program]));
const EVENT_BY_ID = Object.fromEntries(EVENTS.map((event) => [event.id, event]));
const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT.map((item) => [item.id, item]));
const EQUIPMENT_IDS = EQUIPMENT.map((item) => item.id);
const PHASES = new Set(['planning', 'event', 'result', 'finale', 'complete']);
const hasEntry = (record, key) => typeof key === 'string' && Object.hasOwn(record, key);

export const QUALITY_BANDS = Object.freeze([
  Object.freeze({ min: 0, max: 34, multiplier: 0.55, label: '临场磨合' }),
  Object.freeze({ min: 35, max: 49, multiplier: 0.8, label: '稳定发挥' }),
  Object.freeze({ min: 50, max: 64, multiplier: 1, label: '发挥出色' }),
  Object.freeze({ min: 65, max: 79, multiplier: 1.2, label: '观众热烈' }),
  Object.freeze({ min: 80, max: 89, multiplier: 1.4, label: '高光时刻' }),
  Object.freeze({ min: 90, max: 100, multiplier: 1.6, label: '全场沸腾' }),
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isIntegerInRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const sameMembers = (left, right) => left.length === right.length && left.every((id) => right.includes(id));

function hashSeed(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledEventDeck(seed) {
  const deck = EVENTS.map((event) => event.id);
  const random = makeRandom(seed);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function validateMemberSelection(state, program, memberIds) {
  if (!Array.isArray(memberIds)) return { code: 'members-required', message: '请选择出场成员。' };
  if (new Set(memberIds).size !== memberIds.length) return { code: 'duplicate-member', message: '同一成员不能重复出场。' };
  if (memberIds.some((id) => !state.memberIds.includes(id))) {
    return { code: 'member-not-in-roster', message: '只能安排已加入社团的成员。' };
  }
  if (memberIds.length < program.minMembers || memberIds.length > program.maxMembers) {
    return {
      code: 'invalid-member-count',
      message: `${program.name}需要安排 ${program.minMembers}${program.maxMembers === program.minMembers ? '' : `–${program.maxMembers}`} 名成员。`,
    };
  }
  return null;
}

function getQualityBreakdown(state, program, memberIds, eventDelta = 0) {
  const skillLevel = Math.max(...memberIds.map((id) => MEMBER_BY_ID[id].skills[program.id] ?? 0));
  const equipmentLevel = state.equipment[program.equipmentId] ?? 0;
  const hasSynergy = memberIds.length === 2
    && MEMBER_BY_ID[memberIds[0]].synergyWith.includes(memberIds[1]);
  const fatigued = memberIds.some((id) => state.members[id].energy < 25);
  const breakdown = {
    base: 40,
    skillBonus: skillLevel * 10,
    equipmentBonus: equipmentLevel * 5,
    comboBonus: hasSynergy ? 10 : 0,
    fatiguePenalty: fatigued ? 15 : 0,
    eventDelta,
  };
  breakdown.quality = clamp(
    breakdown.base + breakdown.skillBonus + breakdown.equipmentBonus + breakdown.comboBonus
      - breakdown.fatiguePenalty + breakdown.eventDelta,
    0,
    100,
  );
  return breakdown;
}

function qualityReasons(breakdown) {
  return [
    { code: 'base', label: '节目基础质量', value: breakdown.base },
    { code: 'skill', label: '成员特长匹配', value: breakdown.skillBonus },
    { code: 'equipment', label: '设备加成', value: breakdown.equipmentBonus },
    { code: 'synergy', label: '成员默契', value: breakdown.comboBonus },
    { code: 'fatigue', label: '疲劳影响', value: -breakdown.fatiguePenalty },
    ...(breakdown.eventDelta === 0 ? [] : [{ code: 'event', label: '事件影响', value: breakdown.eventDelta }]),
    { code: 'quality', label: '最终质量 Q', value: breakdown.quality },
  ];
}

function payoutBand(quality) {
  return QUALITY_BANDS.find((band) => quality >= band.min && quality <= band.max);
}

function estimateIncome(program, quality) {
  return Math.floor(program.baseIncome * payoutBand(quality).multiplier);
}

function qualityDeltaBounds() {
  const deltas = EVENTS.flatMap((event) => event.options.map((option) => option.qualityDelta));
  return {
    min: Math.min(0, ...deltas),
    max: Math.max(0, ...deltas),
  };
}

export function createGame({ seed = 1, memberIds } = {}) {
  if (!(typeof seed === 'string' && seed.length > 0)
      && !(typeof seed === 'number' && Number.isFinite(seed))) {
    throw new Error('seed must be a non-empty string or a finite number.');
  }
  if (!Array.isArray(memberIds) || memberIds.length !== 3 || new Set(memberIds).size !== 3) {
    throw new Error('Choose exactly three unique members to start.');
  }
  if (memberIds.some((id) => !hasEntry(MEMBER_BY_ID, id))) {
    throw new Error('Starting roster contains an unknown member.');
  }

  const normalizedSeed = typeof seed === 'number' ? Math.trunc(seed) : seed;
  const seedHash = hashSeed(normalizedSeed);
  return {
    rulesVersion: RULES_VERSION,
    seed: normalizedSeed,
    seedHash,
    phase: 'planning',
    memberIds: [...memberIds],
    members: Object.fromEntries(memberIds.map((id) => [id, { id, energy: STARTING_ENERGY }])),
    funds: STARTING_FUNDS,
    hype: 0,
    week: 1,
    slot: 1,
    equipment: Object.fromEntries(EQUIPMENT_IDS.map((id) => [id, 0])),
    eventDeck: shuffledEventDeck(seedHash),
    eventCursor: 0,
    currentShow: null,
    lastResult: null,
    history: [],
    actionIds: [],
    finale: { programIds: [], score: null, endingId: null, result: null },
  };
}

export function previewShow(state, programId, memberIds) {
  if (!validateState(state)) throw new Error('Cannot preview an invalid game state.');
  if (state.phase !== 'planning') {
    return { ok: false, error: 'wrong-phase', message: '目前不是排档阶段。' };
  }
  const program = hasEntry(PROGRAM_BY_ID, programId) ? PROGRAM_BY_ID[programId] : null;
  if (!program) return { ok: false, error: 'unknown-program', message: '找不到这个节目。' };
  const selectionError = validateMemberSelection(state, program, memberIds);
  if (selectionError) return { ok: false, ...selectionError };

  const breakdown = getQualityBreakdown(state, program, memberIds);
  const bounds = qualityDeltaBounds();
  const qualityRange = {
    min: clamp(breakdown.quality + bounds.min, 0, 100),
    max: clamp(breakdown.quality + bounds.max, 0, 100),
  };
  const notSelected = state.memberIds.filter((id) => !memberIds.includes(id));
  const energyCosts = memberIds.map((memberId) => ({ memberId, amount: program.energyCost }));
  const energyRecovery = notSelected.map((memberId) => ({ memberId, amount: Math.min(15, MAX_ENERGY - state.members[memberId].energy) }));
  return {
    ok: true,
    programId,
    memberIds: [...memberIds],
    cost: program.baseCost,
    affordable: state.funds >= program.baseCost,
    quality: breakdown.quality,
    qualityRange,
    incomeRange: {
      min: estimateIncome(program, qualityRange.min),
      max: estimateIncome(program, qualityRange.max),
    },
    energyCosts,
    energyRecovery,
    reasons: qualityReasons(breakdown),
    breakdown,
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function addActionId(state, actionId) {
  state.actionIds.push(actionId);
  return state;
}

function addHistoryResult(state, result) {
  state.lastResult = result;
  state.history.push(result);
  state.phase = 'result';
  return state;
}

function getEnergyChanges(before, after, memberIds) {
  return memberIds.map((memberId) => ({
    memberId,
    before: before[memberId].energy,
    after: after[memberId].energy,
    delta: after[memberId].energy - before[memberId].energy,
  }));
}

function settleShow(state, eventOption, eventCost = 0) {
  const show = state.currentShow;
  const program = PROGRAM_BY_ID[show.programId];
  const beforeMembers = cloneState(state.members);
  const fundsBefore = show.fundsBefore;
  const option = eventOption ?? {
    id: null,
    label: '没有可用事件',
    cost: 0,
    qualityDelta: 0,
    hypeDelta: 0,
    fundsDelta: 0,
    energyDelta: 0,
  };

  for (const memberId of show.memberIds) {
    state.members[memberId].energy = Math.max(0, state.members[memberId].energy - program.energyCost);
  }
  for (const memberId of state.memberIds) {
    if (!show.memberIds.includes(memberId)) {
      state.members[memberId].energy = Math.min(MAX_ENERGY, state.members[memberId].energy + 15);
    }
  }
  if (option.energyDelta !== 0) {
    for (const memberId of show.memberIds) {
      state.members[memberId].energy = clamp(state.members[memberId].energy + option.energyDelta, 0, MAX_ENERGY);
    }
  }

  const breakdown = getQualityBreakdown(
    { ...state, members: beforeMembers },
    program,
    show.memberIds,
    option.qualityDelta,
  );
  const band = payoutBand(breakdown.quality);
  const income = estimateIncome(program, breakdown.quality);
  const hypeBefore = state.hype;
  state.funds += income + option.fundsDelta;
  const intendedHypeDelta = program.baseHype + option.hypeDelta;
  state.hype = clamp(state.hype + intendedHypeDelta, 0, MAX_HYPE);
  const hypeDelta = state.hype - hypeBefore;
  const energyChanges = getEnergyChanges(beforeMembers, state.members, state.memberIds);
  const totalCost = show.programCost + eventCost;
  const reasons = [
    ...qualityReasons(breakdown),
    {
      code: 'income',
      label: `节目收入（${band.label}，${band.multiplier} 倍）`,
      value: income,
      detail: `${program.baseIncome} × ${band.multiplier}`,
    },
    { code: 'program-cost', label: '节目投入', value: -show.programCost },
    ...(eventCost === 0 ? [] : [{ code: 'event-cost', label: '事件支出', value: -eventCost }]),
    ...(option.fundsDelta === 0 ? [] : [{ code: 'event-funds', label: '事件资金变化', value: option.fundsDelta }]),
    { code: 'hype', label: '社团热度变化', value: hypeDelta },
    {
      code: 'energy',
      label: '成员精力变化',
      value: energyChanges.map(({ memberId, delta }) => ({ memberId, delta })),
    },
    ...(show.eventId
      ? [{ code: 'event-choice', label: `${EVENT_BY_ID[show.eventId].title}：${option.label}`, value: option.id }]
      : [{ code: 'event-choice', label: '事件卡已耗尽，本档安全跳过', value: null }]),
  ];
  const result = {
    kind: 'show',
    week: state.week,
    slot: state.slot,
    programId: show.programId,
    programName: program.name,
    memberIds: [...show.memberIds],
    eventId: show.eventId,
    eventOptionId: option.id,
    quality: breakdown.quality,
    qualityBreakdown: breakdown,
    income,
    programCost: show.programCost,
    eventCost,
    cost: totalCost,
    fundsDelta: state.funds - fundsBefore,
    fundsAfter: state.funds,
    hypeDelta,
    hypeAfter: state.hype,
    energyChanges,
    energyAfter: Object.fromEntries(state.memberIds.map((id) => [id, state.members[id].energy])),
    reasons,
  };
  show.eventOptionId = option.id;
  return addHistoryResult(state, result);
}

function settleRest(state) {
  const beforeMembers = cloneState(state.members);
  for (const memberId of state.memberIds) {
    state.members[memberId].energy = Math.min(MAX_ENERGY, state.members[memberId].energy + 25);
  }
  const energyChanges = getEnergyChanges(beforeMembers, state.members, state.memberIds);
  const result = {
    kind: 'rest',
    week: state.week,
    slot: state.slot,
    programId: null,
    programName: '休息档',
    memberIds: [],
    eventId: null,
    eventOptionId: null,
    quality: null,
    qualityBreakdown: null,
    income: 0,
    programCost: 0,
    eventCost: 0,
    cost: 0,
    fundsDelta: 0,
    fundsAfter: state.funds,
    hypeDelta: 0,
    hypeAfter: state.hype,
    energyChanges,
    energyAfter: Object.fromEntries(state.memberIds.map((id) => [id, state.members[id].energy])),
    reasons: [
      { code: 'rest', label: '休息档不产生节目收入，全员恢复最多 25 点精力。', value: 25 },
      {
        code: 'energy',
        label: '成员精力变化',
        value: energyChanges.map(({ memberId, delta }) => ({ memberId, delta })),
      },
    ],
  };
  state.currentShow = { kind: 'rest' };
  return addHistoryResult(state, result);
}

function applyShowAction(state, action) {
  if (state.phase !== 'planning') throw new Error('A show can only be arranged during planning.');
  const program = hasEntry(PROGRAM_BY_ID, action.programId) ? PROGRAM_BY_ID[action.programId] : null;
  if (!program) throw new Error('Unknown program.');
  const selectionError = validateMemberSelection(state, program, action.memberIds);
  if (selectionError) throw new Error(selectionError.message);
  if (state.funds < program.baseCost) throw new Error('Not enough funds for this program; resting is always free.');

  const preview = previewShow(state, action.programId, action.memberIds);
  const next = cloneState(state);
  const fundsBefore = next.funds;
  next.funds -= program.baseCost;
  let eventId = null;
  if (next.eventCursor < next.eventDeck.length) {
    eventId = next.eventDeck[next.eventCursor];
    next.eventCursor += 1;
  }
  next.currentShow = {
    kind: 'show',
    programId: program.id,
    memberIds: [...action.memberIds],
    programCost: program.baseCost,
    fundsBefore,
    eventId,
    eventOptionId: null,
    preview: {
      quality: preview.quality,
      qualityRange: preview.qualityRange,
      incomeRange: preview.incomeRange,
      breakdown: preview.breakdown,
    },
  };
  next.phase = eventId ? 'event' : 'result';
  if (!eventId) settleShow(next, null, 0);
  return addActionId(next, action.actionId);
}

function applyEventAction(state, action) {
  if (state.phase !== 'event' || state.currentShow?.kind !== 'show' || !state.currentShow.eventId) {
    throw new Error('There is no event awaiting a choice.');
  }
  const event = EVENT_BY_ID[state.currentShow.eventId];
  const option = event.options.find((candidate) => candidate.id === action.optionId);
  if (!option) throw new Error('Unknown option for the current event.');
  if (state.funds < option.cost) throw new Error('Not enough funds for this event option; choose an affordable option.');

  const next = cloneState(state);
  next.funds -= option.cost;
  settleShow(next, option, option.cost);
  return addActionId(next, action.actionId);
}

function applyUpgradeAction(state, action) {
  if (state.phase !== 'planning') throw new Error('Equipment can only be upgraded during planning.');
  const item = hasEntry(EQUIPMENT_BY_ID, action.equipmentId) ? EQUIPMENT_BY_ID[action.equipmentId] : null;
  if (!item) throw new Error('Unknown equipment.');
  const level = state.equipment[item.id];
  const cost = item.upgradeCosts[level];
  if (cost === undefined) throw new Error(`${item.name} is already at maximum level.`);
  if (state.funds < cost) throw new Error('Not enough funds for this upgrade.');

  const next = cloneState(state);
  next.funds -= cost;
  next.equipment[item.id] += 1;
  next.lastUpgrade = {
    equipmentId: item.id,
    equipmentName: item.name,
    level: next.equipment[item.id],
    cost,
    week: next.week,
    slot: next.slot,
  };
  return addActionId(next, action.actionId);
}

function applyAdvanceAction(state, action) {
  if (state.phase !== 'result') throw new Error('Advance is only available after a slot result.');
  const next = cloneState(state);
  next.currentShow = null;
  if (next.week === 4 && next.slot === 3) {
    next.phase = 'finale';
  } else {
    if (next.slot < 3) next.slot += 1;
    else {
      next.week += 1;
      next.slot = 1;
    }
    next.phase = 'planning';
  }
  return addActionId(next, action.actionId);
}

function calculateFinale(state, programIds) {
  const played = new Map(PROGRAMS.map((program) => [program.id, []]));
  for (const result of state.history) {
    if (result.kind === 'show') played.get(result.programId).push(result.quality);
  }

  const practice = programIds.reduce((sum, id) => sum + Math.min(3, played.get(id).length) / 3 * 20, 0) / 3;
  const selectedQuality = programIds.reduce((sum, id) => {
    const qualities = played.get(id);
    return sum + (qualities.length ? qualities.reduce((total, value) => total + value, 0) / qualities.length : 0);
  }, 0) / 3;
  const quality = selectedQuality / 100 * 25;
  const hype = state.hype / MAX_HYPE * 20;
  const funds = Math.min(state.funds, 200) / 200 * 10;
  const averageEnergy = state.memberIds.reduce((sum, id) => sum + state.members[id].energy, 0) / state.memberIds.length;
  const energy = averageEnergy / MAX_ENERGY * 10;
  const variety = Math.min(5, new Set(played.entries().filter(([, qualities]) => qualities.length).map(([id]) => id)).size);
  const components = {
    campaign: 10,
    practice,
    quality,
    hype,
    funds,
    energy,
    variety,
  };
  const score = clamp(Math.round(Object.values(components).reduce((sum, value) => sum + value, 0)), 0, 100);
  const endingId = score >= 72 ? 'spotlight' : score >= 45 ? 'steady-debut' : 'first-steps';
  const endings = {
    spotlight: { title: '星光初绽', grade: '闪耀联合演出' },
    'steady-debut': { title: '默契成团', grade: '亮眼联合演出' },
    'first-steps': { title: '初演启程', grade: '温暖完成首演' },
  };
  return {
    score,
    endingId,
    ending: endings[endingId],
    programIds: [...programIds],
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Math.round(value * 10) / 10])),
  };
}

function applyFinaleAction(state, action) {
  if (state.phase !== 'finale') throw new Error('The joint performance is not ready yet.');
  if (!Array.isArray(action.programIds) || action.programIds.length !== 3
      || new Set(action.programIds).size !== 3
      || action.programIds.some((id) => !hasEntry(PROGRAM_BY_ID, id))) {
    throw new Error('Choose three different programs from the program list.');
  }
  const next = cloneState(state);
  const result = calculateFinale(next, action.programIds);
  next.finale = {
    programIds: [...action.programIds],
    score: result.score,
    endingId: result.endingId,
    result,
  };
  next.phase = 'complete';
  return addActionId(next, action.actionId);
}

export function reduceGame(state, action) {
  if (!validateState(state)) throw new Error('Cannot reduce an invalid game state.');
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('Action must be an object.');
  if (typeof action.actionId !== 'string' || action.actionId.trim().length === 0) {
    throw new Error('Every action needs a non-empty actionId.');
  }
  if (state.actionIds.includes(action.actionId)) return state;

  switch (action.type) {
    case 'show':
    case 'arrange':
      return applyShowAction(state, action);
    case 'event':
      return applyEventAction(state, action);
    case 'rest': {
      if (state.phase !== 'planning') throw new Error('Rest is only available during planning.');
      return addActionId(settleRest(cloneState(state)), action.actionId);
    }
    case 'upgrade':
      return applyUpgradeAction(state, action);
    case 'advance':
      return applyAdvanceAction(state, action);
    case 'finale':
      return applyFinaleAction(state, action);
    default:
      throw new Error(`Unknown action type: ${String(action.type)}.`);
  }
}

const ENDING_IDS = new Set(['spotlight', 'steady-debut', 'first-steps']);
const QUALITY_BREAKDOWN_KEYS = ['base', 'skillBonus', 'equipmentBonus', 'comboBonus', 'fatiguePenalty', 'eventDelta', 'quality'];
const FINALE_COMPONENT_LIMITS = {
  campaign: 10,
  practice: 20,
  quality: 25,
  hype: 20,
  funds: 10,
  energy: 10,
  variety: 5,
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && sameMembers(Object.keys(value), keys);
}

function hasOnlyKeys(value, keys) {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isText(value, maxLength = 2000) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function validUniqueReferences(values, allowed, minLength, maxLength) {
  return Array.isArray(values)
    && values.length >= minLength
    && values.length <= maxLength
    && values.every((value) => typeof value === 'string' && allowed.has(value))
    && new Set(values).size === values.length;
}

function validQualityBreakdown(breakdown) {
  return hasExactKeys(breakdown, QUALITY_BREAKDOWN_KEYS)
    && isIntegerInRange(breakdown.base, 0, 100)
    && isIntegerInRange(breakdown.skillBonus, 0, 100)
    && isIntegerInRange(breakdown.equipmentBonus, 0, 100)
    && isIntegerInRange(breakdown.comboBonus, 0, 100)
    && isIntegerInRange(breakdown.fatiguePenalty, 0, 100)
    && isIntegerInRange(breakdown.eventDelta, -100, 100)
    && isIntegerInRange(breakdown.quality, 0, 100);
}

function validPreviewSnapshot(preview) {
  return hasExactKeys(preview, ['quality', 'qualityRange', 'incomeRange', 'breakdown'])
    && isIntegerInRange(preview.quality, 0, 100)
    && hasExactKeys(preview.qualityRange, ['min', 'max'])
    && isIntegerInRange(preview.qualityRange.min, 0, 100)
    && isIntegerInRange(preview.qualityRange.max, preview.qualityRange.min, 100)
    && preview.quality >= preview.qualityRange.min
    && preview.quality <= preview.qualityRange.max
    && hasExactKeys(preview.incomeRange, ['min', 'max'])
    && isIntegerInRange(preview.incomeRange.min, 0, Number.MAX_SAFE_INTEGER)
    && isIntegerInRange(preview.incomeRange.max, preview.incomeRange.min, Number.MAX_SAFE_INTEGER)
    && validQualityBreakdown(preview.breakdown)
    && preview.breakdown.quality === preview.quality;
}

function validEnergyChanges(changes, memberIds) {
  if (!Array.isArray(changes) || changes.length !== memberIds.length) return false;
  const seen = new Set();
  for (const change of changes) {
    if (!isRecord(change)
        || !hasExactKeys(change, ['memberId', 'before', 'after', 'delta'])
        || typeof change.memberId !== 'string'
        || !memberIds.includes(change.memberId)
        || seen.has(change.memberId)
        || !isIntegerInRange(change.before, 0, MAX_ENERGY)
        || !isIntegerInRange(change.after, 0, MAX_ENERGY)
        || !isIntegerInRange(change.delta, -MAX_ENERGY, MAX_ENERGY)
        || change.after - change.before !== change.delta) return false;
    seen.add(change.memberId);
  }
  return sameMembers([...seen], memberIds);
}

function validEnergyMap(energyMap, memberIds) {
  return hasExactKeys(energyMap, memberIds)
    && memberIds.every((id) => isIntegerInRange(energyMap[id], 0, MAX_ENERGY));
}

function validReasonValue(value, memberIds) {
  if (value === null || typeof value === 'string') return typeof value !== 'string' || value.length <= 2000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value)) return false;
  if (value.length !== memberIds.length) return false;
  const seen = new Set();
  for (const item of value) {
    if (!isRecord(item)
        || !hasExactKeys(item, ['memberId', 'delta'])
        || typeof item.memberId !== 'string'
        || !memberIds.includes(item.memberId)
        || seen.has(item.memberId)
        || !isIntegerInRange(item.delta, -MAX_ENERGY, MAX_ENERGY)) return false;
    seen.add(item.memberId);
  }
  return sameMembers([...seen], memberIds);
}

function validReasons(reasons, memberIds) {
  return Array.isArray(reasons)
    && reasons.length > 0
    && reasons.length <= 32
    && reasons.every((reason) => isRecord(reason)
      && hasOnlyKeys(reason, ['code', 'label', 'value', 'detail'])
      && isText(reason.code, 80)
      && isText(reason.label, 300)
      && Object.hasOwn(reason, 'value')
      && validReasonValue(reason.value, memberIds)
      && (reason.detail === undefined || (typeof reason.detail === 'string' && reason.detail.length <= 500)));
}

function validEventReference(eventId, optionId) {
  if (eventId === null) return optionId === null;
  if (!hasEntry(EVENT_BY_ID, eventId)) return false;
  return typeof optionId === 'string' && EVENT_BY_ID[eventId].options.some((option) => option.id === optionId);
}

function validResultRecord(result, memberIds) {
  if (!isRecord(result)
      || !hasExactKeys(result, [
        'kind', 'week', 'slot', 'programId', 'programName', 'memberIds', 'eventId', 'eventOptionId',
        'quality', 'qualityBreakdown', 'income', 'programCost', 'eventCost', 'cost', 'fundsDelta',
        'fundsAfter', 'hypeDelta', 'hypeAfter', 'energyChanges', 'energyAfter', 'reasons',
      ])
      || !['show', 'rest'].includes(result.kind)
      || !isIntegerInRange(result.week, 1, 4)
      || !isIntegerInRange(result.slot, 1, 3)
      || !isText(result.programName, 100)
      || !validUniqueReferences(result.memberIds, new Set(memberIds), 0, 2)
      || !validEventReference(result.eventId, result.eventOptionId)
      || !isIntegerInRange(result.income, 0, Number.MAX_SAFE_INTEGER)
      || !isIntegerInRange(result.programCost, 0, Number.MAX_SAFE_INTEGER)
      || !isIntegerInRange(result.eventCost, 0, Number.MAX_SAFE_INTEGER)
      || !isIntegerInRange(result.cost, 0, Number.MAX_SAFE_INTEGER)
      || !Number.isSafeInteger(result.fundsDelta)
      || !isIntegerInRange(result.fundsAfter, 0, Number.MAX_SAFE_INTEGER)
      || !Number.isSafeInteger(result.hypeDelta)
      || !isIntegerInRange(result.hypeAfter, 0, MAX_HYPE)
      || !validEnergyChanges(result.energyChanges, memberIds)
      || !validEnergyMap(result.energyAfter, memberIds)
      || !validReasons(result.reasons, memberIds)) return false;

  if (result.kind === 'rest') {
    return result.programId === null
      && result.programName === '休息档'
      && result.memberIds.length === 0
      && result.eventId === null
      && result.eventOptionId === null
      && result.quality === null
      && result.qualityBreakdown === null
      && result.income === 0
      && result.programCost === 0
      && result.eventCost === 0
      && result.cost === 0
      && result.fundsDelta === 0
      && result.hypeDelta === 0;
  }

  const program = hasEntry(PROGRAM_BY_ID, result.programId) ? PROGRAM_BY_ID[result.programId] : null;
  return Boolean(program)
    && result.programName === program.name
    && result.memberIds.length >= program.minMembers
    && result.memberIds.length <= program.maxMembers
    && result.programCost === program.baseCost
    && result.cost === result.programCost + result.eventCost
    && (result.eventId !== null || result.eventCost === 0)
    && isIntegerInRange(result.quality, 0, 100)
    && validQualityBreakdown(result.qualityBreakdown)
    && result.qualityBreakdown.quality === result.quality
    && (result.eventId === null || result.eventCost === EVENT_BY_ID[result.eventId].options.find((option) => option.id === result.eventOptionId)?.cost);
}

function validShowSnapshot(show, state, phase) {
  const program = hasEntry(PROGRAM_BY_ID, show?.programId) ? PROGRAM_BY_ID[show.programId] : null;
  if (!isRecord(show)
      || !hasExactKeys(show, [
        'kind', 'programId', 'memberIds', 'programCost', 'fundsBefore', 'eventId', 'eventOptionId', 'preview',
      ])
      || show.kind !== 'show'
      || !program
      || !validUniqueReferences(show.memberIds, new Set(state.memberIds), program.minMembers, program.maxMembers)
      || show.programCost !== program.baseCost
      || !isIntegerInRange(show.programCost, 0, Number.MAX_SAFE_INTEGER)
      || !isIntegerInRange(show.fundsBefore, show.programCost, Number.MAX_SAFE_INTEGER)
      || !validPreviewSnapshot(show.preview)
      || !(show.eventId === null || hasEntry(EVENT_BY_ID, show.eventId))
      || !(show.eventOptionId === null || typeof show.eventOptionId === 'string')) return false;

  if (phase === 'event') {
    return show.eventId !== null
      && show.eventOptionId === null
      && state.funds === show.fundsBefore - show.programCost;
  }
  if (phase !== 'result') return false;
  return show.eventId === null
    ? show.eventOptionId === null && state.eventCursor === state.eventDeck.length
    : validEventReference(show.eventId, show.eventOptionId);
}

function validFinaleResult(result, finale) {
  const componentKeys = Object.keys(FINALE_COMPONENT_LIMITS);
  return isRecord(result)
    && hasExactKeys(result, ['score', 'endingId', 'ending', 'programIds', 'components'])
    && isIntegerInRange(result.score, 0, 100)
    && ENDING_IDS.has(result.endingId)
    && isRecord(result.ending)
    && hasExactKeys(result.ending, ['title', 'grade'])
    && isText(result.ending.title, 100)
    && isText(result.ending.grade, 100)
    && validUniqueReferences(result.programIds, new Set(PROGRAMS.map((program) => program.id)), 3, 3)
    && sameMembers(result.programIds, finale.programIds)
    && hasExactKeys(result.components, componentKeys)
    && componentKeys.every((key) => Number.isFinite(result.components[key])
      && result.components[key] >= 0
      && result.components[key] <= FINALE_COMPONENT_LIMITS[key])
    && result.score === finale.score
    && result.endingId === finale.endingId;
}

function sameData(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameData(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return sameMembers(leftKeys, rightKeys)
      && leftKeys.every((key) => sameData(left[key], right[key]));
  }
  return false;
}

function validateUpgradeRecord(upgrade) {
  if (upgrade === undefined) return true;
  if (!isRecord(upgrade)
      || !hasExactKeys(upgrade, ['equipmentId', 'equipmentName', 'level', 'cost', 'week', 'slot'])
      || !hasEntry(EQUIPMENT_BY_ID, upgrade.equipmentId)) return false;
  const item = EQUIPMENT_BY_ID[upgrade.equipmentId];
  return upgrade.equipmentName === item.name
    && isIntegerInRange(upgrade.level, 1, 2)
    && upgrade.cost === item.upgradeCosts[upgrade.level - 1]
    && isIntegerInRange(upgrade.week, 1, 4)
    && isIntegerInRange(upgrade.slot, 1, 3);
}

export function validateState(state) {
  try {
    if (!isRecord(state)
        || !hasOnlyKeys(state, [
          'rulesVersion', 'seed', 'seedHash', 'phase', 'memberIds', 'members', 'funds', 'hype', 'week', 'slot',
          'equipment', 'eventDeck', 'eventCursor', 'currentShow', 'lastResult', 'history', 'actionIds',
          'finale', 'lastUpgrade',
        ])
        || state.rulesVersion !== RULES_VERSION
        || (!(typeof state.seed === 'string' && state.seed.length > 0)
          && !(typeof state.seed === 'number' && Number.isFinite(state.seed)))
        || !Number.isInteger(state.seedHash)
        || state.seedHash < 0
        || state.seedHash > 0xFFFFFFFF
        || !PHASES.has(state.phase)) return false;
    if (!validUniqueReferences(state.memberIds, new Set(MEMBERS.map((member) => member.id)), 3, 3)
        || !hasExactKeys(state.members, state.memberIds)) return false;
    for (const id of state.memberIds) {
      if (!isRecord(state.members[id])
          || !hasExactKeys(state.members[id], ['id', 'energy'])
          || state.members[id].id !== id
          || !isIntegerInRange(state.members[id].energy, 0, MAX_ENERGY)) return false;
    }
    if (!isIntegerInRange(state.funds, 0, Number.MAX_SAFE_INTEGER)
        || !isIntegerInRange(state.hype, 0, MAX_HYPE)
        || !isIntegerInRange(state.week, 1, 4)
        || !isIntegerInRange(state.slot, 1, 3)
        || !hasExactKeys(state.equipment, EQUIPMENT_IDS)
        || EQUIPMENT_IDS.some((id) => !isIntegerInRange(state.equipment[id], 0, 2))) return false;
    if (!Array.isArray(state.eventDeck)
        || state.eventDeck.length !== EVENTS.length
        || !validUniqueReferences(state.eventDeck, new Set(EVENTS.map((event) => event.id)), EVENTS.length, EVENTS.length)
        || !isIntegerInRange(state.eventCursor, 0, state.eventDeck.length)) return false;
    if (!Array.isArray(state.history)
        || state.history.length > 12
        || !Array.isArray(state.actionIds)
        || state.actionIds.some((id) => !isText(id, 500))
        || new Set(state.actionIds).size !== state.actionIds.length
        || !isRecord(state.finale)
        || !Array.isArray(state.finale.programIds)
        || !hasExactKeys(state.finale, ['programIds', 'score', 'endingId', 'result'])
        || !validateUpgradeRecord(state.lastUpgrade)) return false;
    if (state.phase !== 'complete'
        && (state.finale.programIds.length !== 0
          || state.finale.score !== null
          || state.finale.endingId !== null
          || state.finale.result !== null)) return false;
    if (state.lastUpgrade !== undefined
        && state.equipment[state.lastUpgrade.equipmentId] !== state.lastUpgrade.level) return false;

    const positionIndex = (state.week - 1) * 3 + state.slot - 1;
    for (let index = 0; index < state.history.length; index += 1) {
      const result = state.history[index];
      if (!validResultRecord(result, state.memberIds)
          || result.week !== Math.floor(index / 3) + 1
          || result.slot !== (index % 3) + 1) return false;
    }
    if (state.history.length === 0) {
      if (state.lastResult !== null) return false;
    } else if (!validResultRecord(state.lastResult, state.memberIds)
        || !sameData(state.lastResult, state.history.at(-1))) return false;

    let drawnEvents = 0;
    for (const result of state.history) {
      if (result.kind !== 'show') continue;
      const expectedEventId = drawnEvents < state.eventDeck.length ? state.eventDeck[drawnEvents] : null;
      if (result.eventId !== expectedEventId) return false;
      if (expectedEventId !== null) drawnEvents += 1;
    }
    if (state.phase === 'event') {
      const expectedEventId = drawnEvents < state.eventDeck.length ? state.eventDeck[drawnEvents] : null;
      if (expectedEventId === null
          || !validShowSnapshot(state.currentShow, state, 'event')
          || state.currentShow.eventId !== expectedEventId) return false;
      drawnEvents += 1;
    }
    if (drawnEvents !== state.eventCursor) return false;

    if (state.phase === 'planning') {
      if (state.currentShow !== null || state.history.length !== positionIndex) return false;
    } else if (state.phase === 'event') {
      if (state.history.length !== positionIndex) return false;
    } else if (state.phase === 'result') {
      if (state.history.length !== positionIndex + 1 || !isRecord(state.currentShow)) return false;
      const last = state.history.at(-1);
      if (state.currentShow.kind === 'rest') {
        if (!hasExactKeys(state.currentShow, ['kind']) || last.kind !== 'rest') return false;
      } else if (!validShowSnapshot(state.currentShow, state, 'result')
          || last.kind !== 'show'
          || last.programId !== state.currentShow.programId
          || !sameData(last.memberIds, state.currentShow.memberIds)
          || last.eventId !== state.currentShow.eventId
          || last.eventOptionId !== state.currentShow.eventOptionId
          || last.fundsAfter !== state.funds
          || last.fundsDelta !== state.funds - state.currentShow.fundsBefore) return false;
      if (last.fundsAfter !== state.funds || last.hypeAfter !== state.hype) return false;
      for (const id of state.memberIds) {
        if (last.energyAfter[id] !== state.members[id].energy) return false;
      }
    } else if (state.phase === 'finale') {
      if (state.currentShow !== null
          || state.history.length !== 12
          || state.week !== 4
          || state.slot !== 3
          || state.finale.programIds.length !== 0
          || state.finale.score !== null
          || state.finale.endingId !== null
          || state.finale.result !== null) return false;
    } else if (state.phase === 'complete') {
      if (state.currentShow !== null
          || state.history.length !== 12
          || state.week !== 4
          || state.slot !== 3
          || !validUniqueReferences(state.finale.programIds, new Set(PROGRAMS.map((program) => program.id)), 3, 3)
          || !isIntegerInRange(state.finale.score, 0, 100)
          || !ENDING_IDS.has(state.finale.endingId)
          || !validFinaleResult(state.finale.result, state.finale)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

