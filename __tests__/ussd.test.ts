/**
 * USSD builder — this dials real money, so the tests are mostly about what it
 * REFUSES to build. A wrong string here pays a stranger.
 */
import {buildUssd, railFor, ussdTelUrl} from '../src/tools/ussd';

describe('railFor', () => {
  it('maps the two dialable channels', () => {
    expect(railFor('MoMoPay')).toBe('momopay');
    expect(railFor('Send money')).toBe('sendmoney');
  });

  it('is case- and whitespace-insensitive', () => {
    // channel comes off a model in some paths, so exact casing is not a
    // guarantee worth depending on.
    expect(railFor('  momopay ')).toBe('momopay');
  });

  it('refuses rails we cannot dial', () => {
    for (const c of ['Bank transfer', 'Receive', 'Cash Power', 'Airtime', 'Bill', 'Other', '', null, undefined]) {
      expect(railFor(c)).toBeNull();
    }
  });
});

describe('buildUssd', () => {
  it('builds a MoMoPay merchant string with the amount', () => {
    expect(buildUssd({channel: 'MoMoPay', payCode: '888840', amount: 2500})).toBe(
      '*182*8*1*888840*2500#',
    );
  });

  it('builds a send-money string to a local number', () => {
    expect(buildUssd({channel: 'Send money', payCode: '0788999888', amount: 20000})).toBe(
      '*182*1*1*0788999888*20000#',
    );
  });

  it('keeps a leading-zero merchant code intact', () => {
    expect(buildUssd({channel: 'MoMoPay', payCode: '002597', amount: 1500})).toBe(
      '*182*8*1*002597*1500#',
    );
  });

  it('omits the amount when none is given, letting the network prompt', () => {
    expect(buildUssd({channel: 'MoMoPay', payCode: '888840'})).toBe('*182*8*1*888840#');
  });

  it('drops a zero or negative amount rather than dialling *0#', () => {
    expect(buildUssd({channel: 'MoMoPay', payCode: '888840', amount: 0})).toBe('*182*8*1*888840#');
    expect(buildUssd({channel: 'MoMoPay', payCode: '888840', amount: -5})).toBe('*182*8*1*888840#');
  });

  it('rounds a fractional amount — RWF has no minor unit', () => {
    expect(buildUssd({channel: 'MoMoPay', payCode: '888840', amount: 2500.4})).toBe(
      '*182*8*1*888840*2500#',
    );
  });

  it('returns null when the code and the rail disagree', () => {
    // A phone number on the MoMoPay rail means our two learned fields
    // contradict each other; dialling either one would be a guess.
    expect(buildUssd({channel: 'MoMoPay', payCode: '0788999888', amount: 100})).toBeNull();
    expect(buildUssd({channel: 'Send money', payCode: '888840', amount: 100})).toBeNull();
  });

  it('returns null for an undialable rail or a missing code', () => {
    expect(buildUssd({channel: 'Bank transfer', payCode: '888840'})).toBeNull();
    expect(buildUssd({channel: 'MoMoPay', payCode: null})).toBeNull();
    expect(buildUssd({channel: 'MoMoPay', payCode: '  '})).toBeNull();
  });

  it('rejects a malformed phone number', () => {
    expect(buildUssd({channel: 'Send money', payCode: '250788999888'})).toBeNull();
    expect(buildUssd({channel: 'Send money', payCode: '078899988'})).toBeNull();
  });
});

describe('ussdTelUrl', () => {
  it('percent-encodes the trailing hash', () => {
    // Android truncates a tel: URL at a literal '#', dialling a meaningless
    // prefix — the single most common way USSD-from-an-app breaks.
    expect(ussdTelUrl('*182*8*1*888840*2500#')).toBe('tel:*182*8*1*888840*2500%23');
  });

  it('leaves the asterisks alone', () => {
    expect(ussdTelUrl('*182*8*1*1#')).not.toContain('%2A');
  });
});
