import {
  failure,
  isIdentifier,
  success,
  validateCollectible,
  validateCompletion,
  validateSaveEnvelope,
} from './contracts.mjs';

export const DATABASE_NAME = 'vtlib-game-library';
export const DATABASE_VERSION = 1;
export const DEFAULT_SUPPORTED_VERSIONS = Object.freeze(Object.fromEntries([
  'studio-manager',
  'midnight-store',
  'collab-party',
  'broadcast-rescue',
  'danmaku-deck',
  'night-detectives',
  'encore-rhythm',
  'star-fighters',
].map((gameId) => [gameId, Object.freeze({ saveVersion: '1', rulesVersion: '1', contentVersion: '1' })])));

const STORES = Object.freeze({
  saves: 'gameSaves',
  completions: 'completions',
  collectibles: 'collectibles',
  corrupt: 'corruptSaves',
});

class StorageFault extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageFault';
    this.code = code;
  }
}

function storeKey(gameId, slotId) {
  return `vtlib:${gameId}:${slotId}`;
}

function completionKey(gameId, completionId) {
  return `${gameId}:${completionId}`;
}

function collectibleKey(gameId, collectibleId) {
  return `${gameId}:${collectibleId}`;
}

function stableStringify(value, ancestors = new Set()) {
  if (value === undefined) return '"[undefined]"';
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(`[number:${String(value)}]`);
  if (typeof value === 'bigint') return JSON.stringify(`[bigint:${value}]`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(`[date:${Number.isNaN(value.valueOf()) ? 'invalid' : value.toISOString()}]`);
  if (ancestors.has(value)) return '"[circular]"';
  ancestors.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = `[${value.map((item) => stableStringify(item, ancestors)).join(',')}]`;
  } else if (ArrayBuffer.isView(value)) {
    encoded = JSON.stringify(`[${value.constructor.name}:${Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).join(',')}]`);
  } else if (value instanceof ArrayBuffer) {
    encoded = JSON.stringify(`[ArrayBuffer:${Array.from(new Uint8Array(value)).join(',')}]`);
  } else {
    encoded = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], ancestors)}`).join(',')}}`;
  }
  ancestors.delete(value);
  return encoded;
}

function fingerprint(value) {
  const serialized = stableStringify(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < serialized.length; index++) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function sameSnapshot(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function defaultTransactionRunner(indexedDB, databaseName) {
  let databasePromise;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      return Promise.reject(new StorageFault('STORAGE_UNAVAILABLE', 'This browser does not provide IndexedDB, so local game data cannot be saved.'));
    }

    databasePromise = new Promise((resolve, reject) => {
      let request;
      let settled = false;
      try {
        request = indexedDB.open(databaseName, DATABASE_VERSION);
      } catch (error) {
        reject(new StorageFault('STORAGE_UNAVAILABLE', `Could not open local game storage: ${error.message || 'IndexedDB is unavailable'}`));
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'key' });
        }
      };
      request.onerror = () => {
        settled = true;
        databasePromise = undefined;
        reject(new StorageFault('STORAGE_UNAVAILABLE', `Could not open local game storage: ${request.error?.message || 'IndexedDB failed'}`));
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        databasePromise = undefined;
        reject(new StorageFault('STORAGE_BLOCKED', 'Local game storage is blocked by another open tab. Close an older game tab and try again.'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          databasePromise = undefined;
        };
        resolve(db);
      };
    });
    return databasePromise;
  }

  return async function transaction(storeNames, mode, work) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      let hasResult = false;
      let callbackError;
      try {
        tx = db.transaction(storeNames, mode);
      } catch (error) {
        reject(new StorageFault('STORAGE_WRITE_FAILED', `Could not start a local storage transaction: ${error.message || 'transaction failed'}`));
        return;
      }

      const api = {
        get(storeName, key, onSuccess) {
          const request = tx.objectStore(storeName).get(key);
          request.onsuccess = () => {
            try {
              onSuccess(request.result === undefined ? null : request.result);
            } catch (error) {
              callbackError = error;
              try { tx.abort(); } catch { /* transaction already ended */ }
            }
          };
        },
        getAll(storeName, onSuccess) {
          const request = tx.objectStore(storeName).getAll();
          request.onsuccess = () => {
            try {
              onSuccess(request.result || []);
            } catch (error) {
              callbackError = error;
              try { tx.abort(); } catch { /* transaction already ended */ }
            }
          };
        },
        put(storeName, value) {
          tx.objectStore(storeName).put(value);
        },
      };
      const finish = (value) => {
        result = value;
        hasResult = true;
      };

      tx.oncomplete = () => resolve(hasResult ? result : undefined);
      tx.onerror = () => {
        if (!callbackError) callbackError = tx.error;
      };
      tx.onabort = () => reject(callbackError || new StorageFault('STORAGE_WRITE_FAILED', `Local storage transaction failed: ${tx.error?.message || 'transaction aborted'}`));
      try {
        work(api, finish);
      } catch (error) {
        callbackError = error;
        try { tx.abort(); } catch { reject(error); }
      }
    });
  };
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return failure('STORAGE_FULL', 'The browser ran out of space for local game data. Export or remove other site data and try again.');
  if (typeof error?.code === 'string') return failure(error.code, error.message || 'Local game storage failed.');
  return failure('STORAGE_WRITE_FAILED', `Local game storage failed: ${error?.message || 'unknown error'}`);
}

