export const SAVE_FORMAT = 'vtlib-save-v1';
export const SAVE_EXPORT_FORMAT = 'vtlib-save-export';
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CHARACTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const COMPLETION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const MANIFEST_STATUSES = new Set(['development', 'playable', 'released', 'maintenance']);
const NETWORK_MODES = new Set(['local', 'online', 'optional']);
const INPUT_MODES = new Set(['mouse', 'touch', 'keyboard', 'gamepad']);
const CHARACTER_AVAILABILITY = new Set(['available', 'unavailable', 'retired']);
const VERIFICATION = new Set(['local', 'server']);

export function success(value) {
  return { ok: true, value };
}

export function failure(code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { ok: false, error };
}

export function isIdentifier(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function isCharacterIdentifier(value) {
  return typeof value === 'string' && CHARACTER_ID_PATTERN.test(value);
}

export function isCompletionId(value) {
  return typeof value === 'string' && COMPLETION_ID_PATTERN.test(value);
}

export function isVersion(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value);
}

export function isSitePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/')) return false;
  if (value.includes('\\') || value.includes('%') || value.includes('?') || value.includes('#')) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !isPlainObject(value)) return false;
  seen.add(value);
  const values = Array.isArray(value) ? value : Object.values(value);
  const valid = values.every((child) => isJsonValue(child, seen));
  seen.delete(value);
  return valid;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function checkFields(value, required, label) {
  if (!isPlainObject(value)) return failure('INVALID_CONTRACT', `${label} must be a plain object.`);
  const missing = required.filter((field) => value[field] === undefined);
  if (missing.length) return failure('MISSING_FIELD', `${label} is missing required fields: ${missing.join(', ')}.`, { missing });
  return null;
}

export function validateManifest(manifest) {
  const fields = ['id', 'title', 'entry', 'status', 'playersMin', 'playersMax', 'networkMode', 'inputModes', 'version'];
  const missing = checkFields(manifest, fields, 'Game manifest');
  if (missing) return missing;
  if (!isIdentifier(manifest.id)) return failure('INVALID_GAME_ID', 'Manifest id must be a stable lower-case identifier.');
  if (!nonEmptyText(manifest.title)) return failure('INVALID_TITLE', 'Manifest title must be non-empty text.');
  if (!isSitePath(manifest.entry)) return failure('INVALID_ENTRY', 'Manifest entry must be a safe site-relative path without traversal or a URL.');
  if (!MANIFEST_STATUSES.has(manifest.status)) return failure('INVALID_STATUS', 'Manifest status must be development, playable, released, or maintenance.');
  if (!Number.isInteger(manifest.playersMin) || manifest.playersMin < 1 || manifest.playersMin > 99) return failure('INVALID_PLAYER_RANGE', 'playersMin must be an integer from 1 to 99.');
  if (!Number.isInteger(manifest.playersMax) || manifest.playersMax < manifest.playersMin || manifest.playersMax > 99) return failure('INVALID_PLAYER_RANGE', 'playersMax must be an integer between playersMin and 99.');
  if (!NETWORK_MODES.has(manifest.networkMode)) return failure('INVALID_NETWORK_MODE', 'networkMode must be local, online, or optional.');
  if (!Array.isArray(manifest.inputModes) || manifest.inputModes.length === 0 || manifest.inputModes.some((mode) => !INPUT_MODES.has(mode)) || new Set(manifest.inputModes).size !== manifest.inputModes.length) {
    return failure('INVALID_INPUT_MODES', 'inputModes must be a non-empty list of unique supported input modes.');
  }
  if (!isVersion(manifest.version)) return failure('INVALID_VERSION', 'Manifest version must be a non-empty version string.');
  return success(manifest);
}

export function validateManifestRegistry(manifests) {
  if (!Array.isArray(manifests)) return failure('INVALID_MANIFEST_LIST', 'Manifest registry must be an array.');
  const ids = new Set();
  for (const manifest of manifests) {
    const valid = validateManifest(manifest);
    if (!valid.ok) return valid;
    if (ids.has(manifest.id)) return failure('DUPLICATE_GAME_ID', `Manifest id ${manifest.id} is registered more than once.`, { gameId: manifest.id });
    ids.add(manifest.id);
  }
  return success(manifests);
}

export function validateCharacter(character) {
  const fields = ['id', 'displayName', 'portrait', 'source', 'assetVersion', 'availability'];
  const missing = checkFields(character, fields, 'Character');
  if (missing) return missing;
  if (!isCharacterIdentifier(character.id)) return failure('INVALID_CHARACTER_ID', 'Character id must be a stable identifier that preserves its source casing.');
  if (!nonEmptyText(character.displayName) || !nonEmptyText(character.source)) return failure('INVALID_CHARACTER', 'Character displayName and source must be non-empty text.');
  if (character.portrait !== null && !isSitePath(character.portrait)) return failure('INVALID_PORTRAIT', 'Character portrait must be null or a safe site-relative path.');
  if (!isVersion(character.assetVersion)) return failure('INVALID_VERSION', 'Character assetVersion must be a non-empty version string.');
  if (!CHARACTER_AVAILABILITY.has(character.availability)) return failure('INVALID_AVAILABILITY', 'Character availability must be available, unavailable, or retired.');
  return success(character);
}

