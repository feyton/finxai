/**
 * Regex-parser tests against real Rwandan SMS formats (BK alert format,
 * MoMo, failed transactions). No network — regex facts only.
 */
import {
  detectStatus,
  detectTransfer,
  extractAccountRef,
  extractBalance,
  extractTransferHint,
  findRule,
  isTransferStatusOnly,
  maskedSuffixMatches,
  normalizeAccountNumber,
  parseWithRegex,
  regexExtract,
  trailingDigits,
  ParseContext,
} from '../src/tools/claudeParser';
import {isUsablePattern, normalizeMerchant} from '../src/tools/merchantNormalize';
import {pickSmsFormat} from '../src/tools/smsFormats';
import {THRESHOLD_AUTO_SAVE} from '../src/tools/geminiParser';

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

// ── Bank of Kigali's SECOND alert format — real text, sent from a different
// sender ("BK BANK") than the original "TRANSFER - ... Credited account:"
// format. No "Date:" label, no counterparty name; uses "Txn Description".
const BK_V2_CREDIT =
  'Dear FABRICE HAFASHIMANA, your account ********5558 has been credited RWF2,073,109. Ref: FTCM26204KMIB5YCF on 23-07-2026 19:05:37. Txn Description: Incoming Trsf frm local banks. Txn Charge: RWF0. Notification Charge: RWF0. Available Balance: RWF2,073,109. For inquiries call BK: 250788143000.';

const BK_V2_DEBIT_EKASH =
  'Dear FABRICE HAFASHIMANA, your account ********5558 has been debited RWF100,000. Ref: FTCM2620415SGRF2Y on 23-07-2026 19:10:45. Txn Description: EKASH P2P-NEW APP. Txn Charge: RWF20. Notification Charge: RWF0. Available Balance: RWF1,812,490. For inquiries call BK: 250788143000.';

const BK_V2_CARD_PURCHASE =
  'Dear FABRICE HAFASHIMANA, your account ********5558 has been debited RWF5,064. Ref: FTCM26204TSGM6FED on 23-07-2026 19:56:04. Txn Description: Card Purchase. Txn Charge: RWF0. Notification Charge: RWF0. Available Balance: RWF1,807,426. For inquiries call BK: 250788143000.';

describe('Bank of Kigali — second alert format ("BK BANK" sender)', () => {
  it('reads a credit correctly: amount, balance, date, and a merchant from Txn Description', () => {
    const f = regexExtract(BK_V2_CREDIT);
    expect(f.direction).toBe('credit');
    expect(f.amount).toBe(2073109);
    expect(f.fee).toBe(0);
    expect(f.balance_after).toBe(2073109);
    expect(f.txn_ref).toBe('FTCM26204KMIB5YCF');
    expect(f.occurred_at).toContain('2026-07-23');
    const parsed = parseWithRegex(BK_V2_CREDIT);
    expect(parsed.merchant).toBe('Incoming Trsf frm local banks');
  });

  it('reads a debit (EKASH P2P) with summed Txn + Notification charges', () => {
    const f = regexExtract(BK_V2_DEBIT_EKASH);
    expect(f.direction).toBe('debit');
    expect(f.amount).toBe(100000);
    expect(f.fee).toBe(20);
    expect(f.balance_after).toBe(1812490);
    const parsed = parseWithRegex(BK_V2_DEBIT_EKASH);
    expect(parsed.merchant).toBe('EKASH P2P-NEW APP');
  });

  it('reads a card purchase debit with no fee', () => {
    const f = regexExtract(BK_V2_CARD_PURCHASE);
    expect(f.direction).toBe('debit');
    expect(f.amount).toBe(5064);
    expect(f.fee).toBe(0);
    expect(f.balance_after).toBe(1807426);
    const parsed = parseWithRegex(BK_V2_CARD_PURCHASE);
    expect(parsed.merchant).toBe('Card Purchase');
  });

  it('extracts the account reference for sender-independent routing, matching the configured account number by trailing digits', () => {
    const ref = extractAccountRef(BK_V2_CREDIT);
    expect(ref).toBe('********5558');
    expect(trailingDigits(ref!)).toBe('5558');
    // The account's OWN configured number (unmasked) still matches by suffix.
    expect(maskedSuffixMatches(trailingDigits(ref!), normalizeAccountNumber('100161965558'))).toBe(true);
    // A different account's number does not.
    expect(maskedSuffixMatches(trailingDigits(ref!), normalizeAccountNumber('0787241457'))).toBe(false);
  });

  it('the same transaction reported by BOTH BK senders shares one txn_ref, so it can be deduplicated', () => {
    const OLD_SENDER_SAME_TXN =
      'TRANSFER - EKASH Beneficiary: Fabrice HAFASHIMANA Credited account: 250787241457 Debited account: 100161965558 Amount:RWF 100000.00 Transaction Charge:RWF 20 Event #:FTCM2620415SGRF2Y Status: COMPLETED Date: 2026-07-23 19:10:39.43 Channel:MOBILE Available Balance:RWF 1,812,490 For enquiry call BK:250788143000/4455';
    const a = regexExtract(BK_V2_DEBIT_EKASH);
    const b = regexExtract(OLD_SENDER_SAME_TXN);
    expect(a.txn_ref).toBe('FTCM2620415SGRF2Y');
    expect(b.txn_ref).toBe('FTCM2620415SGRF2Y');
    expect(a.txn_ref).toBe(b.txn_ref);
  });
});

