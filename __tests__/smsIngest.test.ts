/**
 * Tests for the live-capture ingest seam (src/tools/smsIngest.ts) and the
 * deterministic ids it dedupes on (src/tools/txnId.ts).
 *
 * WHY THIS FILE EXISTS: the live path runs inside a native broadcast receiver ->
 * headless JS task, which cannot be triggered from a dev machine — injecting
 * SMS_RECEIVED needs the system-only BROADCAST_SMS permission, and the headless
 * service is deliberately `exported="false"` so `adb start-service` is refused
 * too (an exported one would let any installed app inject fake transactions).
 *
 * So the only way these behaviours get verified before they touch real money is
 * here. The two invariants that matter most:
 *
 *   - ids are a pure function of transaction identity (the 11%-duplicate fix)
 *   - location is attached to money OUT only (the privacy/battery promise)
 */
import {
  findAccountForSms,
  locationForParsed,
  persistParsedSms,
  promoteAutoRecord,
  AccountLike,
  SmsLocation,
} from '../src/tools/smsIngest';
import {ignoredSmsId, smsTransactionId} from '../src/tools/txnId';
import {ParsedSMS, THRESHOLD_AUTO_SAVE} from '../src/tools/smsTypes';

// smsIngest imports syncAccountBalance from ./balance, which reaches
// refreshWidget -> widgetData -> database -> @powersync/react-native. That
// package ships ESM that Jest's default transform does not handle, so loading it
// fails the whole suite. Cutting it here is honest rather than convenient:
// syncAccountBalance is only called by ingestLiveSms (which needs a real DB and
// network), never by the pure id/location/persist logic under test.
jest.mock('../src/tools/balance', () => ({
  syncAccountBalance: jest.fn(async () => {}),
}));

// AsyncStorage (reached via merchantMemory) is mocked automatically by
// __mocks__/@react-native-async-storage/async-storage.js — Jest applies a
// root-level __mocks__ entry for a node_modules package without a jest.mock
// call. Do NOT add one here: the package stopped shipping its own mock in v3,
// so an explicit factory pointing at the old path throws.

const OWNER = 'b630daf7-e850-4cd7-9376-2f0c8e9f7ba6';
const ACCT = 'acct-momo-1';

function parsed(over: Partial<ParsedSMS> = {}): ParsedSMS {
  return {
    direction: 'debit',
    amount: 5000,
    merchant: 'Simba Supermarket',
    category: 'groceries',
    subcategory: '',
    confidence: 0.95,
    fee: 0,
    balance_after: 120000,
    txn_ref: null,
    occurred_at: null,
    ...over,
  };
}

const LOC: SmsLocation = {
  lat: -1.9536,
  lon: 30.0606,
  accuracyM: 25,
  at: '2026-07-30T09:00:00.000Z',
};

// ── Location gating: money OUT only ────────────────────────────
//
// "only query the location when we do have an SMS with Money Out category" —
// the native side applies a loose guess; this is the authoritative check.
describe('locationForParsed', () => {
  it('attaches a fix to a plain money-out expense', () => {
    expect(locationForParsed(parsed({direction: 'debit'}), LOC)).toEqual(LOC);
  });

  it('drops the fix on income — nobody travels to receive money', () => {
    expect(locationForParsed(parsed({direction: 'credit'}), LOC)).toBeNull();
  });

  it('drops the fix on an own-account transfer even when it is a debit', () => {
    // This is the case a direction-only check would get wrong: moving BK -> MoMo
    // debits an account but is not a trip to a merchant.
    expect(
      locationForParsed(parsed({direction: 'debit', isTransfer: true}), LOC),
    ).toBeNull();
  });

  it('returns null when no fix was captured', () => {
    expect(locationForParsed(parsed(), null)).toBeNull();
    expect(locationForParsed(parsed(), undefined)).toBeNull();
  });

  it('rejects a malformed fix rather than writing NaN to the DB', () => {
    // Postgres double precision would take NaN; the map UI would not.
    expect(locationForParsed(parsed(), {lat: NaN, lon: 30.06})).toBeNull();
    expect(locationForParsed(parsed(), {lat: -1.95, lon: NaN})).toBeNull();
    expect(
      locationForParsed(parsed(), {lat: Infinity, lon: 30.06}),
    ).toBeNull();
  });

  it('accepts lat/lon of exactly 0 (valid coordinates, falsy numbers)', () => {
    const zero: SmsLocation = {lat: 0, lon: 0};
    expect(locationForParsed(parsed(), zero)).toEqual(zero);
  });
});

