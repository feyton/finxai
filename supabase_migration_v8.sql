-- ============================================================================
-- FinXAI v8 Migration — parse-source visibility + real merchant learning
-- ============================================================================
--
-- WHY (1): parse_source
-- The AI classifier had been silently failing for an unknown length of time.
-- claudeParser.parseSmsWithAI() catches EVERY error and falls back to
-- regex-only classification with a lone console.warn — so from the UI there
-- was no way to tell an AI-classified record from a regex-guessed one. The
-- only tell was the confidence value itself (regexClassify hardcodes 0.45
-- with no learned rule and 0.9 with one), which is not something a user can
-- reasonably be expected to notice.
--
-- parse_source records which path produced each record, so the app can badge
-- it and "the AI isn't running" becomes visible instead of invisible.
--
-- WHY (2): merchant_rules.display_name + subcategory
-- Learning was keyed on the merchant NAME, and the fallback extractor was
-- producing names with per-message timestamps baked in
-- ("Valentine 002597 was completed at 2026-07-29 11:37:48"). A key like that
-- is unique forever, so a rule could never match a second message — which is
-- why corrections appeared to do nothing. Keys are now normalized
-- (normalizeMerchant in src/tools/merchantMemory.ts).
--
-- A rule also only ever corrected the CATEGORY. The garbled display name kept
-- coming back on every future SMS. display_name stores the name the user
-- actually chose so it is reapplied; subcategory does the same for the
-- subcategory, which was never learned at all.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. No PowerSync sync-rules change needed — the user_data bucket uses
--      `SELECT * FROM <table>`, so new columns sync automatically. (Verify in
--      the PowerSync dashboard that the rules are still SELECT *, not an
--      enumerated column list, before relying on this.)
--   3. The app runs a one-time normalization of existing merchant_rules keys
--      on next launch (migrateMerchantRuleKeys) — no SQL needed for that.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ── 1. parse_source on both transaction-bearing tables ─────────────────────
ALTER TABLE transactions  ADD COLUMN IF NOT EXISTS parse_source text;
ALTER TABLE auto_records  ADD COLUMN IF NOT EXISTS parse_source text;

COMMENT ON COLUMN transactions.parse_source IS
  '''ai'' when the server-side classifier produced this record, ''regex'' when it fell back to on-device pattern matching. NULL for manual entries and for rows created before v8.';

-- ── 2. Real learning columns on merchant_rules ─────────────────────────────
ALTER TABLE merchant_rules ADD COLUMN IF NOT EXISTS subcategory  text DEFAULT '';
ALTER TABLE merchant_rules ADD COLUMN IF NOT EXISTS display_name text;

COMMENT ON COLUMN merchant_rules.pattern IS
  'Normalized counterparty key (see normalizeMerchant). Must NOT contain timestamps, reference numbers, or trailing codes — those made keys unique per message so rules never matched twice.';
COMMENT ON COLUMN merchant_rules.display_name IS
  'Name the user chose for this counterparty. Reapplied to future SMS so a badly-extracted name is corrected everywhere, not just on the one record.';

-- ── 3. Drop the poisonous 'unknown' rule ───────────────────────────────────
-- regexClassify defaults merchant to 'Unknown'. Fixing such a record used to
-- store a rule keyed 'unknown', which then matched EVERY later unparseable
-- SMS and forced confidence to 0.95 — above THRESHOLD_AUTO_SAVE (0.92) — so
-- those records were silently auto-saved with no review at all. The client now
-- refuses to write such keys (isUsablePattern); this clears any already there.
DELETE FROM merchant_rules
WHERE lower(btrim(pattern)) IN ('unknown', 'n/a', 'na', 'none', '-', 'sender', 'sender:')
   OR length(btrim(pattern)) < 3;

-- ── 4. Index for the new per-merchant rule lookup ──────────────────────────
-- getMerchantRules() now queries rules relevant to THIS merchant first,
-- instead of only ever returning the user's global top-N.
CREATE INDEX IF NOT EXISTS idx_merchant_rules_owner_pattern
  ON merchant_rules (owner_id, pattern);
