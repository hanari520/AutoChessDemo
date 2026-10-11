# Game library contracts

This document freezes the first browser-local contract for P02/P04/P05. The shared library owns metadata and persistence boundaries; each game owns the meaning and validation of its `payload`.

## IDs, manifests, and shared metadata

Stable IDs use lower-case ASCII letters and digits with `.`, `_`, or `-` after the first character. They are 1–64 characters. IDs are identifiers, not display labels. Character IDs use the same character set and length while preserving source casing, so legacy IDs such as `liAn` remain stable. This casing exception applies to `Character.id` and `Profile.favoriteCharacterId`; game, slot, run, collectible, reward, and display-slot collectible IDs remain lower-case. A `GameManifest` has `id`, `title`, `entry`, `status`, `playersMin`, `playersMax`, `networkMode`, `inputModes`, and `version`.

`entry` is a site-relative path such as `games/studio-manager/index.html`. It cannot start with `/`, contain `..`, a backslash, query/hash text, percent escapes, or a URL scheme. `status` is `development`, `playable`, `released`, or `maintenance`. `networkMode` is `local`, `online`, or `optional`. Supported `inputModes` are `mouse`, `touch`, `keyboard`, and `gamepad`; the list must be non-empty and contain no duplicates. A manifest is data, so callers must still choose whether its status permits navigation.

`Character` fields are `id`, `displayName`, `portrait`, `source`, `assetVersion`, and `availability`. `portrait` is null or a safe site-relative path. Availability is `available`, `unavailable`, or `retired`. Character metadata carries no cross-game cost, power, or combat attributes.

`Profile` fields are `localProfileId`, `displayName`, `favoriteCharacterId`, and `displaySlots`. `favoriteCharacterId` is null or a stable character ID. `displaySlots` has exactly six collectible IDs or nulls. Profiles have no cross-game battle state.

## Save envelope and revision rules

Every save is a JSON object with this shape:

```js
{
  gameId: 'studio-manager',
  slotId: 'main',
  saveVersion: '1',
  rulesVersion: '1',
  contentVersion: '1',
  revision: 1,
  updatedAt: '2026-10-11T00:00:00.000Z',
  payload: { /* game-owned JSON object */ },
}
```

All three versions are required non-empty strings. The default storage adapter accepts only version `1` for each of the eight planned game IDs. A game may explicitly configure accepted values through `createStorage({ supportedVersions })`; an unsupported version produces `UNSUPPORTED_VERSION` and keeps the existing bytes available. The shared layer checks the payload is a JSON-compatible object, while the owning game may add `payloadValidators` for its own rules.

The database is IndexedDB named `vtlib-game-library`, with a save key `vtlib:<gameId>:<slotId>`. It uses separate object stores for saves, completion idempotency records, collectibles, and quarantined damaged saves. It does not read or migrate legacy `vc_*`, `star_survivor_v1`, arena, or RPG keys.

`loadSave(gameId, slotId = 'main')` returns `{ ok: true, value: null }` when no save exists. A valid save returns the envelope. Invalid records return `CORRUPT_SAVE`; valid envelopes with versions outside the configured policy return `UNSUPPORTED_VERSION`. Both cases are copied into `corruptSaves` and remain in their original save slot. The error details include `quarantineId` and `currentRevision`; this is a recovery confirmation token plus the raw revision observed at load time. A corrupt or unsupported save cannot be replaced by an ordinary save call.

`saveGame(envelope, expectedRevision)` is a compare-and-swap write. The first save uses expected revision `0` and envelope revision `1`; each later envelope must set revision to `expectedRevision + 1`. The IndexedDB read and write run inside one read/write transaction. If another tab has already changed the slot, the call returns `REVISION_CONFLICT` with the actual revision and leaves its data untouched. The game should reload, reconcile its in-memory state, then ask the player to retry. Disabling a button is not a concurrency check.

Example:

```js
import { loadSave, saveGame } from './library/storage.mjs';

const loaded = await loadSave('studio-manager');
if (!loaded.ok) showSaveError(loaded.error);
else {
  const previous = loaded.value;
  const next = makeEnvelope(gameState, (previous?.revision ?? 0) + 1);
  const saved = await saveGame(next, previous?.revision ?? 0);
  if (!saved.ok) showSaveError(saved.error);
}
```

If IndexedDB is unavailable, blocked, full, or fails, the operation returns an error. It never reports an in-memory or localStorage write as persistent success. Callers must only show “saved” after `ok: true`.

