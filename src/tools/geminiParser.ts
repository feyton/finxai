import {CategoryId} from '../theme';

export interface ParsedSMS {
  direction: 'debit' | 'credit';
  amount: number;
  merchant: string;
  category: CategoryId;
  confidence: number;
  fee: number;
  balance_after: number | null;
  txn_ref: string | null;
  occurred_at: string | null;
}

export interface MerchantRule {
  pattern: string;
  category: string;
  correction_count: number;
  confirmation_count: number;
}

// ── Confidence thresholds ──────────────────────────────────────
export const THRESHOLD_AUTO_SAVE = 0.92; // silent auto-save
export const THRESHOLD_REVIEW    = 0.80; // flag for review (still saves)

// ── System prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert at parsing Rwandan bank and mobile money SMS notifications.
Extract transaction data from the raw SMS and return ONLY a valid JSON object — no markdown, no explanation.

## Categories (use exactly one of these ids):
food, groceries, transport, utilities, airtime, rent, health, shopping, salary, family, fun, savings, education

## Required JSON fields:
{
  "direction": "debit" | "credit",
  "amount": <positive RWF integer>,
  "merchant": "<cleaned, title-case merchant or counterparty name>",
  "category": "<one CategoryId from the list above>",
  "confidence": <float 0.0–1.0>,
  "fee": <RWF integer or 0>,
  "balance_after": <RWF integer or null>,
  "txn_ref": "<reference ID string or null>",
  "occurred_at": "<ISO 8601 date string or null>"
}

## Rwanda SMS patterns:
- "TxId:XXXX. You have completed payment of X RWF to MERCHANT. Your new balance is Y RWF. Fee Z RWF." → debit
- "You have received X RWF from NAME (07XXXXXXXX). New balance Y RWF." → credit
- "Dear customer, your account XXXX has been debited RWF X on DATE. Narration: DESCRIPTION. Avail bal RWF Y." → debit
- "Dear customer, your account XXXX has been credited RWF X." → credit
- Airtime / bundle purchases → airtime
- REG Cash Power / electricity tokens → utilities
- WASAC water → utilities
- Salary / payroll → salary
- Transfers to named people → family
- Supermarket / shop names → groceries or shopping
- Restaurants / cafés → food
- Taxi / moto / YEGO → transport

## Confidence guide:
- 0.95–1.0: amount + direction + counterparty are all crystal-clear
- 0.85–0.94: clear transaction but category requires inference
- 0.70–0.84: some ambiguity in counterparty or category
- < 0.70: unclear or malformed SMS`;

// ── Build prompt with merchant memory context ──────────────────
function buildPrompt(rawSms: string, rules: MerchantRule[]): string {
  let ctx = '';
  if (rules.length > 0) {
    ctx = '\n\n## User\'s past categorizations (apply these with high confidence):\n';
    for (const r of rules.slice(0, 10)) {
      const total = r.correction_count + r.confirmation_count;
      const type = r.correction_count > 0 ? 'corrected' : 'confirmed';
      ctx += `- "${r.pattern}" → ${r.category} (${type} ${total}×)\n`;
    }
  }
  return `${SYSTEM_PROMPT}${ctx}\n\n## SMS to parse:\n${rawSms}`;
}

// ── Fallback regex parser (used when no API key or API fails) ──
function fallbackParse(raw: string): ParsedSMS {
  const upper = raw.toUpperCase();
  const isCredit = /received|credited|credit/i.test(raw);
  const amtMatch = raw.match(/[\d,]+(?:\.\d+)?\s*RWF|RWF\s*[\d,]+/i);
  const amount = amtMatch
    ? parseInt(amtMatch[0].replace(/[^0-9]/g, ''), 10)
    : 0;

  const feeMatch = raw.match(/fee\s*[:=]?\s*([\d,]+)/i);
  const fee = feeMatch ? parseInt(feeMatch[1].replace(/,/g, ''), 10) : 0;

  const balMatch = raw.match(/(?:new balance|avail bal|balance)\s*(?:is\s*)?(?:RWF\s*)?([\d,]+)/i);
  const balance_after = balMatch ? parseInt(balMatch[1].replace(/,/g, ''), 10) : null;

  const refMatch = raw.match(/TxId\s*:\s*(\d+)/i);
  const txn_ref = refMatch ? refMatch[1] : null;

  // Infer merchant from common patterns
  let merchant = 'Unknown';
  const payToMatch = raw.match(/payment of [\d,]+ RWF to ([^.]+)/i);
  const fromMatch = raw.match(/received .+ from ([^\(]+)/i);
  const narrationMatch = raw.match(/narration:\s*([^.]+)/i);
  if (payToMatch) {merchant = payToMatch[1].trim();}
  else if (fromMatch) {merchant = fromMatch[1].trim();}
  else if (narrationMatch) {merchant = narrationMatch[1].trim();}

  // Simple category guessing
  let category: CategoryId = 'shopping';
  if (/airtime|bundle|mtn|airtel/i.test(merchant)) {category = 'airtime';}
  else if (/power|reg|electricity|token/i.test(merchant + raw)) {category = 'utilities';}
  else if (/wasac|water/i.test(merchant + raw)) {category = 'utilities';}
  else if (/rent|house|kicukiro|nyamirambo|apartment/i.test(merchant + raw)) {category = 'rent';}
  else if (/salary|payroll|wage/i.test(merchant + raw)) {category = 'salary';}
  else if (/moto|yego|taxi|transport|car/i.test(merchant + raw)) {category = 'transport';}
  else if (/restaurant|café|coffee|food|lunch|dinner/i.test(merchant + raw)) {category = 'food';}
  else if (/supermarket|simba|nakumatt|market/i.test(merchant + raw)) {category = 'groceries';}
  else if (isCredit) {category = 'salary';}

  return {
    direction: isCredit ? 'credit' : 'debit',
    amount,
    merchant,
    category,
    confidence: 0.45, // low — regex is imprecise
    fee,
    balance_after,
    txn_ref,
    occurred_at: null,
  };
}

// ── Main parser ────────────────────────────────────────────────
export async function parseSmsWith(
  rawSms: string,
  merchantRules: MerchantRule[],
  apiKey: string,
  modelName: string,
): Promise<ParsedSMS> {
  const prompt = buildPrompt(rawSms, merchantRules);

  try {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(text.trim()) as ParsedSMS;

    // Validate required fields
    if (typeof parsed.amount !== 'number' || !parsed.direction || !parsed.merchant) {
      throw new Error('Invalid Gemini response shape');
    }

    // Cap confidence to valid range
    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));
    parsed.fee = parsed.fee ?? 0;

    return parsed;
  } catch (e) {
    console.warn('[GeminiParser] Falling back to regex:', e);
    return fallbackParse(rawSms);
  }
}

// ── Without API key ────────────────────────────────────────────
export function parseWithFallback(rawSms: string): ParsedSMS {
  return fallbackParse(rawSms);
}
