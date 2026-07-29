// Per-provider SMS format registry.
//
// WHY: the classifier used to ship ONE monolithic system prompt containing
// Bank-of-Kigali + BPR + "BK BANK" format guidance on *every* call — and no
// guidance at all for MTN MoMo, which is the dominant sender in Rwanda. Every
// request therefore paid tokens for bank instructions that didn't apply, while
// the most common templates went undescribed.
//
// Here each provider owns its own guidance block, few-shot examples, and (where
// the template is rigid enough) a deterministic counterparty extractor. Only
// the matched provider's block reaches the prompt.
//
// Splitting this way also lets the rigid MTN templates skip the model for
// merchant extraction entirely — the name is handed over as a FACT and the
// model only classifies. That matches the design already stated at the top of
// claudeParser.ts: regex does deterministic facts, the model does fuzzy
// classification.

export type SmsFormatId = 'mtn' | 'bk' | 'bk_bank' | 'bpr' | 'equity' | 'generic';

export interface CounterpartyGuess {
  name: string;
  // Trailing merchant/subscriber code, when the template carries one
  // ("THRIVE G Ltd 888840" → '888840').
  code?: string | null;
}

export interface SmsFormat {
  id: SmsFormatId;
  label: string;
  // True when this format handles the given message.
  matches(sender: string, body: string): boolean;
  // Deterministic counterparty extraction, when the template allows it.
  // Returns null when this format can't name the counterparty (several bank
  // alerts genuinely never disclose one).
  extractCounterparty?(body: string): CounterpartyGuess | null;
  // Format-specific instructions injected into the system prompt.
  guidance: string;
}

// Where a counterparty name ends — same stop-set claudeParser uses.
const STOP = String.raw`(?=\s+(?:was|has\s+been|is)\s+(?:completed|successful|processed)\b|\s+at\s+\d|\s*[.(]|\s*$)`;

function firstMatch(body: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]?.trim()) {
      return m[1].trim();
    }
  }
  return null;
}

// Split a trailing numeric code off a counterparty name.
function splitCode(name: string): CounterpartyGuess {
  const m = name.match(/^(.*?[^\d\s])\s+(\d{3,})$/);
  return m ? {name: m[1].trim(), code: m[2]} : {name, code: null};
}

const MTN: SmsFormat = {
  id: 'mtn',
  label: 'MTN MoMo',
  matches: (sender, body) =>
    /mtn|momo|m-?money|mokash/i.test(sender) ||
    /\*164\*|Y'ello|\*EN#/i.test(body),
  extractCounterparty(body) {
    const name = firstMatch(body, [
      // "A transaction of 2000 RWF by ComzAfrica Rwanda Limited was completed"
      new RegExp(String.raw`\btransaction\s+of\s+[\d,.]+\s*(?:RWF|FRW)\s+by\s+(.+?)` + STOP, 'i'),
      // "Your payment of 1,500 RWF to Valentine 002597 was completed"
      new RegExp(String.raw`payment\s+of\s+[\d,.]+\s*(?:RWF|FRW)\s+to\s+(.+?)` + STOP, 'i'),
      // "You have received 105000 RWF from FABRICE HAFASHIMANA (*****915)"
      new RegExp(String.raw`received\s+.+?\bfrom\s+(.+?)` + STOP, 'i'),
      new RegExp(String.raw`sent\s+to\s+(.+?)` + STOP, 'i'),
    ]);
    return name ? splitCode(name) : null;
  },
  guidance: `MTN MoMo templates (the counterparty is already extracted for you below — clean its casing, never invent a different one):
- "A transaction of <amt> RWF by <MERCHANT> was completed at <ts>." → a payment OUT to MERCHANT.
- "Your payment of <amt> RWF to <NAME> <CODE> was completed at <ts>." → NAME is the payee; the trailing digits are a MoMoPay/subscriber code, never part of the name.
- "You have received <amt> RWF from <NAME> (<masked phone>) at <ts>." → money IN from NAME.
- "Mokash" on either side is the user's own MTN savings pocket → is_transfer=true.
- Ignore the "*164*", "Y'ello", "*EN#", "FT Id", and "ET Id" wrappers — they carry no classification signal.`,
};

