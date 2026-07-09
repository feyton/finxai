// Claude Haiku SMS parser.
//
// Split responsibility for consistency:
//   • regex extracts the DETERMINISTIC facts (amount, fee, balance, ref,
//     direction, a channel hint) — these are structurally reliable in RW SMS.
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

// ── Deterministic regex extraction ─────────────────────────────
function num(s: string | undefined): number {
  return s ? parseInt(s.replace(/[^0-9]/g, ''), 10) || 0 : 0;
}

// Authoritative post-transaction balance the SMS reports. Handles all the
// Rwandan variants: "Balance: 61,811 RWF", "Balance:5582 RWF",
// "Balance: 64761RWF", "Available Balance: RWF2,427", "Mokash balance is RWF 3120".
export function extractBalance(raw: string): number | null {
  const m = raw.match(
    /(?:available\s+balance|new\s+balance|mokash\s+balance|balance)\s*(?:is)?\s*:?\s*(?:RWF|FRW)?\s*([\d,]+)/i,
  );
  if (!m) {
    return null;
  }
  const n = parseInt(m[1].replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

export function regexExtract(raw: string) {
  const isCredit = /received|credited|you have received|deposit/i.test(raw);
  const amt = raw.match(/(?:RWF|FRW)\s*([\d,]+)|([\d,]+)\s*(?:RWF|FRW)/i);
  const amount = num(amt?.[1] ?? amt?.[2]);
  const fee = num(raw.match(/fee[:=\s]*([\d,]+)/i)?.[1]);
  const balance_after = extractBalance(raw);
  const txn_ref = raw.match(/(?:TxId|FT Id|Ref|Txn ID|transaction id)[:\s#]*([A-Za-z0-9]+)/i)?.[1] ?? null;
  return {
    direction: (isCredit ? 'credit' : 'debit') as 'credit' | 'debit',
    amount,
    fee,
    balance_after,
    txn_ref,
    channelHint: detectChannel(raw, isCredit),
  };
}

function detectChannel(raw: string, isCredit: boolean): string {
  const s = raw.toLowerCase();
  if (/cash\s?power|electricity|token|\breg\b/.test(s)) {return 'Cash Power';}
  if (/airtime|bundle|\b\d+\s?(mb|gb)\b|data pack/.test(s)) {return 'Airtime';}
  if (/wasac|water|bill|tv|canal|dstv|startimes/.test(s)) {return 'Bill';}
  if (isCredit) {return 'Receive';}
  if (/momo\s?pay|momopay|paid to|payment of .* to |completed payment/.test(s)) {return 'MoMoPay';}
  if (/sent to|you have sent|transfer(?:red)? to/.test(s)) {return 'Send money';}
  if (/debited|narration|account\s*\d/.test(s)) {return 'Bank transfer';}
  return 'Other';
}

// Regex-only merchant + category guess (fallback when no AI).
function regexClassify(raw: string, isCredit: boolean): {merchant: string; category: CategoryId} {
  let merchant = 'Unknown';
  const payTo = raw.match(/payment of [\d,]+ (?:RWF|FRW) to ([^.]+)/i);
  const from = raw.match(/received .+ from ([^\(.]+)/i);
  const sentTo = raw.match(/sent to ([^\(.]+)/i);
  const narration = raw.match(/narration:\s*([^.]+)/i);
  if (payTo) {merchant = payTo[1].trim();}
  else if (from) {merchant = from[1].trim();}
  else if (sentTo) {merchant = sentTo[1].trim();}
  else if (narration) {merchant = narration[1].trim();}

  const hay = (merchant + ' ' + raw).toLowerCase();
  let category: CategoryId = 'shopping';
  if (/airtime|bundle|mtn|airtel/.test(hay)) {category = 'airtime';}
  else if (/power|reg|electric|token|wasac|water/.test(hay)) {category = 'utilities';}
  else if (/rent|house|apartment|kicukiro|nyamirambo/.test(hay)) {category = 'rent';}
  else if (/salary|payroll|wage/.test(hay)) {category = 'salary';}
  else if (/moto|yego|taxi|transport|fuel/.test(hay)) {category = 'transport';}
  else if (/restaurant|caf|coffee|food|meze|inzora/.test(hay)) {category = 'food';}
  else if (/supermarket|simba|market|shop/.test(hay)) {category = 'groceries';}
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

// ── Regex-only fallback ────────────────────────────────────────
export function parseWithRegex(raw: string, userName?: string): ParsedSMS {
  const f = regexExtract(raw);
  const {merchant, category} = regexClassify(raw, f.direction === 'credit');
  return {
    direction: f.direction,
    amount: f.amount,
    merchant,
    category,
    confidence: 0.45,
    fee: f.fee,
    balance_after: f.balance_after,
    txn_ref: f.txn_ref,
    occurred_at: null,
    channel: f.channelHint,
    isTransfer: detectTransfer(raw, userName),
  };
}

// ── Main: Haiku classification over regex-extracted facts ──────
export async function parseSmsWithClaude(
  raw: string,
  rules: MerchantRule[],
  apiKey: string,
  merchantChannels: Record<string, MerchantChannel> = {},
  userName?: string,
): Promise<ParsedSMS> {
  const f = regexExtract(raw);

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
- is_transfer is TRUE when the money moved between the USER'S OWN accounts —
  i.e. the counterparty is the user themselves (name matches the account holder),
  a Mokash savings pocket, a bank↔wallet top-up, or an explicit "fund-transfer"
  to the user's own number. It is FALSE for real payments to shops or other people.
- If a learned rule matches the merchant, use its category and set confidence ≥ 0.95.
- confidence reflects how sure you are of merchant + category.`;

  const user = `SMS: ${raw}
${userName ? `\nAccount holder (the user): ${userName}` : ''}
Deterministic facts (already extracted — do not change): direction=${f.direction}, amount=${f.amount} RWF, fee=${f.fee}, channelHint=${f.channelHint}
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
    const merchant = String(j.merchant || 'Unknown').trim();
    let category = String(j.category || 'shopping').trim() as CategoryId;
    let confidence = Math.min(1, Math.max(0, Number(j.confidence) || 0.7));

    // Hard-apply a learned rule if the merchant matches one.
    const norm = merchant.toLowerCase();
    const rule = rules.find(r => norm.includes(r.pattern) || r.pattern.includes(norm));
    if (rule) {
      category = rule.category as CategoryId;
      confidence = Math.max(confidence, 0.95);
    }
    // Facts are solid → don't let a shaky category sink an otherwise clear txn.
    if (f.amount > 0 && merchant && merchant !== 'Unknown') {
      confidence = Math.max(confidence, 0.72);
    }

    // Transfer if Haiku says so OR our heuristic is confident.
    const isTransfer = j.is_transfer === true || detectTransfer(raw, userName);

    return {
      direction: f.direction,
      amount: f.amount,
      merchant,
      category,
      confidence,
      fee: f.fee,
      balance_after: f.balance_after,
      txn_ref: f.txn_ref,
      occurred_at: null,
      channel: String(j.channel || f.channelHint),
      isTransfer,
    };
  } catch (e) {
    console.warn('[ClaudeParser] falling back to regex:', e);
    return parseWithRegex(raw, userName);
  }
}
