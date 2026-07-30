-- ============================================================================
-- FinXAI v11 Migration — transaction location (money-out only)
-- ============================================================================
--
-- WHY: with real-time SMS capture (a RECEIVE_SMS broadcast receiver rather than
-- polling the inbox on app open) we now know WHEN a transaction happened —
-- within seconds. That makes "where was I" answerable and useful: a map of
-- where money actually goes, and a signal for categorising a merchant the app
-- has not seen before.
--
-- SCOPE — deliberately narrow, for privacy and for battery:
--   • MONEY OUT ONLY. Expenses are the transactions a user personally acts on
--     in a place. Income and inter-account transfers are not, so they never
--     carry a location.
--   • Only for messages captured LIVE. A backfilled or polled SMS from three
--     days ago must never be stamped with today's position — that would be
--     confidently wrong data, which is worse than none. `captured_at` exists so
--     that guarantee is auditable after the fact.
--   • Cached fixes only. The app reads Android's LAST KNOWN location and never
--     requests a fresh GPS fix, so no radio is woken on account of an SMS.
--     A message that arrives with no recent cached fix simply has no location.
--
-- accuracy_m is kept because a cached fix can be a cell-tower estimate several
-- kilometres wide; without it a map would render a 5 km guess as a precise pin.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. No PowerSync sync-rules change needed — the user_data bucket selects
--      `SELECT * FROM transactions ...`, so new columns sync automatically.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS lat          double precision;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS lon          double precision;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS accuracy_m   double precision;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS location_at  text;

-- auto_records carries it too, so a location captured at arrival survives the
-- trip through SMS Review and is still attached when the user confirms.
ALTER TABLE auto_records ADD COLUMN IF NOT EXISTS lat          double precision;
ALTER TABLE auto_records ADD COLUMN IF NOT EXISTS lon          double precision;
ALTER TABLE auto_records ADD COLUMN IF NOT EXISTS accuracy_m   double precision;
ALTER TABLE auto_records ADD COLUMN IF NOT EXISTS location_at  text;

COMMENT ON COLUMN transactions.lat IS
  'Latitude at the moment the SMS arrived. Money-out only, live-captured only, from Android''s last-known (cached) fix — never a fresh GPS request. NULL whenever any of those does not hold.';
COMMENT ON COLUMN transactions.accuracy_m IS
  'Reported accuracy radius in metres. A cached fix may be a cell-tower estimate kilometres wide; do not render it as a precise point.';
COMMENT ON COLUMN transactions.location_at IS
  'When the position was fixed (ISO 8601), which is not the same as when the transaction happened. Lets a stale fix be identified later.';

-- Partial index: only the rows that actually have coordinates, since the large
-- majority (income, transfers, polled history) never will.
CREATE INDEX IF NOT EXISTS idx_transactions_owner_location
  ON transactions (owner_id)
  WHERE lat IS NOT NULL;
