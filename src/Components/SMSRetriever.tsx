/* eslint-disable react-hooks/exhaustive-deps */
/**
 * SMSRetriever — silent background component (renders nothing).
 *
 * On mount:
 * 1. Reads new SMS from Android once (no per-sender native filter — matching
 *    is done here case-insensitively, so 'Mokash' vs 'MoKash' can't miss)
 * 2. Builds a batch-level transfer-hint index from BPR-style "from A/c ...
 *    to A/c ... is Completed" confirmations, for cross-message correlation
 * 3. Calls Claude Haiku to parse + categorize (if API key is set)
 * 4. Falls back to regex parser if no key / API error
 * 5. FAILED transactions and transfer-status-only confirmations go to
 *    ignored_sms — never become records
 * 6. Auto-saves confident records (≥ THRESHOLD_AUTO_SAVE) to transactions
 * 7. Saves review-needed records to auto_records
 */
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useEffect, useRef} from 'react';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {getAnthropicKey, hasAnthropicKey} from '../tools/aiConfig';
import {THRESHOLD_AUTO_SAVE} from '../tools/geminiParser';
import {
  ParseContext,
  dateKeyFromIso,
  extractTransferHint,
  isTransferStatusOnly,
  maskedSuffixMatches,
  normalizeAccountNumber,
  parseSmsWithClaude,
  parseWithRegex,
} from '../tools/claudeParser';
import {
  getMerchantChannels,
  getMerchantRules,
  recordMerchantChannel,
} from '../tools/merchantMemory';

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

// 'M-Money' → 'mmoney', 'MoKash' → 'mokash' — sender matching must survive
// case and punctuation differences between what the user configured and what
// Android reports.
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

