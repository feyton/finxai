// Detects a stalled upload worker and recycles the sync connection.
//
// WHY THIS IS NEEDED: PowerSync can end up connected, with thousands of operations
// queued, and never invoke the connector's uploadData at all — no success log, no
// error, no uploadError on the status object. Observed directly: connected=true,
// pending=11245, lastSyncedAt frozen for seven hours, uploadData never entered over
// 150 seconds of watching. Because PowerSync also refuses to APPLY a downloaded
// checkpoint while local writes are outstanding, a dead upload worker takes
// DOWNLOADS down with it — so changes made on the web never reach the phone either.
// Nothing in the SDK reports any of this.
//
// The watchdog treats "connected, queue not shrinking" as the failure signal, since
// that is the only observable symptom, and recycles the connection to rebuild the
// worker.

import {db} from './database';
import {connector} from './SupabaseConnector';
import {checkpointWal, describeQueue} from './syncRepair';

const CHECK_EVERY_MS = 15_000;
// Long enough that a genuinely slow upload is not mistaken for a stall — a batch of
// 500 against a slow connection can take a while — short enough that a user does not
// sit in a broken state for minutes.
const STALL_AFTER_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startSyncWatchdog(): () => void {
  if (timer) {
    return stopSyncWatchdog;
  }

  let lastDepth: number | null = null;
  let lastProgressAt = Date.now();
  let recycles = 0;

  timer = setInterval(async () => {
    try {
      const status = db.currentStatus;
      const depth = (await db.getUploadQueueStats(false))?.count ?? 0;

      if (depth === 0) {
        // Healthy: nothing to send. Reset so a later backlog is judged fresh.
        lastDepth = 0;
        lastProgressAt = Date.now();
        recycles = 0;
        return;
      }

      // Offline is not a stall — there is nothing to recycle and reconnecting
      // repeatedly would just churn.
      if (!status?.connected) {
        lastProgressAt = Date.now();
        lastDepth = depth;
        return;
      }

      const draining = lastDepth === null || depth < lastDepth;
      if (draining) {
        lastProgressAt = Date.now();
        lastDepth = depth;
        return;
      }

      lastDepth = depth;
      const stalledMs = Date.now() - lastProgressAt;
      if (stalledMs < STALL_AFTER_MS) {
        return;
      }

      // Cap the recycling. If rebuilding the worker three times has not moved the
      // queue, the fault is not the worker and hammering it only wastes battery —
      // leave it for the Repair action, which bypasses the queue entirely.
      if (recycles >= 3) {
        return;
      }
      recycles++;

      console.warn(
        `[watchdog] upload stalled: ${depth} queued, no progress for ` +
          `${Math.round(stalledMs / 1000)}s — recycling the connection (attempt ${recycles})`,
      );
      // Logged once per recycle: this is the only place the contents of a stuck
      // queue are ever visible, and it is what identifies both a poisoned head entry
      // and whatever keeps refilling the queue.
      await describeQueue(400);
      await checkpointWal();

      await db.disconnect();
      await db.connect(connector);
      lastProgressAt = Date.now();
    } catch (e) {
      console.warn('[watchdog] check failed:', e);
    }
  }, CHECK_EVERY_MS);

  return stopSyncWatchdog;
}

export function stopSyncWatchdog(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
