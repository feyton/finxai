/**
 * Regex-parser tests against real Rwandan SMS formats (BK alert format,
 * MoMo, failed transactions). No network — regex facts only.
 */
import {
  detectStatus,
  detectTransfer,
  extractBalance,
  extractTransferHint,
  isTransferStatusOnly,
  maskedSuffixMatches,
  normalizeAccountNumber,
  parseWithRegex,
  regexExtract,
  trailingDigits,
  ParseContext,
} from '../src/tools/claudeParser';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const CTX: ParseContext = {
  userName: 'FABRICE HAFASHIMANA',
  accounts: [
    {id: 'bk-1', name: 'Bank of Kigali', number: '100161965558'},
    {id: 'momo-1', name: 'MTN MoMo', number: '0787241457'},
    {id: 'mokash-1', name: 'MoKash Savings', number: ''},
  ],
  currentAccountId: 'bk-1',
};

const BK_TRANSFER_TO_OWN_MOMO =
  'TRANSFER - MTN mobile money Credited account: 250787241457  Debited account: 100161965558  Amount: RWF 45,000 Transaction Charge: RWF 0 Event #: FTCM26181PVXVS4ND  Status: COMPLETED Date: 6/30/26, 10:01 AM  Channel:MOBILE Available Balance: RWF 393,526 For enquiry call BK: 250788143000 / 4455';

const BK_TRANSFER_TO_OTHER =
  'TRANSFER - MTN mobile money Credited account: 250788214515  Debited account: 100161965558  Amount: RWF 100,000 Transaction Charge: RWF 200 Event #: FTCM26182O3D0493G  Status: COMPLETED Date: 7/1/26, 11:35 PM  Channel:MOBILE Available Balance: RWF 266,471 For enquiry call BK: 250788143000 / 4455';

const BK_BILL_PAYMENT =
  'Bill payment - Cash Power Electricity Credited account: 04199571045 Debited account: 100161965558 Amount: RWF 10,000 Transaction Charge: RWF 0 Event #: FTCM26183ROCF7AKA Status: COMPLETED Date: 7/2/26, 9:24 AM  Channel:MOBILE  Voucher#: TK1:-2576-0359-4291-1321-9178 Available Balance: RWF 237,778 For enquiry call BK: 250788143000 / 4455';

const BK_FAILED =
  'Dear FABRICE HAFASHIMANA, your transfer to Bank of Kigali of RWF 300000.00,Transaction ID: 202607J7XX4DG6RW has FAILED. Any Queries? call 0788143000 / 4455';

describe('normalizeAccountNumber', () => {
  it('equates 2507..., 07..., and bare formats', () => {
    expect(normalizeAccountNumber('250787241457')).toBe('787241457');
    expect(normalizeAccountNumber('0787241457')).toBe('787241457');
    expect(normalizeAccountNumber('787241457')).toBe('787241457');
  });
});

describe('detectStatus', () => {
  it('flags FAILED transfers', () => {
    expect(detectStatus(BK_FAILED)).toBe('failed');
  });
  it('sees COMPLETED', () => {
    expect(detectStatus(BK_TRANSFER_TO_OWN_MOMO)).toBe('completed');
  });
});

describe('BK alert format (Credited/Debited account)', () => {
  it('classifies a debit from the user account as debit — not income', () => {
    const f = regexExtract(BK_TRANSFER_TO_OTHER, CTX);
    expect(f.direction).toBe('debit');
    expect(f.amount).toBe(100000);
    expect(f.fee).toBe(200);
    expect(f.balance_after).toBe(266471);
    expect(f.txn_ref).toBe('FTCM26182O3D0493G');
    expect(f.transferAccount).toBeNull();
  });

  it('defaults to debit even with no account numbers configured', () => {
    const f = regexExtract(BK_TRANSFER_TO_OTHER, {accounts: [], userName: ''});
    expect(f.direction).toBe('debit');
  });

  it('detects a transfer to the user own MoMo account', () => {
    const f = regexExtract(BK_TRANSFER_TO_OWN_MOMO, CTX);
    expect(f.direction).toBe('debit');
    expect(f.amount).toBe(45000);
    expect(f.fee).toBe(0);
    expect(f.transferAccount?.id).toBe('momo-1');
    const parsed = parseWithRegex(BK_TRANSFER_TO_OWN_MOMO, CTX);
    expect(parsed.isTransfer).toBe(true);
    expect(parsed.transferAccountId).toBe('momo-1');
    expect(parsed.merchant).toBe('To MTN MoMo');
  });

  it('parses the transaction Date: into occurred_at', () => {
    const f = regexExtract(BK_TRANSFER_TO_OWN_MOMO, CTX);
    expect(f.occurred_at).toContain('2026-06-30');
  });

  it('parses bill payments as debit utilities, meter number is not a transfer', () => {
    const parsed = parseWithRegex(BK_BILL_PAYMENT, CTX);
    expect(parsed.direction).toBe('debit');
    expect(parsed.amount).toBe(10000);
    expect(parsed.isTransfer).toBe(false);
    expect(parsed.category).toBe('utilities');
    expect(parsed.merchant).toBe('Cash Power Electricity');
  });
});

