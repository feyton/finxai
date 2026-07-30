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
import {ignoredSmsId, rowExists, smsTransactionId} from './txnId';
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
    (await rowExists(db, 'auto_records', txnId))
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
          parse_source, lat, lon, accuracy_m, location_at, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        balance_after, txn_ref, parse_source,
        lat, lon, accuracy_m, location_at, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 0, 'sms', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
