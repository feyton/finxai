// Loan amortisation. Shared by the React Native app and the Next web app so a schedule
// shown in one place is the schedule shown in the other.
//
// Two interest methods, because Rwandan lenders use both and they are not close:
//
//   FLAT — interest is charged on the ORIGINAL principal for the whole term, then split
//   evenly. Every instalment is identical. Common with informal and some SACCO lending,
//   and much more expensive than the quoted rate suggests: 10% flat over a year costs
//   roughly what an 18% reducing loan costs, because you keep paying interest on money
//   you have already repaid.
//
//   REDUCING (diminishing balance) — interest is charged on what you still owe, so it
//   falls every period while the principal portion rises. This is what the user meant by
//   "each month payment is not the same": with a level payment the SPLIT changes, and
//   with an equal-principal schedule the payment itself changes.
//
// Plus management fees, which lenders here commonly add on top and which are invisible in
// the headline rate.
//
// Pure: no dates library, no framework, no rounding surprises left to the caller. Every
// number a screen displays comes from here, so the two apps cannot drift apart on the
// arithmetic.

export type InterestMethod = 'flat' | 'reducing' | 'equal_principal';
export type LoanFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type FeeTiming = 'upfront' | 'spread';

export interface LoanTerms {
  principal: number;
  /** Nominal annual rate as a percentage, e.g. 16 for 16%. */
  annualRatePct: number;
  /** Number of instalments, not years. */
  termCount: number;
  frequency: LoanFrequency;
  method: InterestMethod;
  /** One-off management fee as a percentage of principal. */
  managementFeePct?: number;
  /** One-off management fee as a flat amount, added to any percentage fee. */
  managementFeeFlat?: number;
  /** 'upfront' charges it all with the first instalment; 'spread' divides it evenly. */
  feeTiming?: FeeTiming;
  /** ISO date of the FIRST instalment. */
  startDate: string;
}

export interface Installment {
  /** 1-based instalment number. */
  n: number;
  dueDate: string;
  /** Balance owed before this payment. */
  opening: number;
  principal: number;
  interest: number;
  fee: number;
  total: number;
  /** Balance owed after this payment. Zero on the final row, always. */
  closing: number;
}

export interface LoanPlan {
  installments: Installment[];
  totalPrincipal: number;
  totalInterest: number;
  totalFees: number;
  totalRepaid: number;
  /** Total cost over and above the principal, as a percentage of it. */
  totalCostPct: number;
  /** Level payment for methods that have one; null when payments vary. */
  levelPayment: number | null;
}

export const PERIODS_PER_YEAR: Record<LoanFrequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/** Whole francs. RWF has no practical subunit, and lenders here quote whole numbers. */
function round(n: number): number {
  return Math.round(n);
}

function addPeriods(startISO: string, frequency: LoanFrequency, periods: number): string {
  const d = new Date(startISO);
  if (Number.isNaN(d.getTime())) {
    return startISO;
  }
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7 * periods);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + periods);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3 * periods);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + periods);
      break;
  }
  return d.toISOString();
}

/**
 * Level payment for a reducing-balance loan.
 *
 * Standard annuity formula. The zero-rate case is separated because the general form
 * divides by the rate and would produce NaN — an interest-free instalment plan is a real
 * thing people record.
 */
export function levelPaymentFor(principal: number, periodicRate: number, n: number): number {
  if (n <= 0) {
    return 0;
  }
  if (periodicRate <= 0) {
    return principal / n;
  }
  return (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -n));
}

/**
 * Build the full repayment schedule.
 *
 * Rounding is handled by making the LAST instalment absorb the accumulated difference, so
 * the closing balance is exactly zero and the rows sum to the totals shown above them. A
 * schedule whose final balance reads "3" because of per-row rounding looks broken and
 * invites people to distrust every other number on the screen.
 */
