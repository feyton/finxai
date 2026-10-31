import {
  findTagByName,
  hasTag,
  parseTagIds,
  serializeTagIds,
  tagTotals,
  withTag,
  withoutTag,
} from '../shared/tags';

describe('tag_ids column', () => {
  it('reads every spelling of "untagged" as empty', () => {
    for (const raw of [null, undefined, '', '  ', '[]', 'not json', '{"a":1}', 42]) {
      expect(parseTagIds(raw)).toEqual([]);
    }
  });

  it('drops junk entries rather than throwing', () => {
    expect(parseTagIds('["a", 3, "", null, "b"]')).toEqual(['a', 'b']);
  });

  it('writes NULL for empty and de-duplicates', () => {
    expect(serializeTagIds([])).toBeNull();
    expect(serializeTagIds(['a', 'a', 'b'])).toBe('["a","b"]');
  });

  it('adds and removes without duplicating', () => {
    const one = withTag(null, 'a');
    expect(one).toBe('["a"]');
    expect(withTag(one, 'a')).toBe('["a"]');
    expect(hasTag(withTag(one, 'b'), 'b')).toBe(true);
    expect(withoutTag(one, 'a')).toBeNull();
  });

  it('finds an existing tag regardless of case and spacing', () => {
    const tags = [{id: '1', name: 'Errands for Aline', color: null}];
    expect(findTagByName(tags, '  errands FOR aline ')?.id).toBe('1');
    expect(findTagByName(tags, 'errands')).toBeUndefined();
  });
});

describe('tagTotals', () => {
  it('nets money back against money out, and calls it settled at zero', () => {
    const t = tagTotals([
      {amount: 5000, transaction_type: 'expense'},
      {amount: 3000, transaction_type: 'expense'},
      {amount: 8000, transaction_type: 'income'},
    ]);
    expect(t).toMatchObject({out: 8000, in: 8000, net: 0, count: 3, settled: true});
  });

  it('counts transfers by direction — a MoMo send to the person is money out', () => {
    const t = tagTotals([
      {amount: 2000, transaction_type: 'transfer', transfer_direction: 'out'},
      {amount: 500, transaction_type: 'transfer', transfer_direction: 'in'},
    ]);
    expect(t).toMatchObject({out: 2000, in: 500, net: -1500, settled: false});
  });

  it('is not "settled" when nothing came back yet', () => {
    expect(tagTotals([]).settled).toBe(false);
    expect(tagTotals([{amount: 100, transaction_type: 'expense'}]).settled).toBe(false);
  });
});
