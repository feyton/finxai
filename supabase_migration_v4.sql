-- ============================================================================
-- FinXAI v4 Migration — cross-user account sharing
-- ============================================================================
--
-- WHAT THIS ADDS
--   account_shares: "share my Bank of Kigali account with my wife".
--   * The OWNER creates a share by email. A trigger resolves the email to a
--     user id immediately (if she already signed in once) or on her first
--     sign-in (auth.users trigger) — no accept step needed.
--   * The invitee gets READ access to the account + its transactions
--     (access='view') or read + reclassify/notes (access='edit').
--   * SMS parsing is unaffected: only the OWNER's device receives the bank's
--     SMS, and the app's retriever only processes accounts it owns.
--   * Revoking = deleting the share row; PowerSync then removes the account
--     and its transactions from the invitee's devices automatically.
--
-- HOW TO RUN (same order as always)
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync dashboard → Sync Rules → apply the YAML at the bottom
--      (one new bucket definition + two lines in user_data).
--   3. Then install the app build that uses account_shares.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,                      -- stored lowercase
  shared_with_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  access text NOT NULL DEFAULT 'view',              -- 'view' | 'edit'
  status text NOT NULL DEFAULT 'pending',           -- 'pending' | 'active'
  created_at timestamptz DEFAULT now(),
  UNIQUE (account_id, invitee_email)
);

CREATE INDEX IF NOT EXISTS idx_account_shares_invitee
  ON account_shares (shared_with_id) WHERE shared_with_id IS NOT NULL;

-- ── Auto-link the invitee ───────────────────────────────────────────────────
-- On share insert: if a user with that email already exists, activate now.
CREATE OR REPLACE FUNCTION public.link_account_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.invitee_email := lower(trim(NEW.invitee_email));
  IF NEW.shared_with_id IS NULL THEN
    SELECT u.id INTO NEW.shared_with_id
    FROM auth.users u
    WHERE lower(u.email) = NEW.invitee_email
    LIMIT 1;
  END IF;
  IF NEW.shared_with_id IS NOT NULL THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS account_shares_link ON account_shares;
CREATE TRIGGER account_shares_link
  BEFORE INSERT ON account_shares
  FOR EACH ROW EXECUTE FUNCTION public.link_account_share();

-- On first sign-in of the invitee: activate any pending shares to her email.
CREATE OR REPLACE FUNCTION public.link_pending_shares_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.account_shares
     SET shared_with_id = NEW.id, status = 'active'
   WHERE shared_with_id IS NULL
     AND invitee_email = lower(NEW.email);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_shares ON auth.users;
CREATE TRIGGER on_auth_user_created_link_shares
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_pending_shares_for_new_user();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- RLS policies must NOT reference each other's tables directly: a policy on
-- accounts querying account_shares whose policies query accounts again makes
-- Postgres raise 42P17 "infinite recursion detected in policy". The standard
-- fix: cross-table checks live in SECURITY DEFINER helpers — they run as the
-- function owner, RLS does not apply inside them, so the cycle is broken.

CREATE OR REPLACE FUNCTION public.user_owns_account(aid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = aid AND a.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_account_share(aid uuid, need_edit boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_shares s
    WHERE s.account_id = aid
      AND s.shared_with_id = auth.uid()
      AND s.status = 'active'
      AND (NOT need_edit OR s.access = 'edit')
  );
$$;

ALTER TABLE account_shares ENABLE ROW LEVEL SECURITY;

-- Owner manages shares of accounts they actually own.
DROP POLICY IF EXISTS "Owners manage their shares" ON account_shares;
CREATE POLICY "Owners manage their shares" ON account_shares
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND public.user_owns_account(account_id));

-- Invitee can see shares addressed to them.
DROP POLICY IF EXISTS "Invitees see their shares" ON account_shares;
CREATE POLICY "Invitees see their shares" ON account_shares
  FOR SELECT USING (shared_with_id = auth.uid());

-- Shared visibility on the data itself (additive to the owner policies).
DROP POLICY IF EXISTS "Shared users read accounts" ON accounts;
CREATE POLICY "Shared users read accounts" ON accounts
  FOR SELECT USING (public.has_account_share(id));

DROP POLICY IF EXISTS "Shared users read transactions" ON transactions;
CREATE POLICY "Shared users read transactions" ON transactions
  FOR SELECT USING (public.has_account_share(account_id));

-- access='edit' → the invitee may reclassify / annotate (UPDATE only; they
-- can never insert into or delete from someone else's account).
DROP POLICY IF EXISTS "Shared editors update transactions" ON transactions;
CREATE POLICY "Shared editors update transactions" ON transactions
  FOR UPDATE
  USING (public.has_account_share(account_id, true))
  WITH CHECK (public.has_account_share(account_id, true));

-- ── PowerSync publication ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'account_shares'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE account_shares;
  END IF;
END $$;

-- ============================================================================
-- PowerSync Sync Rules — apply in the dashboard:
--
-- 1. ADD these two lines inside the existing `user_data` bucket's data list
--    (both directions of share metadata):
--
--        - SELECT * FROM account_shares WHERE owner_id::text = bucket.user_id
--        - SELECT * FROM account_shares WHERE shared_with_id::text = bucket.user_id
--
-- 2. ADD a NEW bucket definition (same indentation level as user_data):
--
--    shared_accounts:
--      parameters: SELECT account_id FROM account_shares WHERE shared_with_id::text = token_parameters.user_id AND status = 'active'
--      data:
--        - SELECT * FROM accounts WHERE id = bucket.account_id
--        - SELECT * FROM transactions WHERE account_id = bucket.account_id
--
-- Notes:
-- * split_details of shared transactions are NOT synced in v1 (the invitee
--   sees the parent transaction with its primary category).
-- * Revoking a share (deleting the row) removes the bucket, and PowerSync
--   deletes the shared account + transactions from the invitee's device.
-- ============================================================================
