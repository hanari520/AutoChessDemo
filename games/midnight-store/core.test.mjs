import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  createReplay,
  getEnding,
  getScene,
  previewRecommendation,
  reduceGame,
  validateState,
} from './core.mjs';
import { CONTENT_VERSION, CUSTOMERS, ENDINGS, PRODUCTS, RULES_VERSION, SCENES, TAG_LABELS } from './content.mjs';

let nextActionId = 1;

function act(state, type, extra = {}) {
  return reduceGame(state, { type, actionId: `test-action-${nextActionId++}`, ...extra });
}

function allFlagsTrue(value, key) {
  return CUSTOMERS.every((customer) => value.flags[customer.id][key]);
}

function chooseReply(scene, state, policy) {
  const reply = policy(scene, state);
  assert.ok(reply, `no reply selected for ${scene.id}`);
  assert.ok(getScene(state).replies.find((candidate) => candidate.id === reply.id)?.available,
    `reply ${reply.id} was unavailable for ${scene.id}`);
  return reply;
}

function runNight(state, {
  productForScene = (scene) => PRODUCTS.find((product) => (
    product.temperature === scene.wanted.temperature
    && product.taste === scene.wanted.taste
    && product.boost === scene.wanted.boost
  )).id,
  replyPolicy = (scene) => scene.replies.find((reply) => reply.effects.listen),
} = {}) {
  assert.equal(state.phase, 'stock');
  const scenes = SCENES.filter((scene) => scene.night === state.night);
  const recommendations = scenes.map((scene) => ({ scene, productId: productForScene(scene, state) }));
  const purchaseCounts = new Map();
  for (const { productId } of recommendations) {
    if (productId === 'water') continue;
    purchaseCounts.set(productId, (purchaseCounts.get(productId) ?? 0) + 1);
  }
  for (const [productId, quantity] of purchaseCounts) {
    state = act(state, 'buy', { productId, quantity });
  }

  state = act(state, 'open');
  for (const { scene: plannedScene, productId } of recommendations) {
    const scene = getScene(state);
    assert.equal(scene.id, plannedScene.id);
    const beforePreview = JSON.stringify(state);
    const preview = previewRecommendation(state, productId);
    assert.equal(JSON.stringify(state), beforePreview, 'preview must be pure');
    assert.equal(preview.ok, true);
    state = act(state, 'recommend', { productId });
    assert.equal(state.phase, 'reply');
    assert.equal(state.pending.productId, productId);
    const reply = chooseReply(scene, state, replyPolicy);
    const replyAction = { type: 'reply', actionId: `settle-${nextActionId++}`, replyId: reply.id };
    const beforeReplyFunds = state.funds;
    state = reduceGame(state, replyAction);
    const afterReceipt = state;
    assert.equal(afterReceipt.phase, 'receipt');
    assert.equal(afterReceipt.history.length, (afterReceipt.night - 1) * 3 + afterReceipt.slot + 1);
    assert.equal(afterReceipt.funds, beforeReplyFunds + preview.income);
    assert.equal(reduceGame(afterReceipt, replyAction), afterReceipt, 'a repeated reply is a no-op');
    assert.equal(afterReceipt.history.length, (afterReceipt.night - 1) * 3 + afterReceipt.slot + 1);
    assert.equal(afterReceipt.lastReceipt.sceneId, scene.id);
    assert.equal(afterReceipt.lastReceipt.replyId, reply.id);
    assert.equal(validateState(JSON.parse(JSON.stringify(afterReceipt))), true);
    state = act(state, 'advance');
  }
  assert.equal(state.phase, 'night-end');
  assert.equal(validateState(state), true);
  return state;
}

function runCampaign(replyPolicy, productForScene) {
  let state = createGame({ seed: 'midnight-routes', runId: `route-${nextActionId++}` });
  for (let night = 1; night <= 7; night += 1) {
    if (night > 1) state = act(state, 'next-night');
    state = runNight(state, { replyPolicy, productForScene });
  }
  state = act(state, 'next-night');
  assert.equal(state.phase, 'complete');
  assert.equal(validateState(state), true);
  return state;
}

const listenPolicy = (scene) => scene.replies.find((reply) => reply.effects.listen);

