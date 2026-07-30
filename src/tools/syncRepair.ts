// Sync health, and a repair for rows that were written locally but never reached
// Postgres.
//
// HOW THAT HAPPENS: until v1.23, SupabaseConnector.uploadData caught an upload
// failure and called `transaction.complete(error as Error)`. `complete()` takes an
// optional writeCheckpoint STRING — it does not report a failure, it marks the
// transaction DONE. So a rejected upload had its CRUD queue entry removed while
// the local row stayed behind. The result is silent, permanent divergence that
// looks perfectly healthy from the client: the queue is empty, PowerSync reports
// connected, and nothing will ever retry.
//
// v1.23 stops new losses. This repairs the ones already stranded.
//
// The repair is a no-op UPDATE per row. PowerSync records a PATCH crud entry for
// any local write, so touching a row re-enqueues it; Supabase upserts on the
// primary key, so re-sending a row the server already has is harmless. That makes
// this safe to run more than once.

import {db} from './database';
import {connector} from './SupabaseConnector';
import {supabase} from './supabase';

export interface SyncHealth {
  connected: boolean;
  lastSyncedAt: Date | null;
  // Rows waiting to upload. Non-zero and not falling is the symptom of a blocked
  // queue; zero while data is visibly missing server-side is the symptom of the
  // discarded-write bug above.
  pending: number;
  uploadError: string | null;
  downloadError: string | null;
}

export async function syncHealth(): Promise<SyncHealth> {
  const s = db.currentStatus;
  let pending = 0;
  try {
    const stats = await db.getUploadQueueStats(false);
    pending = stats?.count ?? 0;
  } catch {
    // Stats are diagnostics; never let them break the screen that shows them.
  }
  return {
    connected: !!s?.connected,
    lastSyncedAt: s?.lastSyncedAt ?? null,
    pending,
    uploadError: s?.dataFlowStatus?.uploadError?.message ?? null,
    downloadError: s?.dataFlowStatus?.downloadError?.message ?? null,
  };
}

/**
 * How many local transactions has the server not got?
 *
 * This exists because the discarded-write failure is INVISIBLE to every signal
 * PowerSync exposes: the queue is empty, `connected` is true and there is no
 * uploadError, because from the client's point of view the work was completed. The
 * only way to notice is to ask the server what it actually has and compare.
 *
 * Counts only, so it is two cheap queries and no row data crosses the wire.
 * Returns 0 when offline or on any error — a failed check must never present
 * itself as a problem with the data.
 */
export async function pendingUploadGap(ownerId: string): Promise<number> {
  if (!ownerId) {
    return 0;
  }
  try {
    const {rows} = await db.execute(
      'SELECT COUNT(*) AS n FROM transactions WHERE owner_id = ?',
      [ownerId],
    );
    const local: number = rows?._array?.[0]?.n ?? 0;

    const {count, error} = await supabase
      .from('transactions')
      .select('id', {count: 'exact', head: true})
      .eq('owner_id', ownerId);
    if (error || count == null) {
      return 0;
    }
    // Only a local surplus matters. The reverse (server ahead) is just sync
    // still catching up on download, which resolves itself.
    return Math.max(0, local - count);
  } catch {
    return 0;
  }
}

// Tables worth repairing: the ones that carry money or user corrections. Deliberately
// not every table — `ignored_sms` and the like are not worth re-sending.
const REPAIRABLE = ['transactions', 'auto_records', 'accounts', 'merchant_rules'] as const;

export interface RepairResult {
  touched: number;
  perTable: Record<string, number>;
}

/**
 * Re-enqueue local rows so PowerSync uploads them again.
 *
 * `sinceDays` bounds the work: the divergence being repaired is recent, and
 * re-sending years of history would be a large upload for no benefit. Accounts are
 * always included in full — there are only a handful and their balances are the
 * most visible thing that drifts.
 */
export async function repairSync(sinceDays = 14): Promise<RepairResult> {
  const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const perTable: Record<string, number> = {};
  let touched = 0;

  for (const table of REPAIRABLE) {
    try {
      const scoped = table === 'accounts' ? '' : ' WHERE created_at >= ?';
      const params: any[] = table === 'accounts' ? [] : [cutoff];

      // Counted with a SELECT rather than from the UPDATE result: PowerSync's own
      // docs warn that `rowsAffected` "may be 0 for successful UPDATE and DELETE
      // statements", so trusting it would report a successful repair as having
      // done nothing.
      const {rows} = await db.execute(
        `SELECT COUNT(*) AS n FROM ${table}${scoped}`,
        params,
      );
      const n = rows?._array?.[0]?.n ?? 0;

      // `SET id = id` is the smallest change that still registers as a write. The
      // value is unchanged, so this cannot corrupt anything even if the upload
      // then fails again.
      await db.execute(`UPDATE ${table} SET id = id${scoped}`, params);
      perTable[table] = n;
      touched += n;
    } catch (e) {
      console.warn(`[syncRepair] could not touch ${table}:`, e);
      perTable[table] = 0;
    }
  }

  // There is no public "flush the queue now" call in this PowerSync version —
  // uploadData is invoked automatically once local writes land (subject to
  // crudUploadThrottleMs). Reconnecting restarts the sync stream so the newly
  // queued writes go out immediately instead of on the next natural trigger.
  try {
    await db.connect(connector);
  } catch (e) {
    console.warn('[syncRepair] reconnect after repair failed:', e);
  }

  return {touched, perTable};
}