## Export and import

`exportSave(gameId, slotId = 'main')` returns a JSON string using format `vtlib-save-export`, version `1`. Corrupt raw data can be exported as a `recoveryCopy`; the import parser intentionally refuses recovery copies as playable saves. The format and payload are capped at 2 MiB.

`importSave(json, { expectedGameId, expectedSlotId, expectedRevision })` requires the caller to choose the destination game and provide the revision it observed. It validates the wrapper, envelope fields, game ID, slot ID, and size before writing. The imported revision is rebased to `expectedRevision + 1` and the timestamp is set at import time. A conflict, corrupt existing save, unsupported version, or failed write preserves the current save.

Replacing a damaged or unsupported-version slot requires a separate user confirmation and the exact `recoveryId` returned by `loadSave`: `importSave(json, { expectedGameId, expectedRevision: currentRevision, recoveryId: quarantineId })`. In one IndexedDB read/write transaction, storage checks that the quarantine record belongs to the same game and slot, that its raw snapshot still equals the current slot, and that the raw envelope revision still equals `expectedRevision`. It then writes the validated import while retaining the quarantine copy. A stale token or changed revision returns `RECOVERY_STALE` or `REVISION_CONFLICT`. The recovery token is not a secret or an authentication credential; it is a guard against accidental replacement and stale UI state.

The matching low-level call is `saveGame(envelope, expectedRevision, { recoveryId })`. Ordinary calls without the recovery option continue to fail with `CORRUPT_SAVE` or `UNSUPPORTED_VERSION` when the current slot is damaged or uses a future version.

## Completion and collectibles

A `Completion` has `gameId`, `runId`, `completionId`, `rulesVersion`, `outcome`, and `rewardIds`. `outcome` is non-empty text or a JSON object. `gameId`, `runId`, and `rewardIds` use stable IDs; `completionId` may also include `:` so a game can form a stable composite key such as `studio:<runId>:finale`. `rewardIds` is unique within a completion. `verification` is an output trust label: this local adapter only emits `local` and rejects a client-supplied `server`. Server verification requires a separate server-controlled path and is not implemented by this adapter.

`recordCompletion(completion)` looks up reward IDs in the registered game reward catalog. Unknown IDs fail with `INVALID_REWARD_ID`. The completion idempotency key is `(gameId, completionId)`. A retry with the same result returns the prior result without earning anything again; the same key with different result data returns `IDEMPOTENCY_KEY_REUSED`.

The completion row and any first-time collectible rows are committed in one IndexedDB read/write transaction. If the browser interrupts the transaction, neither side is reported as written and retry is safe. A reward is earned once per game/reward ID even if a later completion references it again. `listCollectibles()` returns local records; it does not imply server trust.

`rewards.json` currently registers the three G1 IDs `studio-first`, `studio-diverse`, and `studio-best`. P05 tests register separate fixture rewards for two fixture game IDs in memory; those test IDs are not added to the shipped reward catalog.

## Result and error shape

All runtime methods resolve to `{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`. Errors are intended for recovery decisions, not direct HTML. Common codes:

| Code | Meaning |
| --- | --- |
| `STORAGE_UNAVAILABLE` / `STORAGE_BLOCKED` | IndexedDB could not be opened or is blocked |
| `STORAGE_WRITE_FAILED` / `STORAGE_FULL` | Transaction did not persist |
| `INVALID_*` | Caller data failed contract validation |
| `CORRUPT_SAVE` | Existing slot is invalid and preserved in quarantine |
| `RECOVERY_STALE` | Recovery token is missing, no longer matches the raw save, or the slot has already changed |
| `UNSUPPORTED_VERSION` | Save versions are not accepted by the configured game adapter |
| `REVISION_CONFLICT` | Another writer advanced this slot |
| `INVALID_REWARD_ID` | Completion references an unregistered reward |
| `UNTRUSTED_VERIFICATION` | Local client attempted to label a result server-verified |
| `IDEMPOTENCY_KEY_REUSED` | Same completion ID was reused with different result data |

## Exports

- `contracts.mjs`: runtime validators and shared result helpers.
- `storage.mjs`: `createStorage(options)`, default `loadSave` and `saveGame` exports.
- `save-transfer.mjs`: `createSaveExport`, `parseSaveImport`, `exportSave`, and `importSave`.
- `collectibles.mjs`: configurable `createCollectibles({ storage, rewards })`, plus default-catalog `recordCompletion` and `listCollectibles`.