test('content has a complete, referenced seven-night grid and useful replies', () => {
  assert.equal(RULES_VERSION, '1');
  assert.equal(CONTENT_VERSION, '1');
  assert.equal(PRODUCTS.length, 9);
  assert.deepEqual(CUSTOMERS.map(({ id }) => id), ['suiji', 'kanban', 'huize']);
  assert.equal(SCENES.length, 21);
  assert.equal(new Set(SCENES.map(({ id }) => id)).size, 21);
  assert.deepEqual(ENDINGS.map(({ id }) => id), ['kept-word', 'remembered', 'open-late']);
  const wantedProductIds = new Set();

  for (let night = 1; night <= 7; night += 1) {
    for (let slot = 0; slot < 3; slot += 1) {
      const scene = SCENES.find((entry) => entry.night === night && entry.slot === slot);
      assert.ok(scene, `missing scene ${night}:${slot}`);
      assert.ok(CUSTOMERS.some((customer) => customer.id === scene.customerId));
      assert.ok(scene.title && scene.text && scene.clue);
      assert.deepEqual(Object.keys(scene.wanted).sort(), ['boost', 'taste', 'temperature']);
      const wantedProduct = PRODUCTS.find((product) => (
        product.temperature === scene.wanted.temperature
        && product.taste === scene.wanted.taste
        && product.boost === scene.wanted.boost
      ));
      assert.ok(wantedProduct, `no exact visible tag match for ${scene.id}`);
      wantedProductIds.add(wantedProduct.id);
      assert.ok(scene.clue.includes(TAG_LABELS.temperature[scene.wanted.temperature]), scene.id);
      assert.ok(scene.clue.includes(TAG_LABELS.taste[scene.wanted.taste]), scene.id);
      assert.ok(scene.clue.includes(TAG_LABELS.boost[scene.wanted.boost]), scene.id);
      assert.ok(scene.replies.length >= 2);
      assert.equal(new Set(scene.replies.map(({ id }) => id)).size, scene.replies.length);
      assert.ok(scene.replies.every((reply) => (
        reply.id && reply.text && reply.response
        && Object.keys(reply.effects).every((key) => ['listen', 'preference', 'commitment'].includes(key))
      )));
      assert.ok(scene.replies.some((reply) => reply.effects.listen === true), `${scene.id} lacks a listening choice`);
    }
  }
  assert.deepEqual([...wantedProductIds].sort(), PRODUCTS.map(({ id }) => id).sort());

  for (const product of PRODUCTS) {
    assert.ok(product.id && product.name && product.icon && product.description);
    assert.ok(Number.isInteger(product.cost) && product.cost > 0);
    assert.ok(Number.isInteger(product.price) && product.price >= product.cost);
    assert.ok(['hot', 'cold', 'room'].includes(product.temperature));
    assert.ok(Number.isInteger(product.boost) && product.boost >= 0 && product.boost <= 2);
    assert.ok(['warm', 'chilled', 'shelf'].includes(product.storage));
    assert.equal(typeof product.perishable, 'boolean');
  }
});

test('first night, a listening callback, and a revisit produce clear contextual lines', () => {
  let state = createGame({ seed: 19, runId: 'first-night' });
  assert.equal(state.funds, 50);
  assert.equal(state.phase, 'stock');
  assert.equal(state.night, 1);
  assert.equal(validateState(state), true);
  const first = getScene(state);
  assert.equal(first.id, 'n1-s0');
  assert.equal(first.contextLines.length, 1);

  state = runNight(state, { replyPolicy: listenPolicy });
  assert.equal(state.history.length, 3);
  assert.equal(allFlagsTrue(state, 'listen'), true);
  state = act(state, 'next-night');
  const revisit = getScene(state);
  assert.equal(revisit.id, 'n2-s0');
  assert.match(revisit.contextText, /愿意把手边的事放一放/);
  assert.equal(revisit.contextLines.some((line) => /偏好/.test(line)), false);

  const nonListenerState = createGame({ seed: 19, runId: 'non-listener' });
  let nonListener = runNight(nonListenerState, {
    replyPolicy: (scene) => scene.replies.find((reply) => reply.effects.commitment === 'make'),
  });
  nonListener = act(nonListener, 'next-night');
  const differentLine = getScene(nonListener);
  assert.match(differentLine.contextText, /上次的话题还停在柜台边/);
  assert.match(differentLine.contextText, /还留着你答应/);
  assert.notEqual(differentLine.contextText, revisit.contextText);
});

