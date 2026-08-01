// Loan amortization the way banks actually build schedules:
// daily interest accrual (actual/365) on the outstanding balance, payment
// dates anchored to month-end when the first due date is a month-end
// (BK-style: 30/11 → 31/12 → 31/01 → 28/02 …), and the installment solved so
// the balance reaches zero on the final payment (last row absorbs rounding).
//
// Lives in shared/ because the Android screens and the Next web app must show the
// SAME schedule for the same loan. A second implementation on the web is how ~423,000
// RWF ended up filed under the wrong categories in a single month; __tests__/
// sharedDrift.test.ts fails if the web's generated copy ever differs from this file.
//
// Three interest methods, because Rwandan lenders use all three and they are not close:
//
//   REDUCING (diminishing balance) — interest on what you still owe, so it falls each
//   period while the principal portion rises. The daily-accrual path below, verified
//   against a real Bank of Kigali paper schedule.
//
//   FLAT — interest charged on the ORIGINAL principal for the whole term, then split
//   evenly. Every instalment identical. Common in informal and SACCO lending, and far
//   more expensive than the quoted rate suggests: you keep paying interest on money you
//   have already repaid. flatToReducingRatePct() below exists to expose exactly that.
//
//   EQUAL PRINCIPAL — constant principal portion, interest on the falling balance, so
//   the TOTAL payment shrinks each period. The other thing people mean by "the payment
//   is not the same every month".
//
// Plus management fees, which lenders here add on top and which the headline rate hides.

export type InterestMethod = 'flat' | 'reducing' | 'equal_principal';
export type FeeTiming = 'upfront' | 'spread';

export interface AmortRow {
  n: number;
  due: Date;
  amount: number;    // installment, INCLUDING any fee charged this period
  interest: number;  // interest portion
  principal: number; // principal portion
  fee: number;       // management fee charged this period (0 on most rows)
  remaining: number; // balance after this payment
}

export interface AmortInput {
  principal: number;
  annualRatePct: number; // 17.5 for 17.5% p.a.
  term: number;          // number of payments
  cadence: 'Weekly' | 'Monthly' | 'One-off' | string;
  firstDue: Date;
  startDate?: Date;      // disbursement date; defaults to one period before firstDue
  /** Defaults to 'reducing' — the assumption least likely to overstate what is owed. */
  method?: InterestMethod;
  /** One-off management fee as a percentage of principal. */
  managementFeePct?: number;
  /** One-off management fee as a flat amount, added to any percentage fee. */
  managementFeeFlat?: number;
  /** 'upfront' charges it all on instalment 1; 'spread' divides it evenly. */
  feeTiming?: FeeTiming;
}

