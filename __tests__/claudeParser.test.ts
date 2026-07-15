/**
 * Regex-parser tests against real Rwandan SMS formats (BK alert format,
 * MoMo, failed transactions). No network — regex facts only.
 */
import {
  detectStatus,
  extractBalance,
  normalizeAccountNumber,
  parseWithRegex,
  regexExtract,
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
