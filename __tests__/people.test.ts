// People — filing money to and from someone by who they are. Invented data only.
import {
  Person,
  looksLikePerson,
  matchPerson,
  personCategory,
  planRefile,
  savePerson,
} from '../src/tools/people';
import {buildClassification} from '../src/tools/smsParser';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p1',
  kind: 'person',
  name: 'Mama',
  matchKeys: ['test mother'],
  phones: ['788000111'],
  relationship: 'parent',
  categoryOut: null,
  categoryIn: null,
  note: null,
  ...over,
});

const SEND = '*165*S*20000 RWF transferred to Test MOTHER (250788000111) at 2026-01-01 10:00:00 .Fee: 100RWF.Balance: 5000RWF.';
const RECEIVE = 'You have received 15000 RWF from Test MOTHER (*********111) at 2026-01-01 10:00:00 . Balance:20000 RWF.';

describe('matchPerson', () => {
  it('by phone number, in any format', () => {
    expect(matchPerson([person({matchKeys: []})], SEND, [])?.id).toBe('p1');
  });
  it('by spelling, when the SMS masks the number', () => {
    expect(matchPerson([person({phones: []})], RECEIVE, ['Test Mother'])?.id).toBe('p1');
  });
  it('nobody', () => {
    expect(matchPerson([person()], 'payment to Someone Else', ['Someone Else'])).toBeNull();
  });
});

describe('personCategory — relationship defaults, direction-aware', () => {
  it('a parent: Family Support out, Money from Family in', () => {
    expect(personCategory(person(), 'debit')).toEqual({category: 'family', subcategory: 'Parents & relatives'});
    expect(personCategory(person(), 'credit')).toEqual({category: 'family_in', subcategory: ''});
  });
  it('a child out goes to Children', () => {
    expect(personCategory(person({relationship: 'child'}), 'debit')?.subcategory).toBe('Children');
  });
  it('a friend: purpose varies, keep asking', () => {
    expect(personCategory(person({relationship: 'friend'}), 'debit')).toBeNull();
  });
  it('a landlord is rent; an employer pays salary', () => {
    expect(personCategory(person({relationship: 'landlord'}), 'debit')).toEqual({category: 'housing', subcategory: 'Rent'});
    expect(personCategory(person({relationship: 'employer'}), 'credit')?.category).toBe('salary');
  });
  it('a per-person category overrides the default', () => {
    expect(personCategory(person({categoryOut: 'education'}), 'debit')).toEqual({category: 'education', subcategory: ''});
  });
});

describe('the classifier files a known person without the model', () => {
  it('money to a parent → Family Support, no model call', () => {
    const plan = buildClassification(SEND, [], {}, {sender: 'M-Money', people: [person()]});
    expect(plan.shortCircuit?.category).toBe('family');
    expect(plan.shortCircuit?.subcategory).toBe('Parents & relatives');
  });
  it('money from a parent → Money from Family', () => {
    const plan = buildClassification(RECEIVE, [], {}, {sender: 'M-Money', people: [person({phones: []})]});
    expect(plan.shortCircuit?.category).toBe('family_in');
  });
  it('"me, another number" → a transfer between my accounts', () => {
    const plan = buildClassification(SEND, [], {}, {sender: 'M-Money', people: [person({relationship: 'self'})]});
    expect(plan.shortCircuit?.category).toBe('own_transfer');
    expect(plan.shortCircuit?.isTransfer).toBe(true);
  });
  it('a friend goes to the model, with the relationship as context', () => {
    const plan = buildClassification(SEND, [], {}, {sender: 'M-Money', people: [person({relationship: 'friend', name: 'Claudine'})]});
    expect(plan.shortCircuit).toBeUndefined();
    expect(plan.user).toContain("account holder's friend (Claudine)");
  });
  it("the user's own words for this payment still win", () => {
    const plan = buildClassification(SEND, [], {}, {sender: 'M-Money', people: [person()], userNote: 'school fees'});
    expect(plan.shortCircuit).toBeUndefined();
  });
});

describe('looksLikePerson', () => {
  it.each([
    ['Claudine Uwase', true],
    ['Moise', true],
    ['Simba Supermarket Ltd', false],
    ['Bank Of Kigali', false],
    ['Mokash Loan Account', false],
    ['Card Purchase', false], // seen on the real phone: the bank's label, not a name
    ['Ekash Incoming Transfer', false],
  ])('%s → %s', (name, want) => {
    expect(looksLikePerson(name)).toBe(want);
  });
});

function fakeDb(txRows: any[] = [], peopleRows: any[] = []) {
  const calls: {sql: string; params: any[]}[] = [];
  return {
    calls,
    execute: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({sql, params});
      if (/FROM people/.test(sql)) return {rows: {_array: peopleRows}};
      if (/FROM transactions/.test(sql)) return {rows: {_array: txRows}};
      return {rows: {_array: []}};
    }),
  };
}

