/* Copies the shared rules runtime into this package so the container image is
 * self-contained. Idempotent: re-running simply overwrites the copies. */
import { copyFileSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(packageRoot);
const SOURCES = [
  ['economy.js', join(repoRoot, 'online', 'economy.js')],
  ['core.js', join(repoRoot, 'online', 'core.js')],
  ['combat.js', join(repoRoot, 'online', 'combat.js')],
  ['equipment.js', join(repoRoot, 'online', 'equipment.js')],
  ['skill-catalog.js', join(repoRoot, 'online', 'skill-catalog.js')],
  ['bond-runtime.js', join(repoRoot, 'tools', 'bond-runtime.js')],
  ['bot-planner.js', join(repoRoot, 'tools', 'bot-planner.js')],
  ['bot-equipment-policy.js', join(repoRoot, 'tools', 'bot-equipment-policy.js')],
];

for (const [name, from] of SOURCES) {
  const to = join(packageRoot, 'src', name);
  copyFileSync(from, to);
  if(name==='combat.js')writeFileSync(to,readFileSync(to,'utf8').replace("'../tools/bond-runtime.js'","'./bond-runtime.js'"));
  console.log(`synced ${from} -> ${to}`);
}
