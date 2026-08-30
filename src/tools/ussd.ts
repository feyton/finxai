// Rebuilds the USSD string for paying a merchant the same way you paid them
// before, from the channel + pay code learned off past SMS (ROADMAP §4).
//
// This dials real money, so the rules here are deliberately narrow: an unknown
// rail or a code whose shape does not match that rail returns null and the UI
// hides the button, rather than offering a string that dials something
// unintended. Refusing to guess is the whole design.
//
// We open the DIALER pre-filled (ACTION_DIAL via `tel:`), never place the call.
// The user still presses the call button, which keeps a human in the loop on
// every payment and sidesteps the CALL_PHONE permission entirely.

export type PayRail = 'momopay' | 'sendmoney';

/** Local Rwandan mobile number, the form normalisePayCode produces: 07XXXXXXXX. */
const PHONE_RE = /^07\d{8}$/;
/** MoMoPay merchant codes observed in the wild are 5-10 digits, zeros kept. */
const MERCHANT_CODE_RE = /^\d{5,10}$/;

/**
 * Which rail a stored `channel` corresponds to, or null when it is one we
 * cannot dial (a bank transfer, an incoming payment, a utility bill paid
 * through a different flow).
 */
export function railFor(channel?: string | null): PayRail | null {
  switch ((channel ?? '').trim().toLowerCase()) {
    case 'momopay':
      return 'momopay';
    case 'send money':
      return 'sendmoney';
    default:
      return null;
  }
}

export interface UssdInput {
  channel?: string | null;
  payCode?: string | null;
  /** Whole RWF. Omit to let the network prompt for it. */
  amount?: number | null;
}

/**
 * The USSD string, or null when this payee cannot be re-paid automatically.
 *
 *   MoMoPay merchant:  *182*8*1*<code>*<amount>#
 *   Send to a person:  *182*1*1*<phone>*<amount>#
 */
export function buildUssd({channel, payCode, amount}: UssdInput): string | null {
  const rail = railFor(channel);
  const code = (payCode ?? '').trim();
  if (!rail || !code) {
    return null;
  }
  // The code must match the rail it claims. A phone number on the MoMoPay rail
  // (or a merchant code on the send-money rail) means the two fields disagree,
  // and the honest response to disagreeing evidence is to dial neither.
  if (rail === 'sendmoney' && !PHONE_RE.test(code)) {
    return null;
  }
  // The phone check is not redundant: a 10-digit local number satisfies the
  // 5-10 digit merchant-code shape, so without it a send-money code stored
  // against the MoMoPay rail would dial as a merchant.
  if (rail === 'momopay' && (!MERCHANT_CODE_RE.test(code) || PHONE_RE.test(code))) {
    return null;
  }

  const prefix = rail === 'momopay' ? '*182*8*1*' : '*182*1*1*';
  // A non-positive or fractional amount is not dialable — RWF has no minor
  // unit, and *...*0# would either fail or, worse, be read as a different menu
  // selection. Falling back to the amount-less form lets the network ask.
  const whole = typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount) : 0;
  return whole > 0 ? `${prefix}${code}*${whole}#` : `${prefix}${code}#`;
}

/**
 * `tel:` URL for Linking.openURL. The `#` MUST be percent-encoded or Android
 * truncates the string at it and dials a meaningless prefix — the single most
 * common way USSD-from-an-app is gotten wrong. encodeURIComponent leaves `*`
 * alone, which is what we want.
 */
export function ussdTelUrl(ussd: string): string {
  return `tel:${encodeURIComponent(ussd)}`;
}