describe('re-filing past payments', () => {
  const rows = [
    {id: 'a', merchant: 'Test Mother', pay_code: '0788000111', category: 'other_spending', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
    {id: 'b', merchant: 'Test Mother', pay_code: null, category: 'own_transfer', transaction_type: 'transfer', transfer_direction: 'in', transfer_account_id: null},
    {id: 'c', merchant: 'Test Mother', pay_code: null, category: 'education', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
    {id: 'd', merchant: 'Test Mother', pay_code: null, category: 'own_transfer', transaction_type: 'transfer', transfer_direction: 'out', transfer_account_id: 'acct-2'},
    {id: 'e', merchant: 'Someone Else', pay_code: null, category: 'other_spending', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
  ];

  it('moves only their GENERIC rows, by direction; never a specific choice or a proven own transfer', async () => {
    const plans = await planRefile(fakeDb(rows), 'o', person());
    expect(plans.map(p => [p.id, p.category, p.type])).toEqual([
      ['a', 'family', 'expense'],
      ['b', 'family_in', 'income'],
    ]);
  });
});

describe('savePerson', () => {
  it('merges into an existing person sharing a phone, instead of a duplicate', async () => {
    const existing = {id: 'p1', name: 'Mama', match_keys: '["test mother"]', phones: '["788000111"]', relationship: 'parent'};
    const db = fakeDb([], [existing]);
    const saved = await savePerson(db, 'o', {name: 'Mama', spellings: ['MOTHER T.'], phones: ['250788000111'], relationship: 'parent'});
    expect(saved.id).toBe('p1');
    expect(db.calls.some(c => c.sql.startsWith('UPDATE people'))).toBe(true);
    expect(db.calls.some(c => c.sql.startsWith('INSERT INTO people'))).toBe(false);
  });
});

describe('places (kind = merchant)', () => {
  const bakery = person({
    id: 'm1',
    kind: 'merchant',
    name: 'Test Bakery',
    matchKeys: ['test bakery'],
    phones: [],
    relationship: 'business',
    categoryOut: 'groceries',
  });
  const PAY = 'TxId: 1. Your payment of 1,500 RWF to TEST BAKERY 012345 has been completed at 2026-01-01 10:00:00. Your new balance: 8,000 RWF. Fee was 0 RWF.';

  it('a known place files its payments with no model call', () => {
    const plan = buildClassification(PAY, [], {}, {sender: 'M-Money', people: [bakery]});
    expect(plan.shortCircuit?.category).toBe('groceries');
    expect(plan.shortCircuit?.merchant).toBe('Test Bakery');
  });

  it('re-filing a place moves its spending rows from ANY category — never transfers', async () => {
    const rows = [
      {id: 'a', merchant: 'Test Bakery', pay_code: null, category: 'eating_out', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
      {id: 'b', merchant: 'Test Bakery', pay_code: null, category: 'other_spending', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
      {id: 'c', merchant: 'Test Bakery', pay_code: null, category: 'own_transfer', transaction_type: 'transfer', transfer_direction: 'out', transfer_account_id: null},
      {id: 'd', merchant: 'Test Bakery', pay_code: null, category: 'groceries', transaction_type: 'expense', transfer_direction: null, transfer_account_id: null},
    ];
    const plans = await planRefile(fakeDb(rows), 'o', bakery);
    expect(plans.map(p => [p.id, p.category])).toEqual([
      ['a', 'groceries'],
      ['b', 'groceries'],
    ]); // c is a transfer; d is already right
  });

  it('suggestPlaces: businesses paid 3+ times, not people, with their usual category', async () => {
    const {suggestPlaces} = require('../src/tools/people');
    const tx = (merchant: string, category: string) => ({merchant, payee: null, pay_code: null, amount: 1000, category, transaction_type: 'expense', date_time: '2026-01-01'});
    const rows = [
      tx('Test Bakery Ltd', 'groceries'), tx('Test Bakery Ltd', 'groceries'), tx('Test Bakery Ltd', 'eating_out'),
      tx('Claudine Tester', 'other_spending'), tx('Claudine Tester', 'other_spending'), tx('Claudine Tester', 'other_spending'),
      tx('Rare Shop Ltd', 'shopping'),
    ];
    const out = await suggestPlaces(fakeDb(rows, []), 'o');
    expect(out.map((p: any) => [p.name, p.count, p.usual])).toEqual([['Test Bakery Ltd', 3, 'groceries']]);
  });
});

describe('a name paid through a merchant code is a place, not a person', () => {
  const {suggestPeople, suggestPlaces} = require('../src/tools/people');
  const tx = (pay_code: string | null, inbound = false) => ({
    merchant: 'Valentina', payee: null, pay_code, amount: 1000, category: 'groceries',
    transaction_type: inbound ? 'income' : 'expense', transfer_direction: null, date_time: '2026-01-01',
  });
  const rows = [tx('123456'), tx('123456'), tx('123456')];
  it('not suggested as a person', async () => {
    expect(await suggestPeople(fakeDb(rows, []), 'o')).toEqual([]);
  });
  it('suggested as a place', async () => {
    const out = await suggestPlaces(fakeDb(rows, []), 'o');
    expect(out.map((p: any) => p.name)).toEqual(['Valentina']);
  });
});