test('inventory holds three product types with up to four units each, purchases and returns are idempotent', () => {
  let state = createGame({ seed: 2, runId: 'inventory' });
  const buy = { type: 'buy', actionId: 'buy-four-milk', productId: 'cold-milk', quantity: 4 };
  state = reduceGame(state, buy);
  assert.equal(state.funds, 34);
  assert.equal(state.inventory['cold-milk'], 4);
  const bought = state;
  assert.strictEqual(reduceGame(state, buy), state);
  assert.equal(state.funds, 34);
  assert.throws(() => act(state, 'buy', { productId: 'cold-milk' }), /limited to 4 units/);

  state = act(state, 'buy', { productId: 'cold-soda' });
  state = act(state, 'return', { productId: 'cold-milk', quantity: 2 });
  assert.equal(state.inventory['cold-milk'], 2);
  state = act(state, 'buy', { productId: 'cold-yogurt' });
  assert.equal(Object.values(state.inventory).filter((count) => count > 0).length, 3);
  assert.throws(() => act(state, 'buy', { productId: 'rice-ball' }), /at most 3 product types/);
  state = act(state, 'return', { productId: 'cold-yogurt' });
  assert.equal(state.inventory['cold-yogurt'], 0);
  state = act(state, 'buy', { productId: 'rice-ball' });
  assert.equal(Object.values(state.inventory).filter((count) => count > 0).length, 3);
  assert.throws(() => act(state, 'buy', { productId: 'cold-soda', quantity: 4 }), /limited to 4 units/);
  assert.equal(validateState(state), true);
  assert.notStrictEqual(state, bought);
});

test('three carried product types keep their slots across nights until a type is returned or sold out', () => {
  let state = createGame({ seed: 3, runId: 'carryover-types' });
  for (const productId of ['hot-coffee', 'herbal-tea', 'crackers']) {
    state = act(state, 'buy', { productId, quantity: 2 });
  }
  state = act(state, 'open');
  for (let slot = 0; slot < 3; slot += 1) {
    const scene = getScene(state);
    state = act(state, 'recommend', { productId: 'water' });
    const reply = scene.replies.find((candidate) => candidate.effects.listen);
    state = act(state, 'reply', { replyId: reply.id });
    state = act(state, 'advance');
  }
  assert.equal(state.phase, 'night-end');
  assert.deepEqual(['hot-coffee', 'herbal-tea', 'crackers'].map((id) => state.inventory[id]), [2, 2, 2]);
  state = act(state, 'next-night');
  assert.equal(state.phase, 'stock');
  assert.throws(() => act(state, 'buy', { productId: 'cold-soda' }), /at most 3 product types/);
  state = act(state, 'return', { productId: 'herbal-tea', quantity: 2 });
  state = act(state, 'buy', { productId: 'cold-soda' });
  assert.equal(state.inventory['herbal-tea'], 0);
  assert.equal(state.inventory['cold-soda'], 1);
  assert.equal(Object.values(state.inventory).filter((count) => count > 0).length, 3);
  assert.equal(validateState(state), true);
});

test('recommendation previews explain every visible tag and do not consume stock or alter funds', () => {
  let state = createGame({ seed: 7, runId: 'preview' });
  state = act(state, 'buy', { productId: 'herbal-tea' });
  state = act(state, 'buy', { productId: 'cold-milk' });
  state = act(state, 'open');
  const before = JSON.stringify(state);
  const preview = previewRecommendation(state, 'herbal-tea');
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.ok, true);
  assert.equal(preview.match, 3);
  assert.equal(preview.income, 9);
  assert.deepEqual(preview.reasons.map(({ tag, matched }) => [tag, matched]), [
    ['temperature', true], ['taste', true], ['boost', true],
  ]);
  assert.match(preview.message, /三个标签都对上/);

  const miss = previewRecommendation(state, 'cold-milk');
  assert.equal(miss.ok, true);
  assert.ok(miss.match < 3);
  assert.equal(miss.reasons.length, 3);
  assert.equal(state.inventory['herbal-tea'], 1);
  assert.equal(state.funds, 42);
  const noStock = previewRecommendation(state, 'cold-yogurt');
  assert.equal(noStock.ok, false);
});