describe('failed SMS', () => {
  it('parses failed transfer with decimal amount, marked failed', () => {
    const parsed = parseWithRegex(BK_FAILED, CTX);
    expect(parsed.status).toBe('failed');
    expect(parsed.amount).toBe(300000);
  });
});

describe('learned transfer rules', () => {
  const SEND_TO_PERSON =
    'TxId: 99887. Your payment of 20,000 RWF to JOHN DOE 250788999888 has been completed. Fee was 100 RWF. Your new balance: 41,711 RWF.';

  it("a 'transfer' rule forces isTransfer for that counterparty", () => {
    const parsed = parseWithRegex(SEND_TO_PERSON, {
      rules: [{pattern: 'john doe', category: 'transfer', correction_count: 1, confirmation_count: 0}],
    });
    expect(parsed.isTransfer).toBe(true);
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('a real-category rule vetoes the name/Mokash heuristics', () => {
    // Counterparty matches the user's name → heuristic would say transfer…
    const raw =
      'You have received 45000 RWF from FABRICE HAFASHIMANA (*********558). Your new balance: 48,120 RWF.';
    const parsed = parseWithRegex(raw, {
      userName: 'Fabrice Hafashimana',
      rules: [{pattern: 'fabrice hafashimana', category: 'salary', correction_count: 1, confirmation_count: 0}],
    });
    // …but the user taught us it's income (salary), so NOT a transfer.
    expect(parsed.isTransfer).toBe(false);
    expect(parsed.category).toBe('salary');
  });

  it('account-number proof beats a contrary rule', () => {
    const parsed = parseWithRegex(
      'TRANSFER - MTN mobile money Credited account: 250787241457  Debited account: 100161965558  Amount: RWF 5,000 Transaction Charge: RWF 0 Event #: FT1 Status: COMPLETED Date: 7/6/26, 7:37 PM Available Balance: RWF 5,397',
      {
        ...CTX,
        rules: [{pattern: 'to mtn momo', category: 'shopping', correction_count: 1, confirmation_count: 0}],
      },
    );
    expect(parsed.isTransfer).toBe(true);
  });
});

describe('legacy formats still work', () => {
  it('MoMo payment (debit)', () => {
    const raw =
      'TxId: 123456. Your payment of 5,000 RWF to SAWA CITI LTD has been completed. Fee was 0 RWF. Your new balance: 61,811 RWF.';
    const parsed = parseWithRegex(raw);
    expect(parsed.direction).toBe('debit');
    expect(parsed.amount).toBe(5000);
    expect(parsed.balance_after).toBe(61811);
  });

  it('MoMo receive from self is a transfer (credit)', () => {
    const raw =
      'You have received 45000 RWF from FABRICE HAFASHIMANA (*********558) on your mobile money account. Your new balance: 48,120 RWF.';
    const parsed = parseWithRegex(raw, {userName: 'Fabrice Hafashimana'});
    expect(parsed.direction).toBe('credit');
    expect(parsed.isTransfer).toBe(true);
  });

  it('Mokash deposit reads balance and is a transfer', () => {
    const raw =
      'You have saved 2,000 RWF to your MoKash account. Your Mokash balance is RWF 3120.';
    const parsed = parseWithRegex(raw);
    expect(parsed.isTransfer).toBe(true);
    expect(extractBalance(raw)).toBe(3120);
  });
});

// ── BPR Bank — real SMS text, balance chain hand-verified ───────────────────
// Each debit/credit deducts BOTH "Transaction Charge" and "Notification
// Charge" from the balance, regardless of direction:
//   326,233 (18 JUN debit) + 211,933 (25 JUN credit) − 520 (500+20 charges) = 537,646
//   537,646 − 100,000 (08 JUL debit) − 20  (0+20 charges)  = 437,626
//   437,626 − 100,000 (18 JUL debit) − 40  (20+20 charges) = 337,586
//   337,586 −  40,000 (19 JUL debit) − 40  (20+20 charges) = 297,546
//   297,546 −  30,000 (20 JUL debit) − 40  (20+20 charges) = 267,506
const BPR_DEBIT =
  'Dear RUSARO KIZITO ANGE, your account 4******947 has been debited RWF 30,000.00. Ref: FT26201C9DZQ on 20 JUL 2026-19:28:17 at BPR Bank. Transaction Charge: RWF 20.00. Notification Charge: RWF 20.00. Your balance is RWF 267,506.00. For inquiry call 250788140000';

const BPR_DEBIT_ZERO_TXN_CHARGE =
  'Dear RUSARO KIZITO ANGE, your account 4******947 has been debited RWF 100,000.00. Ref: FT26189JP45Y on 08 JUL 2026-08:34:20 at BPR Bank. Transaction Charge: RWF 0.00. Notification Charge: RWF 20.00. Your balance is RWF 437,626.00. For inquiry call 250788140000';

const BPR_CREDIT =
  'Dear RUSARO KIZITO ANGE, your account 4******947 has been credited RWF 211,933.00. Ref: FT2617626KF3 on 25 JUN 2026-16:04:27 at BPR Bank. Transaction Charge: RWF 500.00. Notification Charge: RWF 20.00. Your balance is RWF 537,646.00. For inquiry call 250788140000';

const BPR_STATUS_COMPLETED =
  'Dear RUSARO KIZITO ANGE, \n\nTransaction Ref: 20144624592 of RWF 30,000.00 from A/c 4*****1947 to A/c 0*****2911 on 20/07/2026 is Completed Bank Ref: 04e5c2f8-d07a-4f46-a183-5e01a5e42b58.';

const BPR_STATUS_PROCESSING =
  'Dear RUSARO KIZITO ANGE, \n\nTransaction Ref: 20144624592 of RWF 30,000.00 from A/c 4*****1947 to A/c 0*****2911 on 20/07/2026 is Your request is being processing, confirmation will be sent to you shortly Bank Ref: 04e5c2f8-d07a-4f46-a183-5e01a5e42b58.';

const BPR_CTX: ParseContext = {
  userName: 'RUSARO KIZITO ANGE',
  accounts: [
    {id: 'bpr-1', name: 'BPR Bank', number: '4001234561947'},
    {id: 'momo-1', name: 'MTN MoMo', number: '250787241457'},
  ],
  currentAccountId: 'bpr-1',
};

describe('BPR Bank debit/credit alerts', () => {
  it('parses a debit with the DD MON YYYY-HH:MM:SS date, ref, and summed charges', () => {
    const f = regexExtract(BPR_DEBIT, BPR_CTX);
    expect(f.direction).toBe('debit');
    expect(f.amount).toBe(30000);
    expect(f.fee).toBe(40); // 20 (Transaction Charge) + 20 (Notification Charge)
    expect(f.balance_after).toBe(267506);
    expect(f.txn_ref).toBe('FT26201C9DZQ');
    expect(f.occurred_at).toContain('2026-07-20');
  });

  it('sums charges even when Transaction Charge is 0.00', () => {
    const f = regexExtract(BPR_DEBIT_ZERO_TXN_CHARGE, BPR_CTX);
    expect(f.fee).toBe(20); // 0 + 20
    expect(f.balance_after).toBe(437626);
  });

  it('"has been credited" is read as a credit, charges still deducted', () => {
    const f = regexExtract(BPR_CREDIT, BPR_CTX);
    expect(f.direction).toBe('credit');
    expect(f.amount).toBe(211933);
    expect(f.fee).toBe(520); // 500 + 20
    expect(f.balance_after).toBe(537646);
  });

  it('falls back to "at BPR Bank" as the merchant (no counterparty disclosed)', () => {
    const parsed = parseWithRegex(BPR_DEBIT, BPR_CTX);
    expect(parsed.merchant).toBe('BPR Bank');
  });
});

describe('BPR transfer-status confirmations are discarded, not parsed as transactions', () => {
  it('recognizes both the Completed and the processing variant', () => {
    expect(isTransferStatusOnly(BPR_STATUS_COMPLETED)).toBe(true);
    expect(isTransferStatusOnly(BPR_STATUS_PROCESSING)).toBe(true);
  });

  it('does NOT flag the authoritative debit/credit alert as status-only', () => {
    expect(isTransferStatusOnly(BPR_DEBIT)).toBe(false);
    expect(isTransferStatusOnly(BPR_CREDIT)).toBe(false);
  });

  it('extracts a transfer hint (amount, D/M/YYYY date key, destination suffix)', () => {
    const hint = extractTransferHint(BPR_STATUS_COMPLETED);
    expect(hint).not.toBeNull();
    expect(hint?.amount).toBe(30000);
    expect(hint?.dateKey).toBe('2026-07-20');
    expect(hint?.destSuffix).toBe('2911');
  });

  it('the processing variant yields the same hint as Completed', () => {
    expect(extractTransferHint(BPR_STATUS_PROCESSING)).toEqual(
      extractTransferHint(BPR_STATUS_COMPLETED),
    );
  });
});

describe('masked-number suffix matching (BPR shows a different trailing length per template)', () => {
  it('trailingDigits pulls the stable suffix out of a masked string', () => {
    expect(trailingDigits('4******947')).toBe('947');
    expect(trailingDigits('4*****1947')).toBe('1947');
    expect(trailingDigits('0*****2911')).toBe('2911');
  });

  it('matches the SAME account masked to different visible lengths', () => {
    expect(maskedSuffixMatches('947', '1947')).toBe(true);
    expect(maskedSuffixMatches(trailingDigits('4******947'), trailingDigits('4*****1947'))).toBe(true);
  });

  it('rejects an unrelated number and anything shorter than 3 digits', () => {
    expect(maskedSuffixMatches('2911', '1457')).toBe(false);
    expect(maskedSuffixMatches('11', '2911')).toBe(false);
  });

  it('a destination suffix matches the configured MoMo account by its trailing digits', () => {
    const momoNorm = normalizeAccountNumber('0787241457'); // → '787241457'
    expect(maskedSuffixMatches('1457', momoNorm)).toBe(true);
    expect(maskedSuffixMatches('2911', momoNorm)).toBe(false);
  });
});

// ── Kinyarwanda MTN Mokash SMS — real text, no "balance"/"credited" keywords ─
const MOKASH_KINY_DEPOSIT_1 =
  "Y'ello. Umaze kubitsa RWF 500 kuri Mokash kuva kuri konti yawe ya Mobile Money. Ubu ufite RWF 508 kuri Mokash.Ref 29373092228";

const MOKASH_KINY_SEND =
  "Y'ello. Umaze kohereza RWF 5000 kuva kuri konti Mokash tariki 16/07/2026 saa 9:39 AM. Mokash ifiteho amafaranga RWF 7508. Ref 29227817165";

const MOKASH_KINY_DEPOSIT_2 =
  "Y'ello. Umaze kubitsa RWF 500 kuri Mokash kuva kuri konti yawe ya Mobile Money. Ubu ufite RWF 8508 kuri Mokash.Ref 29012034911";

const MOKASH_KINY_INSUFFICIENT_FUNDS =
  "Y'ello. Ntabwo ufite amafaranga ahagije kuri konti yawe ya Mokash kugira ngo ukore iki gikorwa. Ufite 3508 RWF";

describe('Kinyarwanda MTN Mokash SMS', () => {
  it('reads the "Ubu ufite RWF X kuri Mokash" balance and treats a deposit as a credit/transfer', () => {
    expect(extractBalance(MOKASH_KINY_DEPOSIT_1)).toBe(508);
    const parsed = parseWithRegex(MOKASH_KINY_DEPOSIT_1);
    expect(parsed.direction).toBe('credit');
    expect(parsed.isTransfer).toBe(true);
    expect(parsed.balance_after).toBe(508);
  });

  it('reads the "Mokash ifiteho amafaranga RWF X" balance and treats a send as a debit/transfer', () => {
    expect(extractBalance(MOKASH_KINY_SEND)).toBe(7508);
    const parsed = parseWithRegex(MOKASH_KINY_SEND);
    expect(parsed.direction).toBe('debit');
    expect(parsed.isTransfer).toBe(true);
    expect(parsed.balance_after).toBe(7508);
  });

  it('a second deposit again reads as a credit with its own balance', () => {
    expect(extractBalance(MOKASH_KINY_DEPOSIT_2)).toBe(8508);
    const parsed = parseWithRegex(MOKASH_KINY_DEPOSIT_2);
    expect(parsed.direction).toBe('credit');
  });

  it('an insufficient-funds notice is detected as FAILED, never a transaction', () => {
    expect(detectStatus(MOKASH_KINY_INSUFFICIENT_FUNDS)).toBe('failed');
    const parsed = parseWithRegex(MOKASH_KINY_INSUFFICIENT_FUNDS);
    expect(parsed.status).toBe('failed');
  });

  it('detectTransfer still flags plain Mokash mentions regardless of language', () => {
    expect(detectTransfer(MOKASH_KINY_DEPOSIT_1)).toBe(true);
    expect(detectTransfer(MOKASH_KINY_SEND)).toBe(true);
  });
});
