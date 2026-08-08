// Everything the web does to a PENDING SMS record, in one place.
//
// These are the web halves of paths the phone already owns (src/tools/smsIngest.ts,
// src/tools/balance.ts, src/tools/merchantMemory.ts). The rules those paths apply are
// imported from lib/shared, not re-implemented here — a pending record confirmed at a
// desk must land exactly where the same record confirmed on the phone would, with the
// same id, the same merchant-rule key, the same balance and the same transfer sign.
//
// What is deliberately NOT here: re-running the AI classifier. That needs the whole
// prompt pipeline (src/tools/smsParser.ts, ~1000 lines of provider-specific extraction),
// and a second copy of it is exactly the kind of near-duplicate this file exists to
// avoid. Retry stays on the phone; the web can always correct a record by hand.
import type {SupabaseClient} from '@supabase/supabase-js';
import {extractBalance, replayBalance} from '@/lib/shared/balanceReplay';
import {isUsablePattern, normalizeMerchant} from '@/lib/shared/merchantNormalize';
import {resolveDirection} from '@/lib/shared/smsDirection';
import {ignoredSmsId} from '@/lib/shared/smsIds';
import type {Account, AutoRecord} from '@/lib/types';

/**
 * Delete the pending row, and insist that it actually went.
 *
 * `.delete()` alone reports no error when row-level security simply makes the row
 * invisible — it deletes nothing and says so with silence. That failure mode is the
 * dangerous one here: the transaction has already been written by the time this runs,
 * so a quiet no-op would leave the record filed AND still queued for review, which
 * reads to the user as the confirm button doing nothing. Asking for the deleted id back
 * turns it into a message instead.
 */
async function deleteAutoRecord(supabase: SupabaseClient, id: string): Promise<void> {
  const {data, error} = await supabase.from('auto_records').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error(
      'The pending record could not be removed — it may already have been reviewed on another device. Refresh and check.',
    );
  }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Recompute and store one account's balance.
 *
 * The phone does this after every SMS-sourced insert, so the web must too: confirming
 * a record here without it leaves the account showing a balance that predates the
 * transaction the page just created. The 300-row window and DESC order match
 * src/tools/balance.ts exactly — replayBalance is order-dependent by design.
 */
export async function syncAccountBalance(
  supabase: SupabaseClient,
  accountId: string,
): Promise<number | null> {
  if (!accountId) return null;
  const {data, error} = await supabase
    .from('transactions')
    .select('date_time, amount, fees, transaction_type, transfer_direction, balance_after, sms')
    .eq('account_id', accountId)
    .order('date_time', {ascending: false})
    .limit(300);
  if (error) throw error;

  const result = replayBalance(data ?? []);
  // No bank-reported balance anywhere in the history — nothing to anchor on, so the
  // stored balance is left alone rather than overwritten with a guess.
  if (!result) return null;

  const {error: upErr} = await supabase
    .from('accounts')
    .update({available_balance: result.balance})
    .eq('id', accountId);
  if (upErr) throw upErr;
  return result.balance;
}

export interface PromoteOverrides {
  category?: string;
  subcategory?: string;
  merchant?: string;
  accountId?: string;
  type?: 'expense' | 'income' | 'transfer';
  note?: string | null;
}

/**
 * Promote a reviewed `auto_records` row into `transactions`, then drop the pending row.
 *
 * Mirrors promoteAutoRecord in src/tools/smsIngest.ts — same column list (including
 * lat/lon/accuracy_m/location_at, whose omission from the phone's hand-written copies
 * is what threw captured positions away at the moment a record became real), and the
 * same id, so confirming the same record from the phone and the web converges on one
 * row instead of two.
 */
