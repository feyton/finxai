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


export interface RepairResult {
  // Rows actually accepted by the server, not rows attempted — so a zero here
  // means the repair genuinely did nothing, which is what the first version
  // managed to hide behind a healthy-looking count.
  touched: number;
  perTable: Record<string, number>;
}

/**
 * Push local rows the server is missing straight to Supabase.
 *
 * DELIBERATELY BYPASSES POWERSYNC'S QUEUE. The first version of this tried to
 * re-enqueue rows with a local no-op UPDATE and let PowerSync upload them. That
 * failed twice over: `SET id = id` touched only the primary key, so the INSTEAD OF
 * trigger recorded an empty patch and no queue entry appeared — the repair reported
 * "re-queued 256" while queueing nothing, and uploadData was never called. Relying
 * on trigger semantics to fix a sync bug is the wrong dependency for a repair tool.
 *
 * This instead does what the connector would have done, directly: work out exactly
 * which ids are missing server-side, and upsert those rows. Deterministic, and its
 * success is verifiable by re-counting afterwards.
 *
 * Upserting on the primary key means re-running this is harmless.
 */
export async function repairSync(sinceDays = 30): Promise<RepairResult> {
  const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const perTable: Record<string, number> = {};
  let touched = 0;

  for (const table of ['transactions', 'auto_records'] as const) {
    try {
      const {rows} = await db.execute(
        `SELECT * FROM ${table} WHERE created_at >= ?`,
        [cutoff],
      );
      const local = (rows?._array ?? []) as any[];
      if (local.length === 0) {
        perTable[table] = 0;
        continue;
      }

      // Ask the server which of these it already has, so only genuinely missing
      // rows are sent.
      const {data: present, error: readErr} = await supabase
        .from(table)
        .select('id')
        .in(
          'id',
          local.map(r => r.id),
        );
      if (readErr) {
        console.warn(`[syncRepair] could not list server ids for ${table}:`, readErr.message);
        perTable[table] = 0;
        continue;
      }
      const have = new Set((present ?? []).map((r: any) => r.id));
      const missing = local.filter(r => !have.has(r.id));

      if (missing.length === 0) {
        perTable[table] = 0;
        continue;
      }

      // Chunked: a single request with hundreds of rows is more likely to hit a
      // payload limit, and a partial failure is easier to attribute.
      let sent = 0;
      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        const {error} = await supabase.from(table).upsert(chunk);
        if (error) {
          // Reported per chunk rather than swallowed: a column the server does not
          // have would fail every chunk identically, and that message is the fix.
          console.warn(
            `[syncRepair] ${table} chunk ${i / 50 + 1} rejected: ${error.message}`,
          );
          continue;
        }
        sent += chunk.length;
      }
      perTable[table] = sent;
      touched += sent;
      console.log(
        `[syncRepair] ${table}: ${local.length} local, ${missing.length} missing, ${sent} uploaded`,
      );
    } catch (e) {
      console.warn(`[syncRepair] ${table} repair failed:`, e);
      perTable[table] = 0;
    }
  }

  // Balances always go up: there are only a handful of accounts and a drifted
  // balance is the most visible symptom of a missed upload.
  try {
    const {rows} = await db.execute('SELECT * FROM accounts');
    const accts = (rows?._array ?? []) as any[];
    if (accts.length) {
      const {error} = await supabase.from('accounts').upsert(accts);
      if (error) {
        console.warn('[syncRepair] accounts rejected:', error.message);
      } else {
        perTable.accounts = accts.length;
        touched += accts.length;
      }
    }
  } catch (e) {
    console.warn('[syncRepair] accounts repair failed:', e);
  }

  return {touched, perTable};
}