// ── Counterparty extraction against REAL messages ──────────────────────────
// Every case below came from the user's own inbox. Before this suite existed,
// 7 of 8 extracted wrongly and none produced a reusable learning key — yet the
// tests above passed, because none of them asserted on `merchant`.
describe('counterparty extraction (real inbox samples)', () => {
  const CASES: [string, string, string][] = [
    [
      'MTN merchant — "transaction of N RWF by X" had NO pattern at all',
      "*164*S*Y'ello, A transaction of 2000 RWF by ComzAfrica Rwanda Limited was completed at 2026-07-29 12:51:17. Balance:1152 RWF. Fee  0 RWF. FT Id: 29508026690. ET  Id: K1785321706780440.*EN#",
      'ComzAfrica Rwanda Limited',
    ],
    [
      'MTN merchant — INTOUCH',
      "*164*S*Y'ello, A transaction of 105000 RWF by INTOUCH COMMUNICATIONS LTD was completed at 2026-07-29 10:57:20. Balance:3180 RWF. Fee  0 RWF. FT Id: 29505489295.*EN#",
      'Intouch Communications Ltd',
    ],
    [
      'MTN P2P — timestamp used to be captured INTO the name',
      'TxId:29506397578*S*Your payment of 1,500 RWF to Valentine 002597 was completed at 2026-07-29 11:37:48.  Balance: 3,152 RWF. Fee 0 RWF.*EN#',
      'Valentine',
    ],
    [
      'MTN merchant-with-code — code split off the name',
      'TxId:29519088326*S*Your payment of 2,500 RWF to THRIVE G Ltd 888840 was completed at 2026-07-29 20:04:10.  Balance: 5,680 RWF. Fee 0 RWF.*EN#',
      'Thrive G Ltd',
    ],
    [
      'MTN P2P — Lambert',
      'TxId:29496587489*S*Your payment of 6,300 RWF to Lambert 005868 was completed at 2026-07-28 19:52:04.  Balance: 4,180 RWF. Fee 0 RWF.*EN#',
      'Lambert',
    ],
    [
      'MTN receive — greedy .+ used to bind the LAST "from", yielding "sender:"',
      'You have received 105000 RWF from FABRICE HAFASHIMANA (*********915) at 2026-07-29 10:56:04. Message from sender: . Balance:108180 RWF. FT Id: 29505457081.',
      'Fabrice Hafashimana',
    ],
    [
      'legacy MoMo payment — was silently "SAWA CITI LTD has been completed"',
      'TxId: 123456. Your payment of 5,000 RWF to SAWA CITI LTD has been completed. Fee was 0 RWF. Your new balance: 61,811 RWF.',
      'Sawa Citi Ltd',
    ],
  ];

  it.each(CASES)('%s', (_label, raw, expected) => {
    expect(parseWithRegex(raw).merchant).toBe(expected);
  });

  it('never leaves a timestamp or "was completed" inside the merchant name', () => {
    for (const [, raw] of CASES) {
      const m = parseWithRegex(raw).merchant;
      expect(m).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(m).not.toMatch(/was completed|has been completed/i);
    }
  });

  it('the BK header format still wins over the new MTN pattern, casing preserved', () => {
    const parsed = parseWithRegex(
      'TRANSFER - MTN mobile money Credited account: 250787241457  Debited account: 100161965558  Amount: RWF 5,000 Transaction Charge: RWF 0 Status: COMPLETED',
    );
    // A bank DESCRIPTION field, not a counterparty name — passed through as the
    // bank wrote it rather than title-cased.
    expect(parsed.merchant).toBe('MTN mobile money');
  });
});

