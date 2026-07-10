/**
 * Amortization vs a REAL Bank of Kigali schedule (BKQuick+, 17.5% p.a.):
 * principal 15,846,245 · 24 monthly payments · disbursed 23/10/2025 ·
 * first due 30/11/2025 · installments ≈ 783k–806k · balance after 8
 * payments 11,192,546 · dues anchored to month-end.
 */
import {buildSchedule, isMonthEnd, nthDue, outstandingAfter} from '../src/tools/amortize';

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
