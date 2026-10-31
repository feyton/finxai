// withAnswerLocation — when a fix taken as the user answers a review question
// may stand for where the money was spent. Invented data only.
// One ordered log shared by every mock, so tests can assert WHEN the user is
// answered relative to the slow upkeep.
const events: string[] = [];
const mockRows: {auto: any[]} = {auto: []};
jest.mock('../src/native/NativeReviewNotifier', () => ({
  __esModule: true,
  default: {
    ask: jest.fn(),
    cancel: jest.fn(),
    settle: jest.fn((_id: string, text: string) => events.push(`settle:${text}`)),
  },
}));
jest.mock('../src/tools/database', () => ({
  db: {
    execute: jest.fn(async (sql: string) => {
      if (/FROM auto_records WHERE id/.test(sql)) {
        return {rows: {_array: mockRows.auto}};
      }
      return {rows: {_array: []}};
    }),
  },
}));
jest.mock('../src/tools/supabase', () => ({
  supabase: {auth: {getSession: async () => ({data: {session: {user: {id: 'owner-1'}}}})}},
}));
jest.mock('../src/tools/balance', () => ({
  syncAccountBalance: jest.fn(async () => events.push('rebalance')),
}));
jest.mock('../src/widgets/refreshWidget', () => ({refreshBalanceWidget: jest.fn()}));
jest.mock('../src/tools/smsIngest', () => ({
  promoteAutoRecord: jest.fn(async () => {
    events.push('promote');
    return {txType: 'expense', accountId: 'acct-1'};
  }),
  recheckPending: jest.fn(async () => {
    events.push('recheck');
    return {promoted: [], accountIds: []};
  }),
}));

import {reviewTaskHandler, withAnswerLocation} from '../src/tools/reviewNotify';

const paidAt = Date.parse('2026-01-01T10:00:00.000Z');
const record = {id: 'r', date_time: '2026-01-01T10:00:00.000Z', lat: null};
const fix = (minutesAfter: number) => ({
  lat: -1.95,
  lon: 30.06,
  accuracy: 20,
  locationAt: paidAt + minutesAfter * 60_000,
});

describe('withAnswerLocation', () => {
  it('attaches a fix taken soon after paying, as a real device fix', () => {
    const out = withAnswerLocation(record, fix(5), true);
    expect(out).toMatchObject({lat: -1.95, lon: 30.06, accuracy_m: 20, location_source: 'device'});
  });

  it('refuses a fix taken long after — that is where you are now, not where you paid', () => {
    expect(withAnswerLocation(record, fix(60), true).lat).toBeNull();
  });

  it('never places money coming IN (same privacy rule as live capture)', () => {
    expect(withAnswerLocation(record, fix(1), false).lat).toBeNull();
  });

  it('never overwrites a position the SMS already had', () => {
    const had = {...record, lat: 1, lon: 2, location_source: 'device'};
    expect(withAnswerLocation(had, fix(1), true)).toBe(had);
  });

  it('ignores an answer with no fix', () => {
    expect(withAnswerLocation(record, {}, true)).toBe(record);
  });
});

describe('reviewTaskHandler', () => {
  beforeEach(() => {
    events.length = 0;
  });

  // A refactor once routed finish() into itself: every outcome was logged and
  // none reached the notification, which then said "Filing…" until it expired.
  it('updates the notification when the record is already filed', async () => {
    mockRows.auto = [];
    await reviewTaskHandler({recordId: 'gone', kind: 'confirm'});
    expect(events).toEqual(['settle:Already filed']);
  });

  it('answers the user as soon as the record is filed, before slow upkeep', async () => {
    mockRows.auto = [
      {
        id: 'r1',
        amount: 5000,
        account_id: 'acct-1',
        category: 'groceries',
        subcategory: '',
        transaction_type: 'expense',
        merchant: 'Test Shop',
        sms: 'Your payment of 5000 RWF to Test Shop was completed. Balance: 1000 RWF.',
        date_time: '2026-01-01T10:00:00.000Z',
      },
    ];
    await reviewTaskHandler({recordId: 'r1', kind: 'confirm'});
    expect(events[0]).toBe('promote');
    expect(events[1]).toMatch(/^settle:Filed as /);
    expect(events).toContain('rebalance');
    expect(events).toContain('recheck');
    expect(events.filter(e => e.startsWith('settle:'))).toHaveLength(1);
  });
});
