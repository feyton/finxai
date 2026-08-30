// AI-assisted SMS parser.
//
// Split responsibility for consistency:
//   • regex extracts the DETERMINISTIC facts (amount, fee, balance, ref,
//     direction, status, a channel hint) — these are structurally reliable
//     in RW SMS.
//   • The model does only the FUZZY classification (clean merchant name,
//     category, payment channel), guided by the user's learned corrections.
// Classification runs through FinXAI's own server (see ./aiProxyClient); the
// provider is the user's choice and the key is held server-side, never on the
// phone. If the server call is unavailable/fails for any reason we degrade to
// regex-only (low confidence) rather than blocking the transaction.

import {classifySms} from './aiProxyClient';
import type {MerchantChannel} from './merchantMemory';
// Pure helpers only — importing ./merchantMemory itself would pull AsyncStorage
// into this module and into every plain-Jest test that touches the parser.
import {
  isUsablePattern,
  normalizeMerchant,
  ruleDisplayName,
} from './merchantNormalize';
import {MerchantRule, ParsedSMS} from './smsTypes';
import {pickSmsFormat} from './smsFormats';
// Pure rules the web needs too, so they live in shared/ rather than here. Re-exported
// below so every existing `from './smsParser'` import keeps working unchanged.
import {extractBalance} from '../../shared/balanceReplay';
import {
  normalizeAccountNumber,
  resolveDirection,
} from '../../shared/smsDirection';
import {CATS as CAT_MAP, CategoryId, resolveCat} from '../theme';
import categoriesData from './data.json';

// Derived from CATS rather than hand-maintained — this string drifted out of
// sync with theme.ts before, so the model was never told some categories
// existed and could not pick them.
const CATS = Object.keys(CAT_MAP).join(', ');
const CHANNELS =
  'MoMoPay, Send money, Receive, Bank transfer, Cash Power, Airtime, Bill, Other';

// One line per genuinely ambiguous boundary. A bare list of category keys gives
// the model no way to decide the cases that actually matter in Rwanda — most of
// all person-to-person MoMo, which can legitimately read as family, transport,
// food, or a service depending on who the counterparty is.
const CATEGORY_HINTS = [
  '  • food vs groceries: a prepared meal/restaurant/cafe is food; supermarket or market shopping to cook later is groceries.',
  // Measured against 263 real labelled messages: the previous version of this
  // line said "money to/from a PERSON is family", and the model obeyed it —
  // which produced the single largest error cluster, because the user
  // categorises person-to-person payments by PURPOSE (paying an individual for
  // a meal is food, for a ride is transport, being paid by one is salary), not
  // by who the counterparty is.
  '  • paying an individual is NOT automatically family. Rwandan MoMo is used to pay people for ordinary goods and services, so judge by purpose when the message hints at one. Use family only for genuine support/remittance between relatives.',
  '  • a person paying the USER is usually salary or a repayment, not family.',
  '  • IMPORTANT: for a payment to a bare personal name with no clue to the purpose ("payment of 6,300 RWF to Lambert 005868"), the category is genuinely not knowable from the message. Give your best guess but set confidence LOW (≤ 0.5) so the user is asked — their answer is then remembered for that counterparty.',
  '  • savings is only the user moving money into their own savings pocket (e.g. Mokash), never a payment to another person.',
  '  • airtime vs utilities: phone credit and data bundles are airtime; electricity (Cash Power), water (WASAC) and similar household services are utilities.',
  '  • housing vs rent: a monthly rent payment is rent; purchases for the home itself (furniture, repairs, fittings) are housing.',
  '  • personal_care vs health: salon, barber, beauty and grooming are personal_care; clinic, pharmacy and hospital are health.',
  '  • debt vs family: repaying a loan or credit facility is debt, even when paid to a person.',
  '  • transport: moto, taxi, bus, fuel, and ride-hailing.',
  "  • misc: use only when nothing else fits — prefer a real category when the merchant's business is identifiable.",
].join('\n');

// Same grouping useSubcategories() computes for the pickers (built-ins only —
// the AI has no visibility into a user's custom subcategories), so a guess
// here is always one the user can actually see/select in the Fix sheet.
const SUBCATS_BY_CAT: Partial<Record<CategoryId, string[]>> = (() => {
  const map: Partial<Record<CategoryId, string[]>> = {};
  for (const c of (categoriesData as any).categories as any[]) {
    const cat = resolveCat(c.name);
    const names = (c.subcategories ?? []).map((s: any) => s.name);
    map[cat] = [...(map[cat] ?? []), ...names];
  }
  return map;
})();

const SUBCATS_PROMPT_BLOCK = Object.entries(SUBCATS_BY_CAT)
  .filter(([, names]) => (names as string[]).length > 0)
  .map(([cat, names]) => `- ${cat}: ${(names as string[]).join(', ')}`)
  .join('\n');

// ── Parse context: the user's own accounts, for direction + transfer match ──
export interface OwnAccountRef {
  id: string;
  name: string;
  number?: string | null; // user-entered account / phone number
}

export interface ParseContext {
  userName?: string;
  // ALL of the user's accounts (not just the one being processed) — used to
  // recognise inter-account transfers by account/phone number.
  accounts?: OwnAccountRef[];
  // The account this SMS arrived for (its sender address matched).
  currentAccountId?: string;
  // Learned merchant rules. category === 'transfer' means the user taught us
  // this counterparty IS a transfer; any real category means it is NOT one.
  rules?: MerchantRule[];
  // SMS sender address (e.g. 'M-Money', 'BK BANK'), used to select the
  // provider-specific prompt/extractor in ./smsFormats.
  sender?: string;
}

