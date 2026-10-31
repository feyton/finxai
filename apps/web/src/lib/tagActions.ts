// Tag writes for the web. The parsing/serialising rules live in lib/shared/tags
// (a generated copy of shared/tags.ts) so the phone and the web agree on what
// tag_ids means; this file only does the Supabase round trips.
import type {SupabaseClient} from '@supabase/supabase-js';
import {colorForName, findTagByName, parseTagIds, serializeTagIds} from '@/lib/shared/tags';
import type {Tag, Transaction} from '@/lib/types';

/**
 * Return the existing tag with this name, or create it.
 *
 * Reusing by name matters more than it looks: "Aline" and "aline" as two tags
 * would split one errand's spending across two reports, each showing half the
 * money. There is intentionally no unique index behind this (see migration v21:
 * a 23505 on the phone's upload path discards a whole batch), so this check is
 * the only guard.
 */
export async function ensureTag(
  supabase: SupabaseClient,
  tags: Tag[],
  name: string,
  ownerId: string,
): Promise<{tag: Tag; created: boolean}> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Give the tag a name');
  const existing = findTagByName(tags, clean);
  if (existing) return {tag: existing, created: false};

  const row: Tag = {
    id: crypto.randomUUID(),
    name: clean,
    color: colorForName(clean),
    note: null,
    archived: 0,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
  };
  const {error} = await supabase.from('tags').insert(row);
  if (error) throw error;
  return {tag: row, created: true};
}

/**
 * Add or remove one tag on many transactions.
 *
 * Each row keeps its OTHER tags, so the new value differs per row and cannot be
 * one UPDATE. Rows are grouped by the value they end up with — usually one or two
 * groups — and each group is written with `.in()`, in batches small enough to keep
 * the query string well under proxy limits.
 *
 * Returns the new tag_ids per changed row, for the caller's local state.
 */
export async function applyTag(
  supabase: SupabaseClient,
  rows: Pick<Transaction, 'id' | 'tag_ids'>[],
  tagId: string,
  mode: 'add' | 'remove',
): Promise<Map<string, string | null>> {
  const groups = new Map<string, string[]>(); // serialized value → ids
  const changed = new Map<string, string | null>();
  for (const r of rows) {
    const cur = parseTagIds(r.tag_ids);
    const has = cur.includes(tagId);
    if ((mode === 'add' && has) || (mode === 'remove' && !has)) continue;
    const next = serializeTagIds(mode === 'add' ? [...cur, tagId] : cur.filter(x => x !== tagId));
    const key = next ?? '';
    groups.set(key, [...(groups.get(key) ?? []), r.id]);
    changed.set(r.id, next);
  }
  for (const [key, ids] of groups) {
    for (let i = 0; i < ids.length; i += 150) {
      const {error} = await supabase
        .from('transactions')
        .update({tag_ids: key === '' ? null : key})
        .in('id', ids.slice(i, i + 150));
      if (error) throw error;
    }
  }
  return changed;
}
