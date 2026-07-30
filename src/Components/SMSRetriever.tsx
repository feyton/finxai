/* eslint-disable react-hooks/exhaustive-deps */
/**
 * SMSRetriever — silent background component (renders nothing).
 *
 * On mount:
 * 1. Reads new SMS from Android once (no per-sender native filter — matching
 *    is done here case-insensitively, so 'Mokash' vs 'MoKash' can't miss)
 * 2. Builds a batch-level transfer-hint index from BPR-style "from A/c ...
 *    to A/c ... is Completed" confirmations, for cross-message correlation
 * 3. Calls FinXAI's own server (/api/ai/classify-sms — provider and key held
 *    server-side) to parse + categorize
 * 4. Falls back to regex parser if the server call is unavailable / errors
 * 5. FAILED transactions and transfer-status-only confirmations go to
 *    ignored_sms — never become records
 * 6. Auto-saves confident records (≥ THRESHOLD_AUTO_SAVE) to transactions
 * 7. Saves review-needed records to auto_records
 */
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useEffect, useMemo, useRef} from 'react';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import {useToast} from 'react-native-toast-notifications';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {supabase} from '../tools/supabase';
import {THRESHOLD_AUTO_SAVE} from '../tools/smsTypes';
import {
  ParseContext,
  candidateNames,
  dateKeyFromIso,
  extractTransferHint,
  isTransferStatusOnly,
  maskedSuffixMatches,
  normalizeAccountNumber,
  parseSmsWithAI,
  regexExtract,
} from '../tools/smsParser';
import {
  getChannelRules,
  getMerchantChannels,
  getMerchantRules,
  migrateMerchantRuleKeys,
  recordMerchantChannel,
} from '../tools/merchantMemory';
import {syncAccountBalance} from '../tools/balance';
import {ignoredSmsId} from '../tools/txnId';
import {findAccountForSms, persistParsedSms} from '../tools/smsIngest';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getMonthStartEpoch(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

// Cap on one inbox fetch. The native module truncates at this many messages
// with no signal, so the caller warns when a run comes back exactly this size.
const INBOX_MAX = 1500;

const SMSRetriever: React.FC = () => {
  const db = usePowerSync();
  const {userId, name} = useCurrentUser();
  const processing = useRef(false);
  const toast = useToast();

  // ALL accounts stream in — auto ones get SMS processing, and every account
  // number participates in inter-account transfer matching.
  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ?',
    [userId ?? ''],
  );

  // Deduplicate: get already-stored + ignored SMS bodies to avoid reprocessing
  const {data: existingRecords} = useQuery(
    'SELECT sms FROM auto_records WHERE owner_id = ? UNION SELECT sms FROM transactions WHERE owner_id = ? UNION SELECT sms FROM ignored_sms WHERE owner_id = ?',
    [userId ?? '', userId ?? '', userId ?? ''],
  );

  // Bank of Kigali now sends TWO alerts per transaction from two different
  // senders/formats, sharing the same Ref/Event #. This dedupes by
  // (account, txn_ref) across BOTH tables so the second alert never
  // creates a second record for the same real-world transaction.
  const {data: existingTxnRefs} = useQuery(
    'SELECT account_id, txn_ref FROM auto_records WHERE owner_id = ? AND txn_ref IS NOT NULL UNION SELECT account_id, txn_ref FROM transactions WHERE owner_id = ? AND txn_ref IS NOT NULL',
    [userId ?? '', userId ?? ''],
  );

  const autoAccounts = (accounts as any[]).filter(a => a.auto === 1 && a.address);

  // A signature of ONLY the account fields that change how SMS are matched.
  //
  // This effect writes accounts.log_date at the end of every run, and it used to
  // depend on the whole `accounts` array. PowerSync's useQuery is reactive, so that
  // write re-emitted a new array, which changed the dependency, which ran the effect
  // again — a self-feeding loop. `processing.current` prevents overlapping runs but
  // not this: the guard is released when a run finishes, and the changed dependency
  // immediately starts the next one.
  //
  // Each iteration queued one accounts:PATCH per account, which is how the upload
  // queue reached 11,245 entries — 100% of them {"type":"accounts",
  // "data":{"log_date":...}}. That backlog then jammed uploads, and because
  // PowerSync will not apply a downloaded checkpoint while local writes are
  // outstanding, it silently stopped DOWNLOADS too. Every symptom of the last few
  // hours — edits on the web never arriving, balances diverging, the queue refilling
  // after being cleared — comes back to this dependency array.
  //
  // Depending on a signature keeps the behaviour the comment below asks for (an
  // edited account number or sender address still triggers a re-run) while making a
  // log_date or balance write a no-op for this effect.
  const accountsSignature = useMemo(
    () =>
      (accounts as any[])
        .map(a => `${a.id}:${a.auto}:${a.address ?? ''}:${a.number ?? ''}`)
        .sort()
        .join('|'),
    [accounts],
  );

  // Readiness, not a change signal. The dedupe queries must have RESOLVED before a
  // run starts, but they also change on every insert this effect makes — depending
  // on their contents would reintroduce the same loop by a different route.
  const dedupeReady = existingRecords !== undefined && existingTxnRefs !== undefined;

  useEffect(() => {
    if (!userId || autoAccounts.length === 0 || processing.current) {return;}
    // Wait for the dedupe queries too. These are three INDEPENDENT PowerSync
    // queries: gating only on `accounts` left a window where accounts had
    // arrived but existingRecords hadn't, so both dedupe sets were empty
    // (`?? []`) and already-processed messages looked new. The log_date floor
    // hides most of it, but a run interrupted before log_date advanced — or a
    // second device processing the same SMS before it syncs — re-inserts.
    if (!dedupeReady) {return;}
    processSms();
    // accounts.length alone missed edits to an account's number/sender address,
    // so a corrected account only took effect after a restart — hence the
    // signature above rather than the length.
  }, [userId, accountsSignature, dedupeReady]);

  const existingSmsSet = new Set(
    (existingRecords ?? []).map((r: any) => r.sms).filter(Boolean),
  );

  const existingTxnRefSet = new Set(
    (existingTxnRefs ?? []).map((r: any) => `${r.account_id}:${r.txn_ref}`),
  );

  const fetchInbox = (
    minDate: number,
  ): Promise<{body: string; address: string; date: string}[]> =>
    new Promise(resolve => {
      SmsAndroid.list(
        JSON.stringify({box: 'inbox', minDate, maxCount: INBOX_MAX}),
        (fail: string) => {
          console.warn('[SMSRetriever] SMS list failed:', fail);
          resolve([]);
        },
        (_count: number, smsListJson: string) => {
          try {
            resolve(JSON.parse(smsListJson));
          } catch {
            resolve([]);
          }
        },
      );
    });

  const processSms = async () => {
    processing.current = true;
    try {
      const {
        data: {session},
      } = await supabase.auth.getSession();
      const authToken = session?.access_token ?? '';

      // One-time repair of rule keys written before normalizeMerchant existed
      // (timestamps baked into the key, plus the poisonous 'unknown' rule).
      // Idempotent — a no-op once it has run.
      await migrateMerchantRuleKeys(db, userId!);

      // Learned rules feed the classifier — a counterparty the user corrected
      // to 'transfer' (or to a category) is honored on every future SMS. This
      // is the generic head; per-SMS relevant rules are fetched inside the
      // loop below, keyed on that message's own counterparty.
      const merchantRules = await getMerchantRules(db, '', userId!, 20);
      const merchantChannels = await getMerchantChannels();
      const channelRules = await getChannelRules();

      const ctxBase: ParseContext = {
        userName: name ?? '',
        accounts: (accounts as any[]).map(a => ({
          id: a.id,
          name: a.name ?? '',
          number: a.number ?? '',
        })),
        rules: merchantRules,
      };

      // New accounts start their catalog from the 1st of the current month.
      const floors = new Map<string, number>();
      for (const account of autoAccounts) {
        floors.set(account.id, account.log_date || getMonthStartEpoch());
      }
      const minDate = Math.min(...floors.values());
      const fetchTime = Date.now();
      const fetched = await fetchInbox(minDate);
      if (fetched.length >= INBOX_MAX) {
        // The native call truncates silently and its ordering isn't documented,
        // so we can't tell whether the oldest or newest were dropped.
        console.warn(
          `[SMSRetriever] inbox fetch hit the ${INBOX_MAX}-message cap — some messages may not have been seen`,
        );
      }

      // Process in CHRONOLOGICAL order. The previous sort ranked "richness"
      // globally, which pushed every rich-format message ahead of every
      // ordinary one across all accounts and dates — destroying the time order
      // that balance reconciliation depends on, for a preference that was only
      // ever meant to apply *within* a txn_ref pair.
      const isRich = (b: string) => /credited\s+account|debited\s+account/i.test(b ?? '');
      const inbox = [...fetched].sort(
        (a, b) => (parseInt(a.date ?? '0', 10) || 0) - (parseInt(b.date ?? '0', 10) || 0),
      );

      // Prefer the richer "Credited account: X Debited account: Y" alert over
      // its "your account has been debited/credited" sibling when both describe
      // the same transaction — the former proves a self-transfer via
      // account-number matching, the latter names neither account. Resolved
      // per-txn_ref up front so ordering stays chronological.
      const richestByRef = new Map<string, string>();
      for (const sms of inbox) {
        if (!sms.body || !isRich(sms.body)) {
          continue;
        }
        const ref = regexExtract(sms.body).txn_ref;
        if (ref) {
          richestByRef.set(ref, sms.body);
        }
      }

      // Some banks (BPR) send a SEPARATE "from A/c P to A/c Q ... is
      // Completed" confirmation for every transfer, alongside the
      // authoritative "has been debited/credited ... balance is" alert that
      // already carries the real transaction. Build a lookup of
      // {amount, date} → destination account BEFORE the main loop, from ALL
      // fetched SMS (not just ones matching a configured sender — the hint
      // and the alert can arrive as distinct message types from the same
      // bank), so the alert can be tagged as a transfer once we reach it —
      // and the confirmation itself never becomes its own duplicate record.
      const transferHints = inbox
        .map(sms => (sms.body ? extractTransferHint(sms.body) : null))
        .filter((h): h is NonNullable<typeof h> => h != null);
      // Each hint may tag at most one transaction — otherwise a single
      // confirmation could mark several same-amount records as transfers.
      const usedHints = new Set<(typeof transferHints)[number]>();

      // Accounts that got a new auto-saved transaction this run — balance is
      // recomputed for each ONCE at the end (anchor + replay), never by
      // blindly writing whichever SMS happened to be processed last (the
      // inbox isn't guaranteed to arrive in chronological order).
      const touchedAccounts = new Set<string>();

      // How many messages degraded to regex-only classification this run.
      // Surfaced ONCE at the end (not per SMS) — the previous behaviour was a
      // silent console.warn, which is how a fully dark AI pipeline went
      // unnoticed.
      let fallbackCount = 0;
      let lastFallbackReason = '';

      // Per-account cursor bookkeeping, so a message that failed to record
      // doesn't get skipped forever by an advancing log_date.
      const lastProcessed = new Map<string, number>();
      const earliestFailure = new Map<string, number>();
      const noteProcessed = (accountId: string, when: number) => {
        if (when > (lastProcessed.get(accountId) ?? 0)) {
          lastProcessed.set(accountId, when);
        }
      };
      const noteFailure = (accountId: string, when: number) => {
        const prev = earliestFailure.get(accountId);
        if (prev == null || when < prev) {
          earliestFailure.set(accountId, when);
        }
      };

      for (const sms of inbox) {
        if (!sms.body || existingSmsSet.has(sms.body)) {continue;}

        const account = findAccountForSms(sms, autoAccounts, channelRules);
        if (!account) {continue;}

        const smsDate = parseInt(sms.date ?? '0', 10) || 0;
        if (smsDate < (floors.get(account.id) ?? 0)) {continue;}

        // Transfer status/confirmation-only message — never a transaction on
        // its own (its facts were already folded into transferHints above).
        if (isTransferStatusOnly(sms.body)) {
          await db.execute(
            'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [ignoredSmsId({ownerId: userId!, sms: sms.body, sender: account.name}), sms.body, account.name, 'status', userId, new Date().toISOString()],
          );
          existingSmsSet.add(sms.body);
          noteProcessed(account.id, smsDate);
          continue;
        }

        try {
          // Build the FULL context before extracting anything. Without
          // currentAccountId, regexExtract can't tell which side of a BK
          // "Credited account: X Debited account: Y" alert is the user's, so it
          // fell through to a branch that flipped direction to credit and set
          // transferAccount to the user's own debited account — producing a
          // "From <wrong account>" name, which was then what the rule lookup
          // got scoped on. Worst case on the richest message format.
          const ctx: ParseContext = {
            ...ctxBase,
            currentAccountId: account.id,
            sender: sms.address,
          };
          // Extract ONCE and reuse — this used to run twice per SMS.
          const facts = regexExtract(sms.body, ctx);

          // A poorer sibling alert for a transaction whose richer form is also
          // in this batch: skip it and let the richer one carry the record.
          const richer = facts.txn_ref ? richestByRef.get(facts.txn_ref) : undefined;
          if (richer && richer !== sms.body) {
            await db.execute(
              'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [ignoredSmsId({ownerId: userId!, sms: sms.body, sender: account.name}), sms.body, account.name, 'duplicate', userId, new Date().toISOString()],
            );
            existingSmsSet.add(sms.body);
            noteProcessed(account.id, smsDate);
            continue;
          }

          // Scope the rule lookup on the names we can derive without the model.
          const names = candidateNames(sms.body, facts, sms.address);
          const scopedRules = names.length
            ? await getMerchantRules(db, names[0], userId!, 20)
            : merchantRules;
          ctx.rules = scopedRules;

          const parsed = await parseSmsWithAI(
            sms.body,
            scopedRules,
            authToken,
            merchantChannels,
            ctx,
            facts,
          );
          if (parsed.parseSource === 'regex') {
            fallbackCount++;
            lastFallbackReason = parsed.fallbackReason ?? lastFallbackReason;
          }

          const now = new Date().toISOString();

          // FAILED transactions never become records — remember them so this
          // SMS is not parsed again.
          if (parsed.status === 'failed') {
            await db.execute(
              'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [ignoredSmsId({ownerId: userId!, sms: sms.body, sender: account.name}), sms.body, account.name, 'failed', userId, now],
            );
            existingSmsSet.add(sms.body);
            noteProcessed(account.id, smsDate);
            continue;
          }

          // Same transaction, a second alert (see findAccountForSms above) —
          // never a second record.
          const txnRefKey = parsed.txn_ref ? `${account.id}:${parsed.txn_ref}` : null;
          if (txnRefKey && existingTxnRefSet.has(txnRefKey)) {
            await db.execute(
              'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [ignoredSmsId({ownerId: userId!, sms: sms.body, sender: account.name}), sms.body, account.name, 'duplicate', userId, now],
            );
            existingSmsSet.add(sms.body);
            noteProcessed(account.id, smsDate);
            continue;
          }

          // Remember the rail this merchant uses (for consistency + future
          // "pay again"), device-local so it needs no schema change.
          //
          // Only learn from records confident enough to auto-save. This used to
          // fire at ANY confidence, and the result came back into the next
          // prompt as "Known merchant channels:" — so a 0.5-confidence guess
          // became an authoritative-looking hint that biased every future
          // message from that merchant toward the same mistake. Self-
          // reinforcing, and worst for the merchants the model handles least
          // well. Records that go to review instead learn on confirmation.
          if (
            parsed.merchant &&
            parsed.merchant !== 'Unknown' &&
            parsed.channel &&
            parsed.confidence >= THRESHOLD_AUTO_SAVE
          ) {
            recordMerchantChannel(parsed.merchant, parsed.channel).catch(() => {});
          }

          const occurredAt =
            parsed.occurred_at ?? new Date(smsDate || Date.now()).toISOString();

          // Cross-message correlation: a debit/credit alert that gave no
          // counterparty (BPR's format never names one) can still be proven
          // a transfer when a sibling confirmation message — same amount,
          // same calendar day — names a destination whose visible digits
          // match one of the user's OWN accounts.
          // Only the DEBITED side correlates: the hint describes money leaving
          // an account, so pairing it with a credit alert would double-count.
          if (!parsed.isTransfer && parsed.direction === 'debit' && transferHints.length > 0) {
            const dateKey = dateKeyFromIso(occurredAt, smsDate);
            // Amount+day alone matched too loosely — two unrelated 5,000 RWF
            // movements on the same day collided, and one got mislabelled a
            // transfer (category 'savings'), quietly corrupting net worth. Also
            // require the hint's SOURCE account to be this account, and if more
            // than one hint still matches, take none and let the user decide.
            const matches = transferHints.filter(
              h =>
                !usedHints.has(h) &&
                h.dateKey === dateKey &&
                Math.abs(h.amount - parsed.amount) <= 1 &&
                (!h.srcSuffix ||
                  maskedSuffixMatches(
                    h.srcSuffix,
                    normalizeAccountNumber(account.number),
                  )),
            );
            const hint = matches.length === 1 ? matches[0] : null;
            if (hint) {
              const dest = (ctxBase.accounts ?? []).find(
                a =>
                  a.id !== account.id &&
                  maskedSuffixMatches(hint.destSuffix, normalizeAccountNumber(a.number)),
              );
              if (dest) {
                // Each hint tags at most one record.
                usedHints.add(hint);
                parsed.isTransfer = true;
                parsed.transferAccountId = dest.id;
                parsed.merchant = `To ${dest.name}`;
                parsed.category = 'savings';
                // A proven own-account destination is the strongest transfer
                // evidence there is — it used to cap at 0.9, below
                // THRESHOLD_AUTO_SAVE (0.92), so the best-evidenced transfers
                // were the ones sent to manual review.
                parsed.confidence = Math.max(parsed.confidence, 0.95);
              }
            }
          }

          // Dedupe + write goes through the SHARED path so the poller and the
          // live-broadcast path can never disagree on column lists, dedupe keys,
          // or location gating. Batch-only concerns (transfer hints above, the
          // log_date cursor below) stay here.
          //
          // No location on this path by design: a polled message can be days
          // old, and stamping it with the device's current position would be
          // confidently wrong. Only live capture carries a position.
          const outcome = await persistParsedSms(db, {
            parsed,
            account,
            ownerId: userId!,
            body: sms.body,
            smsDate,
            occurredAt,
          });
          if (outcome === 'saved') {
            touchedAccounts.add(account.id);
          }
          existingSmsSet.add(sms.body);
          if (txnRefKey) {
            existingTxnRefSet.add(txnRefKey);
          }
          noteProcessed(account.id, smsDate);
        } catch (e) {
          // Hold this account's cursor behind the failed message so the next
          // run retries it instead of skipping it permanently.
          noteFailure(account.id, smsDate);
          console.warn('[SMSRetriever] Failed to process SMS:', e);
        }
      }

      // Recompute balances once per touched account — anchor on the newest
      // bank-reported balance and replay newer movements, immune to whatever
      // order the inbox happened to process in.
      for (const accId of touchedAccounts) {
        await syncAccountBalance(db, accId);
      }

      // Advance each account's cursor only as far as we actually got.
      //
      // This used to set log_date = fetchTime unconditionally, which moved the
      // cursor past messages that were never recorded — anything that hit the
      // inner catch (parse or insert threw) was skipped permanently, with no
      // trace. That surfaces later as "some of my transactions are just
      // missing" and is unreproducible after the fact.
      //
      // Now: advance to the newest message we processed *successfully* for that
      // account, and hold the cursor if anything failed, so the next run retries
      // it. When an account saw no messages at all there is nothing to retry, so
      // it advances to fetchTime as before.
      for (const account of autoAccounts) {
        const failedAt = earliestFailure.get(account.id);
        const processedAt = lastProcessed.get(account.id);
        const cursor =
          failedAt != null
            ? failedAt - 1 // retry the failed message next run
            : processedAt ?? fetchTime;
        await db.execute('UPDATE accounts SET log_date = ? WHERE id = ?', [
          cursor,
          account.id,
        ]);
      }

      // Clean up orphaned auto_records
      await db.execute(
        'DELETE FROM auto_records WHERE owner_id = ? AND (account_id IS NULL OR account_id NOT IN (SELECT id FROM accounts))',
        [userId],
      );

      // Tell the user once if the classifier was unreachable — otherwise a
      // dark AI pipeline just looks like the parser got worse.
      if (fallbackCount > 0) {
        console.warn(
          `[SMSRetriever] ${fallbackCount} SMS classified without AI (${lastFallbackReason})`,
        );
        toast.show(
          lastFallbackReason === 'not-signed-in'
            ? 'Session expired — sign in again for AI tagging.'
            : `AI tagging unavailable (${lastFallbackReason}) — ${fallbackCount} message${
                fallbackCount === 1 ? '' : 's'
              } tagged offline. Tap Retry on any record.`,
          {type: 'warning', duration: 6000},
        );
      }
    } catch (e) {
      console.error('[SMSRetriever] Error:', e);
    } finally {
      processing.current = false;
    }
  };

  return null; // Headless — UI lives in HomeScreen's AI banner
};

export default SMSRetriever;