test('perishables expire at close, while packaged stock carries to the next night', () => {
  let state = createGame({ seed: 13, runId: 'expiry' });
  state = act(state, 'buy', { productId: 'cold-yogurt' });
  state = act(state, 'buy', { productId: 'rice-ball' });
  state = act(state, 'buy', { productId: 'crackers' });
  state = act(state, 'open');
  for (let slot = 0; slot < 3; slot += 1) {
    const scene = getScene(state);
    state = act(state, 'recommend', { productId: 'water' });
    const reply = scene.replies.find((candidate) => candidate.effects.listen);
    state = act(state, 'reply', { replyId: reply.id });
    state = act(state, 'advance');
  }
  assert.equal(state.phase, 'night-end');
  assert.equal(state.inventory['cold-yogurt'], 0);
  assert.equal(state.inventory['rice-ball'], 0);
  assert.equal(state.inventory.crackers, 1);
  assert.deepEqual(state.ledgers.filter((entry) => entry.kind === 'spoilage').map((entry) => entry.productId).sort(), ['cold-yogurt', 'rice-ball']);
  state = act(state, 'next-night');
  assert.equal(state.inventory.crackers, 1);
  assert.equal(state.inventory['cold-yogurt'], 0);
});

test('free hot water and one clearly explained zero-funds relief keep all seven nights playable', () => {
  let state = createGame({ seed: 'zero-funds', runId: 'zero-funds' });
  state.funds = 0;
  assert.equal(validateState(state), true);
  for (let night = 1; night <= 7; night += 1) {
    if (night > 1) {
      state = act(state, 'next-night');
      if (night === 3) state.funds = 0;
    }
    const noStock = runNight(state, { productForScene: () => 'water' });
    assert.equal(noStock.history.length, night * 3);
    assert.ok(noStock.history.slice(-3).every((row) => row.productId === 'water' && row.income === 0));
    state = noStock;
  }
  state = act(state, 'next-night');
  assert.equal(state.phase, 'complete');
  assert.equal(state.aidUsed, true);
  assert.equal(state.ledgers.filter((entry) => entry.kind === 'relief').length, 1);
  assert.equal(getEnding(state).id, 'open-late');

  let relieved = createGame({ seed: 1, runId: 'aid-once' });
  relieved.funds = 0;
  relieved = runNight(relieved, { productForScene: () => 'water' });
  relieved = act(relieved, 'next-night');
  assert.equal(relieved.funds, 18);
  assert.equal(relieved.aidNotice.amount, 18);
  assert.match(relieved.aidNotice.message, /唯一一次救济/);
  relieved = runNight(relieved, { productForScene: () => 'water' });
  relieved.funds = 0;
  relieved = act(relieved, 'next-night');
  assert.equal(relieved.funds, 0);
  assert.equal(relieved.aidUsed, true);
  assert.equal(relieved.aidNotice, null);
  assert.equal(relieved.ledgers.filter((entry) => entry.kind === 'relief').length, 1);
});

test('all three store endings are reachable through explicit promise, preference, or open-door routes', () => {
  const promiseEnding = runCampaign((scene) => {
    if (scene.night === 1) return scene.replies.find((reply) => reply.effects.commitment === 'make');
    if (scene.night === 3) return scene.replies.find((reply) => reply.effects.commitment === 'fulfill');
    return scene.replies.find((reply) => reply.effects.listen);
  });
  assert.ok(CUSTOMERS.every((customer) => promiseEnding.flags[customer.id].promise));
  assert.equal(promiseEnding.ending, 'kept-word');
  assert.equal(getEnding(promiseEnding).characterClosures.length, 3);

  const preferenceEnding = runCampaign((scene) => (
    scene.night === 2
      ? scene.replies.find((reply) => reply.effects.preference)
      : scene.replies.find((reply) => reply.effects.listen)
  ));
  assert.ok(CUSTOMERS.every((customer) => preferenceEnding.flags[customer.id].preference));
  assert.equal(preferenceEnding.ending, 'remembered');

  const openEnding = runCampaign(listenPolicy);
  assert.ok(CUSTOMERS.every((customer) => openEnding.flags[customer.id].listen));
  assert.equal(openEnding.ending, 'open-late');
  assert.deepEqual(ENDINGS.map(({ id }) => id), [promiseEnding.ending, preferenceEnding.ending, openEnding.ending]);
});

test('all-mismatch recommendations still finish the campaign and preserve their reactions', () => {
  const mismatchProduct = (scene) => PRODUCTS.find((product) => (
    product.temperature !== scene.wanted.temperature
    || product.taste !== scene.wanted.taste
    || product.boost !== scene.wanted.boost
  )).id;
  const state = runCampaign(listenPolicy, mismatchProduct);
  assert.equal(state.phase, 'complete');
  assert.ok(state.history.every((row) => row.match < 3));
  assert.ok(state.history.some((row) => row.match === 0));
  assert.ok(state.history.every((row) => row.reaction && row.replyText && row.flagsAfter));
});

