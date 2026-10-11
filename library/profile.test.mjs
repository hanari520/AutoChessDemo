import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FAVORITE_CHARACTERS,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  getOwnedCollectibleChoices,
  getSlotChoices,
  normalizeProfile,
  parseStoredProfile,
  resolveCollectibleSource,
  validateProfileDraft,
} from './profile.mjs';

const collectibles = [
  { id: 'studio-first', gameId: 'studio-manager', title: '首场开演', image: null, verification: 'local' },
  { id: 'midnight-letter', gameId: 'midnight-store', title: '留在柜台的信', image: null, verification: 'local' },
];

test('profile starts with a contract-shaped six-slot local record and the two current portraits', () => {
  const profile = createDefaultProfile();
  assert.deepEqual(profile, {
    localProfileId: 'local-player',
    displayName: '星夜访客',
    favoriteCharacterId: 'suiji',
    displaySlots: [null, null, null, null, null, null],
  });
  assert.equal(PROFILE_STORAGE_KEY, 'vtlib:profile:v1');
  assert.deepEqual(FAVORITE_CHARACTERS.map(({ id }) => id), ['suiji', 'kanban']);
  for (const character of FAVORITE_CHARACTERS) {
    assert.equal(existsSync(fileURLToPath(new URL(character.portrait, import.meta.url))), true, `${character.id} portrait exists`);
  }
});

test('choices keep G1 and G2 collectibles separate and route each to its own game entry', () => {
  assert.deepEqual(getOwnedCollectibleChoices(collectibles).map(({ id }) => id), ['studio-first', 'midnight-letter']);
  const studio = resolveCollectibleSource(collectibles[0]);
  const midnight = resolveCollectibleSource(collectibles[1]);
  assert.deepEqual(studio, {
    gameId: 'studio-manager', gameTitle: '今晚谁来播', task: 'G1', entry: '../games/studio-manager/index.html',
  });
  assert.deepEqual(midnight, {
    gameId: 'midnight-store', gameTitle: '下播后的便利店', task: 'G2', entry: '../games/midnight-store/index.html',
  });
  for (const source of [studio, midnight]) {
    assert.equal(existsSync(fileURLToPath(new URL(source.entry, new URL('./profile.html', import.meta.url)))), true, `${source.task} entry exists`);
  }
  assert.equal(resolveCollectibleSource('unregistered-game').entry, null);
});

test('stale IDs and repeated slots are cleared; valid selections survive a storage round trip', () => {
  const saved = {
    localProfileId: 'local-player',
    displayName: '  演出之后  ',
    favoriteCharacterId: 'kanban',
    displaySlots: ['studio-first', 'studio-first', 'missing-reward', 'midnight-letter', null, null],
  };
  const parsed = parseStoredProfile(JSON.stringify(saved));
  assert.equal(parsed.state, 'loaded');
  const restored = normalizeProfile(parsed.value, collectibles);
  assert.equal(restored.profile.displayName, '演出之后');
  assert.equal(restored.profile.favoriteCharacterId, 'kanban');
  assert.deepEqual(restored.profile.displaySlots, ['studio-first', null, null, 'midnight-letter', null, null]);
  assert.equal(restored.removedSlots.length, 2);
  const nextLoad = normalizeProfile(parseStoredProfile(JSON.stringify(restored.profile)).value, collectibles);
  assert.deepEqual(nextLoad.profile, restored.profile);
  const legacyFavorite = normalizeProfile({ ...restored.profile, favoriteCharacterId: 'huize' }, collectibles);
  assert.equal(legacyFavorite.profile.favoriteCharacterId, 'suiji');
});

test('a bare ID collision across games cannot be selected ambiguously', () => {
  const collision = [
    ...collectibles,
    { id: 'shared-token', gameId: 'studio-manager', title: 'G1 token', verification: 'local' },
    { id: 'shared-token', gameId: 'midnight-store', title: 'G2 token', verification: 'local' },
  ];
  assert.deepEqual(getOwnedCollectibleChoices(collision).map(({ id }) => id), ['studio-first', 'midnight-letter']);
  assert.deepEqual(getSlotChoices(collision, null, ['studio-first']).map(({ id }) => id), ['midnight-letter']);
  const normalized = normalizeProfile({ ...createDefaultProfile(), displaySlots: ['shared-token', null, null, null, null, null] }, collision);
  assert.deepEqual(normalized.profile.displaySlots, [null, null, null, null, null, null]);
  assert.equal(normalized.removedSlots.length, 1);
});

test('draft validation rejects unowned or repeated collectibles while accepting six legal slots', () => {
  const good = {
    ...createDefaultProfile(),
    displayName: '星夜回忆',
    favoriteCharacterId: 'kanban',
    displaySlots: ['studio-first', 'midnight-letter', null, null, null, null],
  };
  assert.equal(validateProfileDraft(good, collectibles).ok, true);
  assert.equal(validateProfileDraft({ ...good, displaySlots: ['studio-first', 'studio-first', null, null, null, null] }).error.code, 'DUPLICATE_DISPLAY_SLOT');
  assert.equal(validateProfileDraft({ ...good, displaySlots: ['not-owned', null, null, null, null, null] }, collectibles).error.code, 'COLLECTIBLE_NOT_OWNED');
  assert.equal(validateProfileDraft({ ...good, favoriteCharacterId: 'ein' }, collectibles).error.code, 'INVALID_FAVORITE_CHARACTER');
});

test('malformed stored JSON is reported without throwing', () => {
  assert.deepEqual(parseStoredProfile('{not json'), { ok: false, value: null, state: 'invalid' });
  assert.deepEqual(parseStoredProfile('[]'), { ok: false, value: null, state: 'invalid' });
  assert.deepEqual(parseStoredProfile(null), { ok: true, value: null, state: 'missing' });
});
