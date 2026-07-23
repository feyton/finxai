// Claude Haiku SMS parser.
//
// Split responsibility for consistency:
//   • regex extracts the DETERMINISTIC facts (amount, fee, balance, ref,
//     direction, status, a channel hint) — these are structurally reliable
//     in RW SMS.
//   • Claude Haiku does only the FUZZY classification (clean merchant name,
//     category, payment channel), guided by the user's learned corrections.
// If Haiku is unavailable/fails, we degrade to regex-only (low confidence).

import {askClaude} from './anthropicClient';
import {MerchantChannel} from './merchantMemory';
import {MerchantRule, ParsedSMS} from './geminiParser';
import {CategoryId} from '../theme';

export const PARSER_MODEL = 'claude-haiku-4-5';

const CATS =
  'food, groceries, transport, utilities, airtime, rent, health, shopping, salary, family, fun, savings, education';
const CHANNELS =
  'MoMoPay, Send money, Receive, Bank transfer, Cash Power, Airtime, Bill, Other';

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
}

// Find the learned rule whose pattern overlaps the merchant name.
export function findRule(
  rules: MerchantRule[] | undefined,
  merchant: string,
): MerchantRule | undefined {
  if (!rules?.length || !merchant) {
    return undefined;
  }
  const norm = merchant.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) {
    return undefined;
  }
  return rules.find(r => norm.includes(r.pattern) || r.pattern.includes(norm));
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

// Compare account/phone numbers loosely: 250787241457 ≡ 0787241457 ≡ 787241457.
export function normalizeAccountNumber(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length > 9 ? d.slice(-9) : d;
}

function matchOwnAccount(
  numberStr: string | null | undefined,
  accounts: OwnAccountRef[] | undefined,
): OwnAccountRef | undefined {
  const norm = normalizeAccountNumber(numberStr);
  if (!norm || norm.length < 6 || !accounts) {
    return undefined;
  }
  return accounts.find(a => normalizeAccountNumber(a.number) === norm);
}

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

// Authoritative post-transaction balance the SMS reports. Handles all the
// Rwandan variants: "Balance: 61,811 RWF", "Balance:5582 RWF",
// "Balance: 64761RWF", "Available Balance: RWF2,427", "Mokash balance is RWF 3120".
export function extractBalance(raw: string): number | null {
  const m = raw.match(
    /(?:available\s+balance|new\s+balance|mokash\s+balance|balance)\s*(?:is)?\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (m) {
    return num(m[1]);
  }
  // Kinyarwanda MTN Mokash formats — no literal "balance" keyword:
  //   "Ubu ufite RWF 508 kuri Mokash"      (you now have RWF 508 on Mokash)
  //   "Mokash ifiteho amafaranga RWF 7508" (Mokash [now] has RWF 7508)
  const kiny = raw.match(
    /(?:ifiteho\s+amafaranga|ufite)\s*:?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (kiny) {
    return num(kiny[1]);
  }
  return null;
}

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
// __tests__/claudeParser.test.ts) — BK's single "Transaction Charge" still
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
    /of\s+RWF\s*([\d,.]+)\s+from\s+A\/c\s*[\d*]+\s+to\s+A\/c\s*([\d*]+)\s+on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+is\s+(?:completed|your request is being processing)/i,
  );
  if (!m) {
    return null;
  }
  const amount = num(m[1]);
  const destSuffix = trailingDigits(m[2]);
  if (!destSuffix || amount <= 0) {
    return null;
  }
  const day = m[3].padStart(2, '0');
  const month = m[4].padStart(2, '0');
  return {amount, dateKey: `${m[5]}-${month}-${day}`, destSuffix};
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
  // BK alert format: the account on the other side of the movement.
  counterpartyNumber: string | null;
  // Set when the counterparty is one of the user's OWN accounts.
  transferAccount: OwnAccountRef | null;
}

