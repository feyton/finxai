/**
 * Amortization vs a REAL Bank of Kigali schedule (BKQuick+, 17.5% p.a.):
 * principal 15,846,245 · 24 monthly payments · disbursed 23/10/2025 ·
 * first due 30/11/2025 · installments ≈ 783k–806k · balance after 8
 * payments 11,192,546 · dues anchored to month-end.
 */
import {
  buildPlan,
  buildSchedule,
  buildScheduleWithOverrides,
  flatToReducingRatePct,
  isMonthEnd,
  nthDue,
  outstandingAfter,
} from '../shared/amortize';

const BK = {
  principal: 15_846_245,
  annualRatePct: 17.5,
  term: 24,
  cadence: 'Monthly' as const,
  startDate: new Date(2025, 9, 23), // 23 Oct 2025
  firstDue: new Date(2025, 10, 30), // 30 Nov 2025
};

describe('month-end date anchoring', () => {
  it('follows BK month-ends: 30/11 → 31/12 → 31/01 → 28/02', () => {
    expect(nthDue(BK.firstDue, 'Monthly', 1).toDateString()).toBe(new Date(2025, 11, 31).toDateString());
    expect(nthDue(BK.firstDue, 'Monthly', 2).toDateString()).toBe(new Date(2026, 0, 31).toDateString());
    expect(nthDue(BK.firstDue, 'Monthly', 3).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
    expect(nthDue(BK.firstDue, 'Monthly', 23).toDateString()).toBe(new Date(2027, 9, 31).toDateString());
  });

  it('never overflows months for non-month-end dues (Jan 30 → Feb 28)', () => {
    const jan30 = new Date(2026, 0, 30);
    expect(nthDue(jan30, 'Monthly', 1).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
    expect(isMonthEnd(new Date(2026, 1, 28))).toBe(true);
  });
});

describe('BK loan schedule', () => {
  const rows = buildSchedule(BK);

  it('has 24 rows ending at zero', () => {
    expect(rows).toHaveLength(24);
    expect(rows[23].remaining).toBe(0);
  });

  it('installment lands near the bank’s (~799k avg, we tolerate 2.5%)', () => {
    const bankAvg = 798_900;
    expect(Math.abs(rows[0].amount - bankAvg) / bankAvg).toBeLessThan(0.025);
  });

  it('balance after 8 payments ≈ 11,192,546 (±2%)', () => {
    const bank = 11_192_546;
    expect(Math.abs(rows[7].remaining - bank) / bank).toBeLessThan(0.02);
  });

  it('balance after 1 payment ≈ 15,344,921 (±1%) — long first period accrues more interest', () => {
    const bank = 15_344_921;
    expect(Math.abs(rows[0].remaining - bank) / bank).toBeLessThan(0.01);
  });

  it('final payment is the smallest (absorbs the residual)', () => {
    const last = rows[23].amount;
    for (let i = 0; i < 23; i++) {
      expect(last).toBeLessThanOrEqual(rows[i].amount + 1);
    }
  });
});

describe('outstandingAfter (imports mid-loan)', () => {
  it('matches the amortized balance, not principal − n×installment', () => {
    const rows = buildSchedule(BK).map(r => ({
      due_date: r.due.toISOString(),
      amount: r.amount,
    }));
    const out = outstandingAfter(BK.principal, BK.annualRatePct, rows, 8, BK.startDate);
    const bank = 11_192_546;
    expect(Math.abs(out - bank) / bank).toBeLessThan(0.02);
    // the naive formula is off by ~1.8M — make sure we're not doing that
    const naive = BK.principal - rows[0].amount * 8;
    expect(Math.abs(naive - bank)).toBeGreaterThan(1_000_000);
  });

  it('zero-rate loans still subtract payments directly', () => {
    const rows = [
      {due_date: '2026-01-31', amount: 100_000},
      {due_date: '2026-02-28', amount: 100_000},
    ];
    expect(outstandingAfter(300_000, 0, rows, 2)).toBe(100_000);
  });
});

/**
 * The other two interest methods, management fees, and the flat→reducing conversion.
 *
 * These arrived with the loan planner. They live in this file rather than a separate one
 * because there is exactly ONE amortisation engine, and splitting its tests across two
 * files is how a second engine quietly grows back.
 */
const LOAN = {
  principal: 1_000_000,
  annualRatePct: 12,
  term: 12,
  cadence: 'Monthly' as const,
  startDate: new Date(2026, 7, 1),
  firstDue: new Date(2026, 8, 1),
};

describe('flat rate', () => {
  const rows = buildSchedule({...LOAN, method: 'flat'});

  it('charges interest on the ORIGINAL principal for the whole term', () => {
    // 12% of 1,000,000 over one year = 120,000, regardless of what is repaid.
    const total = rows.reduce((s, r) => s + r.interest, 0);
    expect(total).toBe(120_000);
  });

  it('costs materially more than reducing at the same quoted rate', () => {
    // The trap the calculator exists to expose.
    const reducing = buildSchedule(LOAN).reduce((s, r) => s + r.interest, 0);
    expect(rows.reduce((s, r) => s + r.interest, 0)).toBeGreaterThan(reducing * 1.7);
  });

  it('keeps every payment identical except the balancing final one', () => {
    // 1,000,000 / 12 leaves a remainder that cannot be split evenly. Real lenders put it
    // on the last instalment rather than leave a balance outstanding, so "all payments
    // identical" is the wrong assertion — "all but the last" is the true one.
    expect(new Set(rows.slice(0, -1).map(r => r.amount)).size).toBe(1);
    expect(Math.abs(rows[rows.length - 1].amount - rows[0].amount)).toBeLessThan(rows.length);
  });

  it('closes at exactly zero', () => {
    expect(rows[rows.length - 1].remaining).toBe(0);
  });
});

describe('equal principal', () => {
  const rows = buildSchedule({...LOAN, method: 'equal_principal'});

  it('keeps the principal portion constant', () => {
    expect(new Set(rows.slice(0, -1).map(r => r.principal)).size).toBe(1);
  });

  it('makes the TOTAL payment fall each period', () => {
    // The other meaning of "diminishing": here the payment itself shrinks.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].amount).toBeLessThanOrEqual(rows[i - 1].amount);
    }
  });

  it('closes at exactly zero', () => {
    expect(rows[rows.length - 1].remaining).toBe(0);
  });
});

describe('management fees', () => {
  it('charges an upfront fee entirely on the first instalment', () => {
    const rows = buildSchedule({...LOAN, managementFeePct: 2});
    expect(rows[0].fee).toBe(20_000);
    expect(rows[1].fee).toBe(0);
  });

  it('divides a spread fee across every instalment', () => {
    const rows = buildSchedule({...LOAN, managementFeePct: 2.4, feeTiming: 'spread'});
    expect(rows[0].fee).toBe(2_000);
    expect(rows.reduce((s, r) => s + r.fee, 0)).toBe(24_000);
  });

  it('adds a flat fee on top of a percentage one', () => {
    const rows = buildSchedule({...LOAN, managementFeePct: 1, managementFeeFlat: 5_000});
    expect(rows.reduce((s, r) => s + r.fee, 0)).toBe(15_000);
  });

  it('includes the fee in the instalment the borrower actually pays', () => {
    const withFee = buildSchedule({...LOAN, managementFeeFlat: 50_000});
    const without = buildSchedule(LOAN);
    expect(withFee[0].amount - without[0].amount).toBe(50_000);
  });

  it('leaves the schedule alone when there is no fee', () => {
    // Guards the additive promise: existing debts must be unaffected.
    expect(buildSchedule(LOAN).every(r => r.fee === 0)).toBe(true);
  });
});

describe('buildPlan totals', () => {
  it('sums the rows it displays, so the card and the table cannot disagree', () => {
    const plan = buildPlan({...LOAN, managementFeeFlat: 10_000});
    expect(plan.totalRepaid).toBe(plan.rows.reduce((s, r) => s + r.amount, 0));
    expect(plan.totalPrincipal).toBe(1_000_000);
    expect(plan.totalFees).toBe(10_000);
  });

  it('reports a level payment for flat loans and none for equal-principal ones', () => {
    expect(buildPlan({...LOAN, method: 'flat'}).levelPayment).not.toBeNull();
    expect(buildPlan({...LOAN, method: 'equal_principal'}).levelPayment).toBeNull();
  });

  it('counts fees in the cost percentage, since that is what is actually paid', () => {
    const withFee = buildPlan({...LOAN, managementFeeFlat: 50_000});
    expect(withFee.totalCostPct).toBeGreaterThan(buildPlan(LOAN).totalCostPct);
  });
});

describe('flatToReducingRatePct', () => {
  it('reveals what a flat quote really costs', () => {
    // The headline reason to show it: 12% flat is close to twice the rate it sounds.
    const equivalent = flatToReducingRatePct({...LOAN, method: 'flat'});
    expect(equivalent).toBeGreaterThan(20);
    expect(equivalent).toBeLessThan(24);
  });

  it('returns null for a loan that is not flat', () => {
    expect(flatToReducingRatePct(LOAN)).toBeNull();
  });

  it('returns zero for an interest-free flat loan', () => {
    expect(flatToReducingRatePct({...LOAN, method: 'flat', annualRatePct: 0})).toBe(0);
  });
});

describe('hand-edited schedules', () => {
  it('returns the untouched schedule when nothing is overridden', () => {
    expect(buildScheduleWithOverrides(LOAN, {})).toEqual(buildSchedule(LOAN));
  });

  it('honours the edited amount on the row it was set on', () => {
    const rows = buildScheduleWithOverrides(LOAN, {3: 200_000});
    expect(rows[2].amount).toBe(200_000);
  });

  it('re-walks the balances below an edit instead of patching one row', () => {
    // The whole reason this function exists: paying 200,000 in month 3 must leave less
    // owed for the rest of the loan, not just change one cell.
    const edited = buildScheduleWithOverrides(LOAN, {3: 200_000});
    const plain = buildSchedule(LOAN);
    expect(edited[3].remaining).toBeLessThan(plain[3].remaining);
    expect(edited[6].remaining).toBeLessThan(plain[6].remaining);
  });

  it('charges less interest afterwards, because less is owed', () => {
    const edited = buildScheduleWithOverrides(LOAN, {2: 300_000});
    const plain = buildSchedule(LOAN);
    expect(edited[5].interest).toBeLessThan(plain[5].interest);
  });

  it('reports the shortfall when the edits do not clear the loan', () => {
    // Underpaying every month should leave a balance standing, not be silently forced
    // to zero — the residual is the useful part of the answer.
    const rows = buildScheduleWithOverrides(
      LOAN,
      Object.fromEntries(Array.from({length: 12}, (_, i) => [i + 1, 50_000])),
    );
    expect(rows[11].remaining).toBeGreaterThan(0);
  });

  it('leaves a flat loan flat: early payment does not cut fixed interest', () => {
    // Flat interest is set at signing and does not respond to the balance. If editing a
    // row reduced it, the schedule would stop describing the loan the borrower signed.
    const flat = {...LOAN, method: 'flat' as const};
    const edited = buildScheduleWithOverrides(flat, {2: 300_000});
    expect(edited[5].interest).toBe(buildSchedule(flat)[5].interest);
  });

  it('keeps the fee on its row and out of the principal', () => {
    const withFee = {...LOAN, managementFeeFlat: 30_000};
    const rows = buildScheduleWithOverrides(withFee, {1: 120_000});
    expect(rows[0].fee).toBe(30_000);
    expect(rows[0].principal + rows[0].interest + rows[0].fee).toBe(rows[0].amount);
  });
});
