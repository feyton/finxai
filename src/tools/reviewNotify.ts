// Review questions in the notification shade — ask the moment a payment lands
// in the review queue, and file it from the answer.
//
// WHY: the queue was where uncertain records went to wait for the app to be
// opened, by which point "what was 3,500 at that shop?" is long forgotten. It
// reached 86 pending on a real phone, and confirming them had turned into a
// chore the user stopped doing. Asked seconds after paying, the same question
// takes one tap — or a few words typed into the notification — and the words
// are better evidence than anything in the SMS.
//
// Two halves:
//  - askAboutNewRecord: called by the SMS headless task after a 'review' outcome.
//  - reviewTaskHandler: the 'FinxaiReviewTask' headless task, started by
//    android/.../review/ReviewReplyReceiver.kt when the user answers.
//
// Both run with no React tree, like smsTaskHandler.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NativeReviewNotifier from '../native/NativeReviewNotifier';
import {CATS, fmtAmount, resolveCat} from '../theme';
import {db} from './database';
import {supabase} from './supabase';
import {syncAccountBalance} from './balance';
import {
  getMerchantChannels,
  getMerchantRules,
  recordConfirmation,
} from './merchantMemory';
import {extractBalance, parseSmsWithAI, regexExtract} from './smsParser';
import {promoteAutoRecord, recheckPending} from './smsIngest';
import {refreshBalanceWidget} from '../widgets/refreshWidget';

// Never more than this many questions an hour. A burst of uncertain SMS (a
// bank sending a statement's worth at once) should not turn the phone into a
// pager; the rest wait in the queue as before.
const MAX_PER_HOUR = 6;
const ASKED_KEY = 'finxai.reviewAskedAt';
// A typed answer that could not be classified (AI unreachable) is kept here and
// pre-filled into the Fix sheet. auto_records has no `note` column in Postgres,
// so it cannot ride on the pending row itself.
const NOTES_KEY = 'finxai.reviewNotes';

function categoryLabel(record: any): string {
  if (record.transaction_type === 'transfer') {
    return 'Transfer';
  }
  const id = resolveCat(record.category ?? '');
  const label = (id && CATS[id]?.label) || record.category || 'Other';
  return record.subcategory ? `${label} › ${record.subcategory}` : label;
}

async function underHourlyLimit(): Promise<boolean> {
  const now = Date.now();
  let times: number[] = [];
  try {
    times = JSON.parse((await AsyncStorage.getItem(ASKED_KEY)) ?? '[]');
  } catch {}
  times = times.filter(t => now - t < 3_600_000);
  if (times.length >= MAX_PER_HOUR) {
    return false;
  }
  times.push(now);
  await AsyncStorage.setItem(ASKED_KEY, JSON.stringify(times));
  return true;
}

/** Ask about the pending record this SMS just produced. Never throws. */
export async function askAboutNewRecord(
  database: any,
  ownerId: string,
  body: string,
): Promise<void> {
  try {
    if (!NativeReviewNotifier) {
      return;
    }
    const {rows} = await database.execute(
      'SELECT * FROM auto_records WHERE owner_id = ? AND sms = ? LIMIT 1',
      [ownerId, body],
    );
    const record = rows?._array?.[0];
    if (!record || !(record.amount > 0)) {
      return;
    }
    if (!(await underHourlyLimit())) {
      return;
    }
    const who = record.merchant || record.payee || 'someone';
    const out = record.transaction_type !== 'income';
    const label = categoryLabel(record);
    NativeReviewNotifier.ask(
      record.id,
      `RWF ${fmtAmount(record.amount)} ${out ? 'to' : 'from'} ${who} — what was it?`,
      `Looks like ${label}. Tap to confirm, or describe it in a few words.`,
      `✓ ${label}`,
    );
  } catch (e) {
    console.warn('[Review] could not ask:', e);
  }
}

/** Take back questions the user has already answered in the app. */
export function withdrawQuestions(recordIds: string[]): void {
  for (const id of recordIds) {
    try {
      NativeReviewNotifier?.cancel(id);
    } catch {}
  }
}

/** A typed answer that is still waiting to be used, for the Fix sheet. */
export async function pendingNoteFor(recordId: string): Promise<string | null> {
  try {
    const map = JSON.parse((await AsyncStorage.getItem(NOTES_KEY)) ?? '{}');
    return map[recordId] ?? null;
  } catch {
    return null;
  }
}

async function keepNote(recordId: string, note: string): Promise<void> {
  try {
    const map = JSON.parse((await AsyncStorage.getItem(NOTES_KEY)) ?? '{}');
    map[recordId] = note;
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(map));
  } catch {}
}

export interface ReviewTaskPayload {
  recordId?: string;
  kind?: 'confirm' | 'describe';
  note?: string;
  // A fix taken as the user answered (android/.../review/AnswerLocation.kt).
  lat?: number;
  lon?: number;
  accuracy?: number;
  locationAt?: number;
}

// How long after the payment an answer-time fix still says where it happened.
// Answer an hour later from home and the "place" is your sofa — worse than none.
const ANSWER_FIX_MAX_GAP_MS = 15 * 60 * 1000;

/**
 * The record with the answer-time position attached, when that position can
 * honestly stand for where the money was spent: money OUT only (same rule as
 * locationForParsed), the record has no position yet, and the answer came soon
 * after the payment. Stored as 'device' — it IS a real fix of the phone, taken
 * within the window the SMS receiver itself would accept a cached one.
 */
