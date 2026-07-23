-- ============================================================================
-- FinXAI v6 Migration — persist the bank's transaction reference (txn_ref)
-- ============================================================================
--
-- WHY: Bank of Kigali started sending TWO SMS per transaction from TWO
-- different senders/formats — the original "TRANSFER - ... Credited
-- account: X Debited account: Y" alert, and a newer "BK BANK" sender's
-- "your account X has been debited/credited ... Txn Description: ..."
-- alert — both for the SAME transaction, sharing the same Ref/Event #.
-- Persisting txn_ref lets the SMS retriever recognise the second alert as
-- a duplicate of the first instead of creating two records for one
-- transaction.
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
  ADD COLUMN IF NOT EXISTS txn_ref text;

ALTER TABLE auto_records
  ADD COLUMN IF NOT EXISTS txn_ref text;

CREATE INDEX IF NOT EXISTS idx_transactions_txn_ref
  ON transactions (account_id, txn_ref) WHERE txn_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auto_records_txn_ref
  ON auto_records (account_id, txn_ref) WHERE txn_ref IS NOT NULL;
