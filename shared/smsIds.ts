// Deterministic ids for SMS-sourced rows, so the same real-world message always lands
// on the same row no matter which client wrote it. Pure: no database.
//
// See src/tools/txnId.ts for the full argument — briefly: ~11% of confirmed SMS
// transactions in real data turned out to be duplicates, because the in-memory dedupe
// sets could not see a row another device had not yet synced. Making the id a pure
// function of (owner, account, identity-of-the-message) turns the second write into an
// upsert of the first rather than a new row.
//
// It lives in shared/ because the web ignores pending records too
// (apps/web/src/lib/reviewActions.ts). A different id scheme there would grow the
// ignore list by one row every time the same message was ignored from a second client.

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
  /** Message timestamp in ms — only used when there is no txnRef. */
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
