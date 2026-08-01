// Find charges that repeat on a rhythm, from transaction history.
//
// WHY: the Schedule screen queries scheduled_payments, subscriptions and
// debt_schedules — all three of which only ever contain what someone typed in by hand.
// Nobody ever did, so the screen has always been empty and reads as a dead feature.
// Meanwhile the recurring payments are sitting in plain sight in the transaction list:
// a domain renewal, a TV subscription, a loan instalment.
//
// This proposes them. It never writes anything: a detection is a suggestion the user
// accepts, because guessing wrong and silently creating a scheduled payment would be
// worse than showing nothing.
//
// Pure — no database, no React — so the interval logic is unit-testable, which matters
// because "does this look monthly" is exactly the kind of judgement that is easy to get
// subtly wrong and impossible to eyeball afterwards.

export interface RecurringTxn {
  merchant: string | null;
  payee: string | null;
  amount: number | null;
  date_time: string | null;
  category: string | null;
  account_id: string | null;
  transaction_type: string | null;
}

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringCandidate {
  /** Normalised key used for grouping — lowercase merchant. */
  key: string;
  /** Display name, taken from the most recent occurrence. */
  name: string;
  cadence: Cadence;
  /** Median amount, which resists a single unusual charge skewing it. */
  amount: number;
  category: string | null;
  accountId: string | null;
  occurrences: number;
  lastSeen: string;
  /** Projected next date, from the last occurrence plus the cadence. */
  nextDue: string;
}

// Day gaps each cadence accepts. Deliberately wide: a "monthly" bill lands anywhere from
// the 28th to the 3rd depending on weekends and how the biller batches, and a window
// narrow enough to be elegant would reject most real subscriptions.
const CADENCES: {cadence: Cadence; min: number; max: number; step: number}[] = [
  {cadence: 'weekly', min: 5, max: 9, step: 7},
  {cadence: 'monthly', min: 24, max: 38, step: 30},
  {cadence: 'quarterly', min: 80, max: 100, step: 91},
  {cadence: 'yearly', min: 330, max: 400, step: 365},
];

function median(nums: number[]): number {
  if (nums.length === 0) {
    return 0;
  }
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function normaliseKey(t: RecurringTxn): string {
  return (t.merchant || t.payee || '').trim().toLowerCase();
}

/**
 * Group expenses by counterparty and return those that look scheduled.
 *
 * Requires at least `minOccurrences` charges whose gaps agree on one cadence. Two
 * charges a month apart is a coincidence; three is a pattern.
 */
export function detectRecurring(
  txns: RecurringTxn[],
  opts: {minOccurrences?: number; now?: Date} = {},
): RecurringCandidate[] {
  const minOccurrences = opts.minOccurrences ?? 3;
  const now = opts.now ?? new Date();

  const groups = new Map<string, RecurringTxn[]>();
  for (const t of txns) {
    // Expenses only. Income arriving monthly is a salary, not something to remind
    // someone to pay, and transfers between own accounts are not payments at all.
    if (t.transaction_type !== 'expense') {
      continue;
    }
    const key = normaliseKey(t);
    if (!key || !t.date_time) {
      continue;
    }
    const list = groups.get(key);
    if (list) {
      list.push(t);
    } else {
      groups.set(key, [t]);
    }
  }

  const out: RecurringCandidate[] = [];
  for (const [key, list] of groups) {
    if (list.length < minOccurrences) {
      continue;
    }
    const sorted = [...list].sort(
      (a, b) => new Date(a.date_time!).getTime() - new Date(b.date_time!).getTime(),
    );
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days =
        (new Date(sorted[i].date_time!).getTime() -
          new Date(sorted[i - 1].date_time!).getTime()) /
        86400_000;
      gaps.push(days);
    }
    if (gaps.length === 0) {
      continue;
    }

    // A cadence wins only if MOST gaps fit it. Requiring every gap would reject a real
    // subscription that was paid late once; requiring any would match noise.
    let best: {cadence: Cadence; step: number} | null = null;
    for (const c of CADENCES) {
      const fits = gaps.filter(g => g >= c.min && g <= c.max).length;
      if (fits / gaps.length >= 0.6) {
        best = {cadence: c.cadence, step: c.step};
        break;
      }
    }
    if (!best) {
      continue;
    }

    const last = sorted[sorted.length - 1];
    const lastDate = new Date(last.date_time!);

    // Project forward from the last occurrence until the date is in the future, so a
    // series that lapsed months ago still proposes a sensible next date rather than one
    // in the past.
    const next = new Date(lastDate);
    while (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + best.step);
    }

    out.push({
      key,
      name: last.merchant || last.payee || key,
      cadence: best.cadence,
      amount: median(sorted.map(t => Math.abs(t.amount ?? 0))),
      category: last.category,
      accountId: last.account_id,
      occurrences: sorted.length,
      lastSeen: last.date_time!,
      nextDue: next.toISOString(),
    });
  }

  // Biggest first — a 23,000 domain renewal matters more than a 500 recurring snack.
  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * The k-th occurrence of a schedule on or after `from`.
 *
 * Month arithmetic is the only subtle part: naively adding a month to 31 January lands
 * on 3 March, because JavaScript rolls the overflow forward. Clamping to the target
 * month's last day is what people actually mean by "the 31st of every month".
 */
export function nextOccurrence(from: Date, frequency: string, k: number): Date {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + k);
      return d;
    case 'weekly':
      d.setDate(d.getDate() + 7 * k);
      return d;
    case 'yearly':
      d.setFullYear(d.getFullYear() + k);
      return d;
    case 'monthly': {
      const target = new Date(from.getFullYear(), from.getMonth() + k, 1);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(from.getDate(), lastDay));
      return target;
    }
    default:
      // 'once' and anything unrecognised: there is no next one.
      return d;
  }
}

/** How many times a year a frequency fires. 0 for one-off, which has no annual cost. */
export const PER_YEAR: Record<string, number> = {
  daily: 365,
  weekly: 52,
  monthly: 12,
  yearly: 1,
  once: 0,
};