export async function promoteAutoRecord(
  supabase: SupabaseClient,
  args: {
    record: AutoRecord;
    ownerId: string;
    /** All of the user's accounts — needed to read a transfer's direction. */
    accounts: Account[];
    overrides?: PromoteOverrides;
  },
): Promise<{txType: string; accountId: string}> {
  const {record, ownerId, accounts} = args;
  const o = args.overrides ?? {};
  const now = new Date().toISOString();

  const txType =
    o.type ??
    (record.transaction_type === 'income'
      ? 'income'
      : record.transaction_type === 'transfer'
      ? 'transfer'
      : 'expense');
  const accountId = o.accountId || record.account_id || '';
  const isTransfer = txType === 'transfer';

  // `transfer_direction` is not stored on the pending row, so both clients re-read it
  // from the SMS body at promotion time. Same shared rule, so "Credited account:" in a
  // Bank of Kigali alert cannot be mistaken here for money coming in.
  const direction = resolveDirection(record.sms ?? '', {
    accounts,
    currentAccountId: record.account_id ?? undefined,
  }).direction;

  const {error} = await supabase.from('transactions').insert({
    id: record.id,
    amount: record.amount,
    account_id: accountId,
    // A transfer keeps whatever category it had: the fix form hides the category
    // picker for transfers, so an override would be a stale value from before the
    // type was switched.
    category: isTransfer ? record.category : o.category ?? record.category,
    subcategory: isTransfer ? '' : o.subcategory ?? record.subcategory ?? '',
    date_time: record.date_time,
    sms: record.sms,
    sender: record.sender,
    payee: record.payee,
    merchant: o.merchant || record.merchant,
    transaction_type: txType,
    fees: record.fees ?? 0,
    currency: 'RWF',
    confirmed: 1,
    source: 'sms',
    confidence: record.confidence ?? 0,
    transfer_account_id: isTransfer ? record.transfer_account_id ?? null : null,
    transfer_direction: isTransfer ? (direction === 'credit' ? 'in' : 'out') : null,
    balance_after: record.balance_after ?? extractBalance(record.sms ?? ''),
    txn_ref: record.txn_ref ?? null,
    parse_source: record.parse_source ?? null,
    // NULL rather than '' when blank, so "has a note" is a simple IS NOT NULL check
    // everywhere downstream.
    note: (o.note ?? record.note) || null,
    // Carried even when the type changes: a fix can alter how a payment is filed,
    // never where it happened.
    lat: record.lat ?? null,
    lon: record.lon ?? null,
    accuracy_m: record.accuracy_m ?? null,
    location_at: record.location_at ?? null,
    owner_id: ownerId,
    created_at: now,
  });
  // A primary-key collision means this exact record has ALREADY been promoted — the id
  // is a pure function of the message, so there is no other way to hit it. That happens
  // when the phone confirmed it first, or when a previous attempt here wrote the
  // transaction and then failed to clear the pending row. Either way the transaction
  // exists and the pending row is the leftover, so finish the job instead of failing
  // and leaving a card that can never be cleared.
  if (error && error.code !== '23505') throw error;

  await deleteAutoRecord(supabase, record.id);

  return {txType, accountId};
}

/**
 * Drop a pending record and remember the message, so the phone's inbox poller never
 * offers it again — it dedupes on the SMS body across transactions, auto_records and
 * ignored_sms. The id is the same deterministic one the phone would mint, so ignoring
 * the same message twice updates one row instead of adding a second.
 */
export async function ignoreAutoRecord(
  supabase: SupabaseClient,
  args: {record: AutoRecord; ownerId: string},
): Promise<void> {
  const {record, ownerId} = args;
  const {error} = await supabase.from('ignored_sms').upsert({
    id: ignoredSmsId({ownerId, sms: record.sms ?? '', sender: record.sender ?? ''}),
    sms: record.sms ?? '',
    sender: record.sender ?? '',
    reason: 'user',
    owner_id: ownerId,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;

  await deleteAutoRecord(supabase, record.id);
}

/**
 * Teach the classifier, the same way the phone's Fix sheet does.
 *
 * A correction counts for three confirmations when rules are ranked, so the two are
 * recorded separately. `displayName` is the name actually typed, stored so a
 * badly-extracted counterparty is renamed on FUTURE messages too and not just this one.
 *
 * Silently does nothing for an unusable key ('unknown', 'sender:', anything under three
 * characters) — those match every unparseable SMS and would push junk past the
 * auto-save threshold.
 */
export async function recordMerchantRule(
  supabase: SupabaseClient,
  args: {
    merchant: string;
    category: string;
    subcategory?: string;
    ownerId: string;
    kind: 'confirmation' | 'correction';
    displayName?: string;
  },
): Promise<void> {
  const norm = normalizeMerchant(args.merchant);
  if (!isUsablePattern(norm.key)) return;

  const display = (args.displayName ?? '').trim() || norm.display;
  const countCol = args.kind === 'correction' ? 'correction_count' : 'confirmation_count';
  const now = new Date().toISOString();

  const {data: existing} = await supabase
    .from('merchant_rules')
    .select(`id, ${countCol}`)
    .eq('owner_id', args.ownerId)
    .eq('pattern', norm.key)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('merchant_rules')
      .update({
        [countCol]: ((existing as Record<string, number>)[countCol] ?? 0) + 1,
        category: args.category,
        subcategory: args.subcategory ?? '',
        display_name: display,
        updated_at: now,
      })
      .eq('id', (existing as {id: string}).id);
    return;
  }

  await supabase.from('merchant_rules').insert({
    id: uuid(),
    pattern: norm.key,
    category: args.category,
    subcategory: args.subcategory ?? '',
    display_name: display,
    correction_count: args.kind === 'correction' ? 1 : 0,
    confirmation_count: args.kind === 'confirmation' ? 1 : 0,
    owner_id: args.ownerId,
    updated_at: now,
  });
}
