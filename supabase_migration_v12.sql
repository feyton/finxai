-- Migration v12 — close a local/remote schema drift on auto_records.note
--
-- WHY: src/tools/PowerSyncSchema.ts declares `note` on auto_records, but the
-- Postgres table never had that column. PowerSync's local table is a view over
-- the SQLite store, so a write to the declared-but-nonexistent column succeeds
-- LOCALLY and only fails when uploadData pushes it to Postgres.
--
-- That failure mode is the bad one. SupabaseConnector completes a failed CRUD
-- transaction with an error, PowerSync retries it, and a column that does not
-- exist never starts existing — so the write is retried forever and every
-- later write queued behind it is blocked. Silent, total, and indefinite.
--
-- Nothing writes auto_records.note today (verified by grepping every
-- `INSERT INTO auto_records` / `UPDATE auto_records` in src/), so sync is not
-- currently broken. This is pre-emptive: the SMS-review Fix sheet now captures a
-- note, and although it writes to `transactions` (which has the column) on
-- "Save & confirm", having the declared local column actually exist removes the
-- trap for the next person who reasonably assumes it does.
--
-- Safe to re-run. Purely additive: no data is read, moved, or deleted, and a
-- nullable column with no default rewrites no rows.

ALTER TABLE public.auto_records
  ADD COLUMN IF NOT EXISTS note text;

-- No sync-rule change needed: the user_data bucket selects auto_records with
-- SELECT *, so a new COLUMN is picked up automatically (only new TABLES have to
-- be added to the bucket by hand).

-- Verify:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'auto_records' AND column_name = 'note';
-- Expect exactly one row: note | text | YES
