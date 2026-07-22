// Canonical account-balance recomputation.
//
// Why this exists: writing "whatever balance this SMS reports" directly to
// accounts.available_balance is only correct if transactions are confirmed
// in strict chronological order. They aren't — SMS auto-save processes the
// inbox in whatever order Android returns it, and the user can confirm
// pending SMS Review records in any order they like. If an OLDER SMS gets
// written after a NEWER one, the account is left showing a stale balance.
//
// The fix: never trust "the last one processed" — always ANCHOR on the
// newest bank-reported balance found across the account's full history,
// then REPLAY every movement recorded after that anchor. This is idempotent
// and immune to insertion order, so it's safe to call after every
// SMS-sourced insert (auto-save, confirm, fix), not just from a manual
// "Sync balance" button.
import {extractBalance} from './claudeParser';

export interface MovementLike {
  amount?: number | null;
  fees?: number | null;
  transaction_type?: string | null;
  transfer_direction?: string | null;
}

// Movement a transaction had on its own account's balance.
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

export interface SyncResult {
  balance: number;
  anchorDate: string | null;
  replayedCount: number;
}

// Recomputes and writes accounts.available_balance for one account.
// Returns null if no bank-reported balance exists anywhere in its history
// (e.g. a brand-new manual-only account) — nothing to anchor on, so the
// stored balance is left untouched.
export async function syncAccountBalance(
  db: any,
  accountId: string,
): Promise<SyncResult | null> {
  const res = await db.execute(
    `SELECT id, date_time, amount, fees, transaction_type, transfer_direction,
            balance_after, sms
     FROM transactions WHERE account_id = ?
     ORDER BY date_time DESC LIMIT 300`,
    [accountId],
  );
  const rows: any[] = res.rows?._array ?? [];

  let anchorIdx = -1;
  let anchorBal: number | null = null;
  for (let i = 0; i < rows.length; i++) {
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

  await db.execute('UPDATE accounts SET available_balance = ? WHERE id = ?', [
    bal,
    accountId,
  ]);

  return {
    balance: bal,
    anchorDate: rows[anchorIdx].date_time ?? null,
    replayedCount: anchorIdx,
  };
}
