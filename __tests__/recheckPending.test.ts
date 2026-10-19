/**
 * recheckPending — re-filing the review queue after a rule is learned.
 *
 * It files real money without a human looking at each record, so the bar is
 * the ingest prefilter's and no lower: an EXACT rule match files, a fuzzy one
 * stays for review. Invented data only (public repo).
 */
import {recheckPending, undoRecheck} from '../src/tools/smsIngest';
import {normalizeMerchant} from '../shared/merchantNormalize';
import {findRuleForNames} from '../src/tools/smsParser';

// Same cut as smsIngest.test.ts: balance.ts reaches @powersync/react-native ESM.
jest.mock('../src/tools/balance', () => ({
  syncAccountBalance: jest.fn(async () => {}),
}));

const OWNER = 'owner-1';
const key = (name: string) => normalizeMerchant(name).key;

const sms = (to: string, amount = 5000) =>
  `*162*TxId:10000000001*S*Your payment of ${amount} RWF to ${to} 012345 was completed at 2026-01-01 10:00:00. Balance: 20000 RWF. Fee was 0 RWF.`;

function pending(id: string, merchant: string, over: any = {}) {
  return {
    id,
    amount: 5000,
    account_id: 'acct-1',
    category: 'shopping',
    subcategory: '',
    date_time: '2026-01-01T10:00:00.000Z',
    sms: sms(merchant),
    sender: 'M-Money',
    payee: merchant,
    merchant,
    transaction_type: 'expense',
    fees: 0,
    confidence: 0.6,
    owner_id: OWNER,
    ...over,
  };
}

function fakeDb(rules: any[], records: any[]) {
  const calls: {sql: string; params: any[]}[] = [];
  return {
    calls,
    execute: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({sql, params});
      if (/FROM merchant_rules/.test(sql)) {
        return {rows: {_array: rules}};
      }
      if (/SELECT \* FROM auto_records/.test(sql)) {
        return {rows: {_array: records}};
      }
      return {rows: {_array: []}};
    }),
  };
}
const inserts = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter(c => c.sql.includes('INSERT INTO transactions'));

describe('recheckPending', () => {
  it('files records whose counterparty has an exact rule, with the rule applied', async () => {
    const db = fakeDb(
      [{pattern: key('Simba Supermarket'), category: 'groceries', subcategory: 'Household', display_name: 'Simba'}],
      [pending('a', 'Simba Supermarket'), pending('b', 'Unrelated Shop Ltd')],
    );
    const res = await recheckPending(db, OWNER);

    expect(res.promoted.map(r => r.id)).toEqual(['a']);
    expect(res.accountIds).toEqual(['acct-1']);
    const [ins] = inserts(db);
    expect(ins.params[0]).toBe('a'); // the record id becomes the transaction id
    expect(ins.params).toContain('groceries');
    expect(ins.params).toContain('Household'); // the learned subcategory sticks
    expect(ins.params).toContain('Simba'); // and the learned name
  });

  it('leaves a fuzzy (word-contained) match for review, as ingest would', async () => {
    const rules = [
      {pattern: key('Simba'), category: 'groceries', subcategory: '', display_name: null, correction_count: 1, confirmation_count: 0},
    ];
    // Guard against a vacuous pass: the rule DOES match, just not exactly.
    const hit = findRuleForNames(rules, ['Simba Supermarket Kimironko Branch']);
    expect(hit).toBeDefined();
    expect(hit!.exact).toBe(false);

    const db = fakeDb(rules, [pending('a', 'Simba Supermarket Kimironko Branch')]);
    const res = await recheckPending(db, OWNER);
    expect(res.promoted).toHaveLength(0);
    expect(inserts(db)).toHaveLength(0);
  });

  it('never files an ad, even if its name hits a rule', async () => {
    const ad = pending('ad', 'MoKash', {
      sms: 'Yello! Dial *182*5*1# and borrow up to Rwf 250000 with MoKash.',
    });
    const db = fakeDb([{pattern: key('MoKash'), category: 'savings', subcategory: ''}], [ad]);
    const res = await recheckPending(db, OWNER);
    expect(res.promoted).toHaveLength(0);
  });

  it('a transfer rule files a transfer; any other rule un-types a transfer', async () => {
    const db = fakeDb(
      [
        {pattern: key('Jean Test'), category: 'transfer', subcategory: ''},
        {pattern: key('Corner Kiosk'), category: 'food', subcategory: ''},
      ],
      [
        pending('t', 'Jean Test'),
        pending('k', 'Corner Kiosk', {transaction_type: 'transfer'}),
      ],
    );
    await recheckPending(db, OWNER);
    const [t, k] = inserts(db);
    expect(t.params).toContain('transfer');
    expect(k.params).toContain('expense'); // a debit, so money out — not a transfer
    expect(k.params).not.toContain('transfer');
  });

  it('does nothing without rules', async () => {
    const db = fakeDb([], [pending('a', 'Simba Supermarket')]);
    expect((await recheckPending(db, OWNER)).promoted).toHaveLength(0);
  });
});

describe('undoRecheck', () => {
  it('removes the filed transactions and restores the review records exactly', async () => {
    const rec = pending('a', 'Simba Supermarket');
    const db = fakeDb([], []);
    await undoRecheck(db, {promoted: [rec], accountIds: ['acct-1']});

    const del = db.calls.find(c => c.sql.startsWith('DELETE FROM transactions'))!;
    expect(del.params).toEqual(['a']);
    const back = db.calls.find(c => c.sql.startsWith('INSERT INTO auto_records'))!;
    for (const [col, val] of Object.entries(rec)) {
      expect(back.sql).toContain(col);
      expect(back.params).toContain(val);
    }
  });
});
