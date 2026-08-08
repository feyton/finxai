/**
 * The balance rule now has two callers — the phone (src/tools/balance.ts) and the web
 * (apps/web/src/lib/reviewActions.ts), both of which confirm pending SMS records — so
 * the properties that make it order-independent are pinned here rather than left to be
 * re-discovered from a wrong balance.
 */
import {movementDelta, replayBalance} from '../shared/balanceReplay';

describe('movementDelta', () => {
  it('takes the fee out alongside an expense', () => {
    expect(movementDelta({amount: 4500, fees: 100, transaction_type: 'expense'})).toBe(-4600);
  });

  it('adds income without touching fees', () => {
    expect(movementDelta({amount: 30000, fees: 0, transaction_type: 'income'})).toBe(30000);
  });

  it('signs a transfer by its direction', () => {
    const t = {amount: 10000, fees: 200, transaction_type: 'transfer'};
    expect(movementDelta({...t, transfer_direction: 'in'})).toBe(10000);
    expect(movementDelta({...t, transfer_direction: 'out'})).toBe(-10200);
  });
});

describe('replayBalance', () => {
  // Newest first, which is the order the callers must supply.
  const history = [
    {date_time: '2026-08-03', amount: 2000, fees: 0, transaction_type: 'expense', balance_after: null, sms: ''},
    {date_time: '2026-08-02', amount: 5000, fees: 100, transaction_type: 'expense', balance_after: null, sms: ''},
    {date_time: '2026-08-01', amount: 0, fees: 0, transaction_type: 'expense', balance_after: 50000, sms: ''},
  ];

  it('anchors on the newest bank-reported balance and replays what came after', () => {
    // 50,000 − (5,000 + 100) − 2,000
    expect(replayBalance(history)).toEqual({
      balance: 42900,
      anchorDate: '2026-08-01',
      replayedCount: 2,
    });
  });

  it('is immune to which record was confirmed last', () => {
    // The whole reason the rule exists: pending records are confirmed in whatever order
    // they are recognised, so the same history must always produce the same balance.
    const anchorIsNewest = [
      {date_time: '2026-08-03', amount: 2000, fees: 0, transaction_type: 'expense', balance_after: 42900, sms: ''},
      ...history.slice(1),
    ];
    expect(replayBalance(anchorIsNewest)?.balance).toBe(42900);
  });

  it('reads the balance out of the SMS body when the column is null', () => {
    // Rows written before migration v8 added balance_after — the oldest ones, which are
    // exactly the ones a replay is most likely to have to anchor on.
    const rows = [
      {date_time: '2026-08-02', amount: 1000, fees: 0, transaction_type: 'expense', balance_after: null, sms: ''},
      {
        date_time: '2026-08-01',
        amount: 3000,
        fees: 0,
        transaction_type: 'expense',
        balance_after: null,
        sms: 'You have completed payment of 3,000 RWF. Balance: 61,811 RWF',
      },
    ];
    expect(replayBalance(rows)?.balance).toBe(60811);
  });

  it('leaves the stored balance alone when nothing can be anchored on', () => {
    // A manual-only account has no bank-reported balance anywhere, and writing a guess
    // there would be worse than writing nothing.
    expect(
      replayBalance([
        {date_time: '2026-08-02', amount: 1000, fees: 0, transaction_type: 'expense', balance_after: null, sms: ''},
      ]),
    ).toBeNull();
  });
});