/** Everything the calculator card shows above the schedule. */
export interface LoanPlan {
  rows: AmortRow[];
  totalPrincipal: number;
  totalInterest: number;
  totalFees: number;
  totalRepaid: number;
  /** Cost over and above the principal, as a percentage of it. */
  totalCostPct: number;
  /** The regular payment for methods that have one; null when every row differs. */
  levelPayment: number | null;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isMonthEnd(d: Date): boolean {
  return d.getDate() === lastDayOfMonth(d.getFullYear(), d.getMonth());
}

// k-th due date after the first (k=0 → firstDue). Month-end first dues stay
// month-end (BK-style 30/11 → 31/12 → 28/02); other days clamp to the target
// month's length instead of overflowing (the old setMonth() bug turned
// "Aug 31 + 1 month" into Oct 1).
export function nthDue(firstDue: Date, cadence: string, k: number): Date {
  if (cadence === 'Weekly') {
    return new Date(firstDue.getTime() + k * 7 * 24 * 3600 * 1000);
  }
  const y = firstDue.getFullYear();
  const m = firstDue.getMonth() + k;
  if (isMonthEnd(firstDue)) {
    // last day of the target month
    return new Date(y, m + 1, 0);
  }
  const day = Math.min(firstDue.getDate(), new Date(y, m + 1, 0).getDate());
  return new Date(y, m, day);
}

const DAY_MS = 24 * 3600 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

// Simulate the schedule for a given constant installment; returns rows and
// the residual balance after the last scheduled payment.
function simulate(input: AmortInput, payment: number): {rows: AmortRow[]; residual: number} {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  const start = input.startDate ?? nthDue(firstDue, cadence, -1);
  const dailyRate = annualRatePct / 100 / 365;
  let bal = principal;
  let prev = start;
  const rows: AmortRow[] = [];
  for (let n = 1; n <= term; n++) {
    const due = nthDue(firstDue, cadence, n - 1);
    const interest = bal * dailyRate * daysBetween(prev, due);
    const isLast = n === term;
    // The final instalment is the balancing one: whatever is still owed, plus interest.
    const amount = isLast ? bal + interest : payment;
    const principalPart = amount - interest;
    // Balance tracking stays UNROUNDED deliberately. Rounding the payment to whole francs
    // before applying it shifts the residual by up to half a franc per period, and over a
    // 24-month term that drift lands entirely on the final instalment — which is how a
    // schedule verified against a real BK statement started reporting a final payment 7
    // francs above the regular one.
    bal = Math.max(0, bal - principalPart);
    const amountR = Math.round(amount);
    const interestR = Math.round(interest);
    rows.push({
      n,
      due,
      amount: amountR,
      // Derive principal from the two figures already rounded rather than rounding it
      // separately, so every row satisfies amount = principal + interest exactly. Three
      // independent roundings let a row's parts miss its own total, which is the fastest
      // way to make a correct schedule look broken.
      principal: amountR - interestR,
      interest: interestR,
      fee: 0,
      remaining: Math.round(bal),
    });
    prev = due;
  }
  return {rows, residual: bal};
}

/**
 * Build the full schedule for whichever interest method the loan uses.
 *
 * Fees are applied last, on top of whatever the method produced, because a management
 * fee is charged alongside the instalment rather than amortised into it.
 */
export function buildSchedule(input: AmortInput): AmortRow[] {
  if (input.term <= 0 || input.principal <= 0) {
    return [];
  }
  const method = input.method ?? 'reducing';
  const rows =
    method === 'flat'
      ? flatRows(input)
      : method === 'equal_principal'
      ? equalPrincipalRows(input)
      : reducingRows(input);
  return applyFees(rows, input);
}

/**
 * FLAT: interest on the original principal for the whole term, split evenly.
 *
 * Deliberately NOT daily-accrual — that would be a contradiction. A flat loan's interest
 * is fixed at signing and does not care what the balance does, which is precisely why it
 * costs so much more than it sounds.
 */
function flatRows(input: AmortInput): AmortRow[] {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  const periodsPerYear = cadence === 'Weekly' ? 52 : 12;
  const totalInterest = (principal * (annualRatePct || 0)) / 100 * (term / periodsPerYear);
  const perInterest = Math.round(totalInterest / term);
  const perPrincipal = Math.round(principal / term);
  let bal = principal;
  const rows: AmortRow[] = [];
  for (let n = 1; n <= term; n++) {
    // The final row absorbs the rounding remainder so the balance closes at exactly
    // zero. A schedule ending on "3 remaining" makes people distrust every other figure.
    const principalPart = n === term ? bal : Math.min(perPrincipal, bal);
    bal = Math.max(0, Math.round(bal - principalPart));
    rows.push({
      n,
      due: nthDue(firstDue, cadence, n - 1),
      amount: Math.round(principalPart + perInterest),
      interest: perInterest,
      principal: Math.round(principalPart),
      fee: 0,
      remaining: bal,
    });
  }
  return rows;
}

/** EQUAL PRINCIPAL: constant principal, daily-accrued interest, falling total. */
function equalPrincipalRows(input: AmortInput): AmortRow[] {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  const start = input.startDate ?? nthDue(firstDue, cadence, -1);
  const dailyRate = (annualRatePct || 0) / 100 / 365;
  const perPrincipal = Math.round(principal / term);
  let bal = principal;
  let prev = start;
  const rows: AmortRow[] = [];
  for (let n = 1; n <= term; n++) {
    const due = nthDue(firstDue, cadence, n - 1);
    const interest = bal * dailyRate * daysBetween(prev, due);
    const principalPart = n === term ? bal : Math.min(perPrincipal, bal);
    bal = Math.max(0, Math.round(bal - principalPart));
    const interestR = Math.round(interest);
    const principalR = Math.round(principalPart);
    rows.push({
      n,
      due,
      // Sum the rounded parts rather than rounding the sum, so the row adds up.
      amount: principalR + interestR,
      interest: interestR,
      principal: principalR,
      fee: 0,
      remaining: bal,
    });
    prev = due;
  }
  return rows;
}

/** Spread the management fee across the rows it is charged on. */
function applyFees(rows: AmortRow[], input: AmortInput): AmortRow[] {
  const feeTotal = Math.round(
    (input.principal * (input.managementFeePct || 0)) / 100 + (input.managementFeeFlat || 0),
  );
  if (feeTotal <= 0 || rows.length === 0) {
    return rows;
  }
  const spread = (input.feeTiming ?? 'upfront') === 'spread';
  const per = Math.round(feeTotal / rows.length);
  return rows.map((r, i) => {
    // Upfront fees land entirely on instalment 1. Spread fees put the rounding
    // remainder on the last row so the parts still sum to the quoted fee.
    const fee = spread
      ? i === rows.length - 1
        ? feeTotal - per * (rows.length - 1)
        : per
      : i === 0
      ? feeTotal
      : 0;
    return {...r, fee, amount: r.amount + fee};
  });
}

// REDUCING — the original daily-accrual path, verified against a real BK schedule.
// Zero-rate loans fall back to equal principal.
function reducingRows(input: AmortInput): AmortRow[] {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  if (annualRatePct <= 0) {
    const inst = Math.round(principal / term);
    let bal = principal;
    return Array.from({length: term}, (_, i) => {
      const isLast = i === term - 1;
      const amount = isLast ? bal : inst;
      bal = Math.max(0, bal - amount);
      return {
        n: i + 1,
        due: nthDue(firstDue, cadence, i),
        amount: Math.round(amount),
        interest: 0,
        principal: Math.round(amount),
        fee: 0,
        remaining: Math.round(bal),
      };
    });
  }

  // Start from the textbook annuity, then Newton-step the payment until the
  // daily-accrual simulation lands on zero (the long/short first period and
  // month lengths shift it away from the closed-form value).
  const periodsPerYear = cadence === 'Weekly' ? 52 : 12;
  const i = annualRatePct / 100 / periodsPerYear;
  let payment = (principal * i) / (1 - Math.pow(1 + i, -term));
  for (let iter = 0; iter < 8; iter++) {
    // residual BEFORE the final balancing payment: simulate with a plain
    // constant payment (no last-row absorption) to measure the drift.
    const probe = simulateConstant(input, payment);
    if (Math.abs(probe) < 1) {
      break;
    }
    payment += probe / term;
  }
  return simulate(input, payment).rows;
}

function simulateConstant(input: AmortInput, payment: number): number {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  const start = input.startDate ?? nthDue(firstDue, cadence, -1);
  const dailyRate = annualRatePct / 100 / 365;
  let bal = principal;
  let prev = start;
  for (let n = 1; n <= term; n++) {
    const due = nthDue(firstDue, cadence, n - 1);
    bal += bal * dailyRate * daysBetween(prev, due);
    bal -= payment;
    prev = due;
  }
  return bal;
}

// Schedule for a USER-CHOSEN installment (overrides the solved payment);
// the final row still absorbs the residual so the loan closes at zero.
export function buildScheduleWithPayment(input: AmortInput, payment: number): AmortRow[] {
  if (input.term <= 0 || input.principal <= 0) {
    return [];
  }
  return applyFees(simulate(input, payment).rows, input);
}

/**
 * Schedule where individual instalments have been overridden by hand.
 *
 * Real repayment plans are not always uniform: a lender may front-load, a borrower may
 * agree a smaller payment in a lean month, or the paper schedule may simply disagree with
 * the arithmetic. Editing one row changes the interest on every row below it, so the
 * schedule has to be re-walked rather than patched — replacing a single amount in place
 * would leave every balance beneath it wrong.
 *
 * `overrides` is indexed by instalment number (1-based). Rows without an override use the
 * solved payment, and the final row still balances unless it was itself overridden. If
 * the edited payments do not clear the loan, the last row's `remaining` says so instead
 * of being quietly forced to zero — that residual is the useful part of the answer.
 */
export function buildScheduleWithOverrides(
  input: AmortInput,
  overrides: Record<number, number>,
): AmortRow[] {
  const base = buildSchedule(input);
  if (base.length === 0 || Object.keys(overrides).length === 0) {
    return base;
  }
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  const start = input.startDate ?? nthDue(firstDue, cadence, -1);
  const dailyRate = annualRatePct / 100 / 365;
  const flat = (input.method ?? 'reducing') === 'flat';
  let bal = principal;
  let prev = start;
  const rows: AmortRow[] = [];
  for (let n = 1; n <= term; n++) {
    const due = nthDue(firstDue, cadence, n - 1);
    // A flat loan's interest is fixed at signing and does not respond to the balance, so
    // paying more early does not reduce it. Keeping the original interest here is what
    // makes the edited schedule still describe a flat loan.
    const interest = flat
      ? base[n - 1].interest
      : bal * dailyRate * daysBetween(prev, due);
    const fee = base[n - 1].fee;
    const override = overrides[n];
    const isLast = n === term;
    const gross =
      override !== undefined ? override : isLast ? bal + interest + fee : base[n - 1].amount;
    // The fee rides on top of the instalment; only the rest services the loan.
    const principalPart = Math.max(0, Math.min(gross - interest - fee, bal));
    bal = Math.max(0, bal - principalPart);
    const interestR = Math.round(interest);
    const principalR = Math.round(principalPart);
    rows.push({
      n,
      due,
      amount: principalR + interestR + fee,
      interest: interestR,
      principal: principalR,
      fee,
      remaining: Math.round(bal),
    });
    prev = due;
  }
  return rows;
}

/**
 * Schedule plus the totals a borrower actually wants to know before signing.
 *
 * Totals are summed from the ROWS rather than computed independently, so the figures in
 * the summary card and the figures in the table below it can never disagree.
 */
export function buildPlan(input: AmortInput, payment?: number): LoanPlan {
  const rows =
    payment && payment > 0
      ? buildScheduleWithPayment(input, payment)
      : buildSchedule(input);
  // Each figure comes from the source that is actually true for it, so no two can
  // contradict: the principal is what was borrowed, the total repaid is the sum of the
  // instalment column the user can add up by hand, and the interest is the difference
  // between them. Summing the rounded principal column instead would report a 1,000,000
  // loan as 1,000,003 borrowed; deriving the total from the parts would print a total the
  // column below it does not add up to. The few francs of per-row rounding land in the
  // interest figure, where over a year they are genuinely immaterial.
  const principal = Math.max(0, input.principal || 0);
  const totalFees = rows.reduce((s, r) => s + r.fee, 0);
  const totalRepaid = rows.reduce((s, r) => s + r.amount, 0);
  const totalPrincipal = principal;
  const totalInterest = totalRepaid - totalPrincipal - totalFees;
  // A "level payment" only exists if the rows agree. Flat loans have one; equal-principal
  // loans never do; reducing loans have one except for the balancing final row.
  const regular = rows.length > 1 ? rows[0].amount : rows[0]?.amount ?? 0;
  const level =
    rows.length > 1 && rows.slice(0, -1).every(r => r.amount === regular) ? regular : null;
  return {
    rows,
    totalPrincipal,
    totalInterest,
    totalFees,
    totalRepaid,
    totalCostPct: principal > 0 ? ((totalInterest + totalFees) / principal) * 100 : 0,
    levelPayment: level,
  };
}

/**
 * What a flat quote really costs, expressed as the reducing rate with the same interest.
 *
 * The single most useful number on the calculator: a flat rate is the most common way a
 * borrower here underestimates a loan, because "10% a year" flat costs roughly what an
 * 18% reducing loan costs. Solved by bisection — there is no closed form, and 60
 * iterations is instant and exact to far under a franc.
 */
export function flatToReducingRatePct(input: AmortInput): number | null {
  if ((input.method ?? 'reducing') !== 'flat' || input.principal <= 0 || input.term <= 0) {
    return null;
  }
  const bare = {...input, managementFeePct: 0, managementFeeFlat: 0};
  const target = buildPlan(bare).totalInterest;
  if (target <= 0) {
    return 0;
  }
  let lo = 0;
  let hi = 300;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const interest = buildPlan({...bare, method: 'reducing', annualRatePct: mid})
      .totalInterest;
    if (interest < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// Outstanding balance after `paidCount` payments of an existing schedule —
// walks the actual stored rows with daily accrual, so interest-bearing loans
// don't pretend every franc paid was principal.
export function outstandingAfter(
  principal: number,
  annualRatePct: number,
  rows: {due_date: string; amount: number}[],
  paidCount: number,
  startDate?: Date,
): number {
  if (annualRatePct <= 0) {
    const paidSum = rows.slice(0, paidCount).reduce((s, r) => s + (r.amount ?? 0), 0);
    return Math.max(0, Math.round(principal - paidSum));
  }
  const dailyRate = annualRatePct / 100 / 365;
  const sorted = [...rows].sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  let bal = principal;
  let prev =
    startDate ??
    (sorted[0]
      ? new Date(new Date(sorted[0].due_date).getTime() - 30 * DAY_MS)
      : new Date());
  for (let k = 0; k < Math.min(paidCount, sorted.length); k++) {
    const due = new Date(sorted[k].due_date);
    const interest = bal * dailyRate * daysBetween(prev, due);
    bal = Math.max(0, bal + interest - (sorted[k].amount ?? 0));
    prev = due;
  }
  return Math.round(bal);
}
