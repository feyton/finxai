// Tag writes on the phone. Parsing, totals and name-matching come from
// shared/tags.ts so the phone and the web agree on every number a tag shows.
//
// Every write here is a direct, user-initiated statement — never run from an
// effect that depends on a reactive query over `transactions` or `tags`. That
// shape is what queued 11,245 operations and stalled sync on 2026-07-30.
import type {AbstractPowerSyncDatabase} from '@powersync/react-native';
import {colorForName, findTagByName, parseTagIds, serializeTagIds} from '../../shared/tags';

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  note: string | null;
  archived: number | null;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The existing tag with this name (any case), or a new one.
 *
 * Reads the table rather than trusting the caller's list, which may be a render
 * behind. This lookup is the only thing preventing "Aline" and "aline" from
 * splitting one errand's money across two reports — there is deliberately no
 * unique index server-side (see supabase_migration_v21.sql).
 */
export async function ensureTag(
  db: AbstractPowerSyncDatabase,
  name: string,
  ownerId: string,
): Promise<TagRow> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) {
    throw new Error('Give the tag a name');
  }
  const existing = await db.getAll<TagRow>(
    'SELECT id, name, color, note, archived FROM tags WHERE owner_id = ?',
    [ownerId],
  );
  const hit = findTagByName(existing, clean);
  if (hit) {
    return hit;
  }
  const row: TagRow = {id: uuid(), name: clean, color: colorForName(clean), note: null, archived: 0};
  await db.execute(
    'INSERT INTO tags (id, name, color, note, archived, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [row.id, row.name, row.color, null, 0, ownerId, new Date().toISOString()],
  );
  return row;
}

/**
 * Replace a transaction's tags. Returns the stored value so an open sheet can
 * reflect it without waiting for the query to re-run.
 *
 * Skips the write when nothing changed: an UPDATE with the same value still
 * queues an upload op, and an unchanged PATCH can overwrite a tag the web added
 * in the meantime.
 */
export async function setTransactionTags(
  db: AbstractPowerSyncDatabase,
  txId: string,
  current: unknown,
  next: string[],
): Promise<string | null> {
  const value = serializeTagIds(next);
  if (value === serializeTagIds(parseTagIds(current))) {
    return value;
  }
  await db.execute('UPDATE transactions SET tag_ids = ? WHERE id = ?', [value, txId]);
  return value;
}
