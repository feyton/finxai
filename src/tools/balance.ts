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

// Brings an account's balance back in line after its transactions changed — the
// phone's twin of rebalanceAccount in apps/web/src/lib/reviewActions.ts.
//
// Replay FIRST: it is idempotent and repairs drift that already existed instead
// of carrying it forward. `delta` is only used when replay has nothing to anchor
// on (a manual-only account, where no SMS ever states a balance). Before this,
// manual saves always took the delta path, so on SMS-backed accounts they stacked
// increments on top of whatever replay had last written.
//
// Callers must run this AFTER writing the transaction: replay reads the rows, so
// running it first recomputes the old state.
//
// Known limit of the fallback: the local `col = col + ?` is atomic in SQLite, but
// PowerSync uploads the RESULT as a plain PATCH, so a web edit landing on the
// same manual-only account between this write and the upload can still be lost.
// Closing that needs the connector to send deltas via adjust_account_balance.
export async function rebalanceAccount(
  db: any,
  accountId: string | null | undefined,
  delta: number,
): Promise<void> {
  if (!accountId) {
    return;
  }
  const replayed = await syncAccountBalance(db, accountId);
  if (replayed !== null || Math.round(delta) === 0) {
    return;
  }
  await db.execute(
    'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
    [delta, accountId],
  );
  refreshBalanceWidget();
}
