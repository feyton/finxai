// Deterministic transaction ids, so the same real-world transaction always
// lands on the same row.
//
// WHY: ~11% of confirmed SMS transactions in real data turned out to be
// duplicates — the same bank reference stored twice, and in a few cases the
// byte-identical SMS body stored twice. The old defences were both in-memory
// sets built from a PowerSync query (`existingSmsSet`, `existingTxnRefSet`),
// which fail in two ways no amount of gating fixes:
//
//   1. A run interrupted between the INSERT and the log_date update reprocesses
//      the message next launch.
//   2. TWO DEVICES process the same SMS before either has synced. Neither one's
//      query can see the other's row yet, so both insert. This is unfixable
//      with local state — it needs the two writes to collide.
//
// Making the id a pure function of (owner, account, identity-of-the-message)
// makes the second write an UPSERT of the first rather than a new row: PowerSync
// sends `{...opData, id}` and Supabase upserts on the primary key, so the rows
// converge instead of accumulating.
//
// Deliberately NOT a unique index + "let the insert fail": SupabaseConnector
// completes a failed CRUD transaction with an error, which PowerSync retries —
// a permanent constraint violation would retry forever and block every later
// write queued behind it. A colliding primary key has no such failure mode.

// 128-bit FNV-1a-style mix, four independently-seeded 32-bit lanes.
//
// A single 32-bit hash is far too collision-prone to key financial rows on
// (birthday collision around ~77k rows); four lanes give 128 bits, which is
// what UUIDs use and is negligible at any realistic transaction count.
function hash128(input: string): string {
  const SEEDS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const lanes = SEEDS.map(seed => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      // FNV prime, via shifts to stay in 32-bit integer math.
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  });
  return lanes.map(l => l.toString(16).padStart(8, '0')).join('');
}

// Format 32 hex chars as a UUID, with the version/variant nibbles set so the
// value is a well-formed UUID — Postgres `uuid` columns reject anything else.
function asUuid(hex32: string): string {
  const h = hex32.padEnd(32, '0').slice(0, 32);
  const v = `8${h.slice(17, 20)}`; // variant nibble: 8..b
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`, // version 5: name-based hash
    v,
    h.slice(20, 32),
  ].join('-');
}

/**
 * Stable id for an SMS-sourced transaction.
 *
 * Identity precedence:
 *   1. `txnRef` — the bank's own reference. The strongest identity available,
 *      and shared across a bank's multiple alerts for one transaction (verified
 *      for both Bank of Kigali senders), so it also collapses those.
 *   2. The SMS body — for providers that give no reference. Includes the
 *      sender and the message timestamp because two genuinely separate
 *      purchases (same shop, same amount, no reference) produce byte-identical
 *      bodies, and those must NOT collapse into one row.
 */
export function smsTransactionId(args: {
  ownerId: string;
  accountId: string;
  txnRef?: string | null;
  sms: string;
  sender?: string | null;
  // Message timestamp in ms — only used when there is no txnRef.
  smsDate?: number | null;
}): string {
  const {ownerId, accountId, txnRef, sms, sender, smsDate} = args;
  const identity = txnRef?.trim()
    ? `ref:${txnRef.trim().toLowerCase()}`
    : `body:${sender ?? ''}|${smsDate ?? 0}|${sms}`;
  return asUuid(hash128(`${ownerId}|${accountId}|${identity}`));
}

/**
 * Stable id for an ignored SMS (failed / duplicate / status-only), so
 * re-processing the same message doesn't grow the ignore list without bound.
 */
export function ignoredSmsId(args: {
  ownerId: string;
  sms: string;
  sender?: string | null;
}): string {
  return asUuid(
    hash128(`ignored|${args.ownerId}|${args.sender ?? ''}|${args.sms}`),
  );
}

/**
 * True when a row with this id already exists in `table`.
 *
 * PowerSync's local tables are views with INSTEAD OF triggers, so neither
 * `INSERT OR REPLACE` nor `ON CONFLICT` is available — the check has to be
 * explicit. That only covers the local case; two devices racing still both
 * insert, and converge server-side because the upsert targets one primary key.
 */
/**
 * Has this exact SMS body already been recorded for this account?
 *
 * A SECOND dedupe key, because the id-based one cannot be trusted across ingest paths.
 * The id falls back to `body:<sender>|<smsDate>|<sms>` when a message carries no bank
 * reference, and the two paths disagree about smsDate: the live receiver passes the
 * PDU's service-centre timestamp (`timestampMillis`) while the poller passes the Android
 * inbox's received-at (`sms.date`). Those routinely differ by seconds, so one real SMS
 * produced two different ids and `rowExists` missed.
 *
 * Observed on 2026-07-30: three MTN transfers already confirmed as transactions were
 * re-offered for review. Their bodies were byte-identical and their txn_ref was null.
 *
 * Body identity is a safe key for these providers because MoMo and BK embed the
 * transaction timestamp in the message, so two genuine purchases never produce the same
 * bytes. Scoped to owner + account so an identical alert on a different account is still
 * its own record.
 */
export async function smsAlreadyRecorded(
  db: any,
  ownerId: string,
  accountId: string,
  sms: string,
): Promise<boolean> {
  if (!sms || !ownerId) {
    return false;
  }
  try {
    const {rows} = await db.execute(
      `SELECT 1 FROM transactions WHERE owner_id = ? AND account_id = ? AND sms = ?
       UNION ALL
       SELECT 1 FROM auto_records WHERE owner_id = ? AND account_id = ? AND sms = ?
       LIMIT 1`,
      [ownerId, accountId, sms, ownerId, accountId, sms],
    );
    return (rows?._array?.length ?? 0) > 0;
  } catch {
    // A failed check must not block ingest — the id check still applies.
    return false;
  }
}

export async function rowExists(
  db: any,
  table: 'transactions' | 'auto_records' | 'ignored_sms',
  id: string,
): Promise<boolean> {
  try {
    const {rows} = await db.execute(
      `SELECT 1 FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );
    return (rows?._array?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
