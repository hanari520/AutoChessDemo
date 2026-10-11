import {
  CONTENT_VERSION,
  CUSTOMERS,
  ENDINGS,
  PRODUCTS,
  RULES_VERSION,
  SCENES,
  TAG_LABELS,
} from './content.mjs';

export { CONTENT_VERSION, RULES_VERSION };

export const STARTING_FUNDS = 50;
export const STOCK_CAPACITY = 4;
export const STOCK_TYPE_CAPACITY = 3;
export const WATER = Object.freeze({
  id: 'water',
  name: '免费热水',
  temperature: 'hot',
  temperatureLabel: '热',
  taste: 'plain',
  tasteLabel: '清淡',
  boost: 0,
  boostLabel: '不提神',
  price: 0,
});

const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((product) => [product.id, product]));
const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map((customer) => [customer.id, customer]));
const SCENE_BY_POSITION = new Map(SCENES.map((scene) => [`${scene.night}:${scene.slot}`, scene]));
const SCENE_BY_ID = Object.fromEntries(SCENES.map((scene) => [scene.id, scene]));
const ENDING_BY_ID = Object.fromEntries(ENDINGS.map((ending) => [ending.id, ending]));
const CUSTOMER_IDS = CUSTOMERS.map((customer) => customer.id);
const PRODUCT_IDS = PRODUCTS.map((product) => product.id);
const PHASES = new Set(['stock', 'recommend', 'reply', 'receipt', 'night-end', 'complete']);
const REPLY_EFFECT_KEYS = new Set(['listen', 'preference', 'commitment']);

const isInteger = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => (
  Number.isSafeInteger(value) && value >= min && value <= max
);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasExactKeys = (value, keys) => (
  isPlainObject(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))
);
const sameStrings = (left, right) => (
  Array.isArray(left)
  && left.length === right.length
  && right.every((value) => left.includes(value))
);
const clone = (value) => JSON.parse(JSON.stringify(value));
const currentScene = (state) => SCENE_BY_POSITION.get(`${state.night}:${state.slot}`) ?? null;
const blankFlags = () => ({ listen: false, preference: false, promise: false });

function copyFlags(flags) {
  return Object.fromEntries(CUSTOMER_IDS.map((id) => [id, { ...flags[id] }]));
}

function makeNightSnapshot(state) {
  return {
    night: state.night,
    funds: state.funds,
    inventory: { ...state.inventory },
    flags: copyFlags(state.flags),
    commitments: { ...state.commitments },
    aidUsed: state.aidUsed,
    aidNotice: state.aidNotice ? { ...state.aidNotice } : null,
  };
}

function emptyInventory() {
  return Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0]));
}

function buildStartingState({ seed = 1, runId } = {}) {
  const normalizedSeed = typeof seed === 'number' ? Math.trunc(seed) : seed;
  const state = {
    rulesVersion: RULES_VERSION,
    contentVersion: CONTENT_VERSION,
    runId: runId ?? `midnight-${String(normalizedSeed)}`,
    seed: normalizedSeed,
    night: 1,
    slot: 0,
    phase: 'stock',
    funds: STARTING_FUNDS,
    inventory: emptyInventory(),
    flags: Object.fromEntries(CUSTOMER_IDS.map((id) => [id, blankFlags()])),
    commitments: Object.fromEntries(CUSTOMER_IDS.map((id) => [id, false])),
    pending: null,
    history: [],
    ledgers: [],
    ending: null,
    aidUsed: false,
    aidNotice: null,
    appliedIds: [],
    nightStarts: [],
    lastReceipt: null,
    replay: false,
  };
  state.nightStarts.push(makeNightSnapshot(state));
  return state;
}

export function createGame({ seed = 1, runId } = {}) {
  if (!((typeof seed === 'string' && seed.trim().length > 0)
      || (typeof seed === 'number' && Number.isFinite(seed)))) {
    throw new Error('seed must be a non-empty string or a finite number.');
  }
  if (runId !== undefined && !isText(runId)) {
    throw new Error('runId must be a non-empty string.');
  }
  const state = buildStartingState({ seed, runId });
  if (!validateState(state)) throw new Error('Could not create a valid game state.');
  return state;
}

function getCustomerFlags(state, customerId) {
  return state.flags[customerId];
}

