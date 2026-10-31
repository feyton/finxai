// pickMemories — which of the user's facts ride along with an SMS. Invented
// data only (public repo).
import {MemoryRow, cleanMemoryText, pickMemories} from '../src/tools/memory';
import {buildClassification} from '../src/tools/smsParser';

const m = (text: string, over: Partial<MemoryRow> = {}): MemoryRow => ({
  id: text,
  text,
  subject: null,
  source: 'user',
  created_at: null,
  ...over,
});

const SMS_PERSON =
  '*165*S*20000 RWF transferred to Test Landlord (250788000111) at 2026-01-01 10:00:00 .Fee: 100RWF.Balance: 5000RWF.';

describe('pickMemories', () => {
  it('finds a fact by phone number, whatever the formatting', () => {
    const facts = [m('0788 000 111 is my landlord — that is rent')];
    expect(pickMemories(facts, SMS_PERSON, ['Test Landlord'])).toEqual([facts[0].text]);
  });

  it('finds a fact by a name word of the counterparty', () => {
    const facts = [m('Landlord payments are always rent')];
    expect(pickMemories(facts, SMS_PERSON, ['Test Landlord'])).toHaveLength(1);
  });

  it('finds a fact by its subject key', () => {
    const facts = [m('the bakery near the office', {subject: 'hope bread'})];
    expect(pickMemories(facts, 'payment to Hope Bread', ['Hope Bread'])).toHaveLength(1);
  });

  it('never sends a fact pinned to a DIFFERENT number or subject', () => {
    const facts = [
      m('0788 999 999 is my brother'),
      m('the gym', {subject: 'some gym'}),
    ];
    expect(pickMemories(facts, SMS_PERSON, ['Test Landlord'])).toEqual([]);
  });

  it('sends general facts too, but caps them', () => {
    const general = Array.from({length: 10}, (_, i) => m(`general fact number ${i}`));
    const picked = pickMemories(general, SMS_PERSON, ['Test Landlord']);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(6);
  });

  it('puts facts about this counterparty before general ones', () => {
    const facts = [m('I budget weekly'), m('0788000111 is my landlord')];
    expect(pickMemories(facts, SMS_PERSON, ['Test Landlord'])[0]).toBe('0788000111 is my landlord');
  });

  it('handles no memories at all', () => {
    expect(pickMemories([], SMS_PERSON, ['x'])).toEqual([]);
    expect(pickMemories(undefined, SMS_PERSON, ['x'])).toEqual([]);
  });
});

describe('cleanMemoryText', () => {
  it('collapses whitespace and caps the length', () => {
    expect(cleanMemoryText('  a   b \n c ')).toBe('a b c');
    expect(cleanMemoryText('x'.repeat(500))).toHaveLength(240);
  });
});

describe('memories in the classification prompt', () => {
  it('includes the relevant facts and leaves out the unrelated ones', () => {
    const plan = buildClassification(SMS_PERSON, [], {}, {
      sender: 'M-Money',
      memories: [m('0788000111 is my landlord — rent'), m('0788999999 is my brother')],
    });
    if (!('user' in plan)) {
      throw new Error('expected a model prompt, got a shortcut');
    }
    expect(plan.user).toContain('0788000111 is my landlord — rent');
    expect(plan.user).not.toContain('0788999999');
  });
});
