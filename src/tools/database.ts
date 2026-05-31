import {PowerSyncDatabase} from '@powersync/react-native';
import {AppSchema} from './PowerSyncSchema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {dbFilename: 'finxai.db'},
});
