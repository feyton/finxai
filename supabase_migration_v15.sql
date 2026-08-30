-- Migration v15 — close the authorization gaps the 2026-08-30 audit found.
--
-- Three things, all independent; run the whole file in the SQL editor.
--
-- APPLIED 2026-08-30. Verified after the fact: all three parts landed, and
-- pg_policies also revealed that auto_records, scheduled_payments and
-- subscriptions ALREADY carried owner policies named `<table>_owner`, created
-- outside this repo and recorded in no migration. So the exposure the audit
-- flagged never existed — the tables were correctly scoped the whole time,
-- just undocumented. The `<table>_owner` policies are now redundant with the
-- ones below (RLS policies are permissive/OR'd, so duplicates are harmless
-- but they widen the surface anyone has to reason about). Dropping them is
-- v16's job, once their `qual` is confirmed equivalent — never drop a policy
-- you have not read.
--
-- 1) RLS stated outright for the three pre-repo tables no migration ever
--    touched: auto_records, scheduled_payments, subscriptions.
--
--    Same situation and same reasoning as v13 had for budgets: these tables
--    predate every migration in this repo, so their policies are recorded
--    nowhere, and "RLS enabled with an owner policy" vs "enabled with no
--    policy at all" are indistinguishable from the outside. One of those
--    states leaks every user's pending SMS and payment schedules to every
--    other user; the other rejects every client write and wedges the upload
--    queue behind the first rejected op. Neither is worth leaving to
--    assumption. Idempotent: if the right policy already exists it is
--    replaced with an identical one.
--
--    FOR ALL with only USING is deliberate (matches v2/v13): when WITH CHECK
--    is omitted, Postgres reuses USING to validate new rows.

ALTER TABLE public.auto_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their auto records" ON public.auto_records;
CREATE POLICY "Users own their auto records" ON public.auto_records
  FOR ALL USING (owner_id = auth.uid());

ALTER TABLE public.scheduled_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their scheduled payments" ON public.scheduled_payments;
CREATE POLICY "Users own their scheduled payments" ON public.scheduled_payments
  FOR ALL USING (owner_id = auth.uid());

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their subscriptions" ON public.subscriptions;
CREATE POLICY "Users own their subscriptions" ON public.subscriptions
  FOR ALL USING (owner_id = auth.uid());

-- 2) owner_id is immutable on transactions.
--
--    "Shared editors update transactions" (v4) is row-level only — RLS cannot
--    restrict columns — so a "Can view & edit" invitee could set
--    owner_id = auth.uid() on the sharer's row: USING sees the old row
--    (shared to them), WITH CHECK sees the new row (same account, still
--    shared to them), both pass, and the row walks out of the owner's bucket
--    into the editor's. No legitimate flow in either client ever rewrites
--    owner_id after insert, so the narrowest possible fix is to freeze the
--    column for everyone rather than enumerate who may change it to what.

CREATE OR REPLACE FUNCTION public.reject_owner_id_change()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'owner_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_owner_id_immutable ON public.transactions;
CREATE TRIGGER transactions_owner_id_immutable
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_owner_id_change();

-- 3) Shared editors can manage split_details on shared transactions.
--
--    The v4 shared-edit grant covered transactions but split_details stayed
--    owner-only (v4 even noted it was excluded from the shared bucket). So an
--    editor splitting a shared transaction wrote rows that were RLS-refused
--    (mobile, rows now carry the parent transaction's owner_id) or half
--    applied (their DELETE of the owner's old rows silently matched nothing).
--
--    WITH CHECK additionally pins NEW.owner_id to the parent transaction's
--    owner, so an editor cannot use this policy to park foreign rows in an
--    arbitrary bucket. has_account_share is the v4 SECURITY DEFINER helper
--    (edit share, status = 'active'); the subquery on transactions runs under
--    that table's own RLS, which already lets the editor see the row.
--
--    Policies are permissive (OR'd), so this sits alongside the owner policy
--    from v3 without touching it.

DROP POLICY IF EXISTS "Shared editors manage split details" ON public.split_details;
CREATE POLICY "Shared editors manage split details" ON public.split_details
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
       WHERE t.id = split_details.transaction_id
         AND public.has_account_share(t.account_id, true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
       WHERE t.id = split_details.transaction_id
         AND t.owner_id = split_details.owner_id
         AND public.has_account_share(t.account_id, true)
    )
  );

-- ⚠ PowerSync Sync Rules (dashboard, manual): for shared editors to SEE the
--   owner's split rows on the phone, split_details must be added to the
--   shared-account bucket the same way transactions were in v4. Until then the
--   web (which reads Postgres directly) honors this policy fully, while a
--   phone editing offline replaces splits it may not have downloaded. Web-only
--   split editing for shared rows is the safe interim state.
--   While in the dashboard: v3_1's note about transfers + split_details each
--   appearing TWICE in the deployed rules was never confirmed actioned —
--   check, and delete the duplicates if still present.

-- Verify — expect: one owner policy per table in (1), the trigger in (2),
-- and two policies on split_details:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('auto_records','scheduled_payments','subscriptions','split_details')
--    ORDER BY tablename, policyname;
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.transactions'::regclass
--      AND tgname = 'transactions_owner_id_immutable';