function contextualLines(state, scene) {
  if (scene.night === 1) return ['这是你们第一次在这家店碰面。'];

  const customer = CUSTOMER_BY_ID[scene.customerId];
  const flags = getCustomerFlags(state, scene.customerId);
  const lines = [
    flags.listen
      ? `${customer.name}记得上次你愿意把手边的事放一放，听她把话说完。`
      : `上次的话题还停在柜台边；${customer.name}这回先从眼前的小事讲起。`,
  ];
  if (flags.preference) {
    lines.push(`你记得${customer.name}曾告诉你，她偏好什么样的饮料。`);
  }
  if (state.commitments[scene.customerId]) {
    lines.push(`柜台边还留着你答应${customer.name}要做的一件小事。`);
  } else if (flags.promise) {
    lines.push(`你们都记得那件已经兑现的小约定。`);
  }
  return lines;
}

export function getScene(state) {
  if (!validateState(state)) throw new Error('Cannot read a scene from an invalid game state.');
  if (state.phase === 'night-end' || state.phase === 'complete') return null;
  const scene = currentScene(state);
  if (!scene) return null;
  const contextLines = contextualLines(state, scene);
  return {
    ...scene,
    wanted: { ...scene.wanted },
    reaction: { ...scene.reaction },
    replies: scene.replies.map((reply) => ({
      ...reply,
      effects: { ...reply.effects },
      available: reply.effects.commitment !== 'fulfill' || state.commitments[scene.customerId],
    })),
    contextLines,
    contextText: contextLines.join(' '),
  };
}

function formatTag(tag, value) {
  return TAG_LABELS[tag]?.[value] ?? String(value);
}

function makeMatch(scene, product) {
  const actual = product.id === WATER.id ? WATER : product;
  const reasons = ['temperature', 'taste', 'boost'].map((tag) => {
    const expected = scene.wanted[tag];
    const received = actual[tag];
    const matched = expected === received;
    const subject = tag === 'temperature' ? '温度' : tag === 'taste' ? '口味' : '提神程度';
    return {
      tag,
      label: `${subject}：想要${formatTag(tag, expected)}，推荐${formatTag(tag, received)}`,
      expected,
      actual: received,
      matched,
    };
  });
  const match = reasons.filter((reason) => reason.matched).length;
  const reaction = match === 3 ? scene.reaction.full : match > 0 ? scene.reaction.partial : scene.reaction.miss;
  return {
    match,
    reasons,
    reaction,
    message: match === 3
      ? '三个标签都对上了。'
      : match > 0
        ? `对上了 ${match} 个标签。`
        : '这次没有标签对上，仍然可以继续聊下去。',
  };
}

function waterProduct() {
  return {
    id: WATER.id,
    name: WATER.name,
    temperature: WATER.temperature,
    temperatureLabel: WATER.temperatureLabel,
    taste: WATER.taste,
    tasteLabel: WATER.tasteLabel,
    boost: WATER.boost,
    boostLabel: WATER.boostLabel,
    price: WATER.price,
    cost: 0,
    perishable: false,
    storage: null,
  };
}

function productByRequestedId(productId) {
  if (productId === WATER.id) return waterProduct();
  return Object.hasOwn(PRODUCT_BY_ID, productId) ? PRODUCT_BY_ID[productId] : null;
}

export function previewRecommendation(state, productId) {
  if (!validateState(state)) throw new Error('Cannot preview a recommendation from an invalid game state.');
  if (state.phase !== 'recommend') {
    return { ok: false, message: '现在还不是推荐商品的时段。', match: 0, reasons: [], income: 0 };
  }
  const product = productByRequestedId(productId);
  if (!product) {
    return { ok: false, message: '找不到这件商品。', match: 0, reasons: [], income: 0 };
  }
  if (product.id !== WATER.id && state.inventory[product.id] < 1) {
    return { ok: false, message: '这件商品已经缺货，可以提供免费热水。', match: 0, reasons: [], income: 0 };
  }
  const scene = currentScene(state);
  const { match, reasons, reaction, message } = makeMatch(scene, product);
  return {
    ok: true,
    productId: product.id,
    productName: product.name,
    water: product.id === WATER.id,
    match,
    reasons,
    income: product.price,
    message,
    reaction,
  };
}

function stockedProductCount(inventory) {
  return PRODUCTS.reduce((count, product) => count + Number(inventory[product.id] > 0), 0);
}

function assertPositiveQuantity(action) {
  const quantity = action.quantity ?? 1;
  if (!isInteger(quantity, 1, STOCK_CAPACITY)) throw new Error('Quantity must be a whole number from 1 to 4.');
  return quantity;
}

function pushLedger(state, entry) {
  state.ledgers.push({
    id: `${state.runId}-ledger-${state.ledgers.length + 1}`,
    night: state.night,
    slot: null,
    sceneId: null,
    productId: null,
    quantity: 0,
    amount: 0,
    fundsDelta: 0,
    message: '',
    ...entry,
  });
}

