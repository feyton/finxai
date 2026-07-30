// Shared SMS-parsing types + confidence thresholds — used by both the regex
// extractor and the AI classifier in ./smsParser.ts.
//
// The model call lives server-side (apps/web's /api/ai/classify-sms, reached
// via ./aiProxyClient.ts), and WHICH provider serves it is the user's own
// setting — see apps/web/src/lib/aiProvider.ts. Nothing here is
// provider-specific.
import {CategoryId} from '../theme';

export interface ParsedSMS {
  direction: 'debit' | 'credit';
  amount: number;
  merchant: string;
  category: CategoryId;
  // Best-effort guess from the built-in subcategory list for `category`;
  // '' when none fits well. Only ever a built-in name — the AI has no
  // visibility into the user's custom subcategories.
  subcategory: string;
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
  // Which path actually classified this SMS: 'ai' when the server-side model
  // answered, 'regex' when we degraded to on-device pattern matching.
  //
  // This exists because the fallback was previously invisible — the only tell
  // was regexClassify's hardcoded confidence values (0.45 / 0.9) leaking into
  // the UI, so a totally dark AI pipeline looked like a merchant-parsing bug.
  parseSource?: 'ai' | 'regex';
  // Why the fallback happened, for diagnostics. Never shown as-is to users.
  fallbackReason?: string;
}

// MerchantRule moved to ../../shared/merchantNormalize — normalizeMerchant needs it,
// and a shared module must not import back into the mobile app. Re-exported so
// existing `from './smsTypes'` imports keep working.
export type {MerchantRule} from '../../shared/merchantNormalize';

// ── Confidence thresholds ──────────────────────────────────────
export const THRESHOLD_AUTO_SAVE = 0.92; // silent auto-save
export const THRESHOLD_REVIEW    = 0.80; // flag for review (still saves)
