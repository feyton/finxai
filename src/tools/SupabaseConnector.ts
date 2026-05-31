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
    } catch (error) {
      console.error('[SupabaseConnector] uploadData error:', error);
      await transaction.complete(error as Error);
    }
  }
}

export const connector = new SupabaseConnector();
