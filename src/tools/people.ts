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

import {CATEGORY_META, CategoryId, coerceForType} from '../theme';
import {normalizeMerchant} from '../../shared/merchantNormalize';
import {phoneTails} from './memory';

export type Relationship =
  | 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'relative'
  | 'friend' | 'landlord' | 'employer' | 'business' | 'other';

interface RelationshipDefaults {
  label: string;
  out: CategoryId | null;
  outSub?: string;
  in: CategoryId | null;
  inSub?: string;
}

/**
 * Sensible defaults per relationship — every one editable per person. null
 * means "the purpose varies": keep asking (a friend may be lunch or a loan).
 */
export const RELATIONSHIPS: Record<Relationship, RelationshipDefaults> = {
  self: {label: 'Me (another of my numbers)', out: 'own_transfer', in: 'own_transfer'},
  spouse: {label: 'Spouse', out: 'family', in: 'family_in'},
  parent: {label: 'Parent', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  child: {label: 'Child', out: 'family', outSub: 'Children', in: 'family_in'},
  sibling: {label: 'Brother / sister', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  relative: {label: 'Relative', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  friend: {label: 'Friend', out: null, in: null},
  landlord: {label: 'Landlord', out: 'housing', outSub: 'Rent', in: null},
  employer: {label: 'Employer', out: null, in: 'salary'},
  business: {label: 'Business / service', out: null, in: null},
  other: {label: 'Other', out: null, in: null},
};

export const RELATIONSHIP_ORDER: Relationship[] = [
  'self', 'spouse', 'parent', 'child', 'sibling', 'relative',
  'friend', 'landlord', 'employer', 'business', 'other',
];

export interface Person {
  id: string;
  // 'merchant' = a place the user pays often ("Hope Bread is the bakery"):
  // filed by what the user says it IS, the same deterministic way as a person.
  kind: 'person' | 'merchant';
  name: string;
  matchKeys: string[];
  phones: string[];
  relationship: Relationship;
  categoryOut: CategoryId | null;
  categoryIn: CategoryId | null;
  note: string | null;
}

const parseArr = (s: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export function personFromRow(r: any): Person {
  const rel = (r.relationship ?? 'other') as Relationship;
  return {
    id: r.id,
    kind: r.kind === 'merchant' ? 'merchant' : 'person',
    name: r.name ?? '',
    matchKeys: parseArr(r.match_keys),
    phones: parseArr(r.phones),
    relationship: RELATIONSHIPS[rel] ? rel : 'other',
    categoryOut: (r.category_out && CATEGORY_META[r.category_out as CategoryId] ? r.category_out : null) as CategoryId | null,
    categoryIn: (r.category_in && CATEGORY_META[r.category_in as CategoryId] ? r.category_in : null) as CategoryId | null,
    note: r.note ?? null,
  };
}

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

/** The person an SMS is about: a phone number in it, or a known spelling. */
export function matchPerson(
  people: Person[] | undefined,
  sms: string,
  names: (string | null | undefined)[],
): Person | null {
  if (!people?.length) {
    return null;
  }
  const smsPhones = phoneTails(sms);
  const keys = new Set(names.map(n => normalizeMerchant(n ?? '').key).filter(Boolean));
  return (
    people.find(p => p.phones.some(ph => smsPhones.has(ph))) ??
    people.find(p => p.matchKeys.some(k => keys.has(k))) ??
    null
  );
}

/**
 * How money with this person is filed, for this direction — or null when the
 * person's purpose varies and the model should still be asked.
 */
export function personCategory(
  person: Person,
  direction: 'debit' | 'credit',
): {category: CategoryId; subcategory: string} | null {
  const d = RELATIONSHIPS[person.relationship];
  const out = direction === 'debit';
  const cat = out ? person.categoryOut ?? d.out : person.categoryIn ?? d.in;
  if (!cat) {
    return null;
  }
  const usedDefault = out ? !person.categoryOut : !person.categoryIn;
  const sub = usedDefault ? (out ? d.outSub : d.inSub) ?? '' : '';
  return {category: cat, subcategory: sub};
}

/** One line of context for the model when the person's purpose varies. */
export function personContextLine(person: Person): string {
  return `The counterparty is the account holder's ${RELATIONSHIPS[person.relationship].label.toLowerCase()} (${person.name}).`;
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
  const keys = Array.from(new Set(input.spellings.map(s => normalizeMerchant(s).key).filter(k => k.length >= 3)));
  const phones = Array.from(new Set(input.phones.flatMap(p => [...phoneTails(p)])));
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

// Words that make a counterparty a business, not a person — never suggested.
const BUSINESS_WORDS =
  /\b(ltd|limited|ltd\.|plc|sarl|company|co\.|supermarket|market|shop|store|bank|pharmacy|hotel|restaurant|cafe|bar|services?|enterprises?|group|rwanda|mtn|airtel|mokash|irembo|wasac|reg|canal|startimes|mobile money|momo)\b/i;

/** Does this counterparty name look like a person rather than a business? */
export function looksLikePerson(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n || BUSINESS_WORDS.test(n)) {
    return false;
  }
  return /^[A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,3}$/.test(n);
}

export interface PersonSuggestion {
  key: string;
  name: string;
  spellings: string[];
  phones: string[];
  count: number;
  outTotal: number;
  inTotal: number;
  lastAt: string;
}

/**
 * Frequent counterparties that look like people and are not known yet — the
 * "Who is this?" list. Excludes the user's own name (that is `self`, and the
 * transfer detector already knows it) only if a person for it exists.
 */
export async function suggestPeople(db: any, ownerId: string, minCount = 2): Promise<PersonSuggestion[]> {
  const {rows} = await db.execute(
    `SELECT merchant, payee, pay_code, amount, transaction_type, transfer_direction, date_time
       FROM transactions WHERE owner_id = ? ORDER BY date_time DESC LIMIT 3000`,
    [ownerId],
  );
  const people = await loadPeople(db, ownerId);
  const knownKeys = new Set(people.flatMap(p => p.matchKeys));
  const knownPhones = new Set(people.flatMap(p => p.phones));
  const by = new Map<string, PersonSuggestion>();
  for (const r of (rows?._array ?? []) as any[]) {
    const raw = String(r.merchant || r.payee || '');
    if (!looksLikePerson(raw)) continue;
    const key = normalizeMerchant(raw).key;
    if (!key || knownKeys.has(key)) continue;
    const phones = [...phoneTails(String(r.pay_code ?? ''))];
    if (phones.some(ph => knownPhones.has(ph))) continue;
    const s: PersonSuggestion = by.get(key) ?? {
      key, name: normalizeMerchant(raw).display, spellings: [], phones: [], count: 0, outTotal: 0, inTotal: 0, lastAt: r.date_time,
    };
    s.count++;
    const inbound = r.transaction_type === 'income' || r.transfer_direction === 'in';
    if (inbound) s.inTotal += r.amount ?? 0; else s.outTotal += r.amount ?? 0;
    if (!s.spellings.includes(raw)) s.spellings.push(raw);
    for (const ph of phones) if (!s.phones.includes(ph)) s.phones.push(ph);
    by.set(key, s);
  }
  return [...by.values()]
    .filter(s => s.count >= minCount)
    .sort((a, b) => b.count - a.count || b.outTotal + b.inTotal - (a.outTotal + a.inTotal));
}

export interface PlaceSuggestion extends PersonSuggestion {
  /** What its payments are mostly filed as today — offered first. */
  usual: CategoryId | null;
}

/**
 * The places paid most often that are not people and not known yet — "Your
 * regular places". Money OUT only (a place you buy from), at least `minCount`
 * payments, with what they are usually filed as today.
 */
export async function suggestPlaces(db: any, ownerId: string, minCount = 3): Promise<PlaceSuggestion[]> {
  const {rows} = await db.execute(
    `SELECT merchant, payee, pay_code, amount, category, transaction_type, date_time
       FROM transactions
      WHERE owner_id = ? AND transaction_type = 'expense'
      ORDER BY date_time DESC LIMIT 3000`,
    [ownerId],
  );
  const known = await loadPeople(db, ownerId);
  const knownKeys = new Set(known.flatMap(p => p.matchKeys));
  const by = new Map<string, PlaceSuggestion & {cats: Record<string, number>}>();
  for (const r of (rows?._array ?? []) as any[]) {
    const raw = String(r.merchant || r.payee || '');
    if (!raw || looksLikePerson(raw)) continue;
    const key = normalizeMerchant(raw).key;
    if (!key || key.length < 3 || knownKeys.has(key)) continue;
    const s: PlaceSuggestion & {cats: Record<string, number>} = by.get(key) ?? {
      key, name: normalizeMerchant(raw).display, spellings: [], phones: [], count: 0, outTotal: 0, inTotal: 0,
      lastAt: r.date_time, usual: null, cats: {},
    };
    s.count++;
    s.outTotal += r.amount ?? 0;
    s.cats[r.category ?? ''] = (s.cats[r.category ?? ''] ?? 0) + 1;
    if (!s.spellings.includes(raw)) s.spellings.push(raw);
    by.set(key, s);
  }
  return [...by.values()]
    .filter(s => s.count >= minCount)
    .map(({cats, ...s}) => {
      const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0];
      const usual = top && CATEGORY_META[top as CategoryId] ? (top as CategoryId) : null;
      return {...s, usual};
    })
    .sort((a, b) => b.count - a.count || b.outTotal - a.outTotal);
}

// Categories a person's past payments may be moved FROM — the generic ones.
// Anything the user (or the model) filed specifically is left alone.
const GENERIC = new Set(['other_spending', 'other_income', 'family', 'family_in', 'own_transfer']);

export interface RefilePlan {
  id: string;
  category: CategoryId;
  subcategory: string;
  type: 'expense' | 'income' | 'transfer';
  transferDirection: string | null;
}

/** What re-filing this person's past payments would change (nothing is written). */
export async function planRefile(db: any, ownerId: string, person: Person): Promise<RefilePlan[]> {
  const {rows} = await db.execute(
    `SELECT id, merchant, payee, pay_code, category, transaction_type, transfer_direction, transfer_account_id
       FROM transactions WHERE owner_id = ?`,
    [ownerId],
  );
  const plans: RefilePlan[] = [];
  for (const r of (rows?._array ?? []) as any[]) {
    const keyHit = person.matchKeys.includes(normalizeMerchant(String(r.merchant || r.payee || '')).key);
    const phoneHit = [...phoneTails(String(r.pay_code ?? ''))].some(ph => person.phones.includes(ph));
    if (!keyHit && !phoneHit) continue;
    // A PERSON only moves generic rows — a specific choice about one payment to
    // them stays. A PLACE moves its spending rows from anything: the user just
    // said what the place IS. Transfers are never touched by a place.
    if (person.kind === 'merchant') {
      if (r.transaction_type !== 'expense') continue;
    } else if (!GENERIC.has(String(r.category ?? ''))) {
      continue;
    }
    // A PROVEN own-account transfer is never re-filed by a person rule.
    if (r.transfer_account_id) continue;
    const inbound = r.transaction_type === 'income' || r.transfer_direction === 'in';
    const pc = personCategory(person, inbound ? 'credit' : 'debit');
    if (!pc) continue;
    const kind = CATEGORY_META[pc.category].kind;
    const type: RefilePlan['type'] = kind === 'income' ? 'income' : kind === 'expense' ? 'expense' : 'transfer';
    const dir = type === 'transfer' ? (inbound ? 'in' : 'out') : null;
    const category = coerceForType(pc.category, type, dir);
    if (category === r.category && type === r.transaction_type) continue;
    plans.push({id: r.id, category, subcategory: pc.subcategory, type, transferDirection: dir});
  }
  return plans;
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
