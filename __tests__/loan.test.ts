/**
 * Amortisation tests.
 *
 * These numbers get compared against a real lender's paper schedule, so "close enough"
 * is not a pass. Two things are pinned hardest: the closing balance must be exactly zero
 * (a final row reading "3" makes people distrust every other figure on the screen), and
 * the rows must sum to the totals displayed above them.
 */
import {
  buildSchedule,
  flatToReducingRatePct,
  levelPaymentFor,
  type LoanTerms,
} from '../shared/loan';

const base: LoanTerms = {
  principal: 1_000_000,
  annualRatePct: 12,
  termCount: 12,
  frequency: 'monthly',
  method: 'reducing',
  startDate: '2026-08-01T00:00:00.000Z',
};

describe('levelPaymentFor', () => {
  it('matches the annuity formula', () => {
    // 1,000,000 at 1% a month over 12 months.
    expect(Math.round(levelPaymentFor(1_000_000, 0.01, 12))).toBe(88_849);
  });

  it('handles a zero-rate loan without dividing by zero', () => {
    // An interest-free instalment plan is a real arrangement, and the general formula
    // would return NaN.
    expect(levelPaymentFor(1_200_000, 0, 12)).toBe(100_000);
  });
});

describe('buildSchedule — reducing balance', () => {
  const plan = buildSchedule(base);

  it('produces one row per instalment', () => {
    expect(plan.installments).toHaveLength(12);
  });

  it('closes at exactly zero', () => {
    expect(plan.installments[11].closing).toBe(0);
  });

  it('repays exactly the principal, no more and no less', () => {
    expect(plan.totalPrincipal).toBe(1_000_000);
  });

  it('charges falling interest and rising principal — the whole point of reducing', () => {
    const first = plan.installments[0];
    const last = plan.installments[11];
    expect(first.interest).toBeGreaterThan(last.interest);
    expect(first.principal).toBeLessThan(last.principal);
  });

  it('charges the first interest on the full principal', () => {
    expect(plan.installments[0].interest).toBe(10_000); // 1,000,000 × 1%
  });

  it('sums rows to the reported totals', () => {
    const rowSum = plan.installments.reduce((s, r) => s + r.total, 0);
    expect(rowSum).toBe(plan.totalRepaid);
  });
});

describe('buildSchedule — flat rate', () => {
  const plan = buildSchedule({...base, method: 'flat'});

  it('charges interest on the ORIGINAL principal for the whole term', () => {
    // 12% of 1,000,000 for one year = 120,000, regardless of repayment.
    expect(plan.totalInterest).toBe(120_000);
  });

  it('costs materially more than reducing at the same quoted rate', () => {
    // This is the trap the calculator exists to expose.
    const reducing = buildSchedule(base);
    expect(plan.totalInterest).toBeGreaterThan(reducing.totalInterest * 1.7);
  });

  it('keeps every payment identical except the last, which closes the balance', () => {
    // 1,000,000 / 12 leaves 4 francs that cannot be split evenly. Real lenders put the
    // remainder on the final instalment rather than leaving a balance outstanding, and so
    // does this — so "all payments identical" is the wrong assertion; "all but the last"
    // is the true one, and the last must differ by less than a franc per instalment.
    const totals = new Set(plan.installments.slice(0, -1).map(r => r.total));
    expect(totals.size).toBe(1);

    const regular = plan.installments[0].total;
    const final = plan.installments[plan.installments.length - 1].total;
    expect(Math.abs(final - regular)).toBeLessThan(plan.installments.length);
  });

  it('still closes at exactly zero', () => {
    expect(plan.installments[11].closing).toBe(0);
  });
});

describe('buildSchedule — equal principal', () => {
  const plan = buildSchedule({...base, method: 'equal_principal'});

  it('keeps the principal portion constant', () => {
    const principals = plan.installments.slice(0, 11).map(r => r.principal);
    expect(new Set(principals).size).toBe(1);
  });

  it('makes the TOTAL payment fall each period', () => {
    // The other meaning of "diminishing": here the payment itself shrinks.
    for (let i = 1; i < plan.installments.length; i++) {
      expect(plan.installments[i].total).toBeLessThanOrEqual(
        plan.installments[i - 1].total,
      );
    }
  });

  it('closes at exactly zero', () => {
    expect(plan.installments[11].closing).toBe(0);
  });
});

describe('management fees', () => {
  it('charges an upfront fee entirely on the first instalment', () => {
    const plan = buildSchedule({...base, managementFeePct: 2});
    expect(plan.installments[0].fee).toBe(20_000);
    expect(plan.installments[1].fee).toBe(0);
    expect(plan.totalFees).toBe(20_000);
  });

  it('divides a spread fee across every instalment', () => {
    const plan = buildSchedule({...base, managementFeePct: 2.4, feeTiming: 'spread'});
    expect(plan.installments[0].fee).toBe(2_000);
    expect(plan.installments[11].fee).toBe(2_000);
  });

  it('adds a flat fee on top of a percentage one', () => {
    const plan = buildSchedule({...base, managementFeePct: 1, managementFeeFlat: 5_000});
    expect(plan.totalFees).toBe(15_000);
  });

  it('counts fees in the total cost, since that is what the borrower actually pays', () => {
    const withFee = buildSchedule({...base, managementFeeFlat: 50_000});
    const without = buildSchedule(base);
    expect(withFee.totalRepaid - without.totalRepaid).toBe(50_000);
    expect(withFee.totalCostPct).toBeGreaterThan(without.totalCostPct);
  });
});

describe('dates', () => {
  it('starts on the given date and steps by the frequency', () => {
    const plan = buildSchedule({...base, frequency: 'monthly'});
    expect(plan.installments[0].dueDate.slice(0, 10)).toBe('2026-08-01');
    expect(plan.installments[1].dueDate.slice(0, 10)).toBe('2026-09-01');
  });

  it('steps weekly loans by seven days', () => {
    const plan = buildSchedule({...base, frequency: 'weekly', termCount: 4});
    expect(plan.installments[1].dueDate.slice(0, 10)).toBe('2026-08-08');
  });
});

describe('edge cases', () => {
  it('returns an empty plan for a zero-term loan rather than throwing', () => {
    const plan = buildSchedule({...base, termCount: 0});
    expect(plan.installments).toHaveLength(0);
  });

  it('handles a zero-interest instalment plan', () => {
    const plan = buildSchedule({...base, annualRatePct: 0});
    expect(plan.totalInterest).toBe(0);
    expect(plan.totalPrincipal).toBe(1_000_000);
    expect(plan.installments[11].closing).toBe(0);
  });

  it('never lets a payment exceed the balance owed', () => {
    const plan = buildSchedule({...base, termCount: 3});
    for (const r of plan.installments) {
      expect(r.principal).toBeLessThanOrEqual(r.opening);
      expect(r.closing).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('flatToReducingRatePct', () => {
  it('reveals what a flat quote really costs', () => {
    // The headline reason to show this: 12% flat is close to twice the rate it sounds.
    const equivalent = flatToReducingRatePct({...base, method: 'flat'});
    expect(equivalent).toBeGreaterThan(20);
    expect(equivalent).toBeLessThan(24);
  });

  it('returns null for a loan that is not flat', () => {
    expect(flatToReducingRatePct(base)).toBeNull();
  });

  it('returns zero for an interest-free flat loan', () => {
    expect(flatToReducingRatePct({...base, method: 'flat', annualRatePct: 0})).toBe(0);
  });
});
