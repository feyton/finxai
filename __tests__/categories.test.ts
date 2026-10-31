// Taxonomy v2 — category validity is tied to the money's direction.
// The mismatch cases are the real ones found in the labelled corpus on
// 2026-10-31 (transfer+Salary, income+Transport, "Family" both ways).
import {
  CATEGORY_IDS,
  CATEGORY_META,
  categoriesForDirection,
  categoriesForType,
  coerceForType,
  matchCategory,
  resolveCat,
  typeForCategory,
  validForType,
} from '../shared/categories';
import {classificationSchema, parseWithRegex} from '../src/tools/smsParser';

describe('taxonomy shape', () => {
  it('every category has one kind, a definition, and unique subcategories', () => {
    for (const id of CATEGORY_IDS) {
      const m = CATEGORY_META[id];
      expect(['expense', 'income', 'transfer', 'loan']).toContain(m.kind);
      expect(m.description.length).toBeGreaterThan(10);
      const names = m.subcategories.map(s => s.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('labels are unique, so a stored label maps back to exactly one id', () => {
    const labels = CATEGORY_IDS.map(id => CATEGORY_META[id].label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of CATEGORY_IDS) {
      expect(matchCategory(CATEGORY_META[id].label)).toBe(id);
    }
  });
});

describe('there is no income called Groceries', () => {
  it('validForType ties every category to one stored type', () => {
    expect(validForType('groceries', 'expense')).toBe(true);
    expect(validForType('groceries', 'income')).toBe(false);
    expect(validForType('salary', 'expense')).toBe(false);
    expect(validForType('to_savings', 'transfer')).toBe(true);
    expect(validForType('loan_repayment', 'transfer')).toBe(true); // loans are stored as transfers
  });

  it('the money-IN menu has no spending category, the OUT menu no income one', () => {
    for (const id of categoriesForDirection('in')) {
      expect(CATEGORY_META[id].kind).not.toBe('expense');
    }
    for (const id of categoriesForDirection('out')) {
      expect(CATEGORY_META[id].kind).not.toBe('income');
    }
  });

  it('pickers per type only offer that type', () => {
    expect(categoriesForType('income')).not.toContain('groceries');
    expect(categoriesForType('expense')).not.toContain('salary');
  });

  it('the classifier schema only enumerates the direction’s categories', () => {
    const credit = classificationSchema('credit') as any;
    expect(credit.properties.category.enum).not.toContain('groceries');
    expect(credit.properties.category.enum).toContain('salary');
    const debit = classificationSchema('debit') as any;
    expect(debit.properties.category.enum).not.toContain('salary');
  });
});

describe('direction-aware reading of stored values (the migration rules)', () => {
  it('Family: support out, money from family in, own transfer when typed transfer', () => {
    expect(resolveCat('Family & Transfers', 'expense')).toBe('family');
    expect(resolveCat('family', 'income')).toBe('family_in');
    expect(resolveCat('Family & Transfers', 'transfer')).toBe('own_transfer');
  });

  it('the real mismatches resolve to something valid, never a wrong guess', () => {
    expect(resolveCat('salary', 'transfer')).toBe('own_transfer');
    expect(resolveCat('transport', 'income')).toBe('other_income');
    expect(resolveCat('Groceries', 'income')).toBe('other_income');
  });

  it('savings and loans follow the transfer direction', () => {
    expect(resolveCat('savings', 'transfer', 'out')).toBe('to_savings');
    // NOT flipped on an inbound leg: a MoKash deposit lands on the tracked MoKash
    // account as money IN and is still To Savings.
    expect(resolveCat('savings', 'transfer', 'in')).toBe('to_savings');
    expect(resolveCat('From Savings', 'transfer', 'out')).toBe('from_savings');
    expect(resolveCat('debt', 'transfer', 'in')).toBe('loan_received');
    expect(coerceForType('lent_out', 'transfer', 'in')).toBe('repaid_to_me');
  });

  it('v1 labels and ids land in their v2 homes', () => {
    expect(resolveCat('Food & Dining')).toBe('eating_out');
    expect(resolveCat('Rent')).toBe('housing');
    expect(resolveCat('Regular Family Transfer')).toBe('family'); // v1 read this as Utilities
    expect(resolveCat('Other Income', 'income')).toBe('other_income'); // v1: Salary
    expect(resolveCat('something unheard of')).toBe('other_spending'); // v1: Shopping
  });

  it('loans are stored as transfers so they stay out of income and spending', () => {
    expect(typeForCategory('loan_received')).toBe('transfer');
    expect(typeForCategory('family_in')).toBe('income');
  });
});

describe('MoKash: into vs out of savings comes from the words', () => {
  it('a deposit is To Savings even when it arrives as a credit on the MoKash account', () => {
    const deposit = "Y'ello. You have deposited RWF 1000 into Mokash from your Mobile Money Account. Your new  Mokash balance is RWF 1500.Ref 10000000001";
    const p = parseWithRegex(deposit, {accounts: [], currentAccountId: 'mokash'});
    expect(p.category).toBe('to_savings');
    const out = "Y'ello. You have transferred RWF 5000 from your Mokash account on 01/01/2026 at 5:32 PM. Mokash balance is RWF 985. Ref 10000000002";
    expect(parseWithRegex(out, {}).category).toBe('from_savings');
  });
});

describe('the classifier enforces direction on every path', () => {
  const credit = 'You have received 5,000 RWF from TEST PERSON (*********123) on your mobile money account at 2026-01-01 10:00:00. Your new balance: 9,000 RWF.';
  const debit = 'TxId: 1. Your payment of 1,000 RWF to Test Shop 012345 has been completed at 2026-01-01 10:00:00. Your new balance: 8,000 RWF. Fee was 0 RWF.';
  const rule = (pattern: string, category: string) =>
    ({pattern, category, subcategory: '', display_name: null, correction_count: 1, confirmation_count: 0}) as any;

  it('a learned spending rule cannot make money IN into spending', () => {
    // Control: the same rule with an income category IS applied — so the rule
    // matches, and the next assertion is about direction, not a missed match.
    expect(parseWithRegex(credit, {rules: [rule('test person', 'salary')]}).category).toBe('salary');
    const p = parseWithRegex(credit, {rules: [rule('test person', 'groceries')]});
    expect(p.direction).toBe('credit');
    expect(CATEGORY_META[p.category].kind).not.toBe('expense');
  });

  it('a subcategory from another category is dropped', () => {
    const p = parseWithRegex(debit, {
      rules: [{...rule('test shop', 'shopping'), subcategory: 'Charity'}],
    });
    expect(p.category).toBe('shopping');
    expect(p.subcategory).toBe('');
  });

  it('a transfer-kind rule makes the record a transfer', () => {
    const p = parseWithRegex(debit, {rules: [rule('test shop', 'to_savings')]});
    expect(p.isTransfer).toBe(true);
    expect(p.category).toBe('to_savings');
  });
});

// Found reading real rows on 2026-10-31 (invented text below, same templates).
describe('templates the v23 review uncovered', () => {
  it('a BPR "request is being processed" status message is not a transaction', () => {
    const {isTransferStatusOnly} = require('../src/tools/smsParser');
    expect(
      isTransferStatusOnly(
        'Dear TEST USER, Transaction Ref: 1234567 of RWF 80,000.00 from A/c 4*****1000 to A/c 0*****2000 on 18/10/2026 is Your request is being processed, confirmation will be sent to you shortly',
      ),
    ).toBe(true);
  });

  it('Kinyarwanda MoKash: deposit, withdrawal and interest are recognised', () => {
    const {notATransaction} = require('../src/tools/smsParser');
    const dep = "Y'ello. Umaze kubitsa RWF 500 kuri Mokash kuva kuri konti yawe ya Mobile Money. Ubu ufite RWF 3000 kuri Mokash.Ref 1000000001";
    const out = "Y'ello. Umaze kohereza RWF 4000 kuva kuri konti Mokash tariki 14/10/2026 saa 4:26 PM. Mokash ifiteho amafaranga RWF 500. Ref 1000000002";
    const interest = 'Mukiliya mwiza, kwizigamira kuri MoKash biguhesha inyungu. Uhawe inyungu ya RWF 71. Ubwizigamire bwawe ni RWF 1,500.';
    for (const m of [dep, out, interest]) {
      expect(notATransaction(m)).toBe(false); // the interest one used to be dropped as "no money verb"
    }
    expect(parseWithRegex(dep, {}).category).toBe('to_savings');
    expect(parseWithRegex(out, {}).category).toBe('from_savings');
    expect(parseWithRegex(interest, {}).category).toBe('interest');
    // a balance notice is still not a transaction
    expect(notATransaction("Y'ello. Amafaranga ya Mokash ufite ni RWF, 1279 ya tariki 15/09/2026.")).toBe(true);
  });

  it('a BK bill payment ("Credited A/C … Debited A/C") is money OUT', () => {
    const {resolveDirection} = require('../shared/smsDirection');
    const bill = 'Bill payment - Wasac Credited A/C: 1000000000 Debited A/C: 2000000000 Amount: RWF 5,111 Transaction Charge: RWF 100 Status: COMPLETED';
    expect(resolveDirection(bill, {}).direction).toBe('debit');
  });
});

describe('BK eKash transfers name the person', () => {
  const {pickSmsFormat} = require('../src/tools/smsFormats');
  const ekash = 'TRANSFER - EKASH Beneficiary: Jean TESTER Credited account: 250780000123 Debited account: 1000000000 Amount:RWF 15000.00 Transaction Charge:RWF 20 Status: COMPLETED';
  it('the format extractor returns the beneficiary, not "EKASH Beneficiary: …"', () => {
    expect(pickSmsFormat('BK', ekash).extractCounterparty(ekash)?.name).toBe('Jean TESTER');
  });
  it('the regex fallback names them too', () => {
    expect(parseWithRegex(ekash, {}).merchant).toBe('Jean Tester');
  });
});