// ── Deterministic ids: the duplicate fix ───────────────────────
describe('smsTransactionId', () => {
  const base = {ownerId: OWNER, accountId: ACCT, sms: 'body text', sender: 'MTN'};

  it('is a well-formed UUID — Postgres uuid columns reject anything else', () => {
    const id = smsTransactionId({...base, txnRef: 'ABC123'});
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is stable across calls', () => {
    const a = smsTransactionId({...base, txnRef: 'REF-1'});
    const b = smsTransactionId({...base, txnRef: 'REF-1'});
    expect(a).toBe(b);
  });

  it('collapses a bank ref seen twice, even when the bodies differ', () => {
    // Bank of Kigali sends two differently-worded alerts for one transaction;
    // both carry the same Event #. They must land on ONE row.
    const a = smsTransactionId({...base, sms: 'alert one wording', txnRef: 'FTCM26181PVXVS4ND'});
    const b = smsTransactionId({...base, sms: 'totally different wording', txnRef: 'FTCM26181PVXVS4ND'});
    expect(a).toBe(b);
  });

  it('treats a ref as case- and whitespace-insensitive', () => {
    const a = smsTransactionId({...base, txnRef: ' ftcm26181pvxvs4nd '});
    const b = smsTransactionId({...base, txnRef: 'FTCM26181PVXVS4ND'});
    expect(a).toBe(b);
  });

  it('separates two different refs', () => {
    const a = smsTransactionId({...base, txnRef: 'REF-1'});
    const b = smsTransactionId({...base, txnRef: 'REF-2'});
    expect(a).not.toBe(b);
  });

  it('falls back to the body when there is no ref', () => {
    const a = smsTransactionId({...base, txnRef: null, smsDate: 1000});
    const b = smsTransactionId({...base, txnRef: null, smsDate: 1000});
    expect(a).toBe(b);
    expect(a).not.toBe(smsTransactionId({...base, txnRef: 'REF-1'}));
  });

  it('does NOT collapse two identical-bodied purchases at different times', () => {
    // Same shop, same amount, no reference => byte-identical bodies. These are
    // two real purchases and must stay two rows. This is why smsDate is in the
    // identity at all.
    const a = smsTransactionId({...base, txnRef: null, smsDate: 1_700_000_000_000});
    const b = smsTransactionId({...base, txnRef: null, smsDate: 1_700_000_060_000});
    expect(a).not.toBe(b);
  });

  it('treats an empty/whitespace ref as absent rather than as a shared key', () => {
    // Otherwise every ref-less message from an account would collide onto one
    // row — a far worse bug than the duplicates this system replaced.
    const blank = smsTransactionId({...base, txnRef: '   ', sms: 'first', smsDate: 1});
    const other = smsTransactionId({...base, txnRef: '', sms: 'second', smsDate: 2});
    expect(blank).not.toBe(other);
  });

  it('scopes ids per owner and per account', () => {
    const mine = smsTransactionId({...base, txnRef: 'REF-1'});
    expect(smsTransactionId({...base, ownerId: 'someone-else', txnRef: 'REF-1'})).not.toBe(mine);
    expect(smsTransactionId({...base, accountId: 'other-acct', txnRef: 'REF-1'})).not.toBe(mine);
  });

  it('spreads across all four hash lanes', () => {
    // A single 32-bit lane would birthday-collide around ~77k rows. Guard
    // against a regression that silently drops back to one lane: no 8-char
    // lane should be constant across differing inputs.
    const ids = Array.from({length: 50}, (_, i) =>
      smsTransactionId({...base, txnRef: `REF-${i}`}).replace(/-/g, ''),
    );
    for (const lane of [0, 8, 16, 24]) {
      const distinct = new Set(ids.map(h => h.slice(lane, lane + 8)));
      expect(distinct.size).toBeGreaterThan(1);
    }
    expect(new Set(ids).size).toBe(50);
  });
});

describe('ignoredSmsId', () => {
  it('is stable, so re-processing does not grow the ignore list', () => {
    const a = ignoredSmsId({ownerId: OWNER, sms: 'FAILED txn', sender: 'MTN'});
    const b = ignoredSmsId({ownerId: OWNER, sms: 'FAILED txn', sender: 'MTN'});
    expect(a).toBe(b);
  });

  it('is a well-formed UUID', () => {
    expect(ignoredSmsId({ownerId: OWNER, sms: 'x', sender: 'MTN'})).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not collide with the transaction id for the same message', () => {
    const sms = 'Your payment of 5000 RWF failed';
    expect(ignoredSmsId({ownerId: OWNER, sms, sender: 'MTN'})).not.toBe(
      smsTransactionId({ownerId: OWNER, accountId: ACCT, sms, sender: 'MTN', txnRef: null}),
    );
  });
});

