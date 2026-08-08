// Which way did the money move? Pure: no database, no React Native.
//
// WHY IT LIVES HERE: `transfer_direction` decides whether a transfer ADDS to or
// SUBTRACTS from an account balance, and it is not stored on a pending `auto_records`
// row — both review paths re-derive it from the SMS body at the moment the record is
// promoted. The phone does that inside regexExtract (src/tools/smsParser.ts); the web
// does it in apps/web/src/lib/reviewActions.ts. A second, looser copy on the web would
// read the word "Credited" in a Bank of Kigali alert and flip the sign of a transfer,
// so the rule is shared instead.

export interface AccountNumberRef {
  id: string;
  /** User-entered account or phone number. */
  number?: string | null;
}

/**
 * Last 9 digits, which is what makes an account number comparable across the
 * different lengths and formats the same account is written in.
 */
export function normalizeAccountNumber(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length > 9 ? d.slice(-9) : d;
}

export function matchOwnAccount<A extends AccountNumberRef>(
  numberStr: string | null | undefined,
  accounts: A[] | undefined,
): A | undefined {
  const norm = normalizeAccountNumber(numberStr);
  if (!norm || norm.length < 6 || !accounts) {
    return undefined;
  }
  return accounts.find(a => normalizeAccountNumber(a.number) === norm);
}

export interface DirectionContext<A extends AccountNumberRef> {
  /** ALL of the user's accounts, so the alert's counterparty can be recognised. */
  accounts?: A[];
  /** The account this SMS arrived for. */
  currentAccountId?: string;
}

export interface DirectionFacts<A extends AccountNumberRef> {
  direction: 'credit' | 'debit';
  /** BK alert format only: the account refs the message itself names. */
  credited: string | null;
  debited: string | null;
  /** Set when that side is one of the user's OWN accounts. */
  creditedOwn: A | undefined;
  debitedOwn: A | undefined;
}

export function resolveDirection<A extends AccountNumberRef>(
  raw: string,
  ctx?: DirectionContext<A>,
): DirectionFacts<A> {
  // BK alert format: "TRANSFER - MTN mobile money Credited account: X
  // Debited account: Y Amount: RWF 45,000 Transaction Charge: RWF 0 ..."
  // The words "Credited"/"Debited" here describe ACCOUNTS, not the user —
  // direction must come from which account is the user's own.
  const credited = raw.match(/credited\s+account\s*:?\s*([A-Za-z0-9]+)/i)?.[1] ?? null;
  const debited = raw.match(/debited\s+account\s*:?\s*([A-Za-z0-9]+)/i)?.[1] ?? null;

  if (credited || debited) {
    const accounts = ctx?.accounts ?? [];
    const current = accounts.find(a => a.id === ctx?.currentAccountId);
    const currentNorm = normalizeAccountNumber(current?.number);
    const creditedOwn = matchOwnAccount(credited, accounts);
    const debitedOwn = matchOwnAccount(debited, accounts);

    let direction: 'credit' | 'debit';
    if (currentNorm && normalizeAccountNumber(credited) === currentNorm) {
      direction = 'credit';
    } else if (currentNorm && normalizeAccountNumber(debited) === currentNorm) {
      direction = 'debit';
    } else if (debitedOwn && debitedOwn.id !== ctx?.currentAccountId) {
      // Money left ANOTHER of the user's accounts toward this one.
      direction = 'credit';
    } else {
      // Default: banks send this alert format for movements OUT of the
      // user's account (transfers, bill payments) — treat as debit.
      direction = 'debit';
    }
    return {direction, credited, debited, creditedOwn, debitedOwn};
  }

  // "kubitsa" (Kinyarwanda: to deposit/save) — e.g. "Umaze kubitsa RWF 500
  // kuri Mokash" — money moving IN to the tracked account, same role as
  // the English "deposit"/"received"/"credited" signals.
  const direction: 'credit' | 'debit' = /received|credited|you have received|deposit|kubitsa/i.test(
    raw,
  )
    ? 'credit'
    : 'debit';
  return {direction, credited: null, debited: null, creditedOwn: undefined, debitedOwn: undefined};
}
