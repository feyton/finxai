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
    expect(resolveCat('savings', 'transfer', 'in')).toBe('from_savings');
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
