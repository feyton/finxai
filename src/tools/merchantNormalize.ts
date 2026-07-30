// Pure merchant-name normalization. No React Native, no AsyncStorage, no DB.
//
// Deliberately separate from ./merchantMemory (which owns persistence and does
// import AsyncStorage): smsParser.ts needs these helpers, and it is unit
// tested in plain Jest with no RN mocking — the same reason aiProxyClient.ts
// takes an auth token as a parameter instead of importing ./supabase.
import type {MerchantRule} from './smsTypes';

// Patterns that must never become a learning key. 'unknown' is the dangerous
// one: regexClassify defaults merchant to 'Unknown', so a single fix on an
// unparseable SMS used to create a rule that matched EVERY later unparseable
// SMS and forced confidence to 0.95 — above THRESHOLD_AUTO_SAVE, so those were
// silently auto-filed with no review at all.
const RESERVED_PATTERNS = new Set([
  'unknown',
  'n/a',
  'na',
  'none',
  '-',
  'sender',
  'sender:',
]);

export function isUsablePattern(pattern: string): boolean {
  const p = (pattern ?? '').trim();
  return p.length >= 3 && !RESERVED_PATTERNS.has(p);
}

export interface NormalizedMerchant {
  // Stable lookup key for merchant_rules — lowercase, no trailing code, no
  // timestamp tail. This is what makes a rule matchable a second time.
  key: string;
  // Human-facing name, title-cased.
  display: string;
  // Trailing merchant/subscriber code split out of the name ("Valentine
  // 002597" → code '002597'), so two SMS from the same counterparty share one
  // key.
  code: string | null;
}

// Turns a raw extracted counterparty into a stable key + clean display name.
//
// Why this exists: rules are keyed on the merchant string, so anything
// per-message baked into that string (a timestamp, a reference number) makes
// the key unique forever and the rule can never fire again. That is the whole
// reason corrections appeared to do nothing.
//   "Valentine 002597 was completed at 2026-07-29 11:37:48"
//     → key 'valentine', display 'Valentine', code '002597'
export function normalizeMerchant(raw: string): NormalizedMerchant {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim();

  // Drop a trailing sentence tail the fallback regexes over-captured.
  s = s.replace(
    /\s+(?:was|has\s+been|is)\s+(?:completed|successful|processed)\b.*$/i,
    '',
  );
  // Drop a trailing " at <date/time>" clause.
  s = s.replace(/\s+at\s+\d[\d\-/:. ]*$/i, '');
  // Drop any remaining bare date/time tail.
  s = s.replace(/\s+\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\s*$/, '');
  // Strip trailing punctuation/separators left behind by the cuts above.
  s = s.replace(/[\s.,;:*#/-]+$/, '').trim();

  // Split a trailing numeric code ("THRIVE G Ltd 888840", "Lambert 005868").
  // Requires a non-numeric name before it, so a purely numeric counterparty is
  // left alone rather than reduced to an empty key.
  let code: string | null = null;
  const codeMatch = s.match(/^(.*?[^\d\s])\s+(\d{3,})$/);
  if (codeMatch) {
    s = codeMatch[1].trim();
    code = codeMatch[2];
  }

  // Drop common company suffixes from the KEY only (kept in display) so
  // "ComzAfrica Rwanda Limited" and "ComzAfrica Rwanda Ltd" share one rule.
  const key = s
    .toLowerCase()
    .replace(/\b(?:ltd|limited|plc|inc|llc|co|company|sa|sarl)\b\.?/g, '')
    .replace(/[^a-z0-9&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {key, display: titleCase(s), code};
}

// The display name the user last chose for this counterparty, if any. This is
// what stops a badly-extracted name staying badly-extracted forever: a rule
// only ever corrected the CATEGORY before, never the name shown, so the garbled
// name came back on every subsequent SMS.
export function ruleDisplayName(
  rules: MerchantRule[] | undefined,
  merchant: string,
): string | null {
  if (!rules?.length || !merchant) {
    return null;
  }
  const key = normalizeMerchant(merchant).key;
  if (!isUsablePattern(key)) {
    return null;
  }
  const hit = rules.find(r => r.pattern === key);
  return hit?.display_name?.trim() ? hit.display_name.trim() : null;
}

// "SAWA CITI LTD" → "Sawa Citi Ltd"; leaves intentionally mixed-case names
// ("ComzAfrica") alone, since that is how the provider wrote them.
function titleCase(s: string): string {
  return s
    .split(' ')
    .map(w => {
      if (!w) {
        return w;
      }
      if (/[a-z]/.test(w) && /[A-Z]/.test(w)) {
        return w; // already intentionally mixed case
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}