// ── Account routing ────────────────────────────────────────────
describe('findAccountForSms', () => {
  const accounts: AccountLike[] = [
    {id: 'bk-1', name: 'Bank of Kigali', address: 'BK', number: '100161965558'},
    {id: 'momo-1', name: 'MTN MoMo', address: 'MTN', number: '0787241457'},
  ];

  it('matches on sender address', () => {
    expect(findAccountForSms({body: 'x', address: 'MTN'}, accounts)?.id).toBe('momo-1');
  });

  it('matches a sender the bank added later, via the account number in the body', () => {
    // "BK BANK" is not name-related to the configured "BK" address, but the
    // alert still names the account, and that never changes.
    const acct = findAccountForSms(
      {
        body: 'Dear Customer, your account 100161965558 has been debited RWF 5,000',
        address: 'UnknownSender',
      },
      accounts,
    );
    expect(acct?.id).toBe('bk-1');
  });

  it('falls back to a learned sender->account rule last', () => {
    const acct = findAccountForSms(
      {body: 'no account number here', address: 'NEWBANK'},
      accounts,
      {NEWBANK: 'momo-1'},
    );
    expect(acct?.id).toBe('momo-1');
  });

  it('returns undefined for an untracked sender rather than guessing', () => {
    expect(
      findAccountForSms({body: 'Hi mum', address: 'FriendPhone'}, accounts),
    ).toBeUndefined();
  });
});