export function withAnswerLocation(record: any, p: ReviewTaskPayload, isMoneyOut: boolean): any {
  if (record.lat != null || !isMoneyOut) {
    return record;
  }
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number' || !p.locationAt) {
    return record;
  }
  const paidAt = Date.parse(record.date_time ?? '');
  if (!Number.isFinite(paidAt) || Math.abs(p.locationAt - paidAt) > ANSWER_FIX_MAX_GAP_MS) {
    return record;
  }
  return {
    ...record,
    lat: p.lat,
    lon: p.lon,
    accuracy_m: typeof p.accuracy === 'number' ? p.accuracy : null,
    location_at: new Date(p.locationAt).toISOString(),
    location_source: 'device',
  };
}

const settle = (id: string, text: string, filed = false) => {
  try {
    NativeReviewNotifier?.settle(id, text, filed);
  } catch {}
};

export async function reviewTaskHandler(payload: ReviewTaskPayload): Promise<void> {
  const recordId = payload?.recordId ?? '';
  if (!recordId) {
    return;
  }
  try {
    const {
      data: {session},
    } = await supabase.auth.getSession();
    const ownerId = session?.user?.id ?? '';
    if (!ownerId) {
      settle(recordId, 'Sign in to FinXAI to file this');
      return;
    }

    const {rows} = await db.execute(
      'SELECT * FROM auto_records WHERE id = ? AND owner_id = ?',
      [recordId, ownerId],
    );
    const pendingRow = rows?._array?.[0];
    if (!pendingRow) {
      // Answered in the app (or by a re-check) since the question went out —
      // and the transaction keeps the record's id, so a tap still opens it.
      settle(recordId, 'Already filed', true);
      return;
    }
    const sms = String(pendingRow.sms ?? '');
    const facts = regexExtract(sms);
    const record = withAnswerLocation(
      pendingRow,
      payload,
      facts.direction === 'debit' && pendingRow.transaction_type !== 'transfer',
    );
    const placed = record.lat != null && pendingRow.lat == null ? ' · place saved' : '';

    if (payload.kind === 'confirm') {
      const {txType, accountId} = await promoteAutoRecord(db, {
        record,
        ownerId,
        direction: facts.direction,
        balanceAfter: extractBalance(sms),
      });
      await syncAccountBalance(db, accountId);
      if (record.merchant) {
        await recordConfirmation(
          db,
          record.merchant,
          txType === 'transfer' ? 'transfer' : record.category,
          ownerId,
          txType === 'transfer' ? '' : record.subcategory ?? '',
        );
      }
      const more = (await recheckPending(db, ownerId)).promoted.length;
      settle(
        recordId,
        `Filed as ${categoryLabel(record)}${placed}${more ? ` · and ${more} similar` : ''}`,
        true,
      );
      refreshBalanceWidget();
      return;
    }

    // 'describe': classify again with the user's own words as context.
    const note = (payload.note ?? '').trim();
    const meta = session?.user?.user_metadata ?? {};
    const {rows: acctRows} = await db.execute(
      'SELECT id, name, number FROM accounts WHERE owner_id = ?',
      [ownerId],
    );
    const accounts = ((acctRows?._array ?? []) as any[]).map(a => ({
      id: a.id,
      name: a.name ?? '',
      number: a.number ?? '',
    }));
    const rules = await getMerchantRules(db, record.merchant ?? '', ownerId, 20);
    const parsed = await parseSmsWithAI(
      sms,
      rules,
      session?.access_token ?? '',
      await getMerchantChannels(),
      {
        userName: meta.full_name ?? meta.name ?? '',
        accounts,
        currentAccountId: record.account_id,
        rules,
        sender: record.sender ?? '',
        userNote: note,
      },
    );
    if (parsed.parseSource !== 'ai') {
      // No model to read the words: filing on the old guess would ignore exactly
      // what the user just told us. Keep it pending, keep the note for the Fix
      // sheet, and say so.
      await keepNote(recordId, note);
      settle(recordId, 'Saved your note — finish it in FinXAI when online');
      return;
    }

    const type: 'expense' | 'income' | 'transfer' = parsed.isTransfer
      ? 'transfer'
      : parsed.direction === 'credit'
      ? 'income'
      : 'expense';
    const {accountId} = await promoteAutoRecord(db, {
      record,
      ownerId,
      direction: facts.direction,
      balanceAfter: extractBalance(sms),
      overrides: {
        type,
        category: parsed.category,
        subcategory: parsed.subcategory ?? '',
        merchant: parsed.merchant || record.merchant,
        note,
      },
    });
    await syncAccountBalance(db, accountId);
    // A confirmation, not a correction: a description is about THIS purchase.
    // The shop you usually buy groceries at can still sell you a charger, so one
    // answer should nudge the merchant's rule, not rewrite it.
    if (parsed.merchant) {
      await recordConfirmation(
        db,
        parsed.merchant,
        type === 'transfer' ? 'transfer' : parsed.category,
        ownerId,
        type === 'transfer' ? '' : parsed.subcategory ?? '',
      );
    }
    const filed = categoryLabel({
      transaction_type: type,
      category: parsed.category,
      subcategory: parsed.subcategory,
    });
    settle(recordId, `Filed as ${filed}${placed} · “${note.slice(0, 40)}”`, true);
    refreshBalanceWidget();
  } catch (e: any) {
    console.warn('[Review] answer failed:', e);
    settle(recordId, 'Could not file it — open FinXAI to finish');
  }
}
