import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateCompletion,
  validateCharacter,
  validateManifest,
  validateManifestRegistry,
  validateProfile,
  validateSaveEnvelope,
} from './contracts.mjs';

const registeredGames = JSON.parse(await readFile(new URL('./games.json', import.meta.url), 'utf8'));

const manifest = {
  id: 'studio-manager',
  title: '今晚谁来播',
  entry: 'games/studio-manager/index.html',
  status: 'development',
  playersMin: 1,
  playersMax: 1,
  networkMode: 'local',
  inputModes: ['mouse', 'touch', 'keyboard'],
  version: '1',
};

const envelope = {
  gameId: 'studio-manager',
  slotId: 'main',
  saveVersion: '1',
  rulesVersion: '1',
  contentVersion: '1',
  revision: 1,
  updatedAt: '2026-10-11T00:00:00.000Z',
  payload: { week: 1, cash: 100 },
};

test('manifest rejects duplicate inputs and unsafe entry paths', () => {
  assert.equal(validateManifest(manifest).ok, true);
  assert.equal(validateManifest({ ...manifest, inputModes: ['mouse', 'mouse'] }).error.code, 'INVALID_INPUT_MODES');
  assert.equal(validateManifest({ ...manifest, entry: '../index.html' }).error.code, 'INVALID_ENTRY');
  assert.equal(validateManifest({ ...manifest, entry: 'https://example.test/game' }).error.code, 'INVALID_ENTRY');
  assert.equal(validateManifestRegistry([manifest, manifest]).error.code, 'DUPLICATE_GAME_ID');
});

test('the real games.json manifest registry matches the shared contract', () => {
  assert.equal(validateManifestRegistry(registeredGames).ok, true);
});

test('character IDs preserve mixed-case legacy IDs only in character fields', () => {
  const character = {
    id: 'liAn',
    displayName: '离岸',
    portrait: 'assets/units_big/liAn.webp',
    source: 'legacy-roster',
    assetVersion: '1',
    availability: 'available',
  };
  const profile = {
    localProfileId: 'local-player',
    displayName: '玩家',
    favoriteCharacterId: 'liAn',
    displaySlots: ['studio-first', null, null, null, null, null],
  };

  assert.equal(validateCharacter(character).ok, true);
  assert.equal(validateCharacter(character).value.id, 'liAn');
  assert.equal(validateProfile(profile).ok, true);
  assert.equal(validateProfile(profile).value.favoriteCharacterId, 'liAn');
  assert.equal(validateProfile({ ...profile, displaySlots: ['liAn', null, null, null, null, null] }).error.code, 'INVALID_DISPLAY_SLOTS');
  assert.equal(validateManifest({ ...manifest, id: 'liAn' }).error.code, 'INVALID_GAME_ID');
  assert.equal(validateCompletion({
    gameId: 'studio-manager',
    runId: 'liAn',
    completionId: 'finish-001',
    rulesVersion: '1',
    outcome: 'excellent',
    rewardIds: ['studio-first'],
  }).error.code, 'INVALID_COMPLETION_ID');
  assert.equal(validateCompletion({
    gameId: 'studio-manager',
    runId: 'run-001',
    completionId: 'finish-001',
    rulesVersion: '1',
    outcome: 'excellent',
    rewardIds: ['liAn'],
  }).error.code, 'INVALID_REWARD_IDS');
});

test('save envelope requires version strings and matches its namespace', () => {
  assert.equal(validateSaveEnvelope(envelope).ok, true);
  assert.equal(validateSaveEnvelope({ ...envelope, rulesVersion: undefined }).error.code, 'MISSING_FIELD');
  assert.equal(validateSaveEnvelope(envelope, { gameId: 'other-game' }).error.code, 'GAME_ID_MISMATCH');
  assert.equal(validateSaveEnvelope({ ...envelope, payload: { bad: undefined } }).error.code, 'INVALID_PAYLOAD');
  assert.equal(validateSaveEnvelope({ ...envelope, saveVersion: '' }).error.code, 'INVALID_VERSION');
});

test('client completion cannot claim server verification', () => {
  const completion = {
    gameId: 'studio-manager',
    runId: 'run-001',
    completionId: 'finish-001',
    rulesVersion: '1',
    outcome: 'excellent',
    rewardIds: ['studio-first'],
  };
  assert.equal(validateCompletion(completion).ok, true);
  assert.equal(validateCompletion({ ...completion, completionId: 'studio:run-001:finale' }).ok, true);
  assert.equal(validateCompletion({ ...completion, verification: 'server' }).error.code, 'UNTRUSTED_VERIFICATION');
});
