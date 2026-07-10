// Loan amortization the way banks actually build schedules:
// daily interest accrual (actual/365) on the outstanding balance, payment
// dates anchored to month-end when the first due date is a month-end
// (BK-style: 30/11 → 31/12 → 31/01 → 28/02 …), and the installment solved so
// the balance reaches zero on the final payment (last row absorbs rounding).

export interface AmortRow {
  n: number;
  due: Date;
  amount: number;    // installment
  interest: number;  // interest portion
  principal: number; // principal portion
  remaining: number; // balance after this payment
}

export interface AmortInput {
  principal: number;
  annualRatePct: number; // 17.5 for 17.5% p.a.
  term: number;          // number of payments
  cadence: 'Weekly' | 'Monthly' | 'One-off' | string;
  firstDue: Date;
  startDate?: Date;      // disbursement date; defaults to one period before firstDue
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
    const amount = isLast ? bal + interest : payment;
    const principalPart = amount - interest;
    bal = Math.max(0, bal - principalPart);
    rows.push({
      n,
      due,
      amount: Math.round(amount),
      interest: Math.round(interest),
      principal: Math.round(principalPart),
      remaining: Math.round(bal),
    });
    prev = due;
  }
  return {rows, residual: bal};
}

// Build the full schedule. Zero-rate loans fall back to equal principal.
export function buildSchedule(input: AmortInput): AmortRow[] {
  const {principal, annualRatePct, term, cadence, firstDue} = input;
  if (term <= 0 || principal <= 0) {
    return [];
  }
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
  return simulate(input, payment).rows;
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