test('completed nights replay independently from their saved start and stop at closing', () => {
  let state = createGame({ seed: 31, runId: 'replay-source' });
  state = runNight(state, { replyPolicy: listenPolicy });
  const before = JSON.stringify(state);
  const replay = createReplay(state, 1);
  assert.equal(JSON.stringify(state), before);
  assert.equal(replay.replay, true);
  assert.equal(replay.phase, 'stock');
  assert.equal(replay.night, 1);
  assert.equal(replay.history.length, 0);
  assert.deepEqual(replay.flags, state.nightStarts[0].flags);
  let replayed = runNight(replay, { productForScene: () => 'water' });
  assert.equal(replayed.phase, 'night-end');
  assert.equal(replayed.history.length, 3);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => act(replayed, 'next-night'), /replay ends at closing/);
  assert.throws(() => createReplay(state, 2), /Only a completed night/);

  let inProgress = createGame({ seed: 32, runId: 'in-progress' });
  const scene = getScene(inProgress);
  inProgress = act(inProgress, 'open');
  inProgress = act(inProgress, 'recommend', { productId: 'water' });
  inProgress = act(inProgress, 'reply', { replyId: scene.replies[0].id });
  assert.throws(() => createReplay(inProgress, 1), /Only a completed night/);
});

test('malformed imports fail closed, including nested state, ledger, pending, and history shapes', () => {
  const valid = createGame({ seed: 5, runId: 'validator' });
  assert.equal(validateState(valid), true);
  for (const value of [null, undefined, [], 'state', 7, { phase: 'stock' }]) assert.equal(validateState(value), false);

  const badFlags = JSON.parse(JSON.stringify(valid));
  badFlags.flags.suiji = { listen: 'yes', preference: false, promise: false };
  assert.equal(validateState(badFlags), false);

  const badInventory = JSON.parse(JSON.stringify(valid));
  badInventory.inventory['cold-milk'] = -1;
  assert.equal(validateState(badInventory), false);

  const badTypeCount = JSON.parse(JSON.stringify(valid));
  for (const id of ['cold-milk', 'cold-soda', 'cold-yogurt', 'rice-ball']) badTypeCount.inventory[id] = 1;
  assert.equal(validateState(badTypeCount), false);

  const badProductQuantity = JSON.parse(JSON.stringify(valid));
  badProductQuantity.inventory['cold-milk'] = 5;
  assert.equal(validateState(badProductQuantity), false);

  let awaitingReply = act(valid, 'open');
  awaitingReply = act(awaitingReply, 'recommend', { productId: 'water' });
  const badPending = JSON.parse(JSON.stringify(awaitingReply));
  badPending.pending.reasons[0].matched = 'yes';
  assert.equal(validateState(badPending), false);
  assert.throws(() => act(badPending, 'reply', { replyId: getScene(awaitingReply).replies[0].id }), /invalid game state/);

  let withHistory = act(awaitingReply, 'reply', { replyId: getScene(awaitingReply).replies[0].id });
  const badHistory = JSON.parse(JSON.stringify(withHistory));
  badHistory.history[0].flagsAfter.listen = { value: true };
  badHistory.lastReceipt = badHistory.history[0];
  assert.equal(validateState(badHistory), false);

  const badLedger = JSON.parse(JSON.stringify(valid));
  badLedger.ledgers = [{ kind: 'buy', productId: 'constructor' }];
  assert.equal(validateState(badLedger), false);
});

test('story flags and shop revenue cannot be applied twice through a repeated reply', () => {
  let state = createGame({ seed: 41, runId: 'once-only' });
  state = act(state, 'buy', { productId: 'herbal-tea' });
  state = act(state, 'open');
  state = act(state, 'recommend', { productId: 'herbal-tea' });
  const reply = getScene(state).replies.find((candidate) => candidate.effects.commitment === 'make');
  const replyAction = { type: 'reply', actionId: 'single-commitment', replyId: reply.id };
  state = reduceGame(state, replyAction);
  const after = state;
  assert.equal(state.flags.suiji.listen, false);
  assert.equal(state.commitments.suiji, true);
  assert.equal(state.history.length, 1);
  assert.equal(state.ledgers.filter((entry) => entry.kind === 'sale').length, 1);
  state = reduceGame(state, replyAction);
  assert.strictEqual(state, after);
  assert.equal(state.funds, after.funds);
  assert.equal(state.flags.suiji.promise, false);
  assert.equal(state.history.length, 1);
});
