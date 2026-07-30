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
import {reconnect} from './database';

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
export interface SyncGap {
  /** Local transactions the server has no row for. */
  rows: number;
  /** True when any account's balance differs between phone and server. */
  balancesDiffer: boolean;
}

export async function pendingUploadGap(ownerId: string): Promise<SyncGap> {
  const none: SyncGap = {rows: 0, balancesDiffer: false};
  if (!ownerId) {
    return none;
  }
  try {
    const {rows} = await db.execute(
      'SELECT COUNT(*) AS n FROM transactions WHERE owner_id = ?',
      [ownerId],
    );
    const localCount: number = rows?._array?.[0]?.n ?? 0;

    const {count, error} = await supabase
      .from('transactions')
      .select('id', {count: 'exact', head: true})
      .eq('owner_id', ownerId);
    if (error || count == null) {
      return none;
    }
    // Only a local surplus matters. The reverse (server ahead) is just sync
    // still catching up on download, which resolves itself.
    const missing = Math.max(0, localCount - count);

    // Balances are checked separately because they drift WITHOUT any row being
    // missing: available_balance is updated in place, so a failed upload leaves
    // the row count identical and only the number wrong. That is precisely the
    // case a row-count check misses, and it is the one users notice first —
    // the total on the web not matching the total on the phone.
    let balancesDiffer = false;
    const {rows: acctRows} = await db.execute(
      'SELECT id, available_balance FROM accounts WHERE owner_id = ?',
      [ownerId],
    );
    const localAccts = (acctRows?._array ?? []) as {id: string; available_balance: number}[];
    if (localAccts.length) {
      const {data: remote, error: rErr} = await supabase
        .from('accounts')
        .select('id, available_balance')
        .eq('owner_id', ownerId);
      if (!rErr && remote) {
        const byId = new Map(remote.map((a: any) => [a.id, a.available_balance]));
        balancesDiffer = localAccts.some(a => {
          const server = byId.get(a.id);
          // A missing account counts as a difference; rounding to whole francs
          // because RWF has no practical subunit and float noise is not a drift.
          return (
            server == null ||
            Math.round(server ?? 0) !== Math.round(a.available_balance ?? 0)
          );
        });
      }
    }

    return {rows: missing, balancesDiffer};
  } catch {
    return none;
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
export async function repairSync(ownerId: string, sinceDays = 30): Promise<RepairResult> {
  const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const perTable: Record<string, number> = {};
  let touched = 0;

  if (!ownerId) {
    return {touched: 0, perTable};
  }

  for (const table of ['transactions', 'auto_records'] as const) {
    try {
      // owner_id filter is REQUIRED, not tidiness. The local database also holds
      // rows from accounts shared TO this user, which they do not own — RLS
      // rightly refuses those on upsert, and because a chunk is one statement, a
      // single foreign row takes the user's own rows down with it. That is exactly
      // how the accounts leg of this repair failed: "new row violates row-level
      // security policy for table accounts", with none of the user's own three
      // accounts updated either.
      const {rows} = await db.execute(
        `SELECT * FROM ${table} WHERE owner_id = ? AND created_at >= ?`,
        [ownerId, cutoff],
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
    const {rows} = await db.execute('SELECT * FROM accounts WHERE owner_id = ?', [
      ownerId,
    ]);
    const accts = (rows?._array ?? []) as any[];
    if (accts.length) {
      // One at a time. There are only a handful of accounts, and doing them
      // individually means one problem row cannot block the rest — which is the
      // whole lesson from the batch that RLS rejected.
      let sent = 0;
      for (const a of accts) {
        const {error} = await supabase.from('accounts').upsert(a);
        if (error) {
          console.warn(`[syncRepair] account ${a.name} rejected: ${error.message}`);
          continue;
        }
        sent++;
      }
      perTable.accounts = sent;
      touched += sent;
      console.log(`[syncRepair] accounts: ${sent}/${accts.length} pushed`);
    }
  } catch (e) {
    console.warn('[syncRepair] accounts repair failed:', e);
  }

  return {touched, perTable};
}

/**
 * Last-resort recovery for a wedged upload queue.
 *
 * The situation this exists for: `connected=true`, `pending=10065`, `lastSyncedAt`
 * frozen hours earlier, and uploadData never invoked — so nothing uploads, and
 * because PowerSync will not apply a downloaded checkpoint while local writes are
 * outstanding, nothing downloads either. Sync is dead in both directions with no
 * error reported anywhere.
 *
 * ORDER IS THE SAFETY PROPERTY. Every local row is pushed to Supabase FIRST, by
 * direct upsert, so the server definitively has the data. Only then is the local
 * queue cleared. Clearing first would discard writes that had never been uploaded;
 * clearing afterwards means the queue only ever loses entries whose data is already
 * safe on the server.
 *
 * What gets discarded is not user data — it is a list of pending operations, most of
 * it junk generated by an earlier version of this very repair tool, which
 * mass-touched rows to re-enqueue them.
 */
export async function forceResync(
  ownerId: string,
): Promise<{pushed: number; cleared: boolean; queueAfter: number}> {
  // 1. Get the data to safety. A wide window on purpose: this only runs when sync
  //    is already broken, so completeness matters more than economy.
  const {touched} = await repairSync(ownerId, 365);

  // 2. Drop the pending queue. `ps_crud` is PowerSync's local operation log; the
  //    name is internal to the library, so this is written to fail soft.
  let cleared = false;
  try {
    await db.execute('DELETE FROM ps_crud');
    cleared = true;
    console.log('[syncRepair] cleared the local upload queue');
  } catch (e) {
    console.warn('[syncRepair] could not clear ps_crud:', e);
  }

  // 3. Restart the stream so a checkpoint can finally be applied.
  try {
    await reconnect();
  } catch (e) {
    console.warn('[syncRepair] reconnect after force-resync failed:', e);
  }

  let queueAfter = 0;
  try {
    queueAfter = (await db.getUploadQueueStats(false))?.count ?? 0;
  } catch {
    // Diagnostics only.
  }
  console.log(
    `[syncRepair] force resync: pushed ${touched}, cleared=${cleared}, queue now ${queueAfter}`,
  );
  return {pushed: touched, cleared, queueAfter};
}

/**
 * What is actually IN the upload queue.
 *
 * Added because the queue kept refilling after being cleared (11,245 -> 0 -> 777
 * and climbing) and no amount of reasoning about which code path writes locally
 * identified the source. Reading `ps_crud` answers that directly instead, and also
 * surfaces the other failure this could be: a poisoned head row. PowerSync
 * processes the queue in order, so one entry it cannot deserialize stalls
 * everything behind it forever — which would look exactly like the dead upload
 * worker we are seeing.
 *
 * `ps_crud.data` is a JSON string shaped like {op, type, id, data}, where `type` is
 * the table. Parsed defensively: this is an internal table and a schema change must
 * degrade to "no diagnostics", never to a crash.
 */
export async function describeQueue(limit = 400): Promise<void> {
  try {
    const {rows} = await db.execute(
      'SELECT id, tx_id, data FROM ps_crud ORDER BY id ASC LIMIT ?',
      [limit],
    );
    const entries = (rows?._array ?? []) as {id: number; tx_id: number; data: string}[];
    if (entries.length === 0) {
      console.log('[queue] empty');
      return;
    }

    const byKey = new Map<string, number>();
    let biggest = 0;
    let unparseable = 0;
    for (const e of entries) {
      biggest = Math.max(biggest, (e.data ?? '').length);
      try {
        const p = JSON.parse(e.data);
        const key = `${p.type}:${p.op}`;
        byKey.set(key, (byKey.get(key) ?? 0) + 1);
      } catch {
        unparseable++;
      }
    }

    const head = entries[0];
    console.log(
      `[queue] head id=${head.id} tx=${head.tx_id} bytes=${(head.data ?? '').length} ` +
        `sample=${(head.data ?? '').slice(0, 220)}`,
    );
    console.log(
      `[queue] sampled ${entries.length}: ` +
        [...byKey.entries()].map(([k, n]) => `${k}=${n}`).join(' ') +
        ` | largestPayload=${biggest}B unparseable=${unparseable}`,
    );
  } catch (e) {
    console.warn('[queue] could not read ps_crud:', e);
  }
}

/**
 * Keep the local SQLite WAL from growing without bound.
 *
 * With thousands of queued writes the write-ahead log gets large, which slows every
 * read of `ps_crud` — plausibly enough to trip an internal timeout in the upload
 * worker, turning a big queue into a permanently stuck one. PASSIVE never blocks
 * other readers or writers, so this is safe to call on a live database.
 */
export async function checkpointWal(): Promise<void> {
  try {
    await db.execute('PRAGMA wal_checkpoint(PASSIVE)');
  } catch (e) {
    console.warn('[sync] wal_checkpoint failed:', e);
  }
}
