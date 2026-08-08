// Refresh apps/web's copy of the shared modules from shared/.
//
// The React Native app imports shared/ directly. The Next app cannot: Turbopack will
// not resolve a module above its project root, and widening `turbopack.root` plus a
// resolveAlias produced a codegen failure instead of a working build. Rather than leave
// two hand-maintained implementations — which is what filed ~423,000 RWF under the
// wrong categories in a single month — the web keeps a generated copy, and
// __tests__/sharedDrift.test.ts fails if it ever differs.
//
// Edit shared/. Never edit the copy.
//
//   node scripts/sync-shared.mjs
import {copyFileSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const root = join(import.meta.dirname, '..');

// Only what the web actually uses. The four SMS-review modules were added when the web
// gained its own pending-SMS review page (apps/web/src/app/dashboard/review): promoting
// a record there has to key merchant rules, recompute the balance, resolve a transfer's
// direction and mint ignore ids EXACTLY as the phone does, or the two clients disagree
// about the same rows.
const FILES = [
  ['shared/categories.ts', 'apps/web/src/lib/shared/categories.ts'],
  ['shared/amortize.ts', 'apps/web/src/lib/shared/amortize.ts'],
  ['shared/merchantNormalize.ts', 'apps/web/src/lib/shared/merchantNormalize.ts'],
  ['shared/balanceReplay.ts', 'apps/web/src/lib/shared/balanceReplay.ts'],
  ['shared/smsDirection.ts', 'apps/web/src/lib/shared/smsDirection.ts'],
  ['shared/smsIds.ts', 'apps/web/src/lib/shared/smsIds.ts'],
];

let changed = 0;
for (const [from, to] of FILES) {
  const src = join(root, from);
  const dst = join(root, to);
  mkdirSync(dirname(dst), {recursive: true});

  let before = null;
  try {
    before = readFileSync(dst, 'utf8');
  } catch {
    // First run — no copy yet.
  }
  copyFileSync(src, dst);
  const after = readFileSync(dst, 'utf8');
  if (before !== after) {
    changed++;
    console.log(`  updated ${to}`);
  } else {
    console.log(`  unchanged ${to}`);
  }
}
console.log(changed ? `✓ synced ${changed} file(s)` : '✓ already in sync');