export function regexExtract(raw: string, ctx?: ParseContext): RegexFacts {
  const status = detectStatus(raw);

  // BK alert format: "TRANSFER - MTN mobile money Credited account: X
  // Debited account: Y Amount: RWF 45,000 Transaction Charge: RWF 0 ..."
  // The words "Credited"/"Debited" here describe ACCOUNTS, not the user —
  // direction must come from which account is the user's own.
  const credited = raw.match(/credited\s+account\s*:?\s*([A-Za-z0-9]+)/i)?.[1] ?? null;
  const debited = raw.match(/debited\s+account\s*:?\s*([A-Za-z0-9]+)/i)?.[1] ?? null;

  let direction: 'credit' | 'debit';
  let counterpartyNumber: string | null = null;
  let transferAccount: OwnAccountRef | null = null;

  if (credited || debited) {
    const accounts = ctx?.accounts ?? [];
    const current = accounts.find(a => a.id === ctx?.currentAccountId);
    const currentNorm = normalizeAccountNumber(current?.number);
    const creditedOwn = matchOwnAccount(credited, accounts);
    const debitedOwn = matchOwnAccount(debited, accounts);

    if (currentNorm && normalizeAccountNumber(credited) === currentNorm) {
      direction = 'credit';
    } else if (currentNorm && normalizeAccountNumber(debited) === currentNorm) {
      direction = 'debit';
    } else if (debitedOwn && debitedOwn.id !== ctx?.currentAccountId) {
      // Money left ANOTHER of the user's accounts toward this one.
      direction = 'credit';
    } else {
      // Default: banks send this alert format for movements OUT of the
      // user's account (transfers, bill payments) — treat as debit.
      direction = 'debit';
    }
    counterpartyNumber = direction === 'debit' ? credited : debited;
    const other = direction === 'debit' ? creditedOwn : debitedOwn;
    if (other && other.id !== ctx?.currentAccountId) {
      transferAccount = other;
    }
  } else {
    // "kubitsa" (Kinyarwanda: to deposit/save) — e.g. "Umaze kubitsa RWF 500
    // kuri Mokash" — money moving IN to the tracked account, same role as
    // the English "deposit"/"received"/"credited" signals below.
    direction = /received|credited|you have received|deposit|kubitsa/i.test(raw)
      ? 'credit'
      : 'debit';
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
    counterpartyNumber,
    transferAccount,
  };
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
  const payTo = raw.match(/payment of [\d,.]+ (?:RWF|FRW) to ([^.]+)/i);
  const from = raw.match(/received .+ from ([^\(.]+)/i);
  const sentTo = raw.match(/sent to ([^\(.]+)/i);
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

  if (facts.transferAccount) {
    merchant =
      facts.direction === 'debit'
        ? `To ${facts.transferAccount.name}`
        : `From ${facts.transferAccount.name}`;
  } else if (bkHead) {
    merchant = bkHead[1].trim();
  } else if (payTo) {merchant = payTo[1].trim();}
  else if (from) {merchant = from[1].trim();}
  else if (sentTo) {merchant = sentTo[1].trim();}
  else if (narration) {merchant = narration[1].trim();}
  else if (txnDesc) {merchant = txnDesc[1].trim();}
  else if (atBank) {merchant = atBank[1].trim();}

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

function extractJson(text: string): any {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {throw new Error('No JSON in model reply');}
  return JSON.parse(m[0]);
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

function factsToParsed(f: RegexFacts, merchant: string, category: CategoryId, confidence: number, channel: string, isTransfer: boolean): ParsedSMS {
  return {
    direction: f.direction,
    amount: f.amount,
    merchant,
    category,
    confidence,
    fee: f.fee,
    balance_after: f.balance_after,
    txn_ref: f.txn_ref,
    occurred_at: f.occurred_at,
    channel,
    isTransfer,
    status: f.status ?? undefined,
    transferAccountId: f.transferAccount?.id ?? null,
  };
}

// ── Regex-only fallback ────────────────────────────────────────
export function parseWithRegex(raw: string, ctx?: ParseContext): ParsedSMS {
  const f = regexExtract(raw, ctx);
  const classified = regexClassify(raw, f);
  const rule = findRule(ctx?.rules, classified.merchant);
  const category =
    rule && rule.category !== 'transfer'
      ? (rule.category as CategoryId)
      : classified.category;
  const isTransfer = resolveTransfer(f, rule, raw, ctx?.userName);
  // FAILED SMS carry full confidence in that one fact; a learned rule also
  // lifts confidence — the user taught us this exact counterparty.
  const confidence = f.status === 'failed' ? 1 : rule ? 0.9 : 0.45;
  return factsToParsed(f, classified.merchant, category, confidence, f.channelHint, isTransfer);
}

// ── Main: Haiku classification over regex-extracted facts ──────
export async function parseSmsWithClaude(
  raw: string,
  rules: MerchantRule[],
  apiKey: string,
  merchantChannels: Record<string, MerchantChannel> = {},
  ctx?: ParseContext,
): Promise<ParsedSMS> {
  const f = regexExtract(raw, ctx);

  // Failed transactions never become records — skip the model call entirely.
  if (f.status === 'failed') {
    const {merchant, category} = regexClassify(raw, f);
    return factsToParsed(f, merchant, category, 1, f.channelHint, false);
  }

  const ruleLines = rules
    .slice(0, 12)
    .map(r => `- "${r.pattern}" → ${r.category}`)
    .join('\n');
  const channelLines = Object.entries(merchantChannels)
    .slice(0, 12)
    .map(([m, c]) => `- "${m}" → ${c.channel}`)
    .join('\n');

  const system = `You classify a single Rwandan mobile-money / bank SMS. Return ONLY a JSON object, no prose, no markdown.
Fields:
{"merchant": "<clean title-case seller/counterparty>", "category": "<one of: ${CATS}>", "channel": "<one of: ${CHANNELS}>", "is_transfer": <true|false>, "confidence": <0..1>}
Rules:
- merchant is the shop or person, cleaned (e.g. "SAWA CITI LTD" → "Sawa Citi").
- category is your best fit from the list.
- channel is the payment rail.
- Bank of Kigali alert format: "TRANSFER - <rail> Credited account: X Debited account: Y Amount: RWF N ..." —
  the words Credited/Debited name the two ACCOUNTS, not the user. The direction fact below is already
  resolved from the user's own account numbers; never contradict it.
- BPR Bank format: "your account X has been debited/credited RWF N ... at BPR Bank. Transaction Charge:
  ... Notification Charge: ... Your balance is RWF Z." never names the counterparty — use "BPR Bank" or
  the bank/agent named after "at" as the merchant unless a learned rule or transfer fact says otherwise.
- Bank of Kigali ALSO sends a second alert format, from a different sender ("BK BANK"): "your account X
  has been debited/credited RWF N ... Txn Description: <desc> ... Available Balance: RWF Z." No counterparty
  name is given either — use the Txn Description (e.g. "Card Purchase", "EKASH P2P-NEW APP", "Incoming Trsf
  frm local banks") as the merchant/description unless a learned rule or transfer fact says otherwise.
- is_transfer is TRUE when the money moved between the USER'S OWN accounts —
  i.e. the counterparty is the user themselves (name matches the account holder),
  a Mokash savings pocket, a bank↔wallet top-up, or an explicit "fund-transfer"
  to the user's own number. It is FALSE for real payments to shops or other people.
- If a learned rule matches the merchant, use its category and set confidence ≥ 0.95.
- A learned rule of "transfer" means the USER confirmed that counterparty is a
  transfer between their own accounts → is_transfer=true. A learned rule with a
  real category means the user confirmed it is NOT a transfer → is_transfer=false.
- confidence reflects how sure you are of merchant + category.`;

  const factLines = `direction=${f.direction}, amount=${f.amount} RWF, fee=${f.fee}, channelHint=${f.channelHint}` +
    (f.counterpartyNumber ? `, counterpartyAccount=${f.counterpartyNumber}` : '') +
    (f.transferAccount ? `, counterpartyIsUsersOwnAccount="${f.transferAccount.name}"` : '');

  const user = `SMS: ${raw}
${ctx?.userName ? `\nAccount holder (the user): ${ctx.userName}` : ''}
Deterministic facts (already extracted — do not change): ${factLines}
${ruleLines ? `\nLearned category rules:\n${ruleLines}` : ''}
${channelLines ? `\nKnown merchant channels:\n${channelLines}` : ''}`;

  try {
    const reply = await askClaude(
      [{role: 'user', content: user}],
      system,
      apiKey,
      PARSER_MODEL,
    );
    const j = extractJson(reply);
    let merchant = String(j.merchant || 'Unknown').trim();
    let category = String(j.category || 'shopping').trim() as CategoryId;
    let confidence = Math.min(1, Math.max(0, Number(j.confidence) || 0.7));

    // A matched own account is the most trustworthy label there is.
    if (f.transferAccount) {
      merchant =
        f.direction === 'debit'
          ? `To ${f.transferAccount.name}`
          : `From ${f.transferAccount.name}`;
      confidence = Math.max(confidence, 0.95);
    }

    // Hard-apply a learned rule if the merchant matches one. 'transfer'
    // rules govern is_transfer below rather than the category.
    const rule = findRule(rules, merchant);
    if (rule && rule.category !== 'transfer') {
      category = rule.category as CategoryId;
      confidence = Math.max(confidence, 0.95);
    }
    if (rule?.category === 'transfer') {
      confidence = Math.max(confidence, 0.95);
    }
    // Facts are solid → don't let a shaky category sink an otherwise clear txn.
    if (f.amount > 0 && merchant && merchant !== 'Unknown') {
      confidence = Math.max(confidence, 0.72);
    }

    // Account numbers prove it > the user's learned rule > Haiku/heuristics.
    const isTransfer = resolveTransfer(f, rule, raw, ctx?.userName, j.is_transfer === true);

    return factsToParsed(
      f,
      merchant,
      category,
      confidence,
      String(j.channel || f.channelHint),
      isTransfer,
    );
  } catch (e) {
    console.warn('[ClaudeParser] falling back to regex:', e);
    return parseWithRegex(raw, ctx);
  }
}