function setAidIfNeeded(state) {
  state.aidNotice = null;
  if (state.funds !== 0 || state.aidUsed) return;
  const amount = 18;
  state.funds += amount;
  state.aidUsed = true;
  state.aidNotice = {
    night: state.night,
    amount,
    message: `店里账上见底，街区留了一笔 ${amount} 元的基础补货金。这是本轮唯一一次救济。`,
  };
  pushLedger(state, {
    kind: 'relief',
    amount,
    fundsDelta: amount,
    message: state.aidNotice.message,
  });
}

function expirePerishables(state) {
  for (const product of PRODUCTS) {
    const quantity = state.inventory[product.id];
    if (!product.perishable || quantity < 1) continue;
    state.inventory[product.id] = 0;
    pushLedger(state, {
      kind: 'spoilage',
      productId: product.id,
      quantity,
      message: `${product.name}闭店后过期，剩余 ${quantity} 份已下架。`,
    });
  }
}

function resolveEnding(state) {
  if (CUSTOMER_IDS.every((customerId) => state.flags[customerId].promise)) return 'kept-word';
  if (CUSTOMER_IDS.every((customerId) => state.flags[customerId].preference)) return 'remembered';
  return 'open-late';
}

function hasActionShape(action) {
  return isPlainObject(action) && isText(action.actionId) && isText(action.type);
}

function applyBuy(state, action) {
  if (state.phase !== 'stock') throw new Error('Items can only be bought while stocking.');
  const product = Object.hasOwn(PRODUCT_BY_ID, action.productId) ? PRODUCT_BY_ID[action.productId] : null;
  if (!product) throw new Error('Unknown product.');
  const quantity = assertPositiveQuantity(action);
  if (state.inventory[product.id] + quantity > STOCK_CAPACITY) throw new Error(`Each product is limited to ${STOCK_CAPACITY} units.`);
  if (state.inventory[product.id] === 0 && stockedProductCount(state.inventory) >= STOCK_TYPE_CAPACITY) {
    throw new Error(`The store can stock at most ${STOCK_TYPE_CAPACITY} product types at a time.`);
  }
  const cost = product.cost * quantity;
  if (state.funds < cost) throw new Error('Not enough funds to buy that stock.');
  const next = clone(state);
  next.inventory[product.id] += quantity;
  next.funds -= cost;
  pushLedger(next, {
    kind: 'buy', productId: product.id, quantity, amount: cost, fundsDelta: -cost,
    message: `进货 ${product.name} × ${quantity}，支出 ${cost} 元。`,
  });
  return next;
}

function applyReturn(state, action) {
  if (state.phase !== 'stock') throw new Error('Items can only be returned while stocking.');
  const product = Object.hasOwn(PRODUCT_BY_ID, action.productId) ? PRODUCT_BY_ID[action.productId] : null;
  if (!product) throw new Error('Unknown product.');
  const quantity = assertPositiveQuantity(action);
  if (state.inventory[product.id] < quantity) throw new Error('There is not enough of that item to return.');
  const refund = product.cost * quantity;
  const next = clone(state);
  next.inventory[product.id] -= quantity;
  next.funds += refund;
  pushLedger(next, {
    kind: 'return', productId: product.id, quantity, amount: refund, fundsDelta: refund,
    message: `退回 ${product.name} × ${quantity}，返还 ${refund} 元。`,
  });
  return next;
}

function applyOpen(state) {
  if (state.phase !== 'stock') throw new Error('The store can only open after stocking.');
  const next = clone(state);
  next.phase = 'recommend';
  return next;
}

function applyRecommend(state, action) {
  if (state.phase !== 'recommend') throw new Error('There is no customer waiting for a recommendation.');
  const product = productByRequestedId(action.productId);
  if (!product) throw new Error('Unknown product.');
  if (product.id !== WATER.id && state.inventory[product.id] < 1) throw new Error('That product is out of stock; free hot water is always available.');

  const scene = currentScene(state);
  const result = makeMatch(scene, product);
  const next = clone(state);
  const water = product.id === WATER.id;
  if (!water) next.inventory[product.id] -= 1;
  next.pending = {
    sceneId: scene.id,
    night: scene.night,
    slot: scene.slot,
    customerId: scene.customerId,
    productId: product.id,
    productName: product.name,
    water,
    match: result.match,
    reasons: result.reasons,
    income: product.price,
    unitPrice: product.price,
    perishable: product.perishable,
    storage: product.storage,
  };
  next.phase = 'reply';
  return next;
}

function addCommitmentEffects(state, customerId, effects) {
  if (effects.listen === true) state.flags[customerId].listen = true;
  if (effects.preference === true) state.flags[customerId].preference = true;
  if (effects.commitment === 'make') state.commitments[customerId] = true;
  if (effects.commitment === 'fulfill' && state.commitments[customerId]) {
    state.commitments[customerId] = false;
    state.flags[customerId].promise = true;
  }
}

