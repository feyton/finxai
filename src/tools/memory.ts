// Memories — short facts in the user's own words that the SMS classifier reads.
//
// WHY: the classifier saw one SMS at a time and knew nothing about the person
// behind it. "0788… is my landlord", "anything to MUKAMANA is my mother",
// "Hope Bread is the bakery by the office" — facts only the user knows — had
// nowhere to live, so the same questions kept landing in the review queue.
// Merchant rules map a name to a category; they cannot hold a reason, a
// relationship, or a fact about a phone number.
//
// Modelled on Claude Code's memory: plain notes that ride along with each
// request, not a model of their own. No on-device AI — the cloud classifier
// already costs ~$0.001 per SMS, and a local model would cost gigabytes and
// battery to be less accurate. What is local is the cheap part: choosing WHICH
// notes are relevant to this SMS (pickMemories), so the prompt stays small.
//
// Stored in the synced `memories` table (migration v22).

import {normalizeMerchant} from '../../shared/merchantNormalize';
import {phoneTails} from '../../shared/people';

// Moved to shared/people.ts (the web matches phone numbers too); re-exported
// for the existing importers.
export {phoneTails};

export interface MemoryRow {
  id: string;
  text: string;
  subject: string | null;
  source: string | null;
  created_at: string | null;
}

// A memory is a sentence, not an essay — and every one may ride along with
// every SMS, so length is a cost paid thousands of times.
export const MEMORY_MAX_CHARS = 240;
// How many facts go into one classification prompt, at most.
const PROMPT_LIMIT = 12;
// Of those, how many may be general (not about this SMS's counterparty).
const GENERAL_LIMIT = 6;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function loadMemories(db: any, ownerId: string): Promise<MemoryRow[]> {
  if (!ownerId) {
    return [];
  }
  try {
    const {rows} = await db.execute(
      `SELECT id, text, subject, source, created_at FROM memories
        WHERE owner_id = ? ORDER BY created_at DESC`,
      [ownerId],
    );
    return (rows?._array ?? []) as MemoryRow[];
  } catch {
    // A missing table (client ahead of migration v22) must not break ingest.
    return [];
  }
}

/** The text as it will be stored, or '' when there is nothing to keep. */
export function cleanMemoryText(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MEMORY_MAX_CHARS);
}

/**
 * Remember a fact. Returns the stored row's id, or null when it was empty or a
 * duplicate (case-insensitive) — a repeated "remember X" is not a new fact.
 */
export async function addMemory(
  db: any,
  ownerId: string,
  text: string,
  opts: {subject?: string | null; source?: 'user' | 'coach'} = {},
): Promise<string | null> {
  const clean = cleanMemoryText(text);
  if (!clean || !ownerId) {
    return null;
  }
  const existing = await loadMemories(db, ownerId);
  if (existing.some(m => m.text.trim().toLowerCase() === clean.toLowerCase())) {
    return null;
  }
  const id = uuid();
  const subject = opts.subject ? normalizeMerchant(opts.subject).key || null : null;
  await db.execute(
    'INSERT INTO memories (id, text, subject, source, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, clean, subject, opts.source ?? 'user', ownerId, new Date().toISOString()],
  );
  return id;
}

export async function deleteMemory(db: any, id: string): Promise<void> {
  await db.execute('DELETE FROM memories WHERE id = ?', [id]);
}

/** Name words long enough to mean something on their own. */
function nameWords(name: string): string[] {
  return normalizeMerchant(name ?? '')
    .key.split(/\s+/)
    .filter(w => w.length >= 4);
}

/**
 * The facts worth sending with THIS SMS, most relevant first.
 *
 * Facts about the counterparty come first: the subject key matches, a phone
 * number in the fact is in the SMS, or a name word (4+ letters) of the
 * counterparty appears in the fact. Then general facts, newest first, up to a
 * smaller cap. Facts about some OTHER counterparty are left out — they only
 * cost tokens and invite the model to misapply them.
 */
export function pickMemories(
  memories: MemoryRow[] | undefined,
  sms: string,
  names: (string | null | undefined)[],
): string[] {
  if (!memories?.length) {
    return [];
  }
  const keys = new Set(
    names.map(n => normalizeMerchant(n ?? '').key).filter(Boolean),
  );
  const words = new Set(names.flatMap(n => nameWords(n ?? '')));
  const smsPhones = phoneTails(sms);

  const about: string[] = [];
  const general: string[] = [];
  for (const m of memories) {
    const text = m.text ?? '';
    const lower = text.toLowerCase();
    const factPhones = phoneTails(text);
    const hit =
      (m.subject && keys.has(m.subject)) ||
      [...factPhones].some(p => smsPhones.has(p)) ||
      [...words].some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
    if (hit) {
      about.push(text);
    } else if (!m.subject && factPhones.size === 0) {
      // Not about this counterparty. A fact pinned to a different number or
      // subject is left out; one that names another person only in words cannot
      // be told apart from a general fact without parsing the sentence, so it
      // rides along with the general ones — capped, newest first.
      general.push(text);
    }
  }
  return [...about.slice(0, PROMPT_LIMIT), ...general.slice(0, GENERAL_LIMIT)].slice(
    0,
    PROMPT_LIMIT,
  );
}