// Find the learned rule for a merchant name.
//
// Matching is deliberately tiered, because the old one-line version
// (`norm.includes(r.pattern) || r.pattern.includes(norm)`) misfired badly:
//   • A rule stored under 'unknown' — trivially created by fixing a record
//     whose merchant read "Unknown" — matched EVERY unparseable SMS, and the
//     caller then forced confidence to 0.95, above THRESHOLD_AUTO_SAVE. Those
//     records were silently auto-saved with no review.
//   • Two-or-three character patterns ('bk', 'mtn') matched unrelated names
//     anywhere they appeared as a substring.
// `exact` is reported so callers can treat a fuzzy hit as weaker evidence.
export function findRule(
  rules: MerchantRule[] | undefined,
  merchant: string,
): (MerchantRule & {exact: boolean}) | undefined {
  if (!rules?.length || !merchant) {
    return undefined;
  }
  const key = normalizeMerchant(merchant).key;
  if (!isUsablePattern(key)) {
    return undefined;
  }

  const usable = rules.filter(r => isUsablePattern(r.pattern ?? ''));

  // 1. Exact key match — the only kind we fully trust.
  const exact = usable.find(r => r.pattern === key);
  if (exact) {
    return {...exact, exact: true};
  }

  // 2. Whole-word containment, and only for patterns long enough to be
  //    meaningful. Longest pattern first so the most specific rule wins.
  const wordBoundary = usable
    .filter(r => r.pattern.length >= 4)
    .sort((a, b) => b.pattern.length - a.pattern.length)
    .find(r => {
      const escaped = r.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`).test(key);
    });
  return wordBoundary ? {...wordBoundary, exact: false} : undefined;
}

// Try several candidate spellings of the same counterparty and take the best
// hit. An EXACT match on any candidate beats a fuzzy match on all of them.
//
// Why: a rule used to be looked up against the model's cleaned name only, so it
// fired only if that cleaning was byte-stable across calls. It isn't reliably —
// the prompt itself changes between calls as learned rules change, so "Sawa
// Citi" vs "Sawa Citi Ltd" can come back differently and normalize to
// different keys. Checking the deterministic name and the regex name too is
// what makes "my fix stuck" hold.
export function findRuleForNames(
  rules: MerchantRule[] | undefined,
  names: (string | null | undefined)[],
): (MerchantRule & {exact: boolean}) | undefined {
  let fuzzy: (MerchantRule & {exact: boolean}) | undefined;
  const seen = new Set<string>();
  for (const name of names) {
    if (!name) {
      continue;
    }
    const key = normalizeMerchant(name).key;
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const hit = findRule(rules, name);
    if (hit?.exact) {
      return hit;
    }
    fuzzy = fuzzy ?? hit;
  }
  return fuzzy;
}

// Transfer verdict with clear precedence: account-number PROOF beats
// everything; then the user's learned rule; then the name/Mokash heuristics.
function resolveTransfer(
  facts: RegexFacts,
  rule: MerchantRule | undefined,
  raw: string,
  userName?: string,
  modelSaysTransfer?: boolean,
): boolean {
  if (facts.transferAccount) {
    return true;
  }
  if (rule) {
    return rule.category === 'transfer';
  }
  return modelSaysTransfer === true || detectTransfer(raw, userName);
}

// ── Deterministic regex extraction ─────────────────────────────
// Handles decimals ("RWF 300000.00") and thousands separators.
function num(s: string | undefined): number {
  if (!s) {
    return 0;
  }
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : Math.round(n);
}

// Compares account/phone numbers loosely: 250787241457 ≡ 0787241457 ≡ 787241457.
// Implementation in shared/smsDirection.ts, alongside the direction rule that needs it.
export {normalizeAccountNumber};

// FAILED / REVERSED transactions must never become records.
export function detectStatus(raw: string): 'completed' | 'failed' | null {
  if (
    /\bhas\s+FAILED\b|status\s*:?\s*FAILED|\bREVERSED\b|\bDECLINED\b|\bunsuccessful\b|could\s+not\s+be\s+(?:completed|processed)|ntabwo\s+ufite\s+amafaranga\s+ahagije/i.test(
      raw,
    )
  ) {
    return 'failed';
  }
  if (/status\s*:?\s*(?:COMPLETED|SUCCESS(?:FUL)?)\b/i.test(raw)) {
    return 'completed';
  }
  return null;
}

// Authoritative post-transaction balance the SMS reports (shared/balanceReplay.ts —
// the balance recomputation needs it, and so does the web).
export {extractBalance};

// "Date: 7/2/26, 9:31 AM" (BK alert format, M/D/YY) → ISO string.
function extractOccurredAt(raw: string): string | null {
  const m = raw.match(
    /date\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i,
  );
  if (!m) {
    return null;
  }
  const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  let hour = m[4] ? parseInt(m[4], 10) : 0;
  const min = m[5] ? parseInt(m[5], 10) : 0;
  const ampm = (m[6] ?? '').toUpperCase();
  if (ampm === 'PM' && hour < 12) {
    hour += 12;
  }
  if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }
  const d = new Date(year, month, day, hour, min);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// BPR alert format: "on 20 JUL 2026-19:28:17" (DD MON YYYY-HH:MM:SS).
function extractBprDate(raw: string): string | null {
  const m = raw.match(
    /\bon\s+(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})-(\d{1,2}):(\d{2})(?::(\d{2}))?/i,
  );
  if (!m) {
    return null;
  }
  const month = MONTH_INDEX[m[2].toLowerCase()];
  if (month == null) {
    return null;
  }
  const d = new Date(
    parseInt(m[3], 10),
    month,
    parseInt(m[1], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    m[6] ? parseInt(m[6], 10) : 0,
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// BK's second alert format (a different sender, "BK BANK"): "on
// 23-07-2026 19:05:37" (DD-MM-YYYY HH:MM:SS, 24h, dashes not slashes —
// distinct from both the "Date: M/D/YY" original BK format and BPR's
// "on D MON YYYY-HH:MM:SS").
function extractBkV2Date(raw: string): string | null {
  const m = raw.match(
    /\bon\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/i,
  );
  if (!m) {
    return null;
  }
  const d = new Date(
    parseInt(m[3], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[1], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Sums ALL named charges in one SMS — some banks (BPR) deduct MULTIPLE
// charges from a single transaction (Transaction Charge + Notification
// Charge, both applied regardless of direction). A single-match regex here
// silently undercounts the fee; summing is safe because a real bank SMS
// never mentions an unrelated charge/fee amount alongside the transaction's
// own. Verified against a real BPR statement's balance chain (see
// __tests__/smsParser.test.ts) — BK's single "Transaction Charge" still
// sums to the same one value, no regression.
function extractFees(raw: string): number {
  const re = /\b(?:(?:[a-z]+\s+)?charges?|fees?)\b\s*(?:was)?\s*[:=]?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/gi;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    total += num(m[1]);
  }
  return total;
}

// ── BPR-style transfer-confirmation messages ────────────────────
// BPR sends a SEPARATE "Transaction Ref: X of RWF Y from A/c P to A/c Q on
// D/M/YYYY is Completed / is Your request is being processing..." message
// for every transfer — IN ADDITION to the authoritative "your account has
// been debited/credited ... Your balance is RWF Z" alert that already
// carries the real transaction (often 2-3 of these per transfer). Without
// filtering, each transfer would create 2-3 duplicate records on top of the
// real one — these must never become transactions on their own.
export function isTransferStatusOnly(raw: string): boolean {
  return /transaction\s+ref\s*:\s*\S+\s+of\s+RWF[\d,.\s]+from\s+A\/c\s*[\d*]+\s+to\s+A\/c\s*([\d*]+)\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s+is\s+(?:completed|your request is being processing)/i.test(
    raw,
  );
}

export interface TransferHint {
  amount: number;
  dateKey: string; // 'YYYY-MM-DD', from the confirmation message's own date
  destSuffix: string; // trailing visible digits of the destination account
  // Trailing digits of the SOURCE account. Was previously parsed and thrown
  // away, which left hint matching on amount+day only — loose enough that two
  // unrelated same-amount movements on one day could collide.
  srcSuffix: string;
}

// Trailing contiguous digit run of a masked account string, e.g.
// "0*****2911" → "2911", "4******947" → "947". The only STABLE part of a
// masked number — how many leading digits a bank exposes varies by template,
// even for the SAME account across two message types from the same bank.
export function trailingDigits(masked: string): string {
  return masked.match(/(\d+)\s*$/)?.[1] ?? '';
}

// "your account ********5558 has been credited/debited ..." — extracts the
// (often masked) account reference an alert names. This is a MORE reliable
// way to find which of the user's accounts an SMS belongs to than the
// sender address alone: a bank can (and does — see Bank of Kigali's second
// "BK BANK" sender) change or add sender IDs at any time, but the account
// number it reports never changes. Used as a fallback route when no
// configured sender address matches the SMS's actual sender.
export function extractAccountRef(raw: string): string | null {
  return raw.match(/your\s+account\s+([\d*]{4,})/i)?.[1] ?? null;
}

// Loose masked-number match: true when the shorter trailing-digit run is a
// suffix of the longer one. Handles the SAME account being masked to a
// different visible length by different SMS templates (BPR shows 3 trailing
// digits in its debit alert, 4 in its transfer confirmation).
// NOTE: with only 3-4 digits of entropy this can in rare cases collide with
// an unrelated external number sharing the same trailing digits — an
// accepted heuristic risk, same class as BK's exact-account-number matching.
export function maskedSuffixMatches(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const len = Math.min(a.length, b.length);
  if (len < 3) {
    return false; // too short to mean anything
  }
  return a.slice(-len) === b.slice(-len);
}

// Extracts {amount, dateKey, destSuffix} from a BPR-style transfer
// confirmation, for transfer-detection correlation BEFORE the message
// itself is discarded (see isTransferStatusOnly). BPR's own pairing of "on
// 20/07/2026" (confirmation) with "on 20 JUL 2026" (debit alert) confirms
// this date is D/M/YYYY, not M/D/YYYY.
export function extractTransferHint(raw: string): TransferHint | null {
  const m = raw.match(
    /of\s+RWF\s*([\d,.]+)\s+from\s+A\/c\s*([\d*]+)\s+to\s+A\/c\s*([\d*]+)\s+on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+is\s+(?:completed|your request is being processing)/i,
  );
  if (!m) {
    return null;
  }
  const amount = num(m[1]);
  const srcSuffix = trailingDigits(m[2]);
  const destSuffix = trailingDigits(m[3]);
  if (!destSuffix || amount <= 0) {
    return null;
  }
  const day = m[4].padStart(2, '0');
  const month = m[5].padStart(2, '0');
  return {amount, dateKey: `${m[6]}-${month}-${day}`, destSuffix, srcSuffix};
}

// 'YYYY-MM-DD' in LOCAL time — for matching a parsed transaction's own date
// against a TransferHint's dateKey.
export function dateKeyFromIso(iso: string | null, fallbackMs?: number): string {
  const d = iso ? new Date(iso) : new Date(fallbackMs || Date.now());
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export interface RegexFacts {
  direction: 'credit' | 'debit';
  amount: number;
  fee: number;
  balance_after: number | null;
  txn_ref: string | null;
  status: 'completed' | 'failed' | null;
  occurred_at: string | null;
  channelHint: string;
  // The payee's identifier on the rail that was used — a MoMoPay merchant code
  // or the recipient's phone number. This is what "pay again" dials.
  payCode: string | null;
  // BK alert format: the account on the other side of the movement.
  counterpartyNumber: string | null;
  // Set when the counterparty is one of the user's OWN accounts.
  transferAccount: OwnAccountRef | null;
}

export function regexExtract(raw: string, ctx?: ParseContext): RegexFacts {
  const status = detectStatus(raw);

  // Direction lives in shared/smsDirection.ts: the web re-derives it from the same SMS
  // body when it promotes a pending record, and a looser second copy there would read
  // the word "Credited" in a Bank of Kigali alert and flip a transfer's sign.
  const dir = resolveDirection<OwnAccountRef>(raw, {
    accounts: ctx?.accounts,
    currentAccountId: ctx?.currentAccountId,
  });
  const direction = dir.direction;

  // Which account is on the OTHER side of the movement — only the BK alert format
  // names one, so this stays here rather than in the shared rule.
  let counterpartyNumber: string | null = null;
  let transferAccount: OwnAccountRef | null = null;
  if (dir.credited || dir.debited) {
    counterpartyNumber = direction === 'debit' ? dir.credited : dir.debited;
    const other = direction === 'debit' ? dir.creditedOwn : dir.debitedOwn;
    if (other && other.id !== ctx?.currentAccountId) {
      transferAccount = other;
    }
  }

  // Amount: prefer the labelled "Amount: RWF 45,000" (BK), fall back to the
  // first RWF/FRW-adjacent number.
  const labelled = raw.match(/amount\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i);
  const generic = raw.match(
    /(?:RWF|FRW)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:RWF|FRW)/i,
  );
  const amount = labelled ? num(labelled[1]) : num(generic?.[1] ?? generic?.[2]);

  // Fee: "Fee 100 RWF", "fee was: 100", "Transaction Charge: RWF 200" — summed
  // across ALL named charges (see extractFees for why).
  const fee = extractFees(raw);

  const balance_after = extractBalance(raw);
  const txn_ref =
    raw.match(
      /(?:TxId|FT Id|Ref|Txn ID|transaction id|event\s*#)[:\s#]*([A-Za-z0-9]+)/i,
    )?.[1] ?? null;

  return {
    direction,
    amount,
    fee,
    balance_after,
    txn_ref,
    status,
    occurred_at: extractOccurredAt(raw) ?? extractBprDate(raw) ?? extractBkV2Date(raw),
    channelHint: detectChannel(raw, direction === 'credit'),
    payCode: extractPayCode(raw),
    counterpartyNumber,
    transferAccount,
  };
}

// ── Pay code ───────────────────────────────────────────────────
//
// Deterministic, so it lives with the regex facts rather than the model half:
// the code is the difference between dialling the right merchant and sending
// money to a stranger, and a fuzzy answer there is worse than no answer.
//
// Two real shapes, both from MTN MoMo confirmations, where the identifier
// trails the payee name:
//   "...to THRIVE G Ltd 888840 was completed at ..."   -> merchant code
//   "...to JOHN DOE 250788999888 has been completed."  -> phone number
//   "...to SAWA CITI LTD has been completed."          -> none, correctly null
//
// Anchoring on the "was/has been completed" tail is what keeps this honest:
// an unanchored "trailing digits" rule happily returns a balance, a fee or a
// date fragment.
const PAY_CODE_RE =
  /\bto\s+[^.]{0,80}?\b(\d{4,15})\s*(?:has\s+been|was)\s+(?:completed|paid)/i;
// Some networks echo the USSD string that was dialled; when present it is the
// most direct statement of the merchant code there is.
const USSD_MERCHANT_RE = /\*182\*8\*1\*(\d{4,10})/;
// "You have sent 5,000 RWF to JOHN 0788123456"
const SENT_TO_RE = /\bsent\b[^.]{0,80}?\bto\s+[^.]{0,60}?\b((?:250)?0?7\d{8})\b/i;

/**
 * Canonical local form, so the same payee aggregates as one merchant however
 * the network wrote it: 250788999888 / 788999888 / 0788999888 all collapse to
 * 0788999888. Merchant codes are left exactly as printed.
 */
function normalisePayCode(digits: string): string {
  const local = digits.replace(/^250/, '');
  if (/^7\d{8}$/.test(local)) {
    return `0${local}`;
  }
  return local;
}

export function extractPayCode(raw: string): string | null {
  const ussd = USSD_MERCHANT_RE.exec(raw);
  if (ussd) {
    return ussd[1];
  }
  const m = PAY_CODE_RE.exec(raw) ?? SENT_TO_RE.exec(raw);
  if (!m) {
    return null;
  }
  const code = normalisePayCode(m[1]);
  // A bare 4-digit "code" is as likely to be a year or a truncated reference as
  // a merchant, and dialling a wrong merchant code moves real money. Phone
  // numbers are exempt: they are self-identifying by shape.
  if (!/^0?7\d{8}$/.test(code) && code.length < 5) {
    return null;
  }
  return code;
}

function detectChannel(raw: string, isCredit: boolean): string {
  const s = raw.toLowerCase();
  if (/cash\s?power|electricity|token|\breg\b/.test(s)) {return 'Cash Power';}
  if (/airtime|bundle|\b\d+\s?(mb|gb)\b|data pack/.test(s)) {return 'Airtime';}
  if (/wasac|water|bill payment|\btv\b|canal|dstv|startimes/.test(s)) {return 'Bill';}
  if (/credited account|debited account/.test(s)) {return 'Bank transfer';}
  if (isCredit) {return 'Receive';}
  if (/momo\s?pay|momopay|paid to|payment of .* to |completed payment/.test(s)) {return 'MoMoPay';}
  if (/sent to|you have sent|transfer(?:red)? to/.test(s)) {return 'Send money';}
  if (/debited|narration|account\s*\d/.test(s)) {return 'Bank transfer';}
  return 'Other';
}

// Where a counterparty name ends. Shared by every "name follows a preposition"
// pattern below: cut at the sentence tail ("was completed"), an " at <date>"
// clause, an opening paren (a masked phone number), a period, or end of string.
const NAME_STOP = String.raw`(?=\s+(?:was|has\s+been|is)\s+(?:completed|successful|processed)\b|\s+at\s+\d|\s*[.(]|\s*$)`;

// The counterparty names we can derive WITHOUT the model, cheapest first.
// Used to scope the learned-rule lookup (and to decide whether the model call
// is needed at all) before spending a network round-trip.
export function candidateNames(raw: string, facts: RegexFacts, sender = ''): string[] {
  const out: string[] = [];
  const deterministic = pickSmsFormat(sender, raw).extractCounterparty?.(raw);
  if (deterministic?.name) {
    out.push(deterministic.name);
  }
  const viaRegex = regexClassify(raw, facts).merchant;
  if (viaRegex && viaRegex !== 'Unknown') {
    out.push(viaRegex);
  }
  return out;
}

// Regex-only merchant + category guess (fallback when no AI).
function regexClassify(
  raw: string,
  facts: RegexFacts,
): {merchant: string; category: CategoryId} {
  let merchant = 'Unknown';

  // BK alert header: "TRANSFER - MTN mobile money Credited account: ..." /
  // "Bill payment - Cash Power Electricity Credited account: ..."
  const bkHead = raw.match(
    /^\s*(?:TRANSFER|BILL\s*PAYMENT|PAYMENT)\s*-\s*([\s\S]*?)\s+(?:credited|debited)\s+account/i,
  );
  // MTN MoMo's merchant template: "A transaction of 2000 RWF by ComzAfrica
  // Rwanda Limited was completed at ...". There was previously NO pattern for
  // this at all, so the most common MTN merchant alert fell through every
  // branch and came out as 'Unknown'.
  const byMerchant = raw.match(
    new RegExp(String.raw`\btransaction\s+of\s+[\d,.]+\s*(?:RWF|FRW)\s+by\s+(.+?)` + NAME_STOP, 'i'),
  );
  // These three previously captured with `([^.]+)` / `([^\(.]+)`, which only
  // stopped at a period or paren — so "to Valentine 002597 was completed at
  // 2026-07-29 11:37:48" was captured whole, timestamp included, making the
  // learned rule key unique per message and therefore never reusable.
  const payTo = raw.match(
    new RegExp(String.raw`payment\s+of\s+[\d,.]+\s*(?:RWF|FRW)\s+to\s+(.+?)` + NAME_STOP, 'i'),
  );
  // `.+?` is deliberately LAZY: with a greedy `.+` this bound to the LAST
  // " from " in the message, so "You have received ... from FABRICE ...
  // Message from sender: ." yielded the merchant "sender:".
  const from = raw.match(
    new RegExp(String.raw`received\s+.+?\bfrom\s+(.+?)` + NAME_STOP, 'i'),
  );
  const sentTo = raw.match(
    new RegExp(String.raw`sent\s+to\s+(.+?)` + NAME_STOP, 'i'),
  );
  const narration = raw.match(/narration:\s*([^.]+)/i);
  // BK's second alert format ("BK BANK" sender): "... Txn Description:
  // Card Purchase. Txn Charge: ..." — no counterparty name either, but the
  // description (Card Purchase, EKASH P2P-NEW APP, Incoming Trsf frm local
  // banks, ...) is a far better label than "Unknown".
  const txnDesc = raw.match(/txn\s*description\s*:?\s*([^.]+)/i);
  // BPR-style: "... at BPR Bank. Transaction Charge: ..." — no counterparty
  // name is disclosed, but naming the bank/agent beats "Unknown".
  const atBank = raw.match(
    /\bat\s+([A-Z][A-Za-z0-9&. ]{2,30}?)\.\s*(?:Transaction Charge|Notification Charge|Your balance|For inquiry)/i,
  );

  // Whether the matched branch yielded a COUNTERPARTY NAME (a person or shop,
  // safe to tidy) or a bank DESCRIPTION field. Descriptions like "EKASH
  // P2P-NEW APP" or "Incoming Trsf frm local banks" are the bank's own wording
  // — title-casing them loses information, so they pass through verbatim.
  let fromNameSlot = false;

  if (facts.transferAccount) {
    merchant =
      facts.direction === 'debit'
        ? `To ${facts.transferAccount.name}`
        : `From ${facts.transferAccount.name}`;
  } else if (bkHead) {
    merchant = bkHead[1].trim();
  } else if (byMerchant) {merchant = byMerchant[1].trim(); fromNameSlot = true;}
  else if (payTo) {merchant = payTo[1].trim(); fromNameSlot = true;}
  else if (from) {merchant = from[1].trim(); fromNameSlot = true;}
  else if (sentTo) {merchant = sentTo[1].trim(); fromNameSlot = true;}
  else if (narration) {merchant = narration[1].trim();}
  else if (txnDesc) {merchant = txnDesc[1].trim();}
  else if (atBank) {merchant = atBank[1].trim();}

  // Tidy real names only: strip the over-captured tail/code and title-case, so
  // the fallback produces the same shape the AI path is asked for ("SAWA CITI
  // LTD" → "Sawa Citi Ltd").
  if (fromNameSlot) {
    const norm = normalizeMerchant(merchant);
    if (norm.display) {
      merchant = norm.display;
    }
  }

  const isCredit = facts.direction === 'credit';
  const hay = (merchant + ' ' + raw).toLowerCase();
  let category: CategoryId = 'shopping';
  if (facts.transferAccount) {category = 'savings';}
  else if (/airtime|bundle|mtn(?!\s*mobile\s*money)|airtel/.test(hay)) {category = 'airtime';}
  else if (/power|reg|electric|token|wasac|water/.test(hay)) {category = 'utilities';}
  else if (/rent|house|apartment|kicukiro|nyamirambo/.test(hay)) {category = 'rent';}
  else if (/salary|payroll|wage/.test(hay)) {category = 'salary';}
  else if (/moto|yego|taxi|transport|fuel/.test(hay)) {category = 'transport';}
  else if (/restaurant|caf|coffee|food|meze|inzora/.test(hay)) {category = 'food';}
  else if (/supermarket|simba|market|shop/.test(hay)) {category = 'groceries';}
  else if (/mobile money|momo|transfer/.test(hay)) {category = 'family';}
  else if (isCredit) {category = 'salary';}
  return {merchant, category};
}

// The reply is schema-enforced server-side (Gemini responseSchema / a forced
// Claude tool call), so it is normally already a clean JSON object. The brace
// scrape survives only as a fallback for a provider that ignores the schema —
// it used to be the PRIMARY path, and being greedy (`\{[\s\S]*\}` spans the
// first `{` to the LAST `}`) it broke on any prose containing braces, and a
// parse failure silently became a regex-fallback classification.
function extractJson(text: string): any {
  const trimmed = (text ?? '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Non-greedy from the first `{`, and try progressively shorter tails so a
    // trailing explanation can't swallow the object.
    const start = trimmed.indexOf('{');
    if (start >= 0) {
      for (let end = trimmed.lastIndexOf('}'); end > start; end = trimmed.lastIndexOf('}', end - 1)) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          // keep shrinking
        }
      }
    }
    throw new Error('No JSON in model reply');
  }
}

// JSON Schema for the classification reply, sent with the request so the
// provider can enforce it. Enums are generated from the SAME constants the
// prompt and the UI use, so the model cannot return an off-list category,
// subcategory, or channel — which is what turns the downstream
// `validSubcats.some(...)` check from a filter into an assertion.
export function classificationSchema(): Record<string, unknown> {
  const allSubcats = Array.from(
    new Set(Object.values(SUBCATS_BY_CAT).flatMap(v => v ?? [])),
  );
  return {
    type: 'object',
    properties: {
      merchant: {
        type: 'string',
        description: 'Clean title-case counterparty name, no codes or timestamps.',
      },
      category: {type: 'string', enum: Object.keys(CAT_MAP)},
      // "None fits" is expressed by OMITTING this field, not by an empty-string
      // enum member. Gemini rejects an empty enum value outright —
      // `response_schema.properties[subcategory].enum[0]: cannot be empty` — so
      // including '' here 400'd every Gemini classification and silently pushed
      // it onto the regex fallback. `subcategory` is absent from `required`
      // below, which is what makes omission legal on both providers.
      subcategory: {type: 'string', enum: allSubcats},
      channel: {type: 'string', enum: CHANNELS.split(', ')},
      confidence: {type: 'number', description: '0..1, how sure about merchant + category.'},
    },
    required: ['merchant', 'category', 'confidence'],
    additionalProperties: false,
  };
}

// Heuristic: is this money moving between the user's OWN accounts?
// Signals: Mokash (a MoMo-linked savings pocket), an explicit "fund-transfer",
// or the counterparty name overlapping the user's own name.
export function detectTransfer(raw: string, userName?: string): boolean {
  const s = raw.toLowerCase();
  if (/mokash/.test(s)) {return true;}
  if (/fund-?transfer|own number|to my (?:momo|bank|number)|self/.test(s)) {return true;}
  if (userName) {
    const tokens = userName
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length >= 3);
    // counterparty name (from/to) contains one of the user's name tokens
    const party =
      raw.match(/(?:from|to)\s+([A-Za-z][A-Za-z .]+?)(?:\s*\(|\s+\d|\.|,|$)/i)?.[1]?.toLowerCase() ?? '';
    if (party && tokens.some(t => party.includes(t))) {return true;}
  }
  return false;
}

function factsToParsed(
  f: RegexFacts,
  merchant: string,
  category: CategoryId,
  confidence: number,
  channel: string,
  isTransfer: boolean,
  subcategory: string = '',
  parseSource: 'ai' | 'regex' = 'regex',
  fallbackReason?: string,
): ParsedSMS {
  return {
    parseSource,
    fallbackReason,
    direction: f.direction,
    amount: f.amount,
    merchant,
    category,
    subcategory,
    confidence,
    fee: f.fee,
    balance_after: f.balance_after,
    txn_ref: f.txn_ref,
    occurred_at: f.occurred_at,
    channel,
    payCode: f.payCode,
    isTransfer,
    status: f.status ?? undefined,
    transferAccountId: f.transferAccount?.id ?? null,
  };
}

// ── Regex-only fallback ────────────────────────────────────────
export function parseWithRegex(
  raw: string,
  ctx?: ParseContext,
  facts?: RegexFacts,
): ParsedSMS {
  const f = facts ?? regexExtract(raw, ctx);
  const classified = regexClassify(raw, f);
  // Same multi-candidate lookup as the AI path: the deterministic name from the
  // provider template is often a better rule key than the generic regex one.
  const deterministic = pickSmsFormat(ctx?.sender ?? '', raw).extractCounterparty?.(raw);
  const rule = findRuleForNames(ctx?.rules, [
    classified.merchant,
    deterministic?.name,
  ]);
  const category =
    rule && rule.category !== 'transfer'
      ? (rule.category as CategoryId)
      : classified.category;
  const isTransfer = resolveTransfer(f, rule, raw, ctx?.userName);
  // A learned display name applies on this path too — otherwise a rename only
  // sticks while the AI is reachable.
  let merchant = classified.merchant;
  if (!f.transferAccount) {
    merchant =
      ruleDisplayName(ctx?.rules, merchant) ??
      (rule?.display_name?.trim() ? rule.display_name.trim() : null) ??
      merchant;
  }
  // FAILED SMS carry full confidence in that one fact. A learned rule lifts
  // confidence, but an inexact match is capped below THRESHOLD_AUTO_SAVE so a
  // partial name match can't silently auto-file a regex-only guess.
  const confidence =
    f.status === 'failed' ? 1 : rule ? (rule.exact ? 0.9 : 0.7) : 0.45;
  const subcategory =
    rule?.subcategory && rule.category === category ? rule.subcategory : '';
  return factsToParsed(
    f,
    merchant,
    category,
    confidence,
    f.channelHint,
    isTransfer,
    subcategory,
  );
}

// ── Classification, split into build / call / apply ────────────
// The split exists so the offline evaluation harness (scripts/eval-sms.mjs) can
// drive the REAL prompt and the REAL post-processing against any provider,
// rather than maintaining a second copy that drifts out of sync.
export interface ClassificationPlan {
  system: string;
  user: string;
  facts: RegexFacts;
  formatId: string;
  deterministic: {name: string; code?: string | null} | null;
  // Set when the answer is already determined and no model call is needed.
  shortCircuit?: ParsedSMS;
}

export function buildClassification(
  raw: string,
  rules: MerchantRule[],
  merchantChannels: Record<string, MerchantChannel> = {},
  ctx?: ParseContext,
  facts?: RegexFacts,
): ClassificationPlan {
  const f = facts ?? regexExtract(raw, ctx);

  const asPlan = (shortCircuit?: ParsedSMS): ClassificationPlan => ({
    system: '',
    user: '',
    facts: f,
    formatId: pickSmsFormat(ctx?.sender ?? '', raw).id,
    deterministic: null,
    shortCircuit,
  });

  // Failed transactions never become records — skip the model call entirely.
  if (f.status === 'failed') {
    const {merchant, category} = regexClassify(raw, f);
    return asPlan(factsToParsed(f, merchant, category, 1, f.channelHint, false));
  }

  // Only the matched provider's guidance goes into the prompt — previously
  // every call shipped BK + BK-BANK + BPR instructions regardless of sender,
  // and had nothing at all for MTN.
  const format = pickSmsFormat(ctx?.sender ?? '', raw);
  const deterministic = format.extractCounterparty?.(raw) ?? null;

  // ── Skip the model when the answer is already determined ──────────────
  // Two cases where a network round-trip can only introduce disagreement:
  //  1. The counterparty is provably one of the user's OWN accounts — the
  //     merchant is "To/From <account>" and it's a transfer, full stop.
  //  2. The deterministic counterparty already hits an EXACT learned rule —
  //     the user has told us the answer for this exact counterparty.
  // Once someone has a few dozen rules this covers much of steady-state
  // traffic: cheaper, faster, and consistent by construction.
  if (f.transferAccount) {
    const merchant =
      f.direction === 'debit'
        ? `To ${f.transferAccount.name}`
        : `From ${f.transferAccount.name}`;
    return asPlan(
      factsToParsed(f, merchant, 'savings', 0.97, f.channelHint, true, '', 'ai'),
    );
  }
  const preRule = findRuleForNames(rules, [
    deterministic?.name,
    ...candidateNames(raw, f, ctx?.sender ?? ''),
  ]);
  if (preRule?.exact) {
    const name =
      preRule.display_name?.trim() ||
      normalizeMerchant(deterministic?.name ?? preRule.pattern).display;
    const isTransfer = preRule.category === 'transfer';
    return asPlan(
      factsToParsed(
        f,
        name,
        isTransfer ? 'savings' : (preRule.category as CategoryId),
        0.95,
        f.channelHint,
        isTransfer,
        isTransfer ? '' : preRule.subcategory ?? '',
        'ai',
      ),
    );
  }

  const ruleLines = rules
    .slice(0, 12)
    .map(r => `- "${r.pattern}" → ${r.category}${r.display_name ? ` (shown as "${r.display_name}")` : ''}`)
    .join('\n');
  const channelLines = Object.entries(merchantChannels)
    .slice(0, 12)
    .map(([m, c]) => `- "${m}" → ${c.channel}`)
    .join('\n');

  // Deliberately asks for FOUR fields only.
  //
  // is_transfer used to be requested here, but resolveTransfer gives
  // account-number proof and learned rules precedence over the model anyway, so
  // the answer was usually discarded — and asking invited confident wrongness on
  // a field we overwrite, while diluting the one number we do want calibrated.
  // The same went for "if a learned rule matches, set confidence ≥ 0.95": rules
  // are re-applied in code below, so instructing the model to do it too just
  // taught it to inflate confidence.
  //
  // The transfer heuristics still run (detectTransfer + resolveTransfer); they
  // simply no longer need the model's opinion. `is_transfer` is still read if
  // the model volunteers it, as a last-resort signal when no fact and no rule
  // applies — see resolveTransfer.
  // The reply shape is enforced by the provider from classificationSchema(), so
  // this prompt no longer spends tokens restating it. Removed as redundant:
  // "Return ONLY a JSON object, no prose, no markdown", the inline field
  // listing, and "subcategory must be copied EXACTLY ... Never invent one" —
  // the enum makes an off-list value impossible rather than discouraged.
  //
  // Also gone: "if a learned rule matches, set confidence >= 0.95". Rules are
  // applied in code below, so that instruction only ever taught the model to
  // emit 0.95, which is what made THRESHOLD_AUTO_SAVE nearly a no-op.
  const system = `You classify a single Rwandan mobile-money / bank SMS.
- merchant: the shop or person, cleaned (e.g. "SAWA CITI LTD" → "Sawa Citi Ltd").
  Never include reference numbers, subscriber codes, or timestamps.
- category: best fit. Boundary guidance for the ambiguous cases:
${CATEGORY_HINTS}
- subcategory: only when one clearly fits the category you picked. If none does,
  OMIT the field entirely rather than sending an empty value.
  Valid options per category:
${SUBCATS_PROMPT_BLOCK}
- channel: the payment rail used.
- confidence: how sure you are of merchant + category. Be honest — a low number
  sends the record to the user for review, which is the right outcome for a
  genuinely ambiguous message.

Format notes for THIS message (${format.label}):
${format.guidance}`;

  // No counterpartyIsUsersOwnAccount line here: that case returned above
  // without calling the model at all.
  const factLines = `direction=${f.direction}, amount=${f.amount} RWF, fee=${f.fee}, channelHint=${f.channelHint}` +
    (f.counterpartyNumber ? `, counterpartyAccount=${f.counterpartyNumber}` : '') +
    // Where the template is rigid, the counterparty is deterministic — hand it
    // over as a fact so the model only has to classify, not re-extract.
    (deterministic ? `, counterparty="${deterministic.name}"` : '') +
    (deterministic?.code ? `, counterpartyCode=${deterministic.code}` : '');

  const user = `SMS: ${raw}
${ctx?.userName ? `\nAccount holder (the user): ${ctx.userName}` : ''}
Deterministic facts (already extracted — do not change): ${factLines}
${ruleLines ? `\nLearned category rules:\n${ruleLines}` : ''}
${channelLines ? `\nKnown merchant channels:\n${channelLines}` : ''}`;

  return {system, user, facts: f, formatId: format.id, deterministic};
}

// Post-processing of a model reply. Deterministic and provider-agnostic: the
// same reply plus the same plan always yields the same ParsedSMS, which is what
// makes cross-provider evaluation meaningful.
export function applyClassification(
  reply: string,
  planned: ClassificationPlan,
  raw: string,
  rules: MerchantRule[],
  ctx?: ParseContext,
): ParsedSMS {
  const f = planned.facts;
  const deterministic = planned.deterministic;
  {
    const j = extractJson(reply);
    // Normalize the model's name the same way the regex path does — otherwise
    // the two paths write differently-shaped keys into the same rule store.
    const rawMerchant = String(j.merchant || 'Unknown').trim();
    let merchant =
      rawMerchant === 'Unknown'
        ? rawMerchant
        : normalizeMerchant(rawMerchant).display || rawMerchant;
    let category = String(j.category || 'shopping').trim() as CategoryId;
    let subcategory = String(j.subcategory || '').trim();
    // `Number(x) || 0.7` turned a legitimately-returned 0 into 0.7. Only fall
    // back when the value is genuinely absent or non-numeric.
    const rawConf = Number(j.confidence);
    let confidence = Math.min(
      1,
      Math.max(0, Number.isFinite(rawConf) ? rawConf : 0.7),
    );

    // On a rigid template the deterministic name wins over the model's, but
    // only when the model clearly failed (empty/Unknown) or drifted onto text
    // that isn't a name at all. A model cleanup of casing/suffix is welcome.
    if (deterministic?.name) {
      const modelKey = normalizeMerchant(merchant).key;
      const detKey = normalizeMerchant(deterministic.name).key;
      const modelUnusable = !isUsablePattern(modelKey);
      // Keep the model's version if it's recognisably the same counterparty.
      const sameParty =
        modelKey === detKey ||
        (modelKey.length >= 4 && detKey.includes(modelKey)) ||
        (detKey.length >= 4 && modelKey.includes(detKey));
      if (modelUnusable || !sameParty) {
        merchant = normalizeMerchant(deterministic.name).display;
      }
    }

    // (An own-account match short-circuits before the model call — see the
    // prefilter above — so there is no transferAccount case to handle here.)

    // Hard-apply a learned rule if the merchant matches one. 'transfer'
    // rules govern is_transfer below rather than the category.
    //
    // Only an EXACT key match may lift confidence to auto-save territory. A
    // fuzzy (word-boundary) hit still applies the category — the user did
    // teach us something — but caps below THRESHOLD_AUTO_SAVE so the record
    // goes to review rather than being filed silently on a partial match.
    // Match against the model's name AND the deterministic/regex names — a
    // rule shouldn't be missed just because the model spelled the counterparty
    // slightly differently this time.
    const rule = findRuleForNames(rules, [
      merchant,
      deterministic?.name,
      ...candidateNames(raw, f, ctx?.sender ?? ''),
    ]);
    const ruleCeiling = rule?.exact ? 0.95 : 0.9;
    if (rule && rule.category !== 'transfer') {
      category = rule.category as CategoryId;
      confidence = Math.max(confidence, ruleCeiling);
    }
    if (rule?.category === 'transfer') {
      confidence = Math.max(confidence, ruleCeiling);
    }
    // Reapply the name the user chose for this counterparty. Without this a
    // merchant the user renamed once reverts to the model's/regex's version on
    // every subsequent SMS — the single most visible "my fix didn't stick".
    // Skipped when an own-account match already produced a "To/From X" label.
    if (!f.transferAccount) {
      // Look the learned name up under whichever spelling actually matched.
      const learntName =
        ruleDisplayName(rules, merchant) ??
        (rule?.display_name?.trim() ? rule.display_name.trim() : null);
      if (learntName) {
        merchant = learntName;
      }
      // The learned subcategory only applies if the category still matches
      // the one it was learned under.
      if (rule?.subcategory && rule.category === category && !subcategory) {
        subcategory = rule.subcategory;
      }
    }
    // Facts are solid → don't let a shaky category sink an otherwise clear txn.
    if (f.amount > 0 && merchant && merchant !== 'Unknown') {
      confidence = Math.max(confidence, 0.72);
    }

    // Account numbers prove it > the user's learned rule > AI/heuristics.
    const isTransfer = resolveTransfer(f, rule, raw, ctx?.userName, j.is_transfer === true);

    // A rule (or the transfer/account-match overrides above) may have swapped
    // `category` out from under the AI's subcategory guess — only keep it if
    // it's still a real option under the FINAL category.
    const validSubcats = SUBCATS_BY_CAT[category] ?? [];
    if (isTransfer || !validSubcats.some(s => s.toLowerCase() === subcategory.toLowerCase())) {
      subcategory = '';
    } else {
      subcategory = validSubcats.find(s => s.toLowerCase() === subcategory.toLowerCase())!;
    }

    return factsToParsed(
      f,
      merchant,
      category,
      confidence,
      String(j.channel || f.channelHint),
      isTransfer,
      subcategory,
      'ai',
    );
  }
}

// ── Main: AI classification over regex-extracted facts ─────────
export async function parseSmsWithAI(
  raw: string,
  rules: MerchantRule[],
  authToken: string,
  merchantChannels: Record<string, MerchantChannel> = {},
  ctx?: ParseContext,
  // Pre-computed facts, when the caller already ran regexExtract to scope the
  // rule lookup. Avoids extracting twice per SMS.
  facts?: RegexFacts,
): Promise<ParsedSMS> {
  const planned = buildClassification(raw, rules, merchantChannels, ctx, facts);
  if (planned.shortCircuit) {
    return planned.shortCircuit;
  }
  try {
    const reply = await classifySms(
      planned.system,
      planned.user,
      authToken,
      classificationSchema(),
    );
    return applyClassification(reply, planned, raw, rules, ctx);
  } catch (e: any) {
    // Keep degrading rather than dropping the transaction — but record WHY, so
    // a persistently dark classifier is visible in the UI and in logs instead
    // of being inferable only from a confidence number.
    const reason =
      e?.name === 'MissingAuthError'
        ? 'not-signed-in'
        : e?.name === 'AbortError'
        ? 'timeout'
        : e?.status
        ? `http-${e.status}`
        : e?.message ?? 'unknown';
    console.warn(`[AIParser] falling back to regex (${reason}):`, e);
    const parsed = parseWithRegex(raw, ctx, planned.facts);
    return {...parsed, parseSource: 'regex', fallbackReason: reason};
  }
}