function supportedVersionError(envelope, supportedVersions) {
  const rules = supportedVersions?.[envelope.gameId];
  if (!rules || typeof rules !== 'object') return null;
  for (const field of ['saveVersion', 'rulesVersion', 'contentVersion']) {
    const accepted = rules[field];
    if (accepted === undefined) continue;
    const allowed = Array.isArray(accepted) ? accepted : [accepted];
    if (!allowed.includes(envelope[field])) {
      return failure('UNSUPPORTED_VERSION', `This save uses an unsupported ${field}; the original data is preserved.`, {
        field,
        actual: envelope[field],
        accepted: allowed,
      });
    }
  }
  return null;
}

function payloadError(envelope, payloadValidators) {
  const validator = payloadValidators?.[envelope.gameId];
  if (typeof validator !== 'function') return null;
  try {
    const result = validator(envelope.payload);
    if (result === true || result === undefined) return null;
    if (result === false) return failure('INVALID_PAYLOAD', 'The game rejected this save payload.');
    if (result && result.ok === false) return result;
    return failure('INVALID_PAYLOAD', typeof result === 'string' ? result : 'The game rejected this save payload.');
  } catch (error) {
    return failure('INVALID_PAYLOAD', `The game save validator failed: ${error.message || 'invalid payload'}`);
  }
}

function makeQuarantineKey(key, record) {
  const revision = record?.envelope?.revision;
  return `${key}:${Number.isSafeInteger(revision) ? revision : 'invalid'}:${fingerprint(record)}`;
}

function rawRevision(record) {
  const revision = record?.envelope?.revision;
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}

function quarantine(tx, key, gameId, slotId, record, validationError, now, onReady) {
  let quarantineId = makeQuarantineKey(key, record);
  tx.get(STORES.corrupt, quarantineId, (existing) => {
    if (existing && !sameSnapshot(existing.rawRecord, record)) {
      const suffix = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
      quarantineId = `${quarantineId}:${suffix}`;
    }
    if (!existing || !sameSnapshot(existing.rawRecord, record)) {
      tx.put(STORES.corrupt, {
        key: quarantineId,
        gameId,
        slotId,
        detectedAt: now().toISOString(),
        rawRevision: rawRevision(record),
        reason: validationError.message,
        rawRecord: record,
      });
    }
    onReady(quarantineId);
  });
}

function currentSaveError(record, gameId, slotId, payloadValidators) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, 'envelope')) return failure('CORRUPT_SAVE', 'The stored save record is malformed.');
  const shape = validateSaveEnvelope(record.envelope, { gameId, slotId });
  if (!shape.ok) return shape;
  const payload = payloadError(record.envelope, payloadValidators);
  return payload || null;
}

function normalizedReward(completion, definition, now) {
  return {
    id: definition.id,
    gameId: completion.gameId,
    title: definition.title,
    image: definition.image ?? null,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    earnedAt: now().toISOString(),
    sourceRunId: completion.runId,
    verification: 'local',
    completionId: completion.completionId,
  };
}

