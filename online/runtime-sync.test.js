import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The room service copies the shared rules runtime into server-online/src
 * (scripts/sync-runtime.mjs). The copies are committed so a clean clone builds
 * a working container image; this test fails as soon as a source changes
 * without re-running the sync, so the server never silently ships stale rules. */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCES = [
  ['bot-planner.js','tools/bot-planner.js',false],
  ['bot-equipment-policy.js','tools/bot-equipment-policy.js',false],
  ['economy.js', 'online/economy.js', false],
  ['core.js', 'online/core.js', false],
  ['combat.js', 'online/combat.js', true],
  ['equipment.js', 'online/equipment.js', false],
  ['skill-catalog.js', 'online/skill-catalog.js', false],
  ['bond-runtime.js', 'tools/bond-runtime.js', false],
];

test('server runtime copies stay in sync with the shared sources', () => {
  for (const [name, from, rewritesImport] of SOURCES) {
    let expected = readFileSync(join(root, from), 'utf8');
    if (rewritesImport) expected = expected.replace("'../tools/bond-runtime.js'", "'./bond-runtime.js'");
    assert.equal(
      readFileSync(join(root, 'server-online', 'src', name), 'utf8'),
      expected,
      `${name} is stale: run "npm run sync" inside server-online (scripts/sync-runtime.mjs) before committing`,
    );
  }
});