// ── Persistence: routing, dedupe, and what actually gets written ──
describe('persistParsedSms', () => {
  const account: AccountLike = {id: ACCT, name: 'MTN MoMo', address: 'MTN'};

  // Minimal PowerSync stand-in. `existing` seeds the rows rowExists() should
  // find; every execute() is recorded so we can assert on the real SQL.
  function fakeDb(existing: string[] = []) {
    const calls: {sql: string; params: any[]}[] = [];
    return {
      calls,
      execute: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({sql, params});
        if (/^SELECT 1 FROM/.test(sql.trim())) {
          const hit = existing.includes(params[0]);
          return {rows: {_array: hit ? [{1: 1}] : []}};
        }
        return {rows: {_array: []}};
      }),
    };
  }

  const args = (over: Partial<ParsedSMS> = {}, location?: SmsLocation | null) => ({
    parsed: parsed(over),
    account,
    ownerId: OWNER,
    body: 'You have paid 5,000 RWF to Simba Supermarket',
    smsDate: 1_700_000_000_000,
    occurredAt: '2026-07-30T09:00:00.000Z',
    location,
  });

  const insertInto = (db: ReturnType<typeof fakeDb>, table: string) =>
    db.calls.find(c => c.sql.includes(`INSERT INTO ${table}`));

  it('auto-saves a high-confidence parse into transactions', async () => {
    const db = fakeDb();
    const out = await persistParsedSms(db, args({confidence: 0.97}));
    expect(out).toBe('saved');
    expect(insertInto(db, 'transactions')).toBeTruthy();
    expect(insertInto(db, 'auto_records')).toBeUndefined();
  });

  it('sends a low-confidence parse to auto_records for review', async () => {
    const db = fakeDb();
    const out = await persistParsedSms(db, args({confidence: 0.5}));
    expect(out).toBe('review');
    expect(insertInto(db, 'auto_records')).toBeTruthy();
    expect(insertInto(db, 'transactions')).toBeUndefined();
  });

  it('treats the threshold as inclusive', async () => {
    const db = fakeDb();
    expect(await persistParsedSms(db, args({confidence: THRESHOLD_AUTO_SAVE}))).toBe('saved');
  });

  it('never records a failed transaction', async () => {
    const db = fakeDb();
    const out = await persistParsedSms(db, args({status: 'failed'}));
    expect(out).toBe('ignored');
    expect(insertInto(db, 'ignored_sms')).toBeTruthy();
    expect(insertInto(db, 'transactions')).toBeUndefined();
    expect(insertInto(db, 'auto_records')).toBeUndefined();
  });

  it('skips a message already stored as a transaction', async () => {
    const id = smsTransactionId({
      ownerId: OWNER,
      accountId: ACCT,
      txnRef: 'REF-DUP',
      sms: 'You have paid 5,000 RWF to Simba Supermarket',
      sender: 'MTN MoMo',
      smsDate: 1_700_000_000_000,
    });
    const db = fakeDb([id]);
    const out = await persistParsedSms(db, args({txn_ref: 'REF-DUP'}));
    expect(out).toBe('duplicate');
    expect(insertInto(db, 'transactions')).toBeUndefined();
  });

  it('skips a message already awaiting review', async () => {
    const id = smsTransactionId({
      ownerId: OWNER,
      accountId: ACCT,
      txnRef: 'REF-PENDING',
      sms: 'You have paid 5,000 RWF to Simba Supermarket',
      sender: 'MTN MoMo',
      smsDate: 1_700_000_000_000,
    });
    const db = fakeDb([id]);
    expect(await persistParsedSms(db, args({txn_ref: 'REF-PENDING'}))).toBe('duplicate');
  });

  it('skips a message whose BODY already exists, even under a different id', async () => {
    // The id falls back to including smsDate when there is no bank reference, and the
    // live receiver (PDU service-centre timestamp) and the poller (inbox received-at)
    // disagree about it — so one real SMS produced two ids and the id check missed.
    // Three already-confirmed MTN transfers came back for review that way.
    const db = {
      calls: [] as {sql: string; params: any[]}[],
      execute: jest.fn(async (sql: string, params: any[] = []) => {
        db.calls.push({sql, params});
        // No id matches, but the body IS already recorded.
        if (/^SELECT 1 FROM transactions WHERE owner_id/.test(sql.trim())) {
          return {rows: {_array: [{1: 1}]}};
        }
        return {rows: {_array: []}};
      }),
    };
    const out = await persistParsedSms(db, args({confidence: 0.5}));
    expect(out).toBe('duplicate');
    expect(db.calls.find(c => c.sql.includes('INSERT INTO auto_records'))).toBeUndefined();
  });

  it('writes the same id the dedupe check looked for', async () => {
    // Guards against the id being computed differently at check and at write —
    // which would make dedupe silently never match.
    const db = fakeDb();
    await persistParsedSms(db, args({txn_ref: 'REF-X', confidence: 0.97}));
    const check = db.calls.find(c => /^SELECT 1 FROM/.test(c.sql.trim()));
    const write = insertInto(db, 'transactions');
    expect(write!.params[0]).toBe(check!.params[0]);
  });

  it('persists a location on money out', async () => {
    const db = fakeDb();
    await persistParsedSms(db, args({direction: 'debit', confidence: 0.97}, LOC));
    const write = insertInto(db, 'transactions')!;
    expect(write.params).toContain(LOC.lat);
    expect(write.params).toContain(LOC.lon);
  });

  it('does not persist a location on income', async () => {
    const db = fakeDb();
    await persistParsedSms(db, args({direction: 'credit', confidence: 0.97}, LOC));
    const write = insertInto(db, 'transactions')!;
    expect(write.params).not.toContain(LOC.lat);
    expect(write.params).not.toContain(LOC.lon);
  });

  it('does not persist a location on an own-account transfer', async () => {
    const db = fakeDb();
    await persistParsedSms(
      db,
      args({direction: 'debit', isTransfer: true, confidence: 0.97}, LOC),
    );
    const write = insertInto(db, 'transactions')!;
    expect(write.params).not.toContain(LOC.lat);
  });

  it('applies the same location rule on the review path', async () => {
    // auto_records has its own INSERT with its own column list — a rule applied
    // to only one of the two is exactly the drift smsIngest.ts exists to stop.
    const db = fakeDb();
    await persistParsedSms(db, args({direction: 'credit', confidence: 0.5}, LOC));
    const write = insertInto(db, 'auto_records')!;
    expect(write.params).not.toContain(LOC.lat);
  });

  it('records transaction_type from direction and transfer flag', async () => {
    const expense = fakeDb();
    await persistParsedSms(expense, args({direction: 'debit', confidence: 0.97}));
    expect(insertInto(expense, 'transactions')!.params).toContain('expense');

    const income = fakeDb();
    await persistParsedSms(income, args({direction: 'credit', confidence: 0.97}));
    expect(insertInto(income, 'transactions')!.params).toContain('income');

    const transfer = fakeDb();
    await persistParsedSms(
      transfer,
      args({direction: 'debit', isTransfer: true, confidence: 0.97}),
    );
    expect(insertInto(transfer, 'transactions')!.params).toContain('transfer');
  });

  it('defaults parse_source to regex when the AI path did not answer', async () => {
    // An unset parseSource must not read as 'ai' — that flag is the only way a
    // dark classifier is visible in the UI.
    const db = fakeDb();
    await persistParsedSms(db, args({confidence: 0.97, parseSource: undefined}));
    expect(insertInto(db, 'transactions')!.params).toContain('regex');
  });

  it('keeps an ai-classified record labelled ai', async () => {
    const db = fakeDb();
    await persistParsedSms(db, args({confidence: 0.97, parseSource: 'ai'}));
    expect(insertInto(db, 'transactions')!.params).toContain('ai');
  });
});