export function createStorage({
  indexedDB = globalThis.indexedDB,
  databaseName = DATABASE_NAME,
  supportedVersions = DEFAULT_SUPPORTED_VERSIONS,
  payloadValidators = {},
  transactionRunner,
  now = () => new Date(),
} = {}) {
  const transact = transactionRunner || defaultTransactionRunner(indexedDB, databaseName);

  async function run(stores, mode, work) {
    try {
      return await transact(stores, mode, work);
    } catch (error) {
      return storageError(error);
    }
  }

  async function loadSave(gameId, slotId = 'main') {
    if (!isIdentifier(gameId)) return failure('INVALID_GAME_ID', 'gameId must be a stable lower-case identifier.');
    if (!isIdentifier(slotId)) return failure('INVALID_SLOT_ID', 'slotId must be a stable lower-case identifier.');
    const key = storeKey(gameId, slotId);
    return run([STORES.saves, STORES.corrupt], 'readwrite', (tx, finish) => {
      tx.get(STORES.saves, key, (record) => {
        if (record === null) {
          finish(success(null));
          return;
        }
        const invalid = currentSaveError(record, gameId, slotId, payloadValidators);
        if (invalid) {
          quarantine(tx, key, gameId, slotId, record, invalid.error || invalid, now, (quarantineId) => {
            finish(failure('CORRUPT_SAVE', 'This save is damaged or invalid. The original data has been preserved for recovery.', {
              quarantineId,
              currentRevision: rawRevision(record),
              reason: invalid.error?.code || invalid.error?.message || 'INVALID_SAVE',
            }));
          });
          return;
        }
        const versionError = supportedVersionError(record.envelope, supportedVersions);
        if (versionError) {
          quarantine(tx, key, gameId, slotId, record, versionError.error, now, (quarantineId) => {
            finish(failure('UNSUPPORTED_VERSION', versionError.error.message, {
              ...versionError.error.details,
              quarantineId,
              currentRevision: rawRevision(record),
              reason: versionError.error.code,
            }));
          });
          return;
        }
        finish(success(record.envelope));
      });
    });
  }

  async function readRawSave(gameId, slotId = 'main') {
    if (!isIdentifier(gameId)) return failure('INVALID_GAME_ID', 'gameId must be a stable lower-case identifier.');
    if (!isIdentifier(slotId)) return failure('INVALID_SLOT_ID', 'slotId must be a stable lower-case identifier.');
    const key = storeKey(gameId, slotId);
    return run([STORES.saves], 'readonly', (tx, finish) => {
      tx.get(STORES.saves, key, (record) => {
        if (record === null) finish(success(null));
        else finish(success(Object.prototype.hasOwnProperty.call(record, 'envelope') ? record.envelope : record));
      });
    });
  }

  async function saveGame(envelope, expectedRevision, { recoveryId } = {}) {
    const shape = validateSaveEnvelope(envelope);
    if (!shape.ok) return shape;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return failure('INVALID_REVISION', 'expectedRevision must be a non-negative safe integer.');
    if (envelope.revision !== expectedRevision + 1) return failure('INVALID_REVISION', 'A save revision must be exactly expectedRevision + 1.', { expectedRevision, revision: envelope.revision });
    if (recoveryId !== undefined && (typeof recoveryId !== 'string' || recoveryId.length === 0)) return failure('INVALID_RECOVERY_ID', 'recoveryId must be a quarantine token returned by loadSave.');
    const versionError = supportedVersionError(envelope, supportedVersions);
    if (versionError) return versionError;
    const payloadInvalid = payloadError(envelope, payloadValidators);
    if (payloadInvalid) return payloadInvalid;

    const { gameId, slotId } = envelope;
    const key = storeKey(gameId, slotId);
    return run([STORES.saves, STORES.corrupt], 'readwrite', (tx, finish) => {
      tx.get(STORES.saves, key, (record) => {
        if (recoveryId !== undefined) {
          if (record === null) {
            finish(failure('RECOVERY_STALE', 'The damaged save no longer exists. Reload before attempting recovery.'));
            return;
          }
          const invalid = currentSaveError(record, gameId, slotId, payloadValidators);
          const unsupported = invalid ? null : supportedVersionError(record.envelope, supportedVersions);
          if (!invalid && !unsupported) {
            finish(failure('RECOVERY_STALE', 'The save changed after recovery was requested. Reload before importing.'));
            return;
          }
          tx.get(STORES.corrupt, recoveryId, (quarantineRecord) => {
            if (!quarantineRecord || quarantineRecord.gameId !== gameId || quarantineRecord.slotId !== slotId || !sameSnapshot(quarantineRecord.rawRecord, record)) {
              finish(failure('RECOVERY_STALE', 'The damaged save changed after it was backed up. Reload and confirm recovery again.'));
              return;
            }
            const actualRevision = rawRevision(record);
            if (actualRevision !== expectedRevision) {
              finish(failure('REVISION_CONFLICT', 'The damaged save revision changed after it was loaded.', { expectedRevision, actualRevision }));
              return;
            }
            tx.put(STORES.saves, { key, gameId, slotId, envelope });
            finish(success(envelope));
          });
          return;
        }
        if (record !== null) {
          const invalid = currentSaveError(record, gameId, slotId, payloadValidators);
          if (invalid) {
            quarantine(tx, key, gameId, slotId, record, invalid.error || invalid, now, (quarantineId) => {
              finish(failure('CORRUPT_SAVE', 'The existing save is damaged and was preserved. Importing or saving cannot replace it automatically.', {
                quarantineId,
                currentRevision: rawRevision(record),
                reason: invalid.error?.code || invalid.error?.message || 'INVALID_SAVE',
              }));
            });
            return;
          }
          const currentVersionError = supportedVersionError(record.envelope, supportedVersions);
          if (currentVersionError) {
            finish(currentVersionError);
            return;
          }
        }
        const actualRevision = record?.envelope?.revision ?? 0;
        if (actualRevision !== expectedRevision) {
          finish(failure('REVISION_CONFLICT', 'Another tab changed this save. Reload it before saving again.', { expectedRevision, actualRevision }));
          return;
        }
        tx.put(STORES.saves, { key, gameId, slotId, envelope });
        finish(success(envelope));
      });
    });
  }

  async function recordCompletion(completion, rewardDefinitions = []) {
    const shape = validateCompletion(completion);
    if (!shape.ok) return shape;
    const definitions = new Map();
    for (const definition of rewardDefinitions) {
      if (!definition || definition.gameId !== completion.gameId || !isIdentifier(definition.id) || typeof definition.title !== 'string' || !definition.title.trim()) {
        return failure('INVALID_REWARD_CATALOG', 'A reward definition is invalid or belongs to a different game.');
      }
      if (definitions.has(definition.id)) return failure('INVALID_REWARD_CATALOG', `Duplicate reward definition ${definition.id}.`);
      definitions.set(definition.id, definition);
    }
    const rewards = completion.rewardIds.map((id) => definitions.get(id));
    if (rewards.some((reward) => !reward)) {
      const invalidIds = completion.rewardIds.filter((id) => !definitions.has(id));
      return failure('INVALID_REWARD_ID', 'The completion references a reward that is not registered for this game.', { invalidIds });
    }

    const normalized = { ...completion, verification: 'local' };
    const fingerprint = stableStringify({
      gameId: normalized.gameId,
      runId: normalized.runId,
      completionId: normalized.completionId,
      rulesVersion: normalized.rulesVersion,
      outcome: normalized.outcome,
      rewardIds: normalized.rewardIds,
      verification: 'local',
    });
    const key = completionKey(normalized.gameId, normalized.completionId);
    return run([STORES.completions, STORES.collectibles], 'readwrite', (tx, finish) => {
      tx.get(STORES.completions, key, (existing) => {
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            finish(failure('IDEMPOTENCY_KEY_REUSED', 'completionId was already recorded with different result data.', { gameId: normalized.gameId, completionId: normalized.completionId }));
            return;
          }
          finish(success({ completion: existing.completion, collectibleIds: existing.collectibleIds, duplicate: true }));
          return;
        }

        const earnedAt = now().toISOString();
        const collectibles = rewards.map((reward) => normalizedReward(normalized, reward, () => new Date(earnedAt)));
        const collectibleIds = [];
        const newCollectibles = [];
        let index = 0;
        const checkNext = () => {
          if (index >= collectibles.length) {
            tx.put(STORES.completions, {
              key,
              gameId: normalized.gameId,
              completionId: normalized.completionId,
              fingerprint,
              completion: normalized,
              collectibleIds,
              recordedAt: earnedAt,
            });
            for (const collectible of newCollectibles) tx.put(STORES.collectibles, { ...collectible, key: collectibleKey(collectible.gameId, collectible.id) });
            finish(success({ completion: normalized, collectibleIds, duplicate: false }));
            return;
          }
          const collectible = collectibles[index++];
          collectibleIds.push(collectible.id);
          tx.get(STORES.collectibles, collectibleKey(collectible.gameId, collectible.id), (existing) => {
            if (!existing) newCollectibles.push(collectible);
            checkNext();
          });
        };
        checkNext();
      });
    });
  }

  async function listCollectibles(gameId) {
    if (gameId !== undefined && !isIdentifier(gameId)) return failure('INVALID_GAME_ID', 'gameId must be a stable lower-case identifier.');
    return run([STORES.collectibles], 'readonly', (tx, finish) => {
      tx.getAll(STORES.collectibles, (rows) => {
        const collectibles = rows
          .filter((row) => gameId === undefined || row.gameId === gameId)
          .map(({ key: _key, ...collectible }) => collectible)
          .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt) || a.gameId.localeCompare(b.gameId) || a.id.localeCompare(b.id));
        for (const collectible of collectibles) {
          const valid = validateCollectible(collectible);
          if (!valid.ok) {
            finish(failure('CORRUPT_COLLECTIBLE', 'A stored collectible record is invalid.', { id: collectible.id, reason: valid.error.code }));
            return;
          }
        }
        finish(success(collectibles));
      });
    });
  }

  return Object.freeze({ loadSave, readRawSave, saveGame, recordCompletion, listCollectibles });
}

export const defaultStorage = createStorage();

export const loadSave = (...args) => defaultStorage.loadSave(...args);
export const saveGame = (...args) => defaultStorage.saveGame(...args);