export function validateSaveEnvelope(envelope, expected = {}) {
  const fields = ['gameId', 'slotId', 'saveVersion', 'rulesVersion', 'contentVersion', 'revision', 'updatedAt', 'payload'];
  const missing = checkFields(envelope, fields, 'Save envelope');
  if (missing) return missing;
  if (!isIdentifier(envelope.gameId)) return failure('INVALID_GAME_ID', 'Save gameId must be a stable lower-case identifier.');
  if (!isIdentifier(envelope.slotId)) return failure('INVALID_SLOT_ID', 'Save slotId must be a stable lower-case identifier.');
  if (expected.gameId !== undefined && envelope.gameId !== expected.gameId) return failure('GAME_ID_MISMATCH', `Expected a save for game ${expected.gameId}.`, { expected: expected.gameId, actual: envelope.gameId });
  if (expected.slotId !== undefined && envelope.slotId !== expected.slotId) return failure('SLOT_ID_MISMATCH', `Expected a save for slot ${expected.slotId}.`, { expected: expected.slotId, actual: envelope.slotId });
  for (const field of ['saveVersion', 'rulesVersion', 'contentVersion']) {
    if (!isVersion(envelope[field])) return failure('INVALID_VERSION', `${field} must be a non-empty version string.`, { field });
  }
  if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 1) return failure('INVALID_REVISION', 'Save revision must be a positive safe integer.');
  if (!validIsoTimestamp(envelope.updatedAt)) return failure('INVALID_TIMESTAMP', 'updatedAt must be an ISO UTC timestamp.');
  if (!isPlainObject(envelope.payload) || !isJsonValue(envelope.payload)) return failure('INVALID_PAYLOAD', 'Save payload must be a JSON-compatible object.');
  let serialized;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return failure('INVALID_PAYLOAD', 'Save envelope must be JSON serializable.');
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > MAX_SAVE_BYTES) return failure('SAVE_TOO_LARGE', 'Save envelope exceeds the 2 MiB limit.');
  return success(envelope);
}

export function validateCompletion(completion, { allowServerVerification = false } = {}) {
  const fields = ['gameId', 'runId', 'completionId', 'rulesVersion', 'outcome', 'rewardIds'];
  const missing = checkFields(completion, fields, 'Completion');
  if (missing) return missing;
  if (!isIdentifier(completion.gameId)) return failure('INVALID_GAME_ID', 'Completion gameId must be a stable lower-case identifier.');
  if (!isIdentifier(completion.runId) || !isCompletionId(completion.completionId)) return failure('INVALID_COMPLETION_ID', 'runId must be a stable identifier; completionId may also contain colons for a stable composite key.');
  if (!isVersion(completion.rulesVersion)) return failure('INVALID_VERSION', 'Completion rulesVersion must be a non-empty version string.');
  if (!(nonEmptyText(completion.outcome) || (isPlainObject(completion.outcome) && isJsonValue(completion.outcome)))) return failure('INVALID_OUTCOME', 'Completion outcome must be non-empty text or a JSON-compatible object.');
  if (!Array.isArray(completion.rewardIds) || completion.rewardIds.some((id) => !isIdentifier(id)) || new Set(completion.rewardIds).size !== completion.rewardIds.length) return failure('INVALID_REWARD_IDS', 'rewardIds must contain unique stable identifiers.');
  if (completion.verification !== undefined && !VERIFICATION.has(completion.verification)) return failure('INVALID_VERIFICATION', 'verification must be local or server.');
  if (completion.verification === 'server' && !allowServerVerification) return failure('UNTRUSTED_VERIFICATION', 'A local client cannot claim server verification.');
  return success(completion);
}

export function validateCollectible(collectible) {
  const fields = ['id', 'gameId', 'title', 'image', 'earnedAt', 'sourceRunId', 'verification'];
  const missing = checkFields(collectible, fields, 'Collectible');
  if (missing) return missing;
  if (!isIdentifier(collectible.id) || !isIdentifier(collectible.gameId) || !isIdentifier(collectible.sourceRunId)) return failure('INVALID_COLLECTIBLE_ID', 'Collectible identifiers must be stable lower-case identifiers.');
  if (!nonEmptyText(collectible.title)) return failure('INVALID_TITLE', 'Collectible title must be non-empty text.');
  if (collectible.image !== null && !isSitePath(collectible.image)) return failure('INVALID_IMAGE', 'Collectible image must be null or a safe site-relative path.');
  if (collectible.description !== undefined && !nonEmptyText(collectible.description)) return failure('INVALID_DESCRIPTION', 'Collectible description must be non-empty text when provided.');
  if (!validIsoTimestamp(collectible.earnedAt)) return failure('INVALID_TIMESTAMP', 'earnedAt must be an ISO UTC timestamp.');
  if (!VERIFICATION.has(collectible.verification)) return failure('INVALID_VERIFICATION', 'verification must be local or server.');
  return success(collectible);
}

export function validateProfile(profile) {
  const fields = ['localProfileId', 'displayName', 'favoriteCharacterId', 'displaySlots'];
  const missing = checkFields(profile, fields, 'Profile');
  if (missing) return missing;
  if (!isIdentifier(profile.localProfileId) || !nonEmptyText(profile.displayName)) return failure('INVALID_PROFILE', 'Profile id and displayName are required.');
  if (profile.favoriteCharacterId !== null && !isCharacterIdentifier(profile.favoriteCharacterId)) return failure('INVALID_CHARACTER_ID', 'favoriteCharacterId must be null or a stable character identifier.');
  if (!Array.isArray(profile.displaySlots) || profile.displaySlots.length !== 6 || profile.displaySlots.some((id) => id !== null && !isIdentifier(id))) return failure('INVALID_DISPLAY_SLOTS', 'displaySlots must contain exactly six collectible IDs or null values.');
  return success(profile);
}
