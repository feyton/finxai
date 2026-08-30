// Shared SMS ingest: the parts the in-app poller (Components/SMSRetriever) and
// the live broadcast path (widgets/smsTaskHandler, via the native SmsReceiver)
// must agree on.
//
// Only the genuinely shared seam lives here — account routing, dedupe, location
// gating, and the INSERT column lists. Those are what would rot if copied: a
// column added on one path and not the other is a silent data bug. Batch-only
// concerns (cross-message transfer hints, per-txn_ref richness selection, the
// log_date cursor) stay in the poller, because the live path handles exactly one
// message and has no batch to reason about.

import {THRESHOLD_AUTO_SAVE} from './smsTypes';
import {
  ParseContext,
  candidateNames,
  extractAccountRef,
  isTransferStatusOnly,
  maskedSuffixMatches,
  normalizeAccountNumber,
  parseSmsWithAI,
  regexExtract,
  trailingDigits,
} from './smsParser';
import {ParsedSMS} from './smsTypes';
import {getChannelRules, getMerchantChannels, getMerchantRules} from './merchantMemory';
import {ignoredSmsId, rowExists, smsAlreadyRecorded, smsTransactionId} from './txnId';
import {syncAccountBalance} from './balance';

export interface AccountLike {
  id: string;
  name?: string | null;
  address?: string | null;
  number?: string | null;
  auto?: number | null;
}

// Position captured by the native receiver at the moment the SMS arrived.
export interface SmsLocation {
  lat: number;
  lon: number;
  accuracyM?: number | null;
  // When the FIX was taken — not when the transaction happened.
  at?: string | null;
}

