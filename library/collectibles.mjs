import {
  failure,
  isIdentifier,
  isSitePath,
  validateCompletion,
} from './contracts.mjs';
import { defaultStorage } from './storage.mjs';

function normalizeCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || catalog.schemaVersion !== '1' || !catalog.games || typeof catalog.games !== 'object') {
    return failure('INVALID_REWARD_CATALOG', 'Reward catalog must have schemaVersion "1" and a games object.');
  }
  const result = new Map();
  for (const [gameId, rewards] of Object.entries(catalog.games)) {
    if (!isIdentifier(gameId) || !Array.isArray(rewards)) return failure('INVALID_REWARD_CATALOG', `Reward list for ${gameId} is invalid.`);
    const ids = new Set();
    const normalized = [];
    for (const reward of rewards) {
      if (!reward || reward.gameId !== gameId || !isIdentifier(reward.id) || typeof reward.title !== 'string' || !reward.title.trim()) {
        return failure('INVALID_REWARD_CATALOG', `A reward entry for ${gameId} is invalid.`);
      }
      if (reward.image !== null && reward.image !== undefined && !isSitePath(reward.image)) {
        return failure('INVALID_REWARD_CATALOG', `Reward ${reward.id} must use a safe site-relative image path or null.`);
      }
      if (reward.description !== undefined && (typeof reward.description !== 'string' || !reward.description.trim())) {
        return failure('INVALID_REWARD_CATALOG', `Reward ${reward.id} has an invalid description.`);
      }
      if (ids.has(reward.id)) return failure('INVALID_REWARD_CATALOG', `Duplicate reward id ${reward.id} for ${gameId}.`);
      ids.add(reward.id);
      normalized.push({
        id: reward.id,
        gameId,
        title: reward.title.trim(),
        image: reward.image ?? null,
        ...(reward.description === undefined ? {} : { description: reward.description.trim() }),
      });
    }
    result.set(gameId, normalized);
  }
  return { ok: true, value: result };
}

export function createCollectibles({ storage = defaultStorage, rewards }) {
  const catalogResult = normalizeCatalog(rewards);

  async function recordCompletion(completion) {
    if (!catalogResult.ok) return catalogResult;
    const valid = validateCompletion(completion);
    if (!valid.ok) return valid;
    const gameRewards = catalogResult.value.get(completion.gameId) || [];
    const availableIds = new Set(gameRewards.map((reward) => reward.id));
    const invalidIds = completion.rewardIds.filter((id) => !availableIds.has(id));
    if (invalidIds.length) return failure('INVALID_REWARD_ID', 'The completion references a reward that is not registered for this game.', { gameId: completion.gameId, invalidIds });
    return storage.recordCompletion(completion, gameRewards);
  }

  async function listCollectibles(gameId) {
    if (!catalogResult.ok) return catalogResult;
    return storage.listCollectibles(gameId);
  }

  return Object.freeze({ recordCompletion, listCollectibles });
}

let builtInClient;
let builtInCatalogPromise;

async function loadBuiltInCatalog() {
  if (builtInCatalogPromise) return builtInCatalogPromise;
  const pending = (async () => {
    if (typeof fetch !== 'function') return failure('REWARD_CATALOG_UNAVAILABLE', 'The built-in reward catalog could not be loaded in this environment.');
    try {
      const response = await fetch(new URL('./rewards.json', import.meta.url));
      if (!response.ok) return failure('REWARD_CATALOG_UNAVAILABLE', `Could not load the reward catalog (${response.status}).`);
      const catalog = await response.json();
      const normalized = normalizeCatalog(catalog);
      return normalized.ok ? { ok: true, value: catalog } : normalized;
    } catch (error) {
      return failure('REWARD_CATALOG_UNAVAILABLE', `Could not load the reward catalog: ${error.message || 'request failed'}`);
    }
  })();
  builtInCatalogPromise = pending;
  const loaded = await pending;
  // Cache only a valid catalog. A network or parse failure must not make a
  // transient problem permanent for later player retries.
  if (!loaded.ok && builtInCatalogPromise === pending) builtInCatalogPromise = undefined;
  return loaded;
}

async function getBuiltInClient() {
  if (builtInClient) return { ok: true, value: builtInClient };
  const loaded = await loadBuiltInCatalog();
  if (!loaded.ok) return loaded;
  builtInClient = createCollectibles({ storage: defaultStorage, rewards: loaded.value });
  return { ok: true, value: builtInClient };
}

export async function recordCompletion(completion) {
  const client = await getBuiltInClient();
  if (!client.ok) return client;
  return client.value.recordCompletion(completion);
}

export async function listCollectibles(gameId) {
  return defaultStorage.listCollectibles(gameId);
}
