-- ============================================================================
-- FinXAI v5 Migration — per-transaction bank balance (audit + balance sync)
-- ============================================================================
--
-- transactions.balance_after: the balance the BANK's own SMS reported right
-- after this transaction. Stored per record for audit, and used by the
-- "Sync balance" action on an account: anchor on the newest bank-reported
-- balance, then replay the movements recorded after it.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync sync rules: NOTHING to change — the user_data bucket uses
--      SELECT *, which picks up new columns automatically.
--   3. Install the app build that writes the column.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS balance_after real;

ALTER TABLE auto_records
  ADD COLUMN IF NOT EXISTS balance_after real;
