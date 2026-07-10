-- ============================================================================
-- FinXAI v3 Migration — transfers, splits, ignored SMS, budget items, subcats
-- ============================================================================
--
-- WHAT THIS ADDS
--   1. transactions: transfer columns (transfer_account_id/_direction),
--      subcategory, note, budget_id (idempotent — skipped if already present)
--   2. auto_records: transfer_account_id + subcategory
--   3. budget_items: name (e.g. "Cake") + subcategory
--   4. NEW TABLE ignored_sms — failed/user-ignored SMS, never re-parsed
--   5. NEW TABLE transfers — canonical inter-account transfer records
--      (created idempotently in case the v1 schema already has it)
--   6. NEW TABLE split_details — one transaction split across categories
--   7. RLS policies for all of the above
--   8. PowerSync publication registration for the new tables
--
-- HOW TO RUN (ORDER MATTERS — see ROADMAP.md §5)
--   Step 1: Paste this whole file into the Supabase SQL Editor and run it.
--   Step 2: In the PowerSync dashboard, update the Sync Rules (YAML at the
--           bottom of this file, in the comment block) and deploy them.
--   Step 3: Only then install/run the app build that writes these columns —
--           the client uploads will 400 if Supabase doesn't know a column.
--
-- Everything below is idempotent: safe to re-run.
-- ============================================================================

-- ── 1. transactions ─────────────────────────────────────────────────────────
-- transfer_account_id: the user's OTHER account on a transfer (nullable).
-- transfer_direction:  'out' (money left this account) | 'in' (arrived here).
-- subcategory:         fine-grained tag under category (from data.json).
-- budget_id:           claim link — this transaction counts toward a budget.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS budget_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_direction text;

-- Claimed-transaction lookups by budget.
CREATE INDEX IF NOT EXISTS idx_transactions_budget
  ON transactions (budget_id) WHERE budget_id IS NOT NULL;

-- ── 2. auto_records ──────────────────────────────────────────────────────────
ALTER TABLE auto_records
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid;

-- ── 3. budget_items ──────────────────────────────────────────────────────────
-- name: user-facing item label ("Cake", "Drinks") — the category stays the
-- reporting dimension, the name is what the user plans by.
ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS subcategory text;

-- ── 4. ignored_sms ───────────────────────────────────────────────────────────
-- Failed-transaction SMS (auto) and user-ignored SMS (manual). The retriever's
-- dedupe union includes this table, so these bodies are never parsed again.
CREATE TABLE IF NOT EXISTS ignored_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms text NOT NULL,
  sender text,
  reason text NOT NULL DEFAULT 'user',   -- 'failed' | 'user'
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ── 5. transfers ─────────────────────────────────────────────────────────────
-- Canonical record for a manual inter-account transfer. SMS-detected transfers
-- live on transactions (transaction_type='transfer' + transfer_account_id) —
-- each side arrives via its own SMS, so no canonical row is needed there.
CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  amount real NOT NULL,
  date_time text,
  note text,
  currency text DEFAULT 'RWF',
  fees real DEFAULT 0,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ── 6. split_details ─────────────────────────────────────────────────────────
-- Splits one transaction across several categories for accurate accounting.
-- When rows exist for a transaction, reporting uses THEM in place of the
-- parent's single category; the parent's amount stays the source of truth.
CREATE TABLE IF NOT EXISTS split_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount real NOT NULL,
  category text,
  subcategory text,
  note text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_split_details_txn
  ON split_details (transaction_id);

-- ── 7. Row Level Security ────────────────────────────────────────────────────
-- DROP+CREATE keeps this file re-runnable.
ALTER TABLE ignored_sms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their ignored sms" ON ignored_sms;
CREATE POLICY "Users own their ignored sms" ON ignored_sms
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their transfers" ON transfers;
CREATE POLICY "Users own their transfers" ON transfers
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE split_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their split details" ON split_details;
CREATE POLICY "Users own their split details" ON split_details
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ── 8. PowerSync publication ─────────────────────────────────────────────────
-- Add the new tables to the powersync publication (no-op if already present).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ignored_sms', 'transfers', 'split_details'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PowerSync Sync Rules (dashboard → Sync Rules). If your rules already use
-- `SELECT *` per table, the NEW COLUMNS flow automatically — you only need to
-- add the three NEW TABLES. A complete reference ruleset:
--
-- bucket_definitions:
--   user_data:
--     parameters: SELECT request.user_id() as user_id
--     data:
--       - SELECT * FROM accounts WHERE owner_id = bucket.user_id
--       - SELECT * FROM transactions WHERE owner_id = bucket.user_id
--       - SELECT * FROM auto_records WHERE owner_id = bucket.user_id
--       - SELECT * FROM ignored_sms WHERE owner_id = bucket.user_id
--       - SELECT * FROM transfers WHERE owner_id = bucket.user_id
--       - SELECT * FROM split_details WHERE owner_id = bucket.user_id
--       - SELECT * FROM budgets WHERE owner_id = bucket.user_id
--       - SELECT * FROM budget_items WHERE owner_id = bucket.user_id
--       - SELECT * FROM scheduled_payments WHERE owner_id = bucket.user_id
--       - SELECT * FROM subscriptions WHERE owner_id = bucket.user_id
--       - SELECT * FROM debts WHERE owner_id = bucket.user_id
--       - SELECT * FROM debt_schedules WHERE owner_id = bucket.user_id
--       - SELECT * FROM budget_groups WHERE owner_id = bucket.user_id
--       - SELECT * FROM budget_group_contributors WHERE owner_id = bucket.user_id
--       - SELECT * FROM budget_group_expenses WHERE owner_id = bucket.user_id
--       - SELECT * FROM shopping_lists WHERE owner_id = bucket.user_id
--       - SELECT * FROM shopping_items WHERE owner_id = bucket.user_id
--       - SELECT * FROM shared_people WHERE owner_id = bucket.user_id
--       - SELECT * FROM merchant_rules WHERE owner_id = bucket.user_id
--
-- After deploying rules, force a client resync (the app re-downloads buckets
-- automatically on next connect; a fresh install also works).
-- ============================================================================
