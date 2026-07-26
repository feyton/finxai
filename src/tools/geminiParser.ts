// Shared SMS-parsing types + confidence thresholds — used by both the
// regex extractor and the AI classifier in claudeParser.ts. The actual
// Gemini call now lives server-side (apps/web's /api/ai/classify-sms,
// called via src/tools/aiProxyClient.ts) rather than on-device.
import {CategoryId} from '../theme';

export interface ParsedSMS {
  direction: 'debit' | 'credit';
  amount: number;
  merchant: string;
  category: CategoryId;
  confidence: number;
  fee: number;
  balance_after: number | null;
  txn_ref: string | null;
  occurred_at: string | null;
  // Payment rail used, e.g. 'MoMoPay' | 'Send money' | 'Receive' |
  // 'Bank transfer' | 'Cash Power' | 'Airtime' | 'Bill' | 'Other'.
  channel?: string;
  // True when the money moved between the user's OWN accounts (BK↔MoMo,
  // MoMo↔Mokash, self-transfer) — net-zero across net worth, not spend/income.
  isTransfer?: boolean;
  // 'failed' when the SMS reports a FAILED/REVERSED/DECLINED transaction —
  // such messages must never become records (they go to ignored_sms).
  status?: 'completed' | 'failed';
  // When the counterparty account number matches another of the user's OWN
  // accounts, this is that account's id (drives transfer_account_id).
  transferAccountId?: string | null;
}

export interface MerchantRule {
  pattern: string;
  category: string;
  correction_count: number;
  confirmation_count: number;
}

// ── Confidence thresholds ──────────────────────────────────────
export const THRESHOLD_AUTO_SAVE = 0.92; // silent auto-save
export const THRESHOLD_REVIEW    = 0.80; // flag for review (still saves)
