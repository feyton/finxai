// The account-balance rule — anchor on the newest bank-reported balance, then replay
// every movement recorded after it. Pure: no database, no React Native.
//
// WHY IT LIVES HERE: both clients confirm SMS records now. The phone writes through
// PowerSync (src/tools/balance.ts), the web through supabase-js
// (apps/web/src/lib/reviewActions.ts), and the two must leave
// accounts.available_balance holding the SAME number afterwards. Only the two lines of
// I/O differ per client; the rule itself must not exist twice.
//
// Why anchor-and-replay rather than "write whatever this SMS reports": records are not
// confirmed in chronological order. The inbox is processed in whatever order Android
// returns it, and someone reviewing pending records picks whichever they recognise
// first. Writing the last-processed balance leaves the account stale the moment an
// OLDER message is written after a NEWER one. Replaying from an anchor is idempotent
// and immune to insertion order, so it is safe to call after every SMS-sourced insert.

export interface MovementLike {
  amount?: number | null;
  fees?: number | null;
  transaction_type?: string | null;
  transfer_direction?: string | null;
}

/** Movement a transaction had on its own account's balance. */
export function movementDelta(t: MovementLike): number {
  const amount = t.amount ?? 0;
  const fees = t.fees ?? 0;
  if (t.transaction_type === 'income') {
    return amount;
  }
  if (t.transaction_type === 'transfer') {
    return t.transfer_direction === 'in' ? amount : -(amount + fees);
  }
  return -(amount + fees);
}

// Handles decimals ("RWF 300000.00") and thousands separators.
function num(s: string | undefined): number {
  if (!s) {
    return 0;
  }
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : Math.round(n);
}

// Authoritative post-transaction balance the SMS reports. Handles all the
// Rwandan variants: "Balance: 61,811 RWF", "Balance:5582 RWF",
// "Balance: 64761RWF", "Available Balance: RWF2,427", "Mokash balance is RWF 3120".
export function extractBalance(raw: string): number | null {
  const m = raw.match(
    /(?:available\s+balance|new\s+balance|mokash\s+balance|balance)\s*(?:is)?\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (m) {
    return num(m[1]);
  }
  // Kinyarwanda MTN Mokash formats — no literal "balance" keyword:
  //   "Ubu ufite RWF 508 kuri Mokash"      (you now have RWF 508 on Mokash)
  //   "Mokash ifiteho amafaranga RWF 7508" (Mokash [now] has RWF 7508)
  const kiny = raw.match(
    /(?:ifiteho\s+amafaranga|ufite)\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (kiny) {
    return num(kiny[1]);
  }
  return null;
}

export interface ReplayRow extends MovementLike {
  date_time?: string | null;
  balance_after?: number | null;
  sms?: string | null;
}

export interface ReplayResult {
  balance: number;
  anchorDate: string | null;
  replayedCount: number;
}

/**
 * Recompute one account's balance from its history.
 *
 * `rows` MUST be ordered NEWEST FIRST (date_time DESC) — the replay walks backwards
 * from the anchor towards the present, and a differently-ordered list would silently
 * produce a plausible-looking wrong number.
 *
 * Returns null when no bank-reported balance exists anywhere in the history (e.g. a
 * brand-new manual-only account): there is nothing to anchor on, so the caller must
 * leave the stored balance untouched rather than writing a guess.
 */
export function replayBalance(rows: ReplayRow[]): ReplayResult | null {
  let anchorIdx = -1;
  let anchorBal: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    // `balance_after` is the parsed column; the SMS body is re-read for rows written
    // before that column existed, which are exactly the oldest ones.
    const b = rows[i].balance_after ?? extractBalance(rows[i].sms ?? '');
    if (b != null) {
      anchorIdx = i;
      anchorBal = b;
      break;
    }
  }
  if (anchorBal == null) {
    return null;
  }

  // rows[0..anchorIdx-1] are NEWER than the anchor (DESC order) — replay them.
  let bal = anchorBal;
  for (let i = anchorIdx - 1; i >= 0; i--) {
    bal += movementDelta(rows[i]);
  }

  return {
    balance: bal,
    anchorDate: rows[anchorIdx].date_time ?? null,
    replayedCount: anchorIdx,
  };
}
