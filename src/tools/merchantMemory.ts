/**
 * Merchant memory — learns from user corrections and confirmations.
 *
 * Pattern: the normalizeMerchant() key — stable across messages, so a rule
 * can actually match more than once.
 * Corrections (user fixes category) count more than confirmations.
 * Top rules are passed to the model as context on each parse.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {MerchantRule} from './smsTypes';
import {isUsablePattern, normalizeMerchant} from './merchantNormalize';

// Normalization lives in ./merchantNormalize (pure, no RN/AsyncStorage) so
// smsParser.ts can use it without dragging AsyncStorage into its Jest tests.
// Re-exported here so existing importers of this module keep working.
export {
  isUsablePattern,
  normalizeMerchant,
  type NormalizedMerchant,
} from './merchantNormalize';

function normalise(merchant: string): string {
  return normalizeMerchant(merchant).key;
}

// ── Channel memory (sender → preferred account) ────────────────
// Stored device-locally: which account the user maps each SMS sender to.
// The SMS parser can consult this to pick the right account automatically.
const CHANNEL_KEY = 'finxai.channelRules';

export async function recordChannel(
  _db: any,
  sender: string,
  accountId: string,
  _userId: string,
): Promise<void> {
  if (!sender || !accountId) {
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(CHANNEL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[sender] = accountId;
    await AsyncStorage.setItem(CHANNEL_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[MerchantMemory] recordChannel error:', e);
  }
}

export async function getPreferredChannel(sender: string): Promise<string | null> {
  if (!sender) {
    return null;
  }
  const map = await getChannelRules();
  return map[sender] ?? null;
}

// Whole sender→accountId map, for the SMS loop (which resolves an account per
// message and shouldn't hit AsyncStorage once per SMS).
export async function getChannelRules(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CHANNEL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ── Merchant → payment-rail memory (sender-agnostic) ───────────
// Learns which rail (MoMoPay, Bank transfer, …) and optional code a given
// merchant is paid through, so the SMS parser stays consistent and a future
// "pay again" can rebuild the USSD string.
const MERCHANT_CHANNEL_KEY = 'finxai.merchantChannels';

export interface MerchantChannel {
  channel: string;
  code?: string;
}

export async function recordMerchantChannel(
  merchant: string,
  channel: string,
  code?: string,
): Promise<void> {
  const pattern = normalise(merchant);
  if (!pattern || !channel) {
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(MERCHANT_CHANNEL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[pattern] = {channel, ...(code ? {code} : {})};
    await AsyncStorage.setItem(MERCHANT_CHANNEL_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[MerchantMemory] recordMerchantChannel error:', e);
  }
}

export async function getMerchantChannels(): Promise<Record<string, MerchantChannel>> {
  try {
    const raw = await AsyncStorage.getItem(MERCHANT_CHANNEL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// ── Retrieve rules relevant to a merchant name ─────────────────
//
// `merchant` used to be accepted and then ignored entirely — the query only
// ever returned the user's globally top-N rules. Past ~20 corrected merchants
// that means a rule for a less-frequent counterparty stops influencing
// anything, which looks exactly like "my corrections stopped working".
//
// Now: any rule whose key relates to THIS merchant is always included, then
// the global head fills the remaining budget as generic prompt context.
export async function getMerchantRules(
  db: any,
  merchant: string,
  userId: string,
  limit = 15,
): Promise<MerchantRule[]> {
  const SELECT = `SELECT pattern, category, display_name, correction_count, confirmation_count
       FROM merchant_rules`;
  try {
    const key = merchant ? normalizeMerchant(merchant).key : '';
    const targeted: MerchantRule[] = [];

    if (isUsablePattern(key)) {
      // Match in both directions so 'valentine' finds a stored 'valentine'
      // and a stored 'valentine 002597' alike.
      const {rows} = await db.execute(
        `${SELECT}
         WHERE owner_id = ?
           AND (pattern = ? OR ? LIKE '%' || pattern || '%' OR pattern LIKE '%' || ? || '%')
         ORDER BY (correction_count * 3 + confirmation_count) DESC
         LIMIT ?`,
        [userId, key, key, key, limit],
      );
      targeted.push(...((rows?._array ?? []) as MerchantRule[]));
    }

    const remaining = Math.max(0, limit - targeted.length);
    if (remaining === 0) {
      return targeted;
    }

    const {rows: globalRows} = await db.execute(
      `${SELECT}
       WHERE owner_id = ?
       ORDER BY (correction_count * 3 + confirmation_count) DESC
       LIMIT ?`,
      [userId, remaining + targeted.length],
    );
    const seen = new Set(targeted.map(r => r.pattern));
    for (const r of (globalRows?._array ?? []) as MerchantRule[]) {
      if (!seen.has(r.pattern) && targeted.length < limit) {
        seen.add(r.pattern);
        targeted.push(r);
      }
    }
    return targeted;
  } catch {
    return [];
  }
}

export {ruleDisplayName} from './merchantNormalize';

// ── Record that the user confirmed the AI's category ──────────
export async function recordConfirmation(
  db: any,
  merchant: string,
  category: string,
  userId: string,
  subcategory?: string,
): Promise<void> {
  await upsertRule(db, merchant, category, userId, 'confirmation', subcategory);
}

// ── Record that the user corrected the AI's category ─────────
// `displayName` is the name the user actually typed in the Fix sheet — stored
// so future SMS from this counterparty show the corrected name too, not just
// the corrected category.
export async function recordCorrection(
  db: any,
  merchant: string,
  correctedCategory: string,
  userId: string,
  subcategory?: string,
  displayName?: string,
  pay?: {channel?: string | null; payCode?: string | null},
): Promise<void> {
  await upsertRule(
    db,
    merchant,
    correctedCategory,
    userId,
    'correction',
    subcategory,
    displayName,
    pay,
  );
}

async function upsertRule(
  db: any,
  merchant: string,
  category: string,
  userId: string,
  kind: 'confirmation' | 'correction',
  subcategory?: string,
  displayName?: string,
  // How to PAY this merchant, when the user states it in the Fix sheet. This
  // is the user's override; the observed history lives on the transactions
  // themselves. Undefined means "don't touch" — passing null would erase a
  // code the user typed, from a confirmation that never mentioned payment.
  pay?: {channel?: string | null; payCode?: string | null},
): Promise<void> {
  const norm = normalizeMerchant(merchant);
  const pattern = norm.key;
  // Never store a junk key. 'unknown' in particular used to match every
  // unparseable SMS and force it past the auto-save threshold.
  if (!isUsablePattern(pattern)) {
    return;
  }
  const display = (displayName ?? '').trim() || norm.display;
  const countCol = kind === 'correction' ? 'correction_count' : 'confirmation_count';
  try {
    const {rows} = await db.execute(
      `SELECT id, ${countCol} AS n FROM merchant_rules WHERE owner_id = ? AND pattern = ?`,
      [userId, pattern],
    );
    const existing = rows?._array?.[0];
    const now = new Date().toISOString();
    if (existing) {
      await db.execute(
        `UPDATE merchant_rules
         SET ${countCol} = ?, category = ?, subcategory = ?, display_name = ?, updated_at = ?,
             channel = COALESCE(?, channel), pay_code = COALESCE(?, pay_code)
         WHERE id = ?`,
        [
          (existing.n ?? 0) + 1,
          category,
          subcategory ?? '',
          display,
          now,
          pay?.channel ?? null,
          pay?.payCode ?? null,
          existing.id,
        ],
      );
    } else {
      await db.execute(
        `INSERT INTO merchant_rules
           (id, pattern, category, subcategory, display_name,
            correction_count, confirmation_count, channel, pay_code, owner_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(),
          pattern,
          category,
          subcategory ?? '',
          display,
          kind === 'correction' ? 1 : 0,
          kind === 'confirmation' ? 1 : 0,
          pay?.channel ?? null,
          pay?.payCode ?? null,
          userId,
          now,
        ],
      );
    }
  } catch (e) {
    console.warn(`[MerchantMemory] record${kind} error:`, e);
  }
}

// ── One-time cleanup of keys written before normalization existed ──
// Deletes the poisonous 'unknown' rule and re-keys salvageable rows through
// normalizeMerchant, merging duplicates by keeping the highest counts.
// Idempotent — a second run finds nothing to do.
export async function migrateMerchantRuleKeys(db: any, userId: string): Promise<number> {
  try {
    const {rows} = await db.execute(
      `SELECT id, pattern, category, subcategory, display_name,
              correction_count, confirmation_count
       FROM merchant_rules WHERE owner_id = ?`,
      [userId],
    );
    const all: any[] = rows?._array ?? [];
    let changed = 0;

    // Group by the key each row SHOULD have.
    const byKey = new Map<string, any[]>();
    for (const r of all) {
      const key = normalizeMerchant(r.pattern ?? '').key;
      if (!isUsablePattern(key)) {
        await db.execute('DELETE FROM merchant_rules WHERE id = ?', [r.id]);
        changed++;
        continue;
      }
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }

    for (const [key, group] of byKey) {
      const alreadyCorrect = group.length === 1 && group[0].pattern === key;
      if (alreadyCorrect) {
        continue;
      }
      // Winner = most-corrected row; merge counts across the group.
      const winner = [...group].sort(
        (a, b) =>
          (b.correction_count ?? 0) * 3 + (b.confirmation_count ?? 0) -
          ((a.correction_count ?? 0) * 3 + (a.confirmation_count ?? 0)),
      )[0];
      const corrections = group.reduce((s, r) => s + (r.correction_count ?? 0), 0);
      const confirmations = group.reduce((s, r) => s + (r.confirmation_count ?? 0), 0);

      await db.execute(
        `UPDATE merchant_rules
         SET pattern = ?, correction_count = ?, confirmation_count = ?,
             display_name = ?, updated_at = ?
         WHERE id = ?`,
        [
          key,
          corrections,
          confirmations,
          (winner.display_name ?? '').trim() || normalizeMerchant(winner.pattern ?? '').display,
          new Date().toISOString(),
          winner.id,
        ],
      );
      for (const r of group) {
        if (r.id !== winner.id) {
          await db.execute('DELETE FROM merchant_rules WHERE id = ?', [r.id]);
        }
      }
      changed += group.length;
    }

    if (changed > 0) {
      console.log(`[MerchantMemory] migrated ${changed} rule row(s) to normalized keys`);
    }
    return changed;
  } catch (e) {
    console.warn('[MerchantMemory] migrateMerchantRuleKeys error:', e);
    return 0;
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
