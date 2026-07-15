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
    /\bhas\s+FAILED\b|status\s*:?\s*FAILED|\bREVERSED\b|\bDECLINED\b|\bunsuccessful\b|could\s+not\s+be\s+(?:completed|processed)/i.test(
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
  if (!m) {
    return null;
  }
  return num(m[1]);
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
    direction = /received|credited|you have received|deposit/i.test(raw)
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

  // Fee: "Fee 100 RWF", "fee was: 100", "Transaction Charge: RWF 200".
  const fee = num(
    raw.match(
      /\b(?:transaction\s+charge|charge|fee)s?\b\s*(?:was)?\s*[:=]?\s*(?:RWF|FRW)?\s*([\d,]+(?:\.\d+)?)/i,
    )?.[1],
  );

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
    occurred_at: extractOccurredAt(raw),
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
