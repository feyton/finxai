/**
 * Guards the ONE remaining copy of shared logic.
 *
 * `shared/categories.ts` is the source of truth for the category taxonomy and
 * resolveCat. The React Native app imports it directly (src/theme.ts). The Next app
 * cannot: Turbopack will not resolve a module above its project root, and the
 * combination of `turbopack.root` widening plus a resolveAlias produced a codegen
 * failure rather than a working build. So apps/web keeps a COPY at
 * src/lib/shared/categories.ts, refreshed by `npm run sync:shared`.
 *
 * A copy is only acceptable if divergence cannot land silently — and silent divergence
 * is exactly what caused three bugs on 2026-07-30: the web's resolveCat was missing the
 * 'housing' branch and its CATS was missing six categories, so roughly 423,000 RWF in
 * one month was filed under the wrong headings while the phone showed the right answer.
 *
 * This test fails the moment the two files differ, which turns a silent reporting bug
 * into a red test with an obvious fix.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const PAIRS: [string, string][] = [
  ['categories.ts', 'categories.ts'],
  ['amortize.ts', 'amortize.ts'],
  // Added with the web's pending-SMS review page: it promotes, ignores and
  // re-categorises the same rows the phone does, so the merchant-rule key, the
  // balance replay, the transfer direction and the ignore id must all be the same
  // code — a near-copy of any of them is a silent disagreement about real money.
  ['merchantNormalize.ts', 'merchantNormalize.ts'],
  ['balanceReplay.ts', 'balanceReplay.ts'],
  ['smsDirection.ts', 'smsDirection.ts'],
  ['smsIds.ts', 'smsIds.ts'],
  ['tags.ts', 'tags.ts'],
];
const sourceOf = (f: string) => join(__dirname, '..', 'shared', f);
const copyOf = (f: string) =>
  join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'shared', f);

// Line endings are not divergence: git is configured to convert LF to CRLF in the
// working tree on this machine, so one file can legitimately differ from the other by
// \r alone.
const normalise = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();

describe('shared/ copies in apps/web', () => {
  it.each(PAIRS)('%s is byte-identical to the source of truth', (src, dst) => {
    const source = normalise(readFileSync(sourceOf(src), 'utf8'));
    const copy = normalise(readFileSync(copyOf(dst), 'utf8'));
    if (source !== copy) {
      throw new Error(
        `apps/web/src/lib/shared/${dst} has drifted from shared/${src}. ` +
          'Run `npm run sync:shared` to refresh the copy. ' +
          `Do NOT edit the copy directly — edit shared/${src}.`,
      );
    }
    expect(copy).toBe(source);
  });

  // The taxonomy DATA used to live in src/tools/data.json with a byte-copy in
  // apps/web/src/lib/subcategories.json, guarded here. Since taxonomy v2
  // (2026-10-31) every category's subcategories live inside shared/categories.ts,
  // so the identity check above guards them too and the JSON pair is gone.

  it('the web copy still answers the inputs that caused the reporting bugs', () => {
    // Behaviour, not source text: v2 replaced the if-chain with a keyword table, so
    // asserting on `s.includes(...)` strings would test the old implementation.
    // These are the exact values the web once mis-filed (~423,000 RWF in a month).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const web = require('../apps/web/src/lib/shared/categories');
    expect(web.resolveCat('Housing')).toBe('housing');
    expect(web.resolveCat('Personal Care')).toBe('personal_care');
    // v1 ids that collapsed into Shopping on the web — each keeps a real v2 home.
    expect(web.resolveCat('technology')).toBe('shopping');
    expect(web.resolveCat('debt')).toBe('loan_repayment');
    expect(web.resolveCat('gifts')).toBe('giving');
    expect(web.resolveCat('misc')).toBe('other_spending');
    expect(web.resolveCat('freelance')).toBe('business');
  });
});
