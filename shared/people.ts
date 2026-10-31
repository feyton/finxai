// People & places — who a counterparty IS, so money to and from them is filed
// by relationship (or by what a place is) instead of guessed.
//
// The pure half: relationships and their defaults, matching, how a person files
// a payment, the "Who is this?" / "Your regular places" suggestions, and the
// re-file plan. Shared with the web (scripts/sync-shared.mjs) so a person set
// up on one client files the same way on the other; the phone's SQL wrappers
// live in src/tools/people.ts, the web's Supabase round trips in its page.
//
// Stored in the synced `people` table (migration v24).

import {CATEGORY_META, type CategoryId, coerceForType} from './categories';
import {normalizeMerchant} from './merchantNormalize';

export type Relationship =
  | 'self' | 'spouse' | 'parent' | 'child' | 'sibling' | 'relative'
  | 'friend' | 'landlord' | 'employer' | 'business' | 'other';

export interface RelationshipDefaults {
  label: string;
  /** Chip text — short, so eleven chips fit in two rows. */
  short: string;
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
  self: {label: 'Me (another of my numbers)', short: 'Me', out: 'own_transfer', in: 'own_transfer'},
  spouse: {label: 'Spouse', short: 'Spouse', out: 'family', in: 'family_in'},
  parent: {label: 'Parent', short: 'Parent', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  child: {label: 'Child', short: 'Child', out: 'family', outSub: 'Children', in: 'family_in'},
  sibling: {label: 'Brother / sister', short: 'Sibling', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  relative: {label: 'Relative', short: 'Relative', out: 'family', outSub: 'Parents & relatives', in: 'family_in'},
  friend: {label: 'Friend', short: 'Friend', out: null, in: null},
  landlord: {label: 'Landlord', short: 'Landlord', out: 'housing', outSub: 'Rent', in: null},
  employer: {label: 'Employer', short: 'Employer', out: null, in: 'salary'},
  business: {label: 'Business / service', short: 'Business', out: null, in: null},
  other: {label: 'Other', short: 'Other', out: null, in: null},
};

export const RELATIONSHIP_ORDER: Relationship[] = [
  'self', 'spouse', 'parent', 'child', 'sibling', 'relative',
  'friend', 'landlord', 'employer', 'business', 'other',
];

export interface Person {
  id: string;
  // 'merchant' = a place the user pays often ("the corner shop is groceries"):
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

/** Last 9 digits of every phone-like number in a text: "0788 123 456" and "250788123456" agree. */
export function phoneTails(text: string): Set<string> {
  const out = new Set<string>();
  const runs = (text ?? '').replace(/[\s-]/g, '').match(/\d{9,13}/g) ?? [];
  for (const r of runs) {
    out.add(r.slice(-9));
  }
  return out;
}

/** The match keys and phone tails a person is stored with (keys under 3 chars match too much). */
export function personKeys(spellings: string[], phones: string[]): {keys: string[]; phones: string[]} {
  return {
    keys: Array.from(new Set(spellings.map(s => normalizeMerchant(s).key).filter(k => k.length >= 3))),
    phones: Array.from(new Set(phones.flatMap(p => [...phoneTails(p)]))),
  };
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

// Words that make a counterparty a business, not a person — never suggested.
// Bank/MoMo wording too: on the real phone "Card Purchase" was suggested as a
// person — it is the bank's label for card spending, not a name.
const BUSINESS_WORDS =
  /\b(ltd|limited|ltd\.|plc|sarl|company|co\.|supermarket|market|shop|store|bank|pharmacy|hotel|restaurant|cafe|bar|services?|enterprises?|group|rwanda|mtn|airtel|mokash|irembo|wasac|reg|canal|startimes|mobile money|momo|card|purchase|payments?|deposit|incoming|outgoing|charges?|fees?|atm|pos|agent|ekash|transfer|withdrawal|airtime|bundles?|loan|account|insufficient|refund|reversal)\b/i;

/** Does this counterparty name look like a person rather than a business? */
export function looksLikePerson(name: string): boolean {
  const n = (name ?? '').trim();
  if (!n || BUSINESS_WORDS.test(n)) {
    return false;
  }
  return /^[A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,3}$/.test(n);
}

/** A MoMoPay merchant code (4–6 digits), as opposed to a person's phone. */
export function isMerchantCode(payCode: string | null | undefined): boolean {
  return /^\d{4,6}$/.test(String(payCode ?? '').trim());
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

/** Rows: merchant, payee, pay_code, amount, transaction_type, transfer_direction, date_time — newest first. */
export function peopleSuggestionsFromRows(rows: any[], people: Person[], minCount = 2): PersonSuggestion[] {
  const knownKeys = new Set(people.flatMap(p => p.matchKeys));
  const knownPhones = new Set(people.flatMap(p => p.phones));
  const by = new Map<string, PersonSuggestion>();
  const merchantKeys = new Set<string>();
  for (const r of rows) {
    const raw = String(r.merchant || r.payee || '');
    if (!looksLikePerson(raw)) continue;
    // Paid through a MoMoPay MERCHANT code (4–6 digits, not a phone number) →
    // a place, whatever its name looks like. A one-word shop name paid through a
    // merchant code was suggested as a person on the real phone.
    if (isMerchantCode(r.pay_code)) {
      merchantKeys.add(normalizeMerchant(raw).key);
      continue;
    }
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
    .filter(s => s.count >= minCount && !merchantKeys.has(s.key))
    .sort((a, b) => b.count - a.count || b.outTotal + b.inTotal - (a.outTotal + a.inTotal));
}

export interface PlaceSuggestion extends PersonSuggestion {
  /** What its payments are mostly filed as today — offered first. */
  usual: CategoryId | null;
}

/**
 * The places paid most often that are not people and not known yet. Rows are
 * EXPENSES only (merchant, payee, pay_code, amount, category, date_time), newest
 * first — a place is somewhere you buy from.
 */
export function placeSuggestionsFromRows(rows: any[], people: Person[], minCount = 3): PlaceSuggestion[] {
  const knownKeys = new Set(people.flatMap(p => p.matchKeys));
  const by = new Map<string, PlaceSuggestion & {cats: Record<string, number>}>();
  for (const r of rows) {
    const raw = String(r.merchant || r.payee || '');
    if (!raw || (looksLikePerson(raw) && !isMerchantCode(r.pay_code))) continue;
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

/**
 * What re-filing this person's past payments would change (nothing is written).
 * Rows: id, merchant, payee, pay_code, category, transaction_type,
 * transfer_direction, transfer_account_id.
 */
export function refilePlanFromRows(rows: any[], person: Person): RefilePlan[] {
  const plans: RefilePlan[] = [];
  for (const r of rows) {
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
