-- Migration v13 — guarantee owner write access to budgets and budget_items.
--
-- WHY: the web app can now create budgets, and the browser talks to Postgres as
-- the signed-in user, so the insert is subject to RLS. `budgets` and
-- `budget_items` predate every migration in this repo, so their policies are not
-- recorded anywhere here and could not be confirmed by inspection.
--
-- What WAS confirmed: querying both tables with the anon key returns zero rows,
-- so RLS is enabled and enforcing. But "enabled with an owner policy" and
-- "enabled with no policy at all" look identical from outside — an empty result
-- either way — and both tables are currently empty, so no existing row could
-- settle it. Under the second case every insert would fail, and PowerSync would
-- retry the rejected write indefinitely, blocking the whole upload queue behind
-- it. That is not a failure worth risking on an assumption.
--
-- So this states the intended policy outright. It is idempotent: if the right
-- policy already exists it is replaced with an identical one.
--
-- FOR ALL with only USING is deliberate and matches the other tables in v2/v3:
-- when WITH CHECK is omitted, Postgres reuses the USING expression to validate
-- new and updated rows, so `owner_id = auth.uid()` governs both what you can see
-- and what you can write.

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their budgets" ON public.budgets;
CREATE POLICY "Users own their budgets" ON public.budgets
  FOR ALL USING (owner_id = auth.uid());

ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their budget items" ON public.budget_items;
CREATE POLICY "Users own their budget items" ON public.budget_items
  FOR ALL USING (owner_id = auth.uid());

-- `debts` already has "Users own their debts" from v2 (same shape), so the new
-- debt form needs nothing here.

-- Verify — expect one row per table, cmd = ALL:
--   SELECT tablename, policyname, cmd, qual
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('budgets', 'budget_items', 'debts')
--    ORDER BY tablename;
