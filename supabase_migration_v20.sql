-- Migration v20 — actually exclude anon from adjust_account_balance.
--
-- WHY: v19's comment claimed "anon is deliberately excluded", and granting
-- EXECUTE only to `authenticated` looked like it did that. It did not.
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and anon is
-- in PUBLIC, so the explicit grant added nothing that was not already there.
-- Probed after deploying: an anon caller reaches the function and gets 200.
--
-- Nothing was exposed. The function is SECURITY INVOKER, so the UPDATE inside
-- it still runs as the caller and RLS refuses every row anon can't already
-- write — the probe returned NULL, meaning zero rows matched. anon could call
-- it, and could achieve exactly nothing by doing so.
--
-- Revoking anyway, because "reachable but harmless" depends on a second
-- control holding forever. If an accounts policy is ever loosened, this
-- function should not quietly become the way in. Defence in depth is the whole
-- reason the balance write went through a locked statement in the first place.

REVOKE EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric) FROM anon;
GRANT  EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric) TO authenticated;

-- Verify — expect a grant for `authenticated` and none for `anon`/PUBLIC:
--   SELECT grantee, privilege_type
--     FROM information_schema.role_routine_grants
--    WHERE routine_name = 'adjust_account_balance';
--
-- And behaviourally, with the ANON key, this should now be a 404/permission
-- error rather than a 200 returning null:
--   POST /rest/v1/rpc/adjust_account_balance
--     {"p_account_id":"00000000-0000-0000-0000-000000000000","p_delta":0}
