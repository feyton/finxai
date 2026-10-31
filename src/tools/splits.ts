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

import {splitRowsFor, type SplitPart, type TxForSplit} from '../../shared/splits';

export {
  itemsFromText,
  mainCategory,
  normaliseParts,
  partsFromRows,
  restOf,
  splitRowsFor,
} from '../../shared/splits';
export type {SplitPart, TxForSplit} from '../../shared/splits';

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
  const rows = splitRowsFor(tx, parts);
  await db.execute('DELETE FROM split_details WHERE transaction_id = ?', [tx.id]);
  for (const p of rows) {
    await db.execute(
      'INSERT INTO split_details (id, transaction_id, amount, category, subcategory, note, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      // The TRANSACTION's owner: split rows live in the owner's sync bucket.
      [uuid(), tx.id, p.amount, p.category, p.subcategory, p.note, tx.owner_id],
    );
  }
}
