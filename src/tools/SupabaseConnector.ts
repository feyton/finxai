import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/react-native';
import {supabase} from './supabase';

const POWERSYNC_URL =
  'https://6a1ad6bc234fa2bf51a6e950.powersync.journeyapps.com';

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const {
      data: {session},
    } = await supabase.auth.getSession();
    if (!session) {
      return null;
    }
    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    // BATCHED, not one transaction at a time.
    //
    // This used to call getNextCrudTransaction(), which returns a single
    // transaction and therefore made one network round trip per local write. That
    // is fine at a handful of writes and hopeless at scale: a queue of ~9,500
    // operations (a repair tool of mine mass-touched rows and left them queued)
    // needed roughly half an hour of serial requests to drain — and because
    // PowerSync refuses to APPLY a downloaded checkpoint while local writes are
    // outstanding, the whole time it was jammed, DOWNLOADS were blocked too. Edits
    // made on the web never reached the phone, in either direction, with no error
    // anywhere.
    //
    // Grouping consecutive PUTs by table collapses that into a few requests.
    const batch = await database.getCrudBatch(500);
    if (!batch || batch.crud.length === 0) {
      return;
    }

    try {
      // Consecutive PUTs on the same table go up as one upsert. Order is preserved
      // within the batch, and the group is flushed whenever the table or the
      // operation type changes, so a PATCH or DELETE can never be reordered past a
      // PUT that must precede it.
      let pending: {table: string; rows: any[]} | null = null;
      const flush = async () => {
        if (!pending || pending.rows.length === 0) {
          return;
        }
        const {error} = await supabase.from(pending.table).upsert(pending.rows);
        if (error) {
          throw error;
        }
        pending = null;
      };

      for (const op of batch.crud) {
        const record = {...op.opData, id: op.id};
        switch (op.op) {
          case UpdateType.PUT: {
            if (pending && pending.table === op.table) {
              pending.rows.push(record);
            } else {
              await flush();
              pending = {table: op.table, rows: [record]};
            }
            continue;
          }
        }
        // Anything that is not a PUT ends the run, so ordering is preserved.
        await flush();
        switch (op.op) {
          case UpdateType.PATCH: {
            const {error} = await supabase
              .from(op.table)
              .update(op.opData!)
              .eq('id', op.id);
            if (error) {
              throw error;
            }
            break;
          }
          case UpdateType.DELETE: {
            const {error} = await supabase
              .from(op.table)
              .delete()
              .eq('id', op.id);
            if (error) {
              throw error;
            }
            break;
          }
        }
      }
      // Trailing run of PUTs.
      await flush();
      await batch.complete();
      // Progress is logged because a large drain is otherwise completely silent —
      // successful uploads print nothing, which is exactly why a 9,500-deep queue
      // went unnoticed while it blocked sync in both directions.
      console.log(
        `[SupabaseConnector] uploaded ${batch.crud.length} ops` +
          `${batch.haveMore ? ', more queued' : ', queue drained'}`,
      );
    } catch (error: any) {
      // `complete()` takes an optional writeCheckpoint STRING, never an error.
      // This used to call `complete(error as Error)`, which did not report a
      // failure at all — it marked the transaction DONE, so a rejected upload was
      // silently discarded and the local write was lost for good. It only ever
      // surfaced as a TypeScript error nobody acted on.
      //
      // Correct handling depends on whether the rejection can ever succeed:
      //
      //  - Permanent (bad request, constraint violation, RLS refusal): retrying
      //    can never work, and leaving it queued blocks every write behind it
      //    forever. Discard it, loudly.
      //  - Transient (offline, 5xx, timeout, expired token): do NOT complete.
      //    Rethrowing leaves the transaction queued so PowerSync retries it,
      //    which is the whole point of the queue.
      const code = String(error?.code ?? '');
      const permanent = FATAL_RESPONSE_CODES.some(re => re.test(code));
      if (permanent) {
        console.error(
          `[SupabaseConnector] permanent upload failure (${code}) — discarding ` +
            'this transaction so it cannot block the queue:',
          error,
        );
        await batch.complete();
        return;
      }
      console.warn('[SupabaseConnector] transient upload failure, will retry:', error);
      throw error;
    }
  }
}

// PostgREST / Postgres codes that will never succeed on retry.
//   22xxx — data exception (bad input, invalid type, out of range)
//   23xxx — integrity constraint violation (unique, FK, not-null, check)
//   42xxx — syntax error or access rule violation (includes 42501, RLS refusal)
//   PGRST — PostgREST-level rejections (unknown column, malformed request)
// Anything else — network errors, 5xx, auth expiry — is treated as retryable.
const FATAL_RESPONSE_CODES = [/^22\d{3}$/, /^23\d{3}$/, /^42\d{3}$/, /^PGRST\d+$/];

export const connector = new SupabaseConnector();
