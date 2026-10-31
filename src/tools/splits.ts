// Splitting one payment across categories — the model behind SplitSheet and
// the "Describe it" item breakdown.
//
// WHY THIS SHAPE: the old editor made every part a full form (pick from all
// categories, type an amount) and refused to save until the parts summed
// exactly — so the user did the arithmetic, and mostly did not split at all.
// Here you enter only the parts that DIFFER from the main category; whatever is
// left is the "rest" and stays in the main category automatically.
//
// Storage is unchanged: reports read split rows INSTEAD of the transaction when
// any exist (LEFT JOIN split_details, COALESCE), so a split must always cover
// the whole amount. The rest is therefore written as an explicit part — and
// read back by folding every part in the main category into it, so reopening a
// split shows exactly the parts that differ, with no hidden marker.

import {CategoryId, coerceForType, resolveCat} from '../theme';

export interface SplitPart {
  category: CategoryId;
  /** '' = none. Custom subcategories are allowed (not checked here). */
  subcategory: string;
  amount: number;
  /** What it was, when known ("fruits") — stored as the part's note. */
  label?: string;
}

export interface TxForSplit {
  id: string;
  amount: number;
  category: string | null;
  subcategory?: string | null;
  transaction_type: string | null;
  transfer_direction?: string | null;
  owner_id: string;
}

/** The transaction's own category, valid for its type. */
export function mainCategory(tx: TxForSplit): CategoryId {
  return resolveCat(tx.category ?? '', tx.transaction_type, tx.transfer_direction);
}

/**
 * Stored split rows → the parts that DIFFER from the main category. Rows in the
 * main category (including the stored rest) fold away; they are the rest.
 */
export function partsFromRows(tx: TxForSplit, rows: any[]): SplitPart[] {
  const main = mainCategory(tx);
  return rows
    .map(r => ({
      category: resolveCat(r.category ?? '', tx.transaction_type, tx.transfer_direction),
      subcategory: r.subcategory ?? '',
      amount: Math.round(r.amount ?? 0),
      label: r.note ?? undefined,
    }))
    .filter(p => p.category !== main || (p.subcategory && p.subcategory !== (tx.subcategory ?? '')));
}

/** Whole RWF left for the main category; never negative. */
export function restOf(total: number, parts: SplitPart[]): number {
  return Math.max(0, Math.round(total) - parts.reduce((s, p) => s + Math.round(p.amount), 0));
}

/**
 * Parts clamped so they can never exceed the total (the last one shrinks), each
 * category made valid for the transaction's type — a split of a purchase cannot
 * carry a "Salary" part.
 */
export function normaliseParts(tx: TxForSplit, parts: SplitPart[]): SplitPart[] {
  let left = Math.round(tx.amount);
  const out: SplitPart[] = [];
  for (const p of parts) {
    const amount = Math.min(Math.round(p.amount), left);
    if (amount <= 0) continue;
    const category = coerceForType(p.category, tx.transaction_type, tx.transfer_direction);
    const sub = p.subcategory ?? '';
    out.push({
      ...p,
      category,
      // A subcategory belongs to its category: if the category had to change to
      // fit the type, the old subcategory no longer applies.
      subcategory: category !== p.category ? '' : sub,
      amount,
    });
    left -= amount;
  }
  return out;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Replace a transaction's split with these parts plus the rest. No parts (or
 * parts that are all the main category) removes the split entirely — the
 * transaction then reports under its own category, as before.
 */
export async function saveSplit(db: any, tx: TxForSplit, parts: SplitPart[]): Promise<void> {
  const main = mainCategory(tx);
  const clean = normaliseParts(tx, parts).filter(p => p.category !== main || p.subcategory);
  await db.execute('DELETE FROM split_details WHERE transaction_id = ?', [tx.id]);
  if (!clean.length) {
    return;
  }
  const rest = restOf(tx.amount, clean);
  const rows = rest > 0
    ? [...clean, {category: main, subcategory: tx.subcategory ?? '', amount: rest}]
    : clean;
  for (const p of rows) {
    await db.execute(
      'INSERT INTO split_details (id, transaction_id, amount, category, subcategory, note, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        uuid(),
        tx.id,
        p.amount,
        p.category,
        // NULL, not '': readers COALESCE subcategories, and '' would win.
        p.subcategory || null,
        (p as SplitPart).label ?? null,
        // The TRANSACTION's owner: split rows live in the owner's sync bucket.
        tx.owner_id,
      ],
    );
  }
}

/**
 * "fruits 2000 and vegetables 1000", "bread 1,500, soap 2000" → items, with no
 * model call. Used as the fallback when the classifier does not return items,
 * and to decide whether a description is an item list at all.
 */
export function itemsFromText(text: string): {label: string; amount: number}[] {
  const out: {label: string; amount: number}[] = [];
  const re = /([A-Za-zÀ-ÿ'’][A-Za-zÀ-ÿ'’ \-]{1,40}?)\s*(?:of|for|:|=|-)?\s*(?:rwf|frw)?\s*(\d{1,3}(?:[ ,.]\d{3})+|\d{2,7})\s*(?:rwf|frw)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text ?? ''))) {
    const label = m[1]
      .replace(/^(?:and|na|n'|,|&)\s+/i, '')
      .replace(/^(?:payment|paid|bought|buy|for)\s+(?:for\s+)?/i, '')
      .trim();
    const amount = parseInt(m[2].replace(/[ ,.]/g, ''), 10);
    if (label && amount > 0) {
      out.push({label, amount});
    }
  }
  return out;
}