// ── Learning keys must be stable and safe ──────────────────────────────────
describe('merchant normalization → learning keys', () => {
  it('collapses the same counterparty across different timestamps', () => {
    const a = normalizeMerchant('Valentine 002597 was completed at 2026-07-29 11:37:48');
    const b = normalizeMerchant('Valentine 002597 was completed at 2026-08-02 08:14:02');
    expect(a.key).toBe(b.key);
    expect(a.key).toBe('valentine');
    expect(a.code).toBe('002597');
  });

  it('collapses Ltd/Limited spellings onto one key', () => {
    expect(normalizeMerchant('ComzAfrica Rwanda Limited').key).toBe(
      normalizeMerchant('ComzAfrica Rwanda Ltd').key,
    );
  });

  it("rejects 'unknown' as a pattern — it used to match every unparseable SMS", () => {
    expect(isUsablePattern('unknown')).toBe(false);
    expect(isUsablePattern('bk')).toBe(false); // too short to match on safely
    expect(isUsablePattern('valentine')).toBe(true);
  });
});

describe('findRule matching', () => {
  const rule = (pattern: string, category = 'food') => ({
    pattern,
    category,
    correction_count: 1,
    confirmation_count: 0,
  });

  it('matches an exact normalized key and reports it as exact', () => {
    const hit = findRule([rule('valentine')], 'Valentine');
    expect(hit?.category).toBe('food');
    expect(hit?.exact).toBe(true);
  });

  it("never matches via an 'unknown' rule", () => {
    expect(findRule([rule('unknown', 'rent')], 'Unknown')).toBeUndefined();
  });

  it('does not let a 2-char pattern match an unrelated merchant', () => {
    expect(findRule([rule('bk')], 'Bakery Supplies')).toBeUndefined();
  });

  it('matches on a word boundary, not a bare substring', () => {
    expect(findRule([rule('cafe')], 'Cafe Rwanda')?.exact).toBe(false);
    // 'cafe' must NOT match inside 'Cafeteria'
    expect(findRule([rule('cafe')], 'Cafeteria Ltd')).toBeUndefined();
  });

  it('an inexact rule hit stays below the auto-save threshold', () => {
    const parsed = parseWithRegex(
      'TxId: 1. Your payment of 1,000 RWF to Cafe Rwanda has been completed. Fee was 0 RWF.',
      {rules: [rule('cafe')]},
    );
    expect(parsed.category).toBe('food');
    expect(parsed.confidence).toBeLessThan(THRESHOLD_AUTO_SAVE);
  });
});

// ── Per-provider prompt/extractor selection ────────────────────────────────
describe('SMS format registry', () => {
  it('routes MTN wrapper messages to the MTN format', () => {
    const f = pickSmsFormat('M-Money', "*164*S*Y'ello, A transaction of 500 RWF by X was completed.*EN#");
    expect(f.id).toBe('mtn');
  });

  it('routes the BK transfer-alert body to the BK format regardless of sender', () => {
    expect(
      pickSmsFormat('anything', 'TRANSFER - EKASH Credited account: 1 Debited account: 2 Amount: RWF 5').id,
    ).toBe('bk');
  });

  it("routes BK's second sender by its Txn Description marker", () => {
    expect(pickSmsFormat('BK BANK', 'your account x has been debited RWF 1 Txn Description: Card Purchase.').id)
      .toBe('bk_bank');
  });

  it('extracts the MTN counterparty deterministically, code separated', () => {
    const f = pickSmsFormat('M-Money', 'Your payment of 2,500 RWF to THRIVE G Ltd 888840 was completed at 2026-07-29 20:04:10.');
    expect(f.extractCounterparty?.('Your payment of 2,500 RWF to THRIVE G Ltd 888840 was completed at 2026-07-29 20:04:10.')).toEqual({
      name: 'THRIVE G Ltd',
      code: '888840',
    });
  });
});
