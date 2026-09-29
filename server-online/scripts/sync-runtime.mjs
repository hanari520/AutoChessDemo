/* Copies the shared rules runtime into this package so the container image is
 * self-contained. Idempotent: re-running simply overwrites the copies. */
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(packageRoot);
const SOURCES = [
  ['core.js', join(repoRoot, 'online', 'core.js')],
  ['combat.js', join(repoRoot, 'online', 'combat.js')],
];

for (const [name, from] of SOURCES) {
  const to = join(packageRoot, 'src', name);
  copyFileSync(from, to);
  console.log(`synced ${from} -> ${to}`);
}
