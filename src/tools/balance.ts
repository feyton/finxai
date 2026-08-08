// Canonical account-balance recomputation — the PowerSync half of it.
//
// The rule itself (anchor on the newest bank-reported balance, then replay every
// movement recorded after it, and why that is the only order-independent answer) lives
// in shared/balanceReplay.ts, because the web confirms SMS records too and both clients
// have to arrive at the same number. All that is left here is the I/O: read this
// account's history, hand it to replayBalance, write the result back.
import {replayBalance, type ReplayResult} from '../../shared/balanceReplay';
import {refreshBalanceWidget} from '../widgets/refreshWidget';

export type {MovementLike} from '../../shared/balanceReplay';
export {movementDelta} from '../../shared/balanceReplay';

export type SyncResult = ReplayResult;

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

  const result = replayBalance(rows);
  if (!result) {
    return null;
  }

  await db.execute('UPDATE accounts SET available_balance = ? WHERE id = ?', [
    result.balance,
    accountId,
  ]);

  refreshBalanceWidget();

  return result;
}
