// Splits: enter only the parts that differ; the rest stays in the main category.
import {itemsFromText, normaliseParts, partsFromRows, restOf, saveSplit} from '../src/tools/splits';

const tx = {
  id: 't1',
  amount: 12000,
  category: 'groceries',
  subcategory: '',
  transaction_type: 'expense',
  transfer_direction: null,
  owner_id: 'owner-1',
};

function fakeDb() {
  const calls: {sql: string; params: any[]}[] = [];
  return {calls, execute: jest.fn(async (sql: string, params: any[] = []) => { calls.push({sql, params}); return {rows: {_array: []}}; })};
}
const inserted = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter(c => c.sql.startsWith('INSERT INTO split_details')).map(c => ({amount: c.params[2], category: c.params[3], sub: c.params[4], note: c.params[5]}));

describe('saveSplit', () => {
  it('writes the parts plus the rest, so reports still cover the whole amount', async () => {
    const db = fakeDb();
    await saveSplit(db, tx, [{category: 'personal_care', subcategory: 'Toiletries', amount: 3000}]);
    const rows = inserted(db);
    expect(rows).toEqual([
      {amount: 3000, category: 'personal_care', sub: 'Toiletries', note: null},
      {amount: 9000, category: 'groceries', sub: null, note: null},
    ]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(12000);
  });

  it('never exceeds the total — the last part shrinks, no rest row', async () => {
    const db = fakeDb();
    await saveSplit(db, tx, [
      {category: 'personal_care', subcategory: '', amount: 8000},
      {category: 'eating_out', subcategory: '', amount: 8000},
    ]);
    expect(inserted(db).map(r => r.amount)).toEqual([8000, 4000]);
  });

  it('a part cannot carry a category invalid for the type', async () => {
    const db = fakeDb();
    await saveSplit(db, tx, [{category: 'salary', subcategory: '', amount: 1000}]);
    expect(inserted(db)[0].category).toBe('other_spending');
  });

  it('no differing parts removes the split entirely', async () => {
    const db = fakeDb();
    await saveSplit(db, tx, [{category: 'groceries', subcategory: '', amount: 5000}]);
    expect(db.calls.some(c => c.sql.startsWith('DELETE FROM split_details'))).toBe(true);
    expect(inserted(db)).toHaveLength(0);
  });

  it('reading back folds the rest away and shows only what differs', () => {
    const stored = [
      {category: 'personal_care', subcategory: 'Toiletries', amount: 3000},
      {category: 'groceries', subcategory: null, amount: 9000},
    ];
    const parts = partsFromRows(tx, stored);
    expect(parts).toEqual([{category: 'personal_care', subcategory: 'Toiletries', amount: 3000, label: undefined}]);
    expect(restOf(tx.amount, parts)).toBe(9000);
  });

  it('a same-category part with its own subcategory is kept (fruits → Groceries › Produce)', () => {
    const parts = normaliseParts(tx, [{category: 'groceries', subcategory: 'Produce', amount: 2000}]);
    expect(parts).toHaveLength(1);
  });
});

describe('itemsFromText', () => {
  it.each([
    ['Payment for fruits of 2000 and vegetables of 1000', [{label: 'fruits', amount: 2000}, {label: 'vegetables', amount: 1000}]],
    ['bread 1,500, soap 2000', [{label: 'bread', amount: 1500}, {label: 'soap', amount: 2000}]],
    ['ibirayi 3000 na inyanya 1500', [{label: 'ibirayi', amount: 3000}, {label: 'inyanya', amount: 1500}]],
  ])('%s', (text, want) => {
    expect(itemsFromText(text)).toEqual(want);
  });

  it('a plain description has no items', () => {
    expect(itemsFromText('lunch with the team')).toEqual([]);
  });
});

describe('items from a described payment (classifier reply)', () => {
  const {buildClassification, applyClassification, classificationSchema} = require('../src/tools/smsParser');
  const sms = 'TxId: 1. Your payment of 3,000 RWF to Test Market 012345 has been completed at 2026-01-01 10:00:00. Your new balance: 8,000 RWF. Fee was 0 RWF.';
  const ctx = {sender: 'M-Money', userNote: 'fruits 2000 and vegetables 1000'};

  it('the schema only asks for items when the user described the payment', () => {
    expect((classificationSchema('debit', true) as any).properties.items).toBeDefined();
    expect((classificationSchema('debit', false) as any).properties.items).toBeUndefined();
  });

  it('items are validated like the record: direction, ownership of subcategory, total', () => {
    const plan = buildClassification(sms, [], {}, ctx);
    const reply = JSON.stringify({
      merchant: 'Test Market',
      category: 'groceries',
      confidence: 0.9,
      items: [
        {name: 'fruits', amount: 2000, category: 'groceries', subcategory: 'Produce'},
        {name: 'vegetables', amount: 1000, category: 'salary', subcategory: 'Produce'}, // income category on money out
        {name: 'extra', amount: 5000, category: 'shopping', subcategory: 'Charity'}, // over the total
      ],
    });
    const p = applyClassification(reply, plan, sms, [], ctx);
    expect(p.items).toEqual([
      {name: 'fruits', amount: 2000, category: 'groceries', subcategory: 'Produce'},
      {name: 'vegetables', amount: 1000, category: 'other_spending', subcategory: ''},
    ]);
  });
});
