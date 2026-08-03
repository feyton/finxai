/**
 * resolveCat must be idempotent over its own ids and labels.
 *
 * Splits store the category LABEL ("Food & Drink") while transactions store the ID
 * ("food"), and every reader COALESCEs the two columns together before passing the
 * result through resolveCat. That only works if resolveCat maps both spellings to the
 * same id — which nothing checked. These tests pin it, so that storing ids in
 * split_details from now on cannot break the rows that already hold labels.
 *
 * resolveCat is fuzzy substring matching with order-dependent branches, so a new
 * category or a reworded label can silently capture an existing one. That is not
 * hypothetical: the 'housing' branch has to sit before 'rent' because "Housing" contains
 * no "house", and its absence on the web misfiled roughly 423,000 RWF in a month.
 */
import {CATEGORY_META, type CategoryId, resolveCat} from '../shared/categories';

const IDS = Object.keys(CATEGORY_META) as CategoryId[];

describe('resolveCat idempotence', () => {
  it.each(IDS)('the id %s resolves to itself', id => {
    expect(resolveCat(id)).toBe(id);
  });

  it.each(IDS)('the label for %s resolves back to it', id => {
    expect(resolveCat(CATEGORY_META[id].label)).toBe(id);
  });

  it('is stable when applied twice, whichever spelling it started from', () => {
    for (const id of IDS) {
      expect(resolveCat(resolveCat(CATEGORY_META[id].label))).toBe(id);
    }
  });
});