// ── Promotion: review row -> transaction ───────────────────────
//
// These are the tests the bug needed and could not have: the confirm and fix paths
// each hand-wrote their own INSERT inside a screen component, so nothing could assert
// what columns they carried. Both now go through promoteAutoRecord.
describe('promoteAutoRecord', () => {
  const record = {
    id: 'auto-1',
    amount: 3000,
    account_id: ACCT,
    category: 'food',
    subcategory: 'Restaurants',
    date_time: '2026-07-30T14:08:46.000Z',
    sms: 'Your payment of 3,000 RWF to Damascene',
    sender: 'M-Money',
    payee: 'Damascene',
    merchant: 'Damascene',
    transaction_type: 'expense',
    fees: 0,
    confidence: 0.7,
    txn_ref: 'REF-1',
    parse_source: 'ai',
    note: null,
    lat: -1.95805,
    lon: 30.11515,
    accuracy_m: 100,
    location_at: '2026-07-30T14:08:36.000Z',
  };

  function fakeDb() {
    const calls: {sql: string; params: any[]}[] = [];
    return {
      calls,
      execute: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({sql, params});
        return {rows: {_array: []}};
      }),
    };
  }
  const insert = (db: ReturnType<typeof fakeDb>) =>
    db.calls.find(c => c.sql.includes('INSERT INTO transactions'))!;

  it('carries the location through on confirm', async () => {
    const db = fakeDb();
    await promoteAutoRecord(db, {
      record,
      ownerId: OWNER,
      direction: 'debit',
      balanceAfter: 1680,
    });
    const p = insert(db).params;
    expect(p).toContain(record.lat);
    expect(p).toContain(record.lon);
    expect(p).toContain(record.accuracy_m);
    expect(p).toContain(record.location_at);
  });

  it('carries the location through on fix, even when the type changes', async () => {
    // A fix can change how a payment is filed, never where it happened.
    const db = fakeDb();
    await promoteAutoRecord(db, {
      record,
      ownerId: OWNER,
      direction: 'debit',
      balanceAfter: 1680,
      overrides: {type: 'transfer', category: 'savings', merchant: 'Mokash'},
    });
    const p = insert(db).params;
    expect(p).toContain(record.lat);
    expect(p).toContain(record.lon);
  });

  it('reuses the auto_record id so two devices converge on one row', async () => {
    const db = fakeDb();
    await promoteAutoRecord(db, {record, ownerId: OWNER, direction: 'debit', balanceAfter: null});
    expect(insert(db).params[0]).toBe('auto-1');
  });

  it('applies fix overrides over the record values', async () => {
    const db = fakeDb();
    await promoteAutoRecord(db, {
      record,
      ownerId: OWNER,
      direction: 'debit',
      balanceAfter: null,
      overrides: {category: 'transport', subcategory: 'Fuel', merchant: 'Olam Oil', note: 'work trip'},
    });
    const p = insert(db).params;
    expect(p).toContain('transport');
    expect(p).toContain('Fuel');
    expect(p).toContain('Olam Oil');
    expect(p).toContain('work trip');
  });

  it('keeps the original category when the type is switched to transfer', async () => {
    // The Fix sheet hides the category picker for transfers, so an override would be a
    // stale value from before the switch.
    const db = fakeDb();
    await promoteAutoRecord(db, {
      record,
      ownerId: OWNER,
      direction: 'debit',
      balanceAfter: null,
      overrides: {type: 'transfer', category: 'groceries'},
    });
    const p = insert(db).params;
    expect(p).toContain('food');
    expect(p).not.toContain('groceries');
  });

  it('deletes the review row so it cannot be promoted twice', async () => {
    const db = fakeDb();
    await promoteAutoRecord(db, {record, ownerId: OWNER, direction: 'debit', balanceAfter: null});
    const del = db.calls.find(c => c.sql.includes('DELETE FROM auto_records'));
    expect(del).toBeTruthy();
    expect(del!.params).toEqual(['auto-1']);
  });

  it('stores a blank note as NULL', async () => {
    const db = fakeDb();
    await promoteAutoRecord(db, {
      record,
      ownerId: OWNER,
      direction: 'debit',
      balanceAfter: null,
      overrides: {note: ''},
    });
    expect(insert(db).params).not.toContain('');
  });
});
