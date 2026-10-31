// People — who a counterparty IS, so money to and from them is filed by
// relationship instead of guessed.
//
// WHY: after taxonomy v2, what still lands in Other is money to and from people
// ("payment of 6,000 RWF to Moise"): the purpose is not in the SMS, and a
// merchant rule cannot hold "this is my mother". The owner asked for exactly
// this: a transfer to a number must not be assumed to be family, and the app
// should learn relatives and children over time.
//
// A matched person with a category files an SMS deterministically — no model
// call, the cheapest classification there is. A person without one (a friend,
// where the purpose varies) still goes to the model, but with the relationship
// as context.
//
// Stored in the synced `people` table (migration v24).

// The rules themselves (relationships, matching, suggestions, the re-file plan)
// are in shared/people.ts, shared with the web; this file is the phone's SQL.

import {
  type Person,
  type PersonSuggestion,
  type PlaceSuggestion,
  type RefilePlan,
  type Relationship,
  peopleSuggestionsFromRows,
  personFromRow,
  personKeys,
  placeSuggestionsFromRows,
  refilePlanFromRows,
} from '../../shared/people';
import type {CategoryId} from '../theme';

export {
  RELATIONSHIPS,
  RELATIONSHIP_ORDER,
  isMerchantCode,
  looksLikePerson,
  matchPerson,
  personCategory,
  personContextLine,
  personFromRow,
} from '../../shared/people';
export type {
  Person,
  PersonSuggestion,
  PlaceSuggestion,
  RefilePlan,
  Relationship,
  RelationshipDefaults,
} from '../../shared/people';

export async function loadPeople(db: any, ownerId: string): Promise<Person[]> {
  if (!ownerId) {
    return [];
  }
  try {
    const {rows} = await db.execute('SELECT * FROM people WHERE owner_id = ?', [ownerId]);
    return ((rows?._array ?? []) as any[]).map(personFromRow);
  } catch {
    // Client ahead of migration v24: classify as if nobody were known.
    return [];
  }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Create a person, or merge into the one already holding any of these keys/phones. */
export async function savePerson(
  db: any,
  ownerId: string,
  input: {
    kind?: 'person' | 'merchant';
    name: string;
    spellings: string[];
    phones: string[];
    relationship: Relationship;
    categoryOut?: CategoryId | null;
    categoryIn?: CategoryId | null;
    note?: string | null;
  },
): Promise<Person> {
  const {keys, phones} = personKeys(input.spellings, input.phones);
  const existing = (await loadPeople(db, ownerId)).find(
    p => p.matchKeys.some(k => keys.includes(k)) || p.phones.some(ph => phones.includes(ph)),
  );
  const merged: Person = {
    id: existing?.id ?? uuid(),
    kind: input.kind ?? existing?.kind ?? 'person',
    name: input.name.trim() || existing?.name || input.spellings[0] || 'Someone',
    matchKeys: Array.from(new Set([...(existing?.matchKeys ?? []), ...keys])),
    phones: Array.from(new Set([...(existing?.phones ?? []), ...phones])),
    relationship: input.relationship,
    categoryOut: input.categoryOut ?? null,
    categoryIn: input.categoryIn ?? null,
    note: input.note ?? existing?.note ?? null,
  };
  if (existing) {
    await db.execute(
      `UPDATE people SET kind = ?, name = ?, match_keys = ?, phones = ?, relationship = ?,
              category_out = ?, category_in = ?, note = ? WHERE id = ?`,
      [merged.kind, merged.name, JSON.stringify(merged.matchKeys), JSON.stringify(merged.phones), merged.relationship,
        merged.categoryOut, merged.categoryIn, merged.note, merged.id],
    );
  } else {
    await db.execute(
      `INSERT INTO people (id, kind, name, match_keys, phones, relationship, category_out, category_in, note, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [merged.id, merged.kind, merged.name, JSON.stringify(merged.matchKeys), JSON.stringify(merged.phones), merged.relationship,
        merged.categoryOut, merged.categoryIn, merged.note, ownerId, new Date().toISOString()],
    );
  }
  return merged;
}

export async function deletePerson(db: any, id: string): Promise<void> {
  await db.execute('DELETE FROM people WHERE id = ?', [id]);
}

/**
 * Frequent counterparties that look like people and are not known yet — the
 * "Who is this?" list.
 */
export async function suggestPeople(db: any, ownerId: string, minCount = 2): Promise<PersonSuggestion[]> {
  const {rows} = await db.execute(
    `SELECT merchant, payee, pay_code, amount, transaction_type, transfer_direction, date_time
       FROM transactions WHERE owner_id = ? ORDER BY date_time DESC LIMIT 3000`,
    [ownerId],
  );
  return peopleSuggestionsFromRows((rows?._array ?? []) as any[], await loadPeople(db, ownerId), minCount);
}

/**
 * The places paid most often that are not people and not known yet — "Your
 * regular places", with what they are usually filed as today.
 */
export async function suggestPlaces(db: any, ownerId: string, minCount = 3): Promise<PlaceSuggestion[]> {
  const {rows} = await db.execute(
    `SELECT merchant, payee, pay_code, amount, category, transaction_type, date_time
       FROM transactions
      WHERE owner_id = ? AND transaction_type = 'expense'
      ORDER BY date_time DESC LIMIT 3000`,
    [ownerId],
  );
  return placeSuggestionsFromRows((rows?._array ?? []) as any[], await loadPeople(db, ownerId), minCount);
}

/** What re-filing this person's past payments would change (nothing is written). */
export async function planRefile(db: any, ownerId: string, person: Person): Promise<RefilePlan[]> {
  const {rows} = await db.execute(
    `SELECT id, merchant, payee, pay_code, category, transaction_type, transfer_direction, transfer_account_id
       FROM transactions WHERE owner_id = ?`,
    [ownerId],
  );
  return refilePlanFromRows((rows?._array ?? []) as any[], person);
}

export async function applyRefile(db: any, plans: RefilePlan[]): Promise<number> {
  for (const p of plans) {
    await db.execute(
      `UPDATE transactions SET category = ?, subcategory = ?, transaction_type = ?, transfer_direction = ?
        WHERE id = ?`,
      [p.category, p.subcategory || null, p.type, p.transferDirection, p.id],
    );
  }
  return plans.length;
}