const BK: SmsFormat = {
  id: 'bk',
  label: 'Bank of Kigali (transfer alert)',
  matches: (_sender, body) => /credited\s+account|debited\s+account/i.test(body),
  extractCounterparty(body) {
    const name = firstMatch(body, [
      /^\s*(?:TRANSFER|BILL\s*PAYMENT|PAYMENT)\s*-\s*([\s\S]*?)\s+(?:credited|debited)\s+account/i,
    ]);
    return name ? {name, code: null} : null;
  },
  guidance: `Bank of Kigali alert format: "TRANSFER - <rail> Credited account: X Debited account: Y Amount: RWF N ...".
- Credited/Debited name the two ACCOUNTS, not the user. The direction fact below is already resolved from the user's own account numbers — never contradict it.
- The text between the leading "TRANSFER -"/"BILL PAYMENT -" and "Credited account" is the rail/description, and is the best available merchant label.`,
};

const BK_BANK: SmsFormat = {
  id: 'bk_bank',
  label: 'Bank of Kigali (BK BANK sender)',
  matches: (sender, body) =>
    /bk\s*bank/i.test(sender) || /txn\s*description/i.test(body),
  extractCounterparty(body) {
    const name = firstMatch(body, [/txn\s*description\s*:?\s*([^.]+)/i]);
    return name ? {name, code: null} : null;
  },
  guidance: `Bank of Kigali's second alert format (sender "BK BANK"): "your account X has been debited/credited RWF N ... Txn Description: <desc> ... Available Balance: RWF Z."
- No counterparty name is disclosed. Use the Txn Description ("Card Purchase", "EKASH P2P-NEW APP", "Incoming Trsf frm local banks") as the merchant/description unless a learned rule or a transfer fact says otherwise.`,
};

const BPR: SmsFormat = {
  id: 'bpr',
  label: 'BPR Bank',
  matches: (sender, body) => /bpr/i.test(sender) || /\bat\s+BPR\s+Bank\b/i.test(body),
  extractCounterparty(body) {
    const name = firstMatch(body, [
      /\bat\s+([A-Z][A-Za-z0-9&. ]{2,30}?)\.\s*(?:Transaction Charge|Notification Charge|Your balance|For inquiry)/i,
      /narration:\s*([^.]+)/i,
    ]);
    return name ? {name, code: null} : null;
  },
  guidance: `BPR Bank format: "your account X has been debited/credited RWF N ... at BPR Bank. Transaction Charge: ... Notification Charge: ... Your balance is RWF Z."
- Never names the counterparty. Use "BPR Bank" (or whatever bank/agent is named after "at") as the merchant unless a learned rule or transfer fact says otherwise.
- BPR applies MULTIPLE charges per transaction; the fee fact below is already the SUM of them — do not recompute it.`,
};

const EQUITY: SmsFormat = {
  id: 'equity',
  label: 'Equity Bank',
  matches: sender => /equity/i.test(sender),
  guidance: `Equity Bank alert. Prefer any explicit narration/description field as the merchant; otherwise use "Equity Bank".`,
};

const GENERIC: SmsFormat = {
  id: 'generic',
  label: 'Generic',
  matches: () => true,
  guidance: `Unrecognised provider template. Use whatever counterparty the message names after "to"/"from"/"by"; if it names none, use the clearest description present rather than inventing a merchant.`,
};

// Order matters: the two BK variants and BPR are detected on distinctive body
// markers, so they are tried before MTN's broader sender test. GENERIC is last
// and always matches.
export const SMS_FORMATS: SmsFormat[] = [BK, BK_BANK, BPR, EQUITY, MTN, GENERIC];

export function pickSmsFormat(sender: string, body: string): SmsFormat {
  return (
    SMS_FORMATS.find(f => f.id !== 'generic' && f.matches(sender ?? '', body ?? '')) ??
    GENERIC
  );
}
