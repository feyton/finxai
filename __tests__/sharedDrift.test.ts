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

  // The taxonomy DATA, not just the code that reads it. Both clients bucket
  // spending by these ids, so a subcategory added on the phone and missing on
  // the web re-files transactions in every web report — the same failure as the
  // resolveCat drift above, with no code change to notice.
  it('the category taxonomy is byte-identical too', () => {
    const source = normalise(
      readFileSync(join(__dirname, '..', 'src', 'tools', 'data.json'), 'utf8'),
    );
    const copy = normalise(
      readFileSync(
        join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'subcategories.json'),
        'utf8',
      ),
    );
    if (source !== copy) {
      throw new Error(
        'apps/web/src/lib/subcategories.json has drifted from src/tools/data.json. ' +
          'Run `npm run sync:shared`. Do NOT edit the copy — edit src/tools/data.json.',
      );
    }
    expect(copy).toBe(source);
  });

  it('both sides agree on the set of category ids', () => {
    // Parsed rather than textual, so this still fails usefully if the two files
    // are ever legitimately formatted differently.
    const ids = (raw: string) =>
      JSON.parse(raw).categories.map((c: any) => c.id).sort();
    expect(
      ids(readFileSync(join(__dirname, '..', 'apps', 'web', 'src', 'lib', 'subcategories.json'), 'utf8')),
    ).toEqual(ids(readFileSync(join(__dirname, '..', 'src', 'tools', 'data.json'), 'utf8')));
  });

  it('the copy still carries the branches whose absence caused the reporting bugs', () => {
    // Belt-and-braces: even if the identity check were somehow bypassed, these are the
    // specific behaviours that were wrong on the web.
    const copy = readFileSync(copyOf('categories.ts'), 'utf8');
    expect(copy).toContain("s.includes('housing')");
    for (const id of [
      'personal_care',
      'housing',
      'technology',
      'debt',
      'gifts',
      'misc',
      'freelance',
    ]) {
      expect(copy).toContain(`${id}:`);
    }
    // 'housing' must be tested BEFORE 'rent', because "Housing" contains "house".
    expect(copy.indexOf("s.includes('housing')")).toBeLessThan(
      copy.indexOf("s.includes('rent')"),
    );
  });
});