function makeHistoryRecord(state, scene, reply, reaction) {
  const customer = CUSTOMER_BY_ID[scene.customerId];
  const product = state.pending.water ? WATER : PRODUCT_BY_ID[state.pending.productId];
  const flagsAfter = { ...state.flags[scene.customerId] };
  const commitmentAfter = state.commitments[scene.customerId];
  return {
    id: `${state.runId}-${scene.id}`,
    sceneId: scene.id,
    night: scene.night,
    slot: scene.slot,
    customerId: scene.customerId,
    customerName: customer.name,
    title: scene.title,
    dialogue: scene.text,
    clue: scene.clue,
    productId: state.pending.productId,
    productName: state.pending.productName,
    water: state.pending.water,
    replyId: reply.id,
    replyText: reply.text,
    response: reply.response,
    reaction,
    match: state.pending.match,
    reasons: clone(state.pending.reasons),
    income: state.pending.income,
    unitPrice: state.pending.unitPrice,
    profit: state.pending.water ? 0 : state.pending.income - product.cost,
    fundsAfter: state.funds,
    flagsAfter,
    commitmentAfter,
  };
}

function applyReply(state, action) {
  if (state.phase !== 'reply' || !state.pending) throw new Error('Choose a reply after making a recommendation.');
  const scene = currentScene(state);
  const reply = scene.replies.find((candidate) => candidate.id === action.replyId);
  if (!reply) throw new Error('Unknown reply for the current scene.');
  if (reply.effects.commitment === 'fulfill' && !state.commitments[scene.customerId]) {
    throw new Error('There is no earlier promise to fulfill.');
  }

  const next = clone(state);
  const nextScene = currentScene(next);
  const nextReply = nextScene.replies.find((candidate) => candidate.id === action.replyId);
  addCommitmentEffects(next, scene.customerId, nextReply.effects);
  next.funds += next.pending.income;

  if (next.pending.water) {
    pushLedger(next, {
      kind: 'water', slot: scene.slot, sceneId: scene.id, productId: WATER.id,
      quantity: 1, amount: 0, fundsDelta: 0,
      message: '提供免费热水，不收取费用。',
    });
  } else {
    pushLedger(next, {
      kind: 'sale', slot: scene.slot, sceneId: scene.id, productId: next.pending.productId,
      quantity: 1, amount: next.pending.income, fundsDelta: next.pending.income,
      message: `售出 ${next.pending.productName}，收入 ${next.pending.income} 元。`,
    });
  }

  const reaction = next.pending.match === 3
    ? scene.reaction.full
    : next.pending.match > 0
      ? scene.reaction.partial
      : scene.reaction.miss;
  const record = makeHistoryRecord(next, scene, nextReply, reaction);
  record.fundsAfter = next.funds;
  next.history.push(record);
  next.lastReceipt = clone(record);
  next.pending = null;
  next.phase = 'receipt';
  return next;
}

function applyAdvance(state) {
  if (state.phase !== 'receipt' || !state.lastReceipt) throw new Error('There is no receipt to advance from.');
  const next = clone(state);
  if (next.slot < 2) {
    next.slot += 1;
    next.phase = 'recommend';
    return next;
  }
  expirePerishables(next);
  next.phase = 'night-end';
  return next;
}

function applyNextNight(state) {
  if (state.phase !== 'night-end') throw new Error('The next night can only start after closing.');
  if (state.replay) throw new Error('A replay ends at closing and cannot advance the main campaign.');
  const next = clone(state);
  if (next.night === 7) {
    next.ending = resolveEnding(next);
    next.phase = 'complete';
    return next;
  }
  next.night += 1;
  next.slot = 0;
  next.phase = 'stock';
  next.pending = null;
  setAidIfNeeded(next);
  next.nightStarts.push(makeNightSnapshot(next));
  return next;
}