export function buildSchedule(terms: LoanTerms): LoanPlan {
  const principal = Math.max(0, terms.principal || 0);
  const n = Math.max(0, Math.floor(terms.termCount || 0));
  const periodsPerYear = PERIODS_PER_YEAR[terms.frequency] ?? 12;
  const periodicRate = (terms.annualRatePct || 0) / 100 / periodsPerYear;

  const feeTotal = round(
    (principal * (terms.managementFeePct || 0)) / 100 + (terms.managementFeeFlat || 0),
  );
  const feeTiming: FeeTiming = terms.feeTiming ?? 'upfront';

  const empty: LoanPlan = {
    installments: [],
    totalPrincipal: principal,
    totalInterest: 0,
    totalFees: feeTotal,
    totalRepaid: principal + feeTotal,
    totalCostPct: principal > 0 ? (feeTotal / principal) * 100 : 0,
    levelPayment: null,
  };
  if (n === 0 || principal === 0) {
    return empty;
  }

  const rows: Installment[] = [];
  let balance = principal;
  let levelPayment: number | null = null;

  // Interest for the whole term, charged on the original principal — the defining
  // property of a flat loan.
  const flatTotalInterest =
    terms.method === 'flat' ? (principal * (terms.annualRatePct || 0) / 100) * (n / periodsPerYear) : 0;

  if (terms.method === 'reducing') {
    levelPayment = round(levelPaymentFor(principal, periodicRate, n));
  } else if (terms.method === 'flat') {
    levelPayment = round((principal + flatTotalInterest) / n);
  }

  for (let i = 1; i <= n; i++) {
    const opening = balance;
    let interest: number;
    let principalPart: number;

    if (terms.method === 'flat') {
      interest = round(flatTotalInterest / n);
      principalPart = round(principal / n);
    } else if (terms.method === 'equal_principal') {
      // Equal principal, falling payment — the other shape of "diminishing", and the one
      // where the TOTAL changes each period rather than just the split.
      principalPart = round(principal / n);
      interest = round(opening * periodicRate);
    } else {
      interest = round(opening * periodicRate);
      principalPart = round((levelPayment ?? 0) - interest);
    }

    const fee =
      feeTiming === 'spread'
        ? round(feeTotal / n)
        : i === 1
        ? feeTotal
        : 0;

    // Final instalment absorbs every accumulated rounding difference so the balance
    // closes at exactly zero.
    if (i === n) {
      principalPart = opening;
    }
    principalPart = Math.min(principalPart, opening);

    balance = round(opening - principalPart);
    rows.push({
      n: i,
      dueDate: addPeriods(terms.startDate, terms.frequency, i - 1),
      opening,
      principal: principalPart,
      interest,
      fee,
      total: principalPart + interest + fee,
      closing: balance,
    });
  }

  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalFees = rows.reduce((s, r) => s + r.fee, 0);
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const totalRepaid = totalPrincipal + totalInterest + totalFees;

  return {
    installments: rows,
    totalPrincipal,
    totalInterest,
    totalFees,
    totalRepaid,
    totalCostPct: principal > 0 ? ((totalInterest + totalFees) / principal) * 100 : 0,
    levelPayment,
  };
}

/**
 * What a flat rate really costs, expressed as the reducing rate with the same total
 * interest.
 *
 * Worth showing because a flat quote is the most common way a borrower here
 * underestimates a loan — "10% a year" on a flat basis is close to 18% reducing. Solved
 * by bisection rather than algebraically: there is no closed form, and 60 iterations is
 * instant and exact to well under a franc.
 */
export function flatToReducingRatePct(terms: LoanTerms): number | null {
  if (terms.method !== 'flat' || terms.principal <= 0 || terms.termCount <= 0) {
    return null;
  }
  const target = buildSchedule(terms).totalInterest;
  if (target <= 0) {
    return 0;
  }
  let lo = 0;
  let hi = 300;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const interest = buildSchedule({
      ...terms,
      method: 'reducing',
      annualRatePct: mid,
      managementFeePct: 0,
      managementFeeFlat: 0,
    }).totalInterest;
    if (interest < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
