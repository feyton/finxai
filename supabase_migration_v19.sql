-- Migration v19 — an atomic way to nudge a balance.
--
-- WHY: the web adjusts `accounts.available_balance` by SELECTing it and then
-- UPDATEing with the computed value. Between those two statements anything can
-- happen, and something regularly does: the phone syncs a new transaction, a
-- second tab saves an edit, a replay recomputes the account. The later write
-- overwrites the earlier one and a real delta silently disappears — no error,
-- no conflict, just a balance that is quietly wrong.
--
-- Postgres can do the whole thing in one statement, which is race-free because
-- the row is locked for the duration. PostgREST cannot express `col = col + x`,
-- so it needs a function.
--
-- SECURITY INVOKER (the default — deliberately NOT definer): this must run as
-- the caller so RLS still decides who may touch which account. A shared editor
-- with no accounts UPDATE policy gets zero rows affected, exactly as today. A
-- definer function here would hand every caller the ability to rewrite any
-- balance in the database.
--
-- This is the FALLBACK, not the primary path. Where an account has a
-- bank-reported balance to anchor on, both clients recompute by replay
-- (shared/balanceReplay.ts), which is idempotent and self-healing. This exists
-- for manual-only accounts, where no SMS ever states a balance and a delta is
-- the only thing available.

CREATE OR REPLACE FUNCTION public.adjust_account_balance(
  p_account_id uuid,
  p_delta      numeric
)
RETURNS numeric
LANGUAGE sql
AS $$
  UPDATE public.accounts
     SET available_balance = COALESCE(available_balance, 0) + p_delta
   WHERE id = p_account_id
  RETURNING available_balance;
$$;

COMMENT ON FUNCTION public.adjust_account_balance(uuid, numeric) IS
  'Race-free balance adjustment: does the arithmetic in one locked statement instead of a read-then-write. Runs as the CALLER, so RLS still governs access. Fallback for accounts with no bank-reported balance to replay from.';

-- anon is deliberately excluded: there is no signed-out reason to move money.
GRANT EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric) TO authenticated;

-- Verify — expect one row, prosecdef = false (INVOKER, not DEFINER):
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname = 'adjust_account_balance';
--
-- And that it respects RLS — as an ordinary signed-in user, adjusting an
-- account you do not own must affect nothing and return NULL:
--   SELECT public.adjust_account_balance('<someone-elses-account-uuid>', 1);
