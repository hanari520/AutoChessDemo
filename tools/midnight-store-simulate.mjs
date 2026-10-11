import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createGame,
  getEnding,
  getScene,
  reduceGame,
  validateState,
} from '../games/midnight-store/core.mjs';
import { CUSTOMERS, PRODUCTS, SCENES } from '../games/midnight-store/content.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = resolve(PROJECT_ROOT, 'out/midnight-store/simulations.json');

function makeDispatcher(routeId) {
  let sequence = 1;
  return (state, type, extra = {}) => {
    const next = reduceGame(state, {
      type,
      actionId: `${routeId}-${String(sequence++).padStart(3, '0')}`,
      ...extra,
    });
    if (!validateState(next)) throw new Error(`${routeId} produced an invalid state after ${type}.`);
    return next;
  };
}

function matchingProduct(scene) {
  const product = PRODUCTS.find((candidate) => (
    candidate.temperature === scene.wanted.temperature
    && candidate.taste === scene.wanted.taste
    && candidate.boost === scene.wanted.boost
  ));
  if (!product) throw new Error(`No exact visible-tag match for ${scene.id}.`);
  return product;
}

function chooseAvailableReply(scene, state, policy) {
  const hydrated = getScene(state);
  const reply = policy(scene, hydrated).find((candidate) => candidate.available);
  if (!reply) throw new Error(`${scene.id} has no reply available for this policy.`);
  return reply;
}

function summarizeNights(state) {
  return Array.from({ length: 7 }, (_, index) => {
    const night = index + 1;
    const entries = state.ledgers.filter((entry) => entry.night === night);
    const visits = state.history.filter((entry) => entry.night === night);
    const start = state.nightStarts.find((snapshot) => snapshot.night === night);
    const nextStart = state.nightStarts.find((snapshot) => snapshot.night === night + 1);
    const fundsOpen = start?.funds ?? 0;
    const fundsDelta = entries.reduce((sum, entry) => sum + entry.fundsDelta, 0);
    const endSnapshot = nextStart ?? {
      funds: fundsOpen + fundsDelta,
      inventory: state.inventory,
      flags: state.flags,
      commitments: state.commitments,
    };
    const purchased = entries.filter((entry) => entry.kind === 'buy');
    const returned = entries.filter((entry) => entry.kind === 'return');
    const sales = entries.filter((entry) => entry.kind === 'sale');
    const water = entries.filter((entry) => entry.kind === 'water');
    const spoilage = entries.filter((entry) => entry.kind === 'spoilage');
    const aid = entries.filter((entry) => entry.kind === 'relief');
    return {
      night,
      visits: visits.length,
      fundsOpen,
      purchaseSpend: purchased.reduce((sum, entry) => sum + entry.amount, 0),
      returnRefunds: returned.reduce((sum, entry) => sum + entry.amount, 0),
      salesIncome: sales.reduce((sum, entry) => sum + entry.amount, 0),
      freeWaterServed: water.length,
      relief: aid.reduce((sum, entry) => sum + entry.amount, 0),
      expired: spoilage.map(({ productId, quantity }) => ({ productId, quantity })),
      fundsClose: endSnapshot.funds,
      inventoryClose: { ...endSnapshot.inventory },
      flagsClose: Object.fromEntries(CUSTOMERS.map((customer) => [customer.id, { ...endSnapshot.flags[customer.id] }])),
      commitmentsClose: { ...endSnapshot.commitments },
      story: visits.map(({ sceneId, customerId, productId, match, replyId, income }) => ({
        sceneId, customerId, productId, match, replyId, income,
      })),
    };
  });
}

function simulateRoute({ id, title, policy, productPolicy }) {
  const dispatch = makeDispatcher(id);
  let state = createGame({ seed: `sim-${id}`, runId: id });

  for (let night = 1; night <= 7; night += 1) {
    if (night > 1) state = dispatch(state, 'next-night');
    const scenes = SCENES.filter((scene) => scene.night === night);
    const stockByProduct = new Map();
    const planned = scenes.map((scene) => {
      const productId = productPolicy(scene, state);
      if (productId !== 'water') stockByProduct.set(productId, (stockByProduct.get(productId) ?? 0) + 1);
      return { scene, productId };
    });
    for (const [productId, quantity] of stockByProduct) {
      state = dispatch(state, 'buy', { productId, quantity });
    }
    state = dispatch(state, 'open');

    for (const { scene, productId } of planned) {
      const liveScene = getScene(state);
      if (liveScene.id !== scene.id) throw new Error(`${id}: expected ${scene.id}, got ${liveScene.id}.`);
      state = dispatch(state, 'recommend', { productId });
      const reply = chooseAvailableReply(scene, state, policy);
      state = dispatch(state, 'reply', { replyId: reply.id });
      state = dispatch(state, 'advance');
    }
    if (state.phase !== 'night-end') throw new Error(`${id}: night ${night} did not close.`);
  }

  state = dispatch(state, 'next-night');
  if (state.phase !== 'complete') throw new Error(`${id}: campaign did not complete.`);
  const ending = getEnding(state);
  const nightLedgers = summarizeNights(state);
  if (state.history.length !== 21 || nightLedgers.length !== 7) {
    throw new Error(`${id}: expected 21 story entries and seven night ledgers.`);
  }

  return {
    id,
    title,
    policy,
    counts: {
      historyEntries: state.history.length,
      transactionLedgerEntries: state.ledgers.length,
      nightLedgers: nightLedgers.length,
    },
    ending: {
      id: ending.id,
      title: ending.title,
      text: ending.text,
      characterClosures: ending.characterClosures,
    },
    flags: state.flags,
    commitments: state.commitments,
    funds: state.funds,
    inventory: state.inventory,
    history: state.history,
    ledgers: state.ledgers,
    nightLedgers,
  };
}

const listenReplyPolicy = (scene) => scene.replies.filter((reply) => reply.effects.listen === true);

const routes = [
  simulateRoute({
    id: 'quiet-water',
    title: 'Quiet counter: free water and brief listening replies',
    policy: {
      recommendations: 'Offer free hot water for all 21 visits; buy no stock.',
      replies: 'Choose the available listening reply at every visit; no preference or promise choices.',
    },
    productPolicy: () => 'water',
    policy: (scene) => listenReplyPolicy(scene),
  }),
  simulateRoute({
    id: 'listening-shelf',
    title: 'Listening route: match every visible product clue and listen at every visit',
    policy: (scene) => listenReplyPolicy(scene),
    productPolicy: (scene) => matchingProduct(scene).id,
  }),
  simulateRoute({
    id: 'kept-promises',
    title: 'Promises route: match the clues, make all three first-night promises, fulfill them on night three, and listen otherwise',
    policy: (scene) => {
      if (scene.night === 1) return scene.replies.filter((reply) => reply.effects.commitment === 'make');
      if (scene.night === 3) return scene.replies.filter((reply) => reply.effects.commitment === 'fulfill');
      return listenReplyPolicy(scene);
    },
    productPolicy: (scene) => matchingProduct(scene).id,
  }),
];

const output = {
  formatVersion: '1',
  generatedBy: 'tools/midnight-store-simulate.mjs',
  routes,
};

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

for (const route of routes) {
  console.log(`${route.id}: ending=${route.ending.id}, funds=${route.funds}, history=${route.counts.historyEntries}, nightLedgers=${route.counts.nightLedgers}, transactionLedgerEntries=${route.counts.transactionLedgerEntries}`);
}
console.log(`Wrote ${OUTPUT_FILE}`);