const SMSRetriever: React.FC = () => {
  const db = usePowerSync();
  const {userId, name} = useCurrentUser();
  const processing = useRef(false);

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

  const autoAccounts = (accounts as any[]).filter(a => a.auto === 1 && a.address);

  useEffect(() => {
    if (!userId || autoAccounts.length === 0 || processing.current) {return;}
    processSms();
  }, [userId, accounts.length]);

  const existingSmsSet = new Set(
    (existingRecords ?? []).map((r: any) => r.sms).filter(Boolean),
  );

  const fetchInbox = (
    minDate: number,
  ): Promise<{body: string; address: string; date: string}[]> =>
    new Promise(resolve => {
      SmsAndroid.list(
        JSON.stringify({box: 'inbox', minDate, maxCount: 1500}),
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
      const useAI = await hasAnthropicKey();
      const apiKey = useAI ? (await getAnthropicKey())! : '';
      // Learned rules feed BOTH parsing paths — a counterparty the user
      // corrected to 'transfer' (or to a category) applies with or without AI.
      const merchantRules = await getMerchantRules(db, '', userId!, 20);
      const merchantChannels = useAI ? await getMerchantChannels() : {};

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
      const inbox = await fetchInbox(minDate);

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

      for (const sms of inbox) {
        if (!sms.body || existingSmsSet.has(sms.body)) {continue;}

        const account = autoAccounts.find(a =>
          senderMatches(sms.address, a.address),
        );
        if (!account) {continue;}

        const smsDate = parseInt(sms.date ?? '0', 10) || 0;
        if (smsDate < (floors.get(account.id) ?? 0)) {continue;}

        // Transfer status/confirmation-only message — never a transaction on
        // its own (its facts were already folded into transferHints above).
        if (isTransferStatusOnly(sms.body)) {
          await db.execute(
            'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [uuid(), sms.body, account.name, 'status', userId, new Date().toISOString()],
          );
          existingSmsSet.add(sms.body);
          continue;
        }

        try {
          const ctx: ParseContext = {...ctxBase, currentAccountId: account.id};
          const parsed = useAI
            ? await parseSmsWithClaude(sms.body, merchantRules, apiKey, merchantChannels, ctx)
            : parseWithRegex(sms.body, ctx);

          const now = new Date().toISOString();

          // FAILED transactions never become records — remember them so this
          // SMS is not parsed again.
          if (parsed.status === 'failed') {
            await db.execute(
              'INSERT INTO ignored_sms (id, sms, sender, reason, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
              [uuid(), sms.body, account.name, 'failed', userId, now],
            );
            existingSmsSet.add(sms.body);
            continue;
          }

          // Remember the rail this merchant uses (for consistency + future
          // "pay again"), device-local so it needs no schema change.
          if (parsed.merchant && parsed.merchant !== 'Unknown' && parsed.channel) {
            recordMerchantChannel(parsed.merchant, parsed.channel).catch(() => {});
          }

          const occurredAt =
            parsed.occurred_at ?? new Date(smsDate || Date.now()).toISOString();

          // Cross-message correlation: a debit/credit alert that gave no
          // counterparty (BPR's format never names one) can still be proven
          // a transfer when a sibling confirmation message — same amount,
          // same calendar day — names a destination whose visible digits
          // match one of the user's OWN accounts.
          if (!parsed.isTransfer && transferHints.length > 0) {
            const dateKey = dateKeyFromIso(occurredAt, smsDate);
            const hint = transferHints.find(
              h => h.dateKey === dateKey && Math.abs(h.amount - parsed.amount) <= 1,
            );
            if (hint) {
              const dest = (ctxBase.accounts ?? []).find(
                a =>
                  a.id !== account.id &&
                  maskedSuffixMatches(hint.destSuffix, normalizeAccountNumber(a.number)),
              );
              if (dest) {
                parsed.isTransfer = true;
                parsed.transferAccountId = dest.id;
                parsed.merchant =
                  parsed.direction === 'debit' ? `To ${dest.name}` : `From ${dest.name}`;
                parsed.category = 'savings';
                parsed.confidence = Math.max(parsed.confidence, 0.9);
              }
            }
          }

          const txType = parsed.isTransfer
            ? 'transfer'
            : parsed.direction === 'credit'
            ? 'income'
            : 'expense';
          const transferAccountId = parsed.isTransfer
            ? parsed.transferAccountId ?? null
            : null;
          const transferDirection = parsed.isTransfer
            ? parsed.direction === 'credit'
              ? 'in'
              : 'out'
            : null;

          if (useAI && parsed.confidence >= THRESHOLD_AUTO_SAVE) {
            // Auto-save directly to transactions — high confidence
            await db.execute(
              `INSERT INTO transactions
                 (id, amount, account_id, category, date_time, sms, sender,
                  payee, merchant, transaction_type, fees, currency,
                  confirmed, source, confidence,
                  transfer_account_id, transfer_direction, balance_after,
                  owner_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?, ?, ?, ?)`,
              [
                uuid(),
                parsed.amount,
                account.id,
                parsed.category,
                occurredAt,
                sms.body,
                account.name,
                parsed.merchant,
                parsed.merchant,
                txType,
                parsed.fee,
                parsed.confidence,
                transferAccountId,
                transferDirection,
                parsed.balance_after,
                userId,
                now,
              ],
            );

            // Prefer the bank's own balance from the SMS (authoritative,
            // self-healing); only fall back to incrementing when absent.
            if (parsed.balance_after != null) {
              await db.execute(
                'UPDATE accounts SET available_balance = ? WHERE id = ?',
                [parsed.balance_after, account.id],
              );
            } else {
              // Balance impact follows the SMS direction (not the type):
              // a debit costs amount + fee, a credit adds amount.
              const delta =
                parsed.direction === 'credit'
                  ? parsed.amount
                  : -(parsed.amount + (parsed.fee ?? 0));
              await db.execute(
                'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
                [delta, account.id],
              );
            }
          } else {
            // Needs review — goes to auto_records
            await db.execute(
              `INSERT INTO auto_records
                 (id, amount, account_id, category, date_time, sms, sender,
                  payee, merchant, transaction_type, fees, currency,
                  confirmed, source, confidence, transfer_account_id,
                  balance_after, owner_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 0, 'sms', ?, ?, ?, ?, ?)`,
              [
                uuid(),
                parsed.amount,
                account.id,
                parsed.category,
                occurredAt,
                sms.body,
                account.name,
                parsed.merchant,
                parsed.merchant,
                txType,
                parsed.fee,
                parsed.confidence,
                transferAccountId,
                parsed.balance_after,
                userId,
                now,
              ],
            );
          }
          existingSmsSet.add(sms.body);
        } catch (e) {
          console.warn('[SMSRetriever] Failed to process SMS:', e);
        }
      }

      // Advance every auto account's catalog cursor to this fetch.
      for (const account of autoAccounts) {
        await db.execute('UPDATE accounts SET log_date = ? WHERE id = ?', [
          fetchTime,
          account.id,
        ]);
      }

      // Clean up orphaned auto_records
      await db.execute(
        'DELETE FROM auto_records WHERE owner_id = ? AND (account_id IS NULL OR account_id NOT IN (SELECT id FROM accounts))',
        [userId],
      );
    } catch (e) {
      console.error('[SMSRetriever] Error:', e);
    } finally {
      processing.current = false;
    }
  };

  return null; // Headless — UI lives in HomeScreen's AI banner
};

export default SMSRetriever;
