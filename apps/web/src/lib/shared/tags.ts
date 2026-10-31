// Tags — the logic both clients need, so the phone and the web read, write and
// total a tag identically. See supabase_migration_v21.sql for the data shape.
//
// `transactions.tag_ids` is a JSON array of tag ids stored as TEXT. Every reader
// goes through parseTagIds and every writer through serializeTagIds, because the
// column can legitimately hold NULL, '' or '[]' (all "untagged"), and a hand-rolled
// JSON.parse in a render path is one malformed row away from a crashed list.

export interface TagLike {
  id: string;
  name: string | null;
  color: string | null;
}

/** Colours offered for new tags. Picked to stay distinct from the category
 *  colours a tag sits next to in every row. */
export const TAG_COLORS = [
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
  '#ca8a04',
  '#be123c',
];

/** Stable default colour for a name, so the same tag gets the same colour on
 *  both clients without anyone having to choose. */
export function colorForName(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function parseTagIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && x !== '');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];
  } catch {
    return [];
  }
}

/** NULL rather than '[]' when empty, so "is tagged" is a plain IS NOT NULL. */
export function serializeTagIds(ids: string[]): string | null {
  const uniq = [...new Set(ids.filter(Boolean))];
  return uniq.length ? JSON.stringify(uniq) : null;
}

export function hasTag(raw: unknown, tagId: string): boolean {
  return parseTagIds(raw).includes(tagId);
}

export function withTag(raw: unknown, tagId: string): string | null {
  return serializeTagIds([...parseTagIds(raw), tagId]);
}

export function withoutTag(raw: unknown, tagId: string): string | null {
  return serializeTagIds(parseTagIds(raw).filter(id => id !== tagId));
}

/** Case-insensitive name lookup — both pickers offer an existing tag before
 *  creating a near-duplicate. This is the ONLY guard: there is deliberately no
 *  unique index (see supabase_migration_v21.sql). */
export function findTagByName<T extends TagLike>(tags: T[], name: string): T | undefined {
  const n = name.trim().toLowerCase();
  return tags.find(t => (t.name ?? '').trim().toLowerCase() === n);
}

interface TxLike {
  amount: number | null;
  transaction_type: string | null;
  transfer_direction?: string | null;
}

export interface TagTotals {
  /** Money that left on this tag's behalf. */
  out: number;
  /** Money that came back on it (e.g. the person repaying you). */
  in: number;
  /** in − out. Negative = you are still out of pocket. */
  net: number;
  count: number;
  /** Both directions present and they cancel to within 1 RWF. */
  settled: boolean;
}

/**
 * Totals for a tag.
 *
 * Unlike the spending reports, transfers COUNT here, by direction: if someone
 * asks you to buy things and you send them the money by MoMo, that send is
 * usually filed as a transfer — and it is precisely the money the tag is meant to
 * track. Leaving transfers out would show a balance that never settles.
 */
export function tagTotals(rows: TxLike[]): TagTotals {
  let out = 0;
  let inn = 0;
  for (const t of rows) {
    const a = Math.abs(t.amount ?? 0);
    const incoming =
      t.transaction_type === 'income' ||
      (t.transaction_type === 'transfer' && t.transfer_direction === 'in');
    if (incoming) inn += a;
    else out += a;
  }
  const net = inn - out;
  return {out, in: inn, net, count: rows.length, settled: out > 0 && inn > 0 && Math.abs(net) < 1};
}