function normalizeSender(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function senderMatches(smsAddress: string, accountAddress: string): boolean {
  const a = normalizeSender(smsAddress);
  const b = normalizeSender(accountAddress);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Which of the user's accounts does this SMS belong to?
 *
 * Sender address is the primary signal, but a bank can add or change sender IDs
 * at any time (Bank of Kigali now also sends from "BK BANK", unrelated by name
 * to the configured address), so the account NUMBER the alert itself names is
 * the fallback — that never changes. `channelRules` is the last resort: the
 * sender→account mapping the user implicitly builds by picking a payment
 * account in the Fix sheet.
 */
export function findAccountForSms(
  sms: {body: string; address: string},
  accounts: AccountLike[],
  channelRules: Record<string, string> = {},
): AccountLike | undefined {
  const bySender = accounts.find(a => senderMatches(sms.address, a.address ?? ''));
  if (bySender) {
    return bySender;
  }
  const ref = extractAccountRef(sms.body);
  const refSuffix = ref ? trailingDigits(ref) : '';
  if (refSuffix) {
    const byNumber = accounts.find(a => {
      const num = normalizeAccountNumber(a.number);
      return num && maskedSuffixMatches(refSuffix, num);
    });
    if (byNumber) {
      return byNumber;
    }
  }
  const learntId = channelRules[sms.address];
  return learntId ? accounts.find(a => a.id === learntId) : undefined;
}

/**
 * Location is attached to MONEY OUT only.
 *
 * Income and inter-account transfers are not things a person goes somewhere to
 * do, so a position on them is noise at best and a privacy cost for nothing.
 * The native receiver already applies a loose money-out guess to decide whether
 * to bother reading a cached fix; this is the authoritative check, made against
 * the real parse.
 */
export function locationForParsed(
  parsed: ParsedSMS,
  loc: SmsLocation | null | undefined,
): SmsLocation | null {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
    return null;
  }
  if (parsed.isTransfer) {
    return null;
  }
  if (parsed.direction !== 'debit') {
    return null;
  }
  return loc;
}

export type PersistOutcome = 'saved' | 'review' | 'duplicate' | 'ignored';

/**
 * Dedupe, then write one parsed message to the right table.
 *
 * The id is deterministic (see ./txnId), so a repeat of the same real-world
 * transaction targets the same row: a local re-run is skipped outright here, and
 * two devices racing converge server-side because both upsert one primary key.
 */
export async function persistParsedSms(
  db: any,
  args: {
    parsed: ParsedSMS;
    account: AccountLike;
    ownerId: string;
    body: string;
    smsDate: number;
    occurredAt: string;
    location?: SmsLocation | null;
  },
): Promise<PersistOutcome> {
  const {parsed, account, ownerId, body, smsDate, occurredAt} = args;
  const now = new Date().toISOString();

  // A failed/reversed transaction is never a record.
  if (parsed.status === 'failed') {
    await db.execute(
      'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        ignoredSmsId({ownerId, sms: body, sender: account.name ?? ''}),
        body,
        account.name ?? '',
        'failed',
        ownerId,
        now,
      ],
    );
    return 'ignored';
  }

  const txnId = smsTransactionId({
    ownerId,
    accountId: account.id,
    txnRef: parsed.txn_ref,
    sms: body,
    sender: account.name ?? '',
    smsDate,
  });
  if (
    (await rowExists(db, 'transactions', txnId)) ||
    (await rowExists(db, 'auto_records', txnId)) ||
    // Second key, by body. The id alone is not enough across ingest paths: without a
    // bank reference it includes smsDate, and the live receiver (PDU service-centre
    // timestamp) and the poller (inbox received-at) disagree about that, so one real
    // SMS yielded two ids. That is how three already-confirmed MTN transfers came back
    // for review on 2026-07-30.
    (await smsAlreadyRecorded(db, ownerId, account.id, body))
  ) {
    return 'duplicate';
  }

  const loc = locationForParsed(parsed, args.location);
  const txType = parsed.isTransfer
    ? 'transfer'
    : parsed.direction === 'credit'
    ? 'income'
    : 'expense';
  const transferAccountId = parsed.isTransfer ? parsed.transferAccountId ?? null : null;

  if (parsed.confidence >= THRESHOLD_AUTO_SAVE) {
    await db.execute(
      `INSERT INTO transactions
         (id, amount, account_id, category, subcategory, date_time, sms, sender,
          payee, merchant, transaction_type, fees, currency,
          confirmed, source, confidence,
          transfer_account_id, transfer_direction, balance_after, txn_ref,
          parse_source, channel, pay_code,
          lat, lon, accuracy_m, location_at, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txnId,
        parsed.amount,
        account.id,
        parsed.category,
        parsed.subcategory ?? '',
        occurredAt,
        body,
        account.name ?? '',
        parsed.merchant,
        parsed.merchant,
        txType,
        parsed.fee,
        parsed.confidence,
        transferAccountId,
        parsed.isTransfer ? (parsed.direction === 'credit' ? 'in' : 'out') : null,
        parsed.balance_after,
        parsed.txn_ref,
        parsed.parseSource ?? 'regex',
        parsed.channel ?? null,
        parsed.payCode ?? null,
        loc?.lat ?? null,
        loc?.lon ?? null,
        loc?.accuracyM ?? null,
        loc?.at ?? null,
        ownerId,
        now,
      ],
    );
    return 'saved';
  }

  await db.execute(
    `INSERT INTO auto_records
       (id, amount, account_id, category, subcategory, date_time, sms, sender,
        payee, merchant, transaction_type, fees, currency,
        confirmed, source, confidence, transfer_account_id,
        balance_after, txn_ref, parse_source, channel, pay_code,
        lat, lon, accuracy_m, location_at, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 0, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      txnId,
      parsed.amount,
      account.id,
      parsed.category,
      parsed.subcategory ?? '',
      occurredAt,
      body,
      account.name ?? '',
      parsed.merchant,
      parsed.merchant,
      txType,
      parsed.fee,
      parsed.confidence,
      transferAccountId,
      parsed.balance_after,
      parsed.txn_ref,
      parsed.parseSource ?? 'regex',
      parsed.channel ?? null,
      parsed.payCode ?? null,
      loc?.lat ?? null,
      loc?.lon ?? null,
      loc?.accuracyM ?? null,
      loc?.at ?? null,
      ownerId,
      now,
    ],
  );
  return 'review';
}

/**
 * Ingest ONE live-captured message. Entry point for the headless task.
 *
 * Returns what happened so the caller can log it; never throws — a broadcast
 * receiver's task failing loudly is worse than the poller picking the message
 * up later.
 */
export async function ingestLiveSms(
  db: any,
  ownerId: string,
  userName: string,
  payload: {
    body: string;
    sender: string;
    date: number;
    location?: SmsLocation | null;
  },
  authToken: string,
): Promise<PersistOutcome | 'skipped'> {
  const {body, sender, date} = payload;
  if (!body || !ownerId) {
    return 'skipped';
  }

  // BPR-style "…is Completed" confirmations restate a transfer that its own
  // debit alert already recorded; on their own they are not transactions.
  if (isTransferStatusOnly(body)) {
    await db.execute(
      'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        ignoredSmsId({ownerId, sms: body, sender}),
        body,
        sender,
        'status',
        ownerId,
        new Date().toISOString(),
      ],
    );
    return 'ignored';
  }

  const {rows} = await db.execute(
    'SELECT id, name, address, number, auto FROM accounts WHERE owner_id = ?',
    [ownerId],
  );
  const all: AccountLike[] = rows?._array ?? [];
  const autoAccounts = all.filter(a => a.auto === 1 && a.address);
  const channelRules = await getChannelRules();
  const account = findAccountForSms({body, address: sender}, autoAccounts, channelRules);
  if (!account) {
    // Not an account FinXAI tracks — the poller will not want it either.
    return 'skipped';
  }

  const ctxBase: ParseContext = {
    userName,
    accounts: all.map(a => ({id: a.id, name: a.name ?? '', number: a.number ?? ''})),
    currentAccountId: account.id,
    sender,
  };
  const facts = regexExtract(body, ctxBase);
  const names = candidateNames(body, facts, sender);
  const rules = await getMerchantRules(db, names[0] ?? '', ownerId, 20);
  const ctx: ParseContext = {...ctxBase, rules};

  const parsed = await parseSmsWithAI(
    body,
    rules,
    authToken,
    await getMerchantChannels(),
    ctx,
    facts,
  );

  const occurredAt = parsed.occurred_at ?? new Date(date || Date.now()).toISOString();
  const outcome = await persistParsedSms(db, {
    parsed,
    account,
    ownerId,
    body,
    smsDate: date,
    occurredAt,
    location: payload.location,
  });

  if (outcome === 'saved') {
    await syncAccountBalance(db, account.id);
  }
  return outcome;
}

