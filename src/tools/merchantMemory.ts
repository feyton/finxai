/**
 * Merchant memory — learns from user corrections and confirmations.
 *
 * Pattern: lowercase, space-collapsed merchant name.
 * Corrections (user fixes category) count more than confirmations.
 * Top rules are passed to Gemini as context on each parse.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {MerchantRule} from './geminiParser';

function normalise(merchant: string): string {
  return merchant.toLowerCase().replace(/\s+/g, ' ').trim();
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
  try {
    const raw = await AsyncStorage.getItem(CHANNEL_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[sender] ?? null;
  } catch {
    return null;
  }
}

// ── Retrieve rules relevant to a merchant name ─────────────────
export async function getMerchantRules(
  db: any,
  merchant: string,
  userId: string,
  limit = 15,
): Promise<MerchantRule[]> {
  try {
    // Also fetch top-used global rules (by usage count)
    const {rows} = await db.execute(
      `SELECT pattern, category, correction_count, confirmation_count
       FROM merchant_rules
       WHERE owner_id = ?
       ORDER BY (correction_count * 3 + confirmation_count) DESC
       LIMIT ?`,
      [userId, limit],
    );
    return (rows?._array ?? []) as MerchantRule[];
  } catch {
    return [];
  }
}

// ── Record that the user confirmed the AI's category ──────────
export async function recordConfirmation(
  db: any,
  merchant: string,
  category: string,
  userId: string,
): Promise<void> {
  const pattern = normalise(merchant);
  if (!pattern) {return;}
  try {
    const {rows} = await db.execute(
      'SELECT id, confirmation_count FROM merchant_rules WHERE owner_id = ? AND pattern = ?',
      [userId, pattern],
    );
    const existing = rows?._array?.[0];
    if (existing) {
      await db.execute(
        'UPDATE merchant_rules SET confirmation_count = ?, category = ?, updated_at = ? WHERE id = ?',
        [existing.confirmation_count + 1, category, new Date().toISOString(), existing.id],
      );
    } else {
      await db.execute(
        'INSERT INTO merchant_rules (id, pattern, category, correction_count, confirmation_count, owner_id, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)',
        [generateUUID(), pattern, category, userId, new Date().toISOString()],
      );
    }
  } catch (e) {
    console.warn('[MerchantMemory] recordConfirmation error:', e);
  }
}

// ── Record that the user corrected the AI's category ─────────
export async function recordCorrection(
  db: any,
  merchant: string,
  correctedCategory: string,
  userId: string,
): Promise<void> {
  const pattern = normalise(merchant);
  if (!pattern) {return;}
  try {
    const {rows} = await db.execute(
      'SELECT id, correction_count FROM merchant_rules WHERE owner_id = ? AND pattern = ?',
      [userId, pattern],
    );
    const existing = rows?._array?.[0];
    if (existing) {
      await db.execute(
        'UPDATE merchant_rules SET correction_count = ?, category = ?, updated_at = ? WHERE id = ?',
        [existing.correction_count + 1, correctedCategory, new Date().toISOString(), existing.id],
      );
    } else {
      await db.execute(
        'INSERT INTO merchant_rules (id, pattern, category, correction_count, confirmation_count, owner_id, updated_at) VALUES (?, ?, ?, 1, 0, ?, ?)',
        [generateUUID(), pattern, correctedCategory, userId, new Date().toISOString()],
      );
    }
  } catch (e) {
    console.warn('[MerchantMemory] recordCorrection error:', e);
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