export function reduceGame(state, action) {
  if (!validateState(state)) throw new Error('Cannot reduce an invalid game state.');
  if (!hasActionShape(action)) throw new Error('Every action requires a non-empty type and actionId.');
  if (state.appliedIds.includes(action.actionId)) return state;
  if (state.phase === 'complete') throw new Error('This campaign is already complete.');

  let next;
  switch (action.type) {
    case 'buy':
      next = applyBuy(state, action);
      break;
    case 'return':
      next = applyReturn(state, action);
      break;
    case 'open':
      next = applyOpen(state);
      break;
    case 'recommend':
      next = applyRecommend(state, action);
      break;
    case 'reply':
      next = applyReply(state, action);
      break;
    case 'advance':
      next = applyAdvance(state);
      break;
    case 'next-night':
      next = applyNextNight(state);
      break;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
  next.appliedIds.push(action.actionId);
  if (!validateState(next)) throw new Error('Action would produce an invalid game state.');
  return next;
}

function validFlagsMap(value) {
  if (!isPlainObject(value) || !sameStrings(Object.keys(value), CUSTOMER_IDS)) return false;
  return CUSTOMER_IDS.every((customerId) => (
    hasExactKeys(value[customerId], ['listen', 'preference', 'promise'])
    && typeof value[customerId].listen === 'boolean'
    && typeof value[customerId].preference === 'boolean'
    && typeof value[customerId].promise === 'boolean'
  ));
}

function validCommitments(value) {
  return isPlainObject(value)
    && sameStrings(Object.keys(value), CUSTOMER_IDS)
    && CUSTOMER_IDS.every((customerId) => typeof value[customerId] === 'boolean');
}

function validInventory(value) {
  if (!isPlainObject(value) || !sameStrings(Object.keys(value), PRODUCT_IDS)) return false;
  if (!PRODUCTS.every((product) => isInteger(value[product.id], 0, STOCK_CAPACITY))) return false;
  return stockedProductCount(value) <= STOCK_TYPE_CAPACITY;
}

function validReasons(value) {
  const tags = ['temperature', 'taste', 'boost'];
  return Array.isArray(value)
    && value.length === tags.length
    && value.every((reason, index) => (
      hasExactKeys(reason, ['tag', 'label', 'expected', 'actual', 'matched'])
      && reason.tag === tags[index]
      && isText(reason.label)
      && isText(String(reason.expected))
      && isText(String(reason.actual))
      && typeof reason.matched === 'boolean'
      && reason.matched === (reason.expected === reason.actual)
    ));
}

function reasonsMatchScene(value, scene, product) {
  const expected = makeMatch(scene, product).reasons;
  return value.length === expected.length && value.every((reason, index) => {
    const target = expected[index];
    return reason.tag === target.tag
      && reason.label === target.label
      && reason.expected === target.expected
      && reason.actual === target.actual
      && reason.matched === target.matched;
  });
}

function validHistoryRecord(value) {
  const keys = [
    'id', 'sceneId', 'night', 'slot', 'customerId', 'customerName', 'title', 'dialogue', 'clue',
    'productId', 'productName', 'water', 'replyId', 'replyText', 'response', 'reaction', 'match', 'reasons',
    'income', 'unitPrice', 'profit', 'fundsAfter', 'flagsAfter', 'commitmentAfter',
  ];
  if (!hasExactKeys(value, keys)) return false;
  const scene = SCENE_BY_ID[value.sceneId];
  if (!scene || value.night !== scene.night || value.slot !== scene.slot || value.customerId !== scene.customerId) return false;
  const customer = CUSTOMER_BY_ID[value.customerId];
  const reply = scene.replies.find((candidate) => candidate.id === value.replyId);
  const water = value.productId === WATER.id;
  const product = water ? waterProduct() : PRODUCT_BY_ID[value.productId];
  if (!product) return false;
  const expectedReaction = makeMatch(scene, product).reaction;
  return isText(value.id)
    && value.customerName === customer.name
    && value.title === scene.title
    && value.dialogue === scene.text
    && value.clue === scene.clue
    && value.productName === product.name
    && typeof value.water === 'boolean'
    && value.water === water
    && !!reply
    && value.replyText === reply.text
    && value.response === reply.response
    && value.reaction === expectedReaction
    && isInteger(value.match, 0, 3)
    && validReasons(value.reasons)
    && reasonsMatchScene(value.reasons, scene, product)
    && value.match === value.reasons.filter((reason) => reason.matched).length
    && isInteger(value.income)
    && value.income === product.price
    && isInteger(value.unitPrice)
    && value.unitPrice === product.price
    && isInteger(value.profit)
    && value.profit === (water ? 0 : value.income - product.cost)
    && isInteger(value.fundsAfter)
    && validCustomerFlags(value.flagsAfter)
    && typeof value.commitmentAfter === 'boolean';
}

function validCustomerFlags(value) {
  return hasExactKeys(value, ['listen', 'preference', 'promise'])
    && typeof value.listen === 'boolean'
    && typeof value.preference === 'boolean'
    && typeof value.promise === 'boolean';
}

function validLedger(value) {
  const keys = ['id', 'kind', 'night', 'slot', 'sceneId', 'productId', 'quantity', 'amount', 'fundsDelta', 'message'];
  if (!hasExactKeys(value, keys)) return false;
  const validKinds = new Set(['buy', 'return', 'sale', 'water', 'spoilage', 'relief']);
  const product = value.productId === WATER.id ? WATER : PRODUCT_BY_ID[value.productId];
  const scene = value.sceneId === null ? null : SCENE_BY_ID[value.sceneId];
  const commonValid = isText(value.id)
    && validKinds.has(value.kind)
    && isInteger(value.night, 1, 7)
    && (value.slot === null || isInteger(value.slot, 0, 2))
    && (value.sceneId === null || Object.hasOwn(SCENE_BY_ID, value.sceneId))
    && (value.productId === null || value.productId === WATER.id || Object.hasOwn(PRODUCT_BY_ID, value.productId))
    && isInteger(value.quantity)
    && isInteger(value.amount)
    && Number.isSafeInteger(value.fundsDelta)
    && isText(value.message);
  if (!commonValid) return false;
  if (value.kind === 'buy' || value.kind === 'return') {
    return !!PRODUCT_BY_ID[value.productId]
      && value.slot === null
      && value.sceneId === null
      && isInteger(value.quantity, 1, STOCK_CAPACITY)
      && value.amount === PRODUCT_BY_ID[value.productId].cost * value.quantity
      && value.fundsDelta === (value.kind === 'buy' ? -value.amount : value.amount);
  }
  if (value.kind === 'sale') {
    return !!scene
      && !!PRODUCT_BY_ID[value.productId]
      && scene.night === value.night
      && scene.slot === value.slot
      && value.quantity === 1
      && value.amount === PRODUCT_BY_ID[value.productId].price
      && value.fundsDelta === value.amount;
  }
  if (value.kind === 'water') {
    return !!scene
      && value.productId === WATER.id
      && scene.night === value.night
      && scene.slot === value.slot
      && value.quantity === 1
      && value.amount === 0
      && value.fundsDelta === 0;
  }
  if (value.kind === 'spoilage') {
    return !!PRODUCT_BY_ID[value.productId]?.perishable
      && value.slot === null
      && value.sceneId === null
      && isInteger(value.quantity, 1, STOCK_CAPACITY)
      && value.amount === 0
      && value.fundsDelta === 0;
  }
  return value.kind === 'relief'
    && value.productId === null
    && value.slot === null
    && value.sceneId === null
    && value.quantity === 0
    && isInteger(value.amount, 1)
    && value.fundsDelta === value.amount;
}

function validAidNotice(value, night) {
  return value === null || (
    hasExactKeys(value, ['night', 'amount', 'message'])
    && value.night === night
    && isInteger(value.amount, 1)
    && isText(value.message)
  );
}

function validNightSnapshot(value, expectedNight) {
  return hasExactKeys(value, ['night', 'funds', 'inventory', 'flags', 'commitments', 'aidUsed', 'aidNotice'])
    && value.night === expectedNight
    && isInteger(value.funds)
    && validInventory(value.inventory)
    && validFlagsMap(value.flags)
    && validCommitments(value.commitments)
    && typeof value.aidUsed === 'boolean'
    && validAidNotice(value.aidNotice, expectedNight);
}

function validPending(value, state) {
  if (value === null) return true;
  const keys = ['sceneId', 'night', 'slot', 'customerId', 'productId', 'productName', 'water', 'match', 'reasons', 'income', 'unitPrice', 'perishable', 'storage'];
  if (!hasExactKeys(value, keys)) return false;
  const scene = currentScene(state);
  const product = value.productId === WATER.id ? waterProduct() : PRODUCT_BY_ID[value.productId];
  return !!scene
    && value.sceneId === scene.id
    && value.night === state.night
    && value.slot === state.slot
    && value.customerId === scene.customerId
    && !!product
    && value.productName === product.name
    && typeof value.water === 'boolean'
    && value.water === (value.productId === WATER.id)
    && isInteger(value.match, 0, 3)
    && validReasons(value.reasons)
    && reasonsMatchScene(value.reasons, scene, product)
    && value.match === value.reasons.filter((reason) => reason.matched).length
    && isInteger(value.income)
    && value.income === product.price
    && isInteger(value.unitPrice)
    && value.unitPrice === product.price
    && typeof value.perishable === 'boolean'
    && value.perishable === (product.perishable ?? false)
    && value.storage === (product.storage ?? null);
}

function phaseProgress(state) {
  switch (state.phase) {
    case 'stock': return 0;
    case 'recommend': return state.slot;
    case 'reply': return state.slot;
    case 'receipt': return state.slot + 1;
    case 'night-end':
    case 'complete': return 3;
    default: return -1;
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function storyStateMatchesHistory(state) {
  const initial = state.replay ? state.nightStarts[0] : null;
  const flags = initial ? copyFlags(initial.flags) : Object.fromEntries(CUSTOMER_IDS.map((id) => [id, blankFlags()]));
  const commitments = initial
    ? { ...initial.commitments }
    : Object.fromEntries(CUSTOMER_IDS.map((id) => [id, false]));

  for (const row of state.history) {
    const scene = SCENE_BY_ID[row.sceneId];
    const reply = scene?.replies.find((candidate) => candidate.id === row.replyId);
    if (!scene || !reply) return false;
    const customerId = scene.customerId;
    const effects = reply.effects;
    if (effects.listen === true) flags[customerId].listen = true;
    if (effects.preference === true) flags[customerId].preference = true;
    if (effects.commitment === 'make') commitments[customerId] = true;
    if (effects.commitment === 'fulfill') {
      if (!commitments[customerId]) return false;
      commitments[customerId] = false;
      flags[customerId].promise = true;
    }
    if (stableSerialize(flags[customerId]) !== stableSerialize(row.flagsAfter)) return false;
    if (commitments[customerId] !== row.commitmentAfter) return false;
  }
  return stableSerialize(flags) === stableSerialize(state.flags)
    && stableSerialize(commitments) === stableSerialize(state.commitments);
}

function ledgerMatchesHistory(state) {
  const outcomes = state.ledgers.filter((entry) => entry.kind === 'sale' || entry.kind === 'water');
  if (outcomes.length !== state.history.length) return false;
  for (const row of state.history) {
    const matching = outcomes.filter((entry) => entry.sceneId === row.sceneId);
    if (matching.length !== 1) return false;
    const [entry] = matching;
    if (entry.productId !== row.productId || entry.amount !== row.income) return false;
    if (entry.kind !== (row.water ? 'water' : 'sale')) return false;
  }
  const reliefCount = state.ledgers.filter((entry) => entry.kind === 'relief').length;
  if (reliefCount > 1 || reliefCount !== Number(state.aidUsed && !state.replay)) return false;
  if (state.ledgers.some((entry, index) => entry.id !== `${state.runId}-ledger-${index + 1}`)) return false;
  const spoilageKeys = state.ledgers
    .filter((entry) => entry.kind === 'spoilage')
    .map((entry) => `${entry.night}:${entry.productId}`);
  return new Set(spoilageKeys).size === spoilageKeys.length;
}

function receiptsMatch(left, right) {
  return left === null ? right === null : right !== null && stableSerialize(left) === stableSerialize(right);
}

export function validateState(state) {
  try {
    const keys = [
      'rulesVersion', 'contentVersion', 'runId', 'seed', 'night', 'slot', 'phase', 'funds', 'inventory',
      'flags', 'commitments', 'pending', 'history', 'ledgers', 'ending', 'aidUsed', 'aidNotice',
      'appliedIds', 'nightStarts', 'lastReceipt', 'replay',
    ];
    if (!hasExactKeys(state, keys)) return false;
    if (state.rulesVersion !== RULES_VERSION || state.contentVersion !== CONTENT_VERSION) return false;
    if (!isText(state.runId)) return false;
    if (!((typeof state.seed === 'string' && state.seed.trim().length > 0)
        || (typeof state.seed === 'number' && Number.isFinite(state.seed)))) return false;
    if (!isInteger(state.night, 1, 7) || !isInteger(state.slot, 0, 2) || !PHASES.has(state.phase)) return false;
    if (!isInteger(state.funds)) return false;
    if (!validInventory(state.inventory) || !validFlagsMap(state.flags) || !validCommitments(state.commitments)) return false;
    if (typeof state.aidUsed !== 'boolean' || !validAidNotice(state.aidNotice, state.night)) return false;
    if (state.aidNotice && !state.aidUsed) return false;
    if (typeof state.replay !== 'boolean') return false;
    if (!Array.isArray(state.appliedIds) || !state.appliedIds.every(isText) || new Set(state.appliedIds).size !== state.appliedIds.length) return false;
    if (!Array.isArray(state.history) || state.history.length > 21 || !state.history.every(validHistoryRecord)) return false;
    if (new Set(state.history.map((row) => row.sceneId)).size !== state.history.length) return false;
    if (state.history.some((row, index) => {
      const expectedNight = state.replay ? state.night : Math.floor(index / 3) + 1;
      const expectedSlot = state.replay ? index : index % 3;
      return row.night !== expectedNight || row.slot !== expectedSlot || row.id !== `${state.runId}-${row.sceneId}`;
    })) return false;
    if (!Array.isArray(state.ledgers) || !state.ledgers.every(validLedger)) return false;
    if (new Set(state.ledgers.map((entry) => entry.id)).size !== state.ledgers.length) return false;
    if (state.ledgers.some((entry) => entry.night > state.night)) return false;
    if (state.ending !== null && !Object.hasOwn(ENDING_BY_ID, state.ending)) return false;
    if ((state.phase === 'complete') !== (state.ending !== null)) return false;
    if (state.phase === 'complete' && state.night !== 7) return false;
    if (state.phase === 'stock' && state.slot !== 0) return false;
    if (state.phase === 'night-end' && state.slot !== 2) return false;
    if (state.phase === 'complete' && state.slot !== 2) return false;
    if (!validPending(state.pending, state)) return false;
    if ((state.phase === 'reply') !== (state.pending !== null)) return false;
    if (state.phase === 'receipt' && !validHistoryRecord(state.lastReceipt)) return false;
    if (state.lastReceipt !== null && !validHistoryRecord(state.lastReceipt)) return false;
    if (!receiptsMatch(state.history.at(-1) ?? null, state.lastReceipt)) return false;
    if (state.phase === 'receipt') {
      const latest = state.history.at(-1);
      if (!latest || latest.id !== state.lastReceipt.id || latest.sceneId !== currentScene(state).id) return false;
    }
    if (!Array.isArray(state.nightStarts)) return false;
    if (state.replay) {
      if (state.nightStarts.length !== 1 || !validNightSnapshot(state.nightStarts[0], state.night)) return false;
      if (state.phase === 'complete' || state.ending !== null) return false;
      if (state.history.length !== phaseProgress(state)) return false;
    } else {
      if (state.nightStarts.length !== state.night) return false;
      if (!state.nightStarts.every((snapshot, index) => validNightSnapshot(snapshot, index + 1))) return false;
      if (state.history.length !== (state.night - 1) * 3 + phaseProgress(state)) return false;
    }
    if (state.lastReceipt && !state.history.some((row) => row.id === state.lastReceipt.id)) return false;
    if (!storyStateMatchesHistory(state) || !ledgerMatchesHistory(state)) return false;
    return true;
  } catch {
    return false;
  }
}

function characterClosures(state) {
  return CUSTOMERS.map((customer) => {
    const flags = state.flags[customer.id];
    const pronoun = customer.pronoun;
    const promised = flags.promise
      ? '你们一起把答应的那件小事做完了。'
      : state.commitments[customer.id]
        ? '柜台边还有一张没有兑现的便签。'
        : '你们没有留下待办的约定。';
    const remembered = flags.preference
      ? `你记得${pronoun}说过的偏好，下次可以少问一句。`
      : `${pronoun}仍可以在下一次见面时重新告诉你自己的偏好。`;
    const heard = flags.listen
      ? `${pronoun}愿意把一段话留给你听。`
      : '你们还没真正坐下来把话说完。';
    return {
      customerId: customer.id,
      name: customer.name,
      text: `${heard}${remembered}${promised}`,
    };
  });
}

export function getEnding(state) {
  if (!validateState(state)) throw new Error('Cannot read an ending from an invalid game state.');
  if (state.phase !== 'complete' || !state.ending) return null;
  const ending = ENDING_BY_ID[state.ending];
  return { ...ending, characterClosures: characterClosures(state) };
}

export function createReplay(state, night) {
  if (!validateState(state)) throw new Error('Cannot replay from an invalid game state.');
  if (state.replay) throw new Error('A replay cannot start another replay.');
  if (!isInteger(night, 1, 7)) throw new Error('night must be a whole number from 1 to 7.');
  if (night === state.night && !['night-end', 'complete'].includes(state.phase)) {
    throw new Error('Only a completed night can be replayed.');
  }
  const rows = state.history.filter((row) => row.night === night);
  if (rows.length !== 3) throw new Error('Only a completed night can be replayed.');
  const snapshot = state.nightStarts.find((entry) => entry.night === night);
  if (!snapshot) throw new Error('The saved night-start snapshot is missing.');
  const replay = {
    rulesVersion: RULES_VERSION,
    contentVersion: CONTENT_VERSION,
    runId: `${state.runId}-replay-${night}`,
    seed: state.seed,
    night,
    slot: 0,
    phase: 'stock',
    funds: snapshot.funds,
    inventory: { ...snapshot.inventory },
    flags: copyFlags(snapshot.flags),
    commitments: { ...snapshot.commitments },
    pending: null,
    history: [],
    ledgers: [],
    ending: null,
    aidUsed: snapshot.aidUsed,
    aidNotice: snapshot.aidNotice ? { ...snapshot.aidNotice } : null,
    appliedIds: [],
    nightStarts: [clone(snapshot)],
    lastReceipt: null,
    replay: true,
  };
  if (!validateState(replay)) throw new Error('Could not create a valid replay state.');
  return replay;
}
