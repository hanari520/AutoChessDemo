import {
  MAX_SAVE_BYTES,
  SAVE_EXPORT_FORMAT,
  failure,
  success,
  validateSaveEnvelope,
} from './contracts.mjs';
import { defaultStorage } from './storage.mjs';

const EXPORT_VERSION = '1';

function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength;
  return unescape(encodeURIComponent(text)).length;
}

export function createSaveExport(envelope, { exportedAt = new Date().toISOString() } = {}) {
  const valid = validateSaveEnvelope(envelope);
  if (!valid.ok) return valid;
  const serialized = JSON.stringify({
    format: SAVE_EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    envelope,
  }, null, 2);
  if (byteLength(serialized) > MAX_SAVE_BYTES) return failure('SAVE_TOO_LARGE', 'The exported save exceeds the 2 MiB limit.');
  return success(serialized);
}

export function parseSaveImport(serialized, { expectedGameId, expectedSlotId, maxBytes = MAX_SAVE_BYTES } = {}) {
  if (typeof serialized !== 'string') return failure('INVALID_IMPORT', 'Save import must be JSON text.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return failure('INVALID_IMPORT_LIMIT', 'maxBytes must be a positive safe integer.');
  if (byteLength(serialized) > maxBytes) return failure('SAVE_TOO_LARGE', `Save import exceeds the ${maxBytes}-byte limit.`);

  let document;
  try {
    document = JSON.parse(serialized);
  } catch {
    return failure('INVALID_JSON', 'The selected file is not valid JSON.');
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) return failure('INVALID_IMPORT', 'Save import must contain a JSON object.');
  if (document.format !== SAVE_EXPORT_FORMAT || document.version !== EXPORT_VERSION) return failure('UNSUPPORTED_EXPORT_VERSION', 'This file is not a supported game-library save export.');
  if (document.recoveryCopy === true) return failure('CORRUPT_IMPORT', 'This is a recovery copy of damaged data; it cannot be loaded as a game save. Keep it for manual recovery.');
  const valid = validateSaveEnvelope(document.envelope, { gameId: expectedGameId, slotId: expectedSlotId });
  if (!valid.ok) return valid;
  return success(document.envelope);
}

async function exportStoredSave(gameId, slotId = 'main', { storage = defaultStorage, now = () => new Date() } = {}) {
  if (!storage || typeof storage.readRawSave !== 'function') return failure('INVALID_STORAGE', 'The save storage adapter does not support export.');
  const read = await storage.readRawSave(gameId, slotId);
  if (!read.ok) return read;
  if (read.value === null) return failure('SAVE_NOT_FOUND', `No save exists for ${gameId}/${slotId}.`);

  const valid = validateSaveEnvelope(read.value, { gameId, slotId });
  const document = valid.ok
    ? { format: SAVE_EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now().toISOString(), envelope: read.value }
    : { format: SAVE_EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now().toISOString(), recoveryCopy: true, raw: read.value };
  const serialized = JSON.stringify(document, null, 2);
  if (valid.ok && byteLength(serialized) > MAX_SAVE_BYTES) return failure('SAVE_TOO_LARGE', 'The exported save exceeds the 2 MiB limit.');
  return success(serialized);
}

// Pass an envelope to create a synchronous download payload, or a game ID to
// export the current stored slot. Awaiting either form is safe.
export function exportSave(source, slotId = 'main', options = {}) {
  if (source && typeof source === 'object') {
    const exportOptions = slotId && typeof slotId === 'object' ? slotId : options;
    return createSaveExport(source, exportOptions);
  }
  if (typeof source !== 'string') return failure('INVALID_GAME_ID', 'Export requires a save envelope or a game ID.');
  return exportStoredSave(source, slotId, options);
}

export async function importSave(serialized, {
  storage = defaultStorage,
  expectedGameId,
  expectedSlotId = 'main',
  expectedRevision,
  recoveryId,
  now = () => new Date(),
} = {}) {
  if (!expectedGameId) return failure('INVALID_GAME_ID', 'Choose the destination game before importing a save.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return failure('INVALID_REVISION', 'expectedRevision is required so an import cannot overwrite a newer save.');
  if (!storage || typeof storage.saveGame !== 'function') return failure('INVALID_STORAGE', 'The save storage adapter does not support import.');
  const parsed = parseSaveImport(serialized, { expectedGameId, expectedSlotId });
  if (!parsed.ok) return parsed;
  const envelope = {
    ...parsed.value,
    revision: expectedRevision + 1,
    updatedAt: now().toISOString(),
  };
  return storage.saveGame(envelope, expectedRevision, recoveryId === undefined ? undefined : { recoveryId });
}