/**
 * Promote a reviewed `auto_records` row into `transactions`.
 *
 * WHY THIS EXISTS: the confirm and fix paths in SMSReviewScreen each hand-wrote their
 * own `INSERT INTO transactions`, alongside the two in persistParsedSms above — four
 * copies of one column list. Predictably, a column added to some was missed by others:
 * confirming or fixing a record silently dropped lat/lon/accuracy_m/location_at, so a
 * position captured live was stored on the auto_record and then thrown away at the
 * moment the record became real. Only high-confidence transactions appeared to keep a
 * location, because they are the only ones that never pass through review.
 *
 * One function, one column list. A column added here reaches every promotion path.
 *
 * `overrides` carries what the Fix sheet changes; confirm passes none and the record's
 * own values are used. The id is deliberately the auto_record's — it is already the
 * deterministic transaction id (see ./txnId), so confirming the same record on two
 * devices converges on one row instead of two.
 */
export async function promoteAutoRecord(
  db: any,
  args: {
    record: any;
    ownerId: string;
    /** Direction from the raw SMS, used only to set transfer_direction. */
    direction: 'debit' | 'credit';
    /** Bank-reported balance parsed from the SMS, or null. */
    balanceAfter: number | null;
    overrides?: {
      category?: string;
      subcategory?: string;
      merchant?: string;
      accountId?: string;
      type?: 'expense' | 'income' | 'transfer';
      note?: string | null;
      /** How it was paid — the Fix sheet can correct a misread rail or code. */
      channel?: string | null;
      payCode?: string | null;
    };
  },
): Promise<{txType: string; accountId: string}> {
  const {record, ownerId, direction, balanceAfter} = args;
  const o = args.overrides ?? {};
  const now = new Date().toISOString();

  const txType =
    o.type ??
    (record.transaction_type === 'income'
      ? 'income'
      : record.transaction_type === 'transfer'
      ? 'transfer'
      : 'expense');
  const accountId = o.accountId || record.account_id;
  const isTransfer = txType === 'transfer';

  await db.execute(
    `INSERT INTO transactions
       (id, amount, account_id, category, subcategory, date_time, sms, sender,
        payee, merchant, transaction_type, fees, currency,
        confirmed, source, confidence,
        transfer_account_id, transfer_direction, balance_after, txn_ref,
        parse_source, note, channel, pay_code,
        lat, lon, accuracy_m, location_at, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.amount,
      accountId,
      // A transfer keeps whatever category it had: the Fix sheet hides the category
      // picker for transfers, so an override would be a stale value from before the
      // type was switched.
      isTransfer ? record.category : o.category ?? record.category,
      isTransfer ? '' : o.subcategory ?? record.subcategory ?? '',
      record.date_time,
      record.sms,
      record.sender,
      record.payee,
      o.merchant || record.merchant,
      txType,
      record.fees ?? 0,
      record.confidence ?? 0,
      isTransfer ? record.transfer_account_id ?? null : null,
      isTransfer ? (direction === 'credit' ? 'in' : 'out') : null,
      balanceAfter,
      record.txn_ref ?? null,
      record.parse_source ?? null,
      // NULL rather than '' when blank, so "has a note" is a simple IS NOT NULL check
      // everywhere downstream.
      (o.note ?? record.note) || null,
      // How it was paid, overridable from the Fix sheet. Same reasoning as the
      // location columns below: this is a property of the payment, so it must
      // survive promotion rather than being re-derived (the SMS is kept, but a
      // record confirmed offline would otherwise lose the code for good).
      o.channel ?? record.channel ?? null,
      o.payCode ?? record.pay_code ?? null,
      // The four columns whose omission was the whole bug. Carried even when the type
      // changes: a fix can alter how a payment is filed, never where it happened, and
      // the money-out gate already ran at ingest.
      record.lat ?? null,
      record.lon ?? null,
      record.accuracy_m ?? null,
      record.location_at ?? null,
      ownerId,
      now,
    ],
  );

  await db.execute('DELETE FROM auto_records WHERE id = ?', [record.id]);
  return {txType, accountId};
}

export type ReclassifyOutcome =
  | {ok: true; merchant: string}
  | {ok: false; reason: 'no-sms' | 'no-auth' | 'still-offline'; detail?: string};

/**
 * Re-run the AI classifier over a row's stored SMS and write the result back.
 *
 * Works on either table. `auto_records` needed this so a review row parsed while the
 * classifier was unreachable could be re-tagged; `transactions` needs it because rows
 * confirmed BEFORE the parser fixes are stuck with whatever the old code produced —
 * "Unknown", "sender:", or a whole "…was completed at 2026-07-25 19:18:40" clause — and
 * confirming a record was previously a one-way door with no way back.
 *
 * Only the classification is touched: merchant, category, subcategory, type and
 * confidence. Amount, date, account, balance and LOCATION are left exactly as they are,
 * because none of them is the classifier's to decide and the location in particular was
 * captured once and cannot be recovered if overwritten.
 *
 * Extracted rather than copied. Four hand-written copies of the promotion INSERT is what
 * silently dropped locations on confirm; this would have been the second copy of the
 * retry path.
 */
export async function reclassifySms(
  db: any,
  args: {
    table: 'transactions' | 'auto_records';
    record: any;
    ownerId: string;
    userName: string;
    accounts: {id: string; name: string; number: string}[];
    authToken: string;
  },
): Promise<ReclassifyOutcome> {
  const {table, record, ownerId, userName, accounts, authToken} = args;
  if (!record?.sms) {
    return {ok: false, reason: 'no-sms'};
  }
  if (!authToken) {
    return {ok: false, reason: 'no-auth'};
  }

  const rules = await getMerchantRules(db, record.merchant ?? '', ownerId, 20);
  const parsed = await parseSmsWithAI(
    record.sms,
    rules,
    authToken,
    await getMerchantChannels(),
    {
      userName,
      accounts,
      currentAccountId: record.account_id,
      rules,
      sender: record.sender ?? '',
    },
  );

  // Refuse to write a regex result over an existing one. A failed round trip must leave
  // the row alone rather than replacing a considered guess with a worse one.
  if (parsed.parseSource !== 'ai') {
    return {ok: false, reason: 'still-offline', detail: parsed.fallbackReason};
  }

  const txType = parsed.isTransfer
    ? 'transfer'
    : parsed.direction === 'credit'
    ? 'income'
    : 'expense';

  await db.execute(
    `UPDATE ${table}
        SET category = ?, subcategory = ?, merchant = ?, payee = ?,
            transaction_type = ?, confidence = ?, parse_source = 'ai',
            transfer_account_id = ?,
            channel = COALESCE(?, channel), pay_code = COALESCE(?, pay_code)
      WHERE id = ?`,
    [
      parsed.category,
      parsed.subcategory ?? '',
      parsed.merchant,
      parsed.merchant,
      txType,
      parsed.confidence,
      parsed.isTransfer ? parsed.transferAccountId ?? null : null,
      // Unlike location, these ARE recoverable from the stored SMS — they are
      // regex-derived — so re-running backfills every row written before v16.
      // COALESCE keeps a user's hand-corrected value when the re-parse finds
      // nothing, so a retry can add information but never silently remove it.
      parsed.channel ?? null,
      parsed.payCode ?? null,
      record.id,
    ],
  );

  return {ok: true, merchant: parsed.merchant};
}
