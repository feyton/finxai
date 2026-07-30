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
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    try {
      for (const op of transaction.crud) {
        const record = {...op.opData, id: op.id};
        switch (op.op) {
          case UpdateType.PUT: {
            const {error} = await supabase.from(op.table).upsert(record);
            if (error) {
              throw error;
            }
            break;
          }
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
      await transaction.complete();
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
        await transaction.complete();
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
