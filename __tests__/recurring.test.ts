/**
 * Tests for recurring-charge detection.
 *
 * The interval logic is the whole feature and it is easy to get subtly wrong: too strict
 * and real subscriptions are missed, too loose and unrelated purchases at the same shop
 * look scheduled. Neither failure is visible by eye, so it is pinned here.
 */
import {detectRecurring, type RecurringTxn} from '../src/tools/recurring';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function tx(over: Partial<RecurringTxn> = {}): RecurringTxn {
  return {
    merchant: 'Canal Plus',
    payee: null,
    amount: 20000,
    date_time: '2026-05-01T10:00:00.000Z',
    category: 'fun',
    account_id: 'acct-1',
    transaction_type: 'expense',
    ...over,
  };
}

const monthly = (dates: string[], over: Partial<RecurringTxn> = {}) =>
  dates.map(d => tx({date_time: d, ...over}));

describe('detectRecurring', () => {
  it('finds a monthly subscription', () => {
    const out = detectRecurring(
      monthly([
        '2026-05-03T10:00:00.000Z',
        '2026-06-02T10:00:00.000Z',
        '2026-07-03T10:00:00.000Z',
      ]),
      {now: NOW},
    );
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe('monthly');
    expect(out[0].name).toBe('Canal Plus');
    expect(out[0].occurrences).toBe(3);
  });

  it('needs three occurrences — two a month apart is a coincidence', () => {
    const out = detectRecurring(
      monthly(['2026-06-02T10:00:00.000Z', '2026-07-03T10:00:00.000Z']),
      {now: NOW},
    );
    expect(out).toHaveLength(0);
  });

  it('tolerates one late payment rather than rejecting the series', () => {
    // Real billers slip around weekends; requiring every gap to fit would reject most
    // genuine subscriptions.
    const out = detectRecurring(
      monthly([
        '2026-03-01T10:00:00.000Z',
        '2026-04-01T10:00:00.000Z',
        '2026-05-01T10:00:00.000Z',
        '2026-07-20T10:00:00.000Z', // a long gap after a missed month
      ]),
      {now: NOW},
    );
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe('monthly');
  });

  it('ignores irregular purchases at the same shop', () => {
    const out = detectRecurring(
      monthly([
        '2026-07-01T10:00:00.000Z',
        '2026-07-03T10:00:00.000Z',
        '2026-07-04T10:00:00.000Z',
        '2026-07-19T10:00:00.000Z',
      ]),
      {now: NOW},
    );
    expect(out).toHaveLength(0);
  });

  it('detects a yearly renewal', () => {
    const out = detectRecurring(
      monthly([
        '2024-07-30T10:00:00.000Z',
        '2025-07-30T10:00:00.000Z',
        '2026-07-30T10:00:00.000Z',
      ], {merchant: 'NameCheap Renewal', amount: 23047}),
      {now: NOW},
    );
    expect(out).toHaveLength(1);
    expect(out[0].cadence).toBe('yearly');
    expect(out[0].amount).toBe(23047);
  });

  it('projects the next date into the future even for a lapsed series', () => {
    // A subscription last charged six months ago should still propose an upcoming date,
    // not one already in the past.
    const out = detectRecurring(
      monthly([
        '2025-11-01T10:00:00.000Z',
        '2025-12-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z',
      ]),
      {now: NOW},
    );
    expect(out).toHaveLength(1);
    expect(new Date(out[0].nextDue).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('uses the median amount so one odd charge does not skew it', () => {
    const out = detectRecurring(
      [
        tx({date_time: '2026-05-01T10:00:00.000Z', amount: 20000}),
        tx({date_time: '2026-06-01T10:00:00.000Z', amount: 20000}),
        tx({date_time: '2026-07-01T10:00:00.000Z', amount: 90000}),
      ],
      {now: NOW},
    );
    expect(out[0].amount).toBe(20000);
  });

  it('ignores income and transfers', () => {
    const salary = monthly(
      ['2026-05-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z'],
      {transaction_type: 'income', merchant: 'Employer'},
    );
    const moves = monthly(
      ['2026-05-02T10:00:00.000Z', '2026-06-02T10:00:00.000Z', '2026-07-02T10:00:00.000Z'],
      {transaction_type: 'transfer', merchant: 'To MTN MoMo'},
    );
    expect(detectRecurring([...salary, ...moves], {now: NOW})).toHaveLength(0);
  });

  it('groups case-insensitively and skips unnamed rows', () => {
    const out = detectRecurring(
      [
        tx({date_time: '2026-05-01T10:00:00.000Z', merchant: 'canal plus'}),
        tx({date_time: '2026-06-01T10:00:00.000Z', merchant: 'Canal Plus'}),
        tx({date_time: '2026-07-01T10:00:00.000Z', merchant: 'CANAL PLUS'}),
        tx({date_time: '2026-07-02T10:00:00.000Z', merchant: '', payee: null}),
      ],
      {now: NOW},
    );
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(3);
    // Display name comes from the most recent occurrence, not the lowercased key.
    expect(out[0].name).toBe('CANAL PLUS');
  });

  it('ranks by amount so the expensive commitment is first', () => {
    const small = monthly(
      ['2026-05-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z'],
      {merchant: 'Small', amount: 500},
    );
    const big = monthly(
      ['2026-05-05T10:00:00.000Z', '2026-06-05T10:00:00.000Z', '2026-07-05T10:00:00.000Z'],
      {merchant: 'Big', amount: 50000},
    );
    const out = detectRecurring([...small, ...big], {now: NOW});
    expect(out.map(c => c.name)).toEqual(['Big', 'Small']);
  });
});
