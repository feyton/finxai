import {PowerSyncDatabase} from '@powersync/react-native';
import {AppSchema} from './PowerSyncSchema';
import {connector} from './SupabaseConnector';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {dbFilename: 'finxai.db'},
});

// PowerSync only re-evaluates parameterized bucket subscriptions (like
// shared_accounts, which depends on the current account_shares rows) when
// the sync stream reconnects — not continuously on an already-open
// connection. Pull-to-refresh on screens showing shared data calls this so
// a newly granted (or revoked) share shows up without waiting for the next
// natural reconnect.
export async function reconnect() {
  await db.disconnect();
  await db.connect(connector);
}
