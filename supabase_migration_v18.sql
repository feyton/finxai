-- Migration v18 — drop the undocumented duplicate owner policies.
--
-- WHY: four tables carry TWO identical owner policies each. One set is recorded
-- in this repo (v3 for split_details, v15 for the rest); the other —
-- `<table>_owner` — was created outside it and appears in no migration.
--
-- Verified on 2026-08-30 via pg_policies, for every pair:
--   cmd = ALL, permissive = PERMISSIVE, roles = {public},
--   qual = (owner_id = auth.uid()), with_check null or the same expression.
-- (A null WITH CHECK on a FOR ALL policy means Postgres reuses USING, so
-- split_details' explicit-check twin is equivalent, not stricter.)
--
-- Permissive policies are OR'd, so removing one of two identical grants leaves
-- effective access byte-for-byte the same. This is housekeeping: the point is
-- that the migrations become a truthful record of the database. That assumption
-- is exactly what failed during the audit — three tables were flagged as
-- possibly unprotected when they had been correctly scoped all along, because
-- the protection existed only in the dashboard.
--
-- SAFETY: nothing is dropped blind. Each duplicate is removed only if its
-- repo-recorded twin exists AND both quals are textually identical. If v15 was
-- never applied, or someone has since edited one of them, the drop is skipped
-- and says so — the failure mode is "did nothing", never "locked the table".
-- Idempotent: a second run finds nothing to do.

DO $$
DECLARE
  pair   record;
  keep_q text;
  dup_q  text;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('auto_records',       'auto_records_owner',       'Users own their auto records'),
      ('scheduled_payments', 'scheduled_payments_owner', 'Users own their scheduled payments'),
      ('subscriptions',      'subscriptions_owner',      'Users own their subscriptions'),
      ('split_details',      'split_details_owner',      'Users own their split details')
    ) AS t(tbl, dup, keep)
  LOOP
    SELECT qual INTO keep_q FROM pg_policies
     WHERE schemaname = 'public' AND tablename = pair.tbl AND policyname = pair.keep;
    SELECT qual INTO dup_q  FROM pg_policies
     WHERE schemaname = 'public' AND tablename = pair.tbl AND policyname = pair.dup;

    IF dup_q IS NULL THEN
      RAISE NOTICE 'SKIP %.% — already gone', pair.tbl, pair.dup;
    ELSIF keep_q IS NULL THEN
      -- Dropping now would leave the table with NO owner policy: every client
      -- write would be refused and PowerSync would retry the rejection forever.
      RAISE NOTICE 'SKIP %.% — its replacement "%" does not exist', pair.tbl, pair.dup, pair.keep;
    ELSIF keep_q IS DISTINCT FROM dup_q THEN
      RAISE NOTICE 'SKIP %.% — quals differ, so it is not a duplicate (keep: % / dup: %)',
        pair.tbl, pair.dup, keep_q, dup_q;
    ELSE
      EXECUTE format('DROP POLICY %I ON public.%I', pair.dup, pair.tbl);
      RAISE NOTICE 'dropped duplicate %.%', pair.tbl, pair.dup;
    END IF;
  END LOOP;
END $$;

-- Rollback, should one ever be wanted (they were plain owner policies):
--   CREATE POLICY "<table>_owner" ON public.<table>
--     FOR ALL USING (owner_id = auth.uid());

-- Verify — expect ONE policy per table, plus the shared-editor one on
-- split_details, and no name ending in `_owner`:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('auto_records','scheduled_payments','subscriptions','split_details')
--    ORDER BY tablename, policyname;
