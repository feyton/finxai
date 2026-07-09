/* eslint-disable react-hooks/exhaustive-deps */
/**
 * SMSRetriever — silent background component (renders nothing).
 *
 * On mount:
 * 1. Reads new SMS from Android for each linked account
 * 2. Calls Gemini to parse + categorize (if API key is set)
 * 3. Falls back to regex parser if no key / API error
 * 4. Auto-saves confident records (≥ THRESHOLD_AUTO_SAVE) to transactions
 * 5. Saves review-needed records to auto_records
 */
import {useQuery, usePowerSync} from '@powersync/react-native';
import React, {useEffect, useRef} from 'react';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {getAnthropicKey, hasAnthropicKey} from '../tools/aiConfig';
import {THRESHOLD_AUTO_SAVE} from '../tools/geminiParser';
import {parseSmsWithClaude, parseWithRegex} from '../tools/claudeParser';
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

const SMSRetriever: React.FC = () => {
  const db = usePowerSync();
  const {userId} = useCurrentUser();
  const processing = useRef(false);

  const {data: accounts} = useQuery(
    'SELECT * FROM accounts WHERE owner_id = ? AND auto = 1',
    [userId ?? ''],
  );

  // Deduplicate: get already-stored SMS bodies to avoid reprocessing
  const {data: existingRecords} = useQuery(
    'SELECT sms FROM auto_records WHERE owner_id = ? UNION SELECT sms FROM transactions WHERE owner_id = ?',
    [userId ?? '', userId ?? ''],
  );

  useEffect(() => {
    if (!userId || accounts.length === 0 || processing.current) {return;}
    processSms();
  }, [userId, accounts.length]);

  const existingSmsSet = new Set(
    (existingRecords ?? []).map((r: any) => r.sms).filter(Boolean),
  );

  const processSms = async () => {
    processing.current = true;
    try {
      const useAI = await hasAnthropicKey();
      const apiKey = useAI ? (await getAnthropicKey())! : '';
      const merchantRules = useAI
        ? await getMerchantRules(db, '', userId!, 20)
        : [];
      const merchantChannels = useAI ? await getMerchantChannels() : {};

      for (const account of accounts) {
        await processAccountSms(account, useAI, apiKey, merchantRules, merchantChannels);
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

  const processAccountSms = async (
    account: any,
    useAI: boolean,
    apiKey: string,
    merchantRules: any[],
    merchantChannels: any,
  ): Promise<void> => {
    const filters = {
      box: 'inbox',
      minDate: account?.log_date || getMonthStartEpoch(),
      address: account.address,
    };

    return new Promise(resolve => {
      SmsAndroid.list(
        JSON.stringify(filters),
        (fail: string) => {
          console.warn('[SMSRetriever] SMS list failed:', fail);
          resolve();
        },
        async (_count: number, smsListJson: string) => {
          const smsList: {body: string; address: string; date: string}[] =
            JSON.parse(smsListJson);

          // Update account log_date
          await db.execute('UPDATE accounts SET log_date = ? WHERE id = ?', [
            Date.now(),
            account.id,
          ]);

          for (const sms of smsList) {
            if (!sms.body || existingSmsSet.has(sms.body)) {continue;}

            try {
              const parsed = useAI
                ? await parseSmsWithClaude(sms.body, merchantRules, apiKey, merchantChannels)
                : parseWithRegex(sms.body);

              // Remember the rail this merchant uses (for consistency + future
              // "pay again"), device-local so it needs no schema change.
              if (parsed.merchant && parsed.merchant !== 'Unknown' && parsed.channel) {
                recordMerchantChannel(parsed.merchant, parsed.channel).catch(() => {});
              }

              const now = new Date().toISOString();
              const occurredAt = parsed.occurred_at ?? new Date(parseInt(sms.date ?? '0', 10) || Date.now()).toISOString();

              if (useAI && parsed.confidence >= THRESHOLD_AUTO_SAVE) {
                // Auto-save directly to transactions — high confidence
                const txType = parsed.direction === 'credit' ? 'income' : 'expense';
                await db.execute(
                  `INSERT INTO transactions
                     (id, amount, account_id, category, date_time, sms, sender,
                      payee, merchant, transaction_type, fees, currency,
                      confirmed, source, confidence, owner_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 1, 'sms', ?, ?, ?)`,
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
                  // fees reduce the balance too → a debit costs amount + fee
                  const delta =
                    txType === 'income'
                      ? parsed.amount
                      : -(parsed.amount + (parsed.fee ?? 0));
                  await db.execute(
                    'UPDATE accounts SET available_balance = available_balance + ? WHERE id = ?',
                    [delta, account.id],
                  );
                }
              } else {
                // Needs review — goes to auto_records
                const txType = parsed.direction === 'credit' ? 'income' : 'expense';
                await db.execute(
                  `INSERT INTO auto_records
                     (id, amount, account_id, category, date_time, sms, sender,
                      payee, merchant, transaction_type, fees, currency,
                      confirmed, source, confidence, owner_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RWF', 0, 'sms', ?, ?, ?)`,
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
                    userId,
                    now,
                  ],
                );
              }
            } catch (e) {
              console.warn('[SMSRetriever] Failed to process SMS:', e);
            }
          }
          resolve();
        },
      );
    });
  };

  return null; // Headless — UI lives in HomeScreen's AI banner
};

export default SMSRetriever;
