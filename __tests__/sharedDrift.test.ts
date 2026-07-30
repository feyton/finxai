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

const SOURCE = join(__dirname, '..', 'shared', 'categories.ts');
const COPY = join(
  __dirname,
  '..',
  'apps',
  'web',
  'src',
  'lib',
  'shared',
  'categories.ts',
);

// Line endings are not divergence: git is configured to convert LF to CRLF in the
// working tree on this machine, so one file can legitimately differ from the other by
// \r alone.
const normalise = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();

describe('shared/categories copy in apps/web', () => {
  it('is byte-identical to the source of truth', () => {
    const source = normalise(readFileSync(SOURCE, 'utf8'));
    const copy = normalise(readFileSync(COPY, 'utf8'));
    if (source !== copy) {
      throw new Error(
        'apps/web/src/lib/shared/categories.ts has drifted from shared/categories.ts.\n' +
          'Run `npm run sync:shared` to refresh the copy.\n' +
          'Do NOT edit the copy directly — edit shared/categories.ts.',
      );
    }
    expect(copy).toBe(source);
  });

  it('the copy still carries the branches whose absence caused the reporting bugs', () => {
    // Belt-and-braces: even if the identity check were somehow bypassed, these are the
    // specific behaviours that were wrong on the web.
    const copy = readFileSync(COPY, 'utf8');
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
