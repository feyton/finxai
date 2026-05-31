-- FinXAI v2 Migration — Run this in Supabase SQL Editor
-- Adds new tables and columns for the AI-powered overhaul

-- ── Add new columns to existing tables ────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS sender text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS confidence real DEFAULT 1.0;

ALTER TABLE auto_records
  ADD COLUMN IF NOT EXISTS sender text,
  ADD COLUMN IF NOT EXISTS merchant text,
  ADD COLUMN IF NOT EXISTS confidence real DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'sms';

-- ── New tables ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dir text NOT NULL,             -- 'borrowed' | 'lent'
  party text NOT NULL,
  sub text,
  principal real NOT NULL,
  outstanding real NOT NULL,
  rate real DEFAULT 0,
  frequency text NOT NULL,       -- 'Weekly' | 'Monthly' | 'One-off'
  installment real,
  next_due text,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  term integer DEFAULT 1,
  paid integer DEFAULT 0,
  tint text,
  icon text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS debt_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  n integer NOT NULL,
  due_date text NOT NULL,
  amount real NOT NULL,
  status text NOT NULL DEFAULT 'upcoming', -- 'paid' | 'due' | 'upcoming'
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text,
  type text NOT NULL,            -- 'party' | 'shared' | 'goal'
  tint text,
  target real NOT NULL,
  spent real DEFAULT 0,
  date_label text,
  recurring integer DEFAULT 0,
  frequency text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_group_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES budget_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  initials text,
  tint text,
  amount real DEFAULT 0,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budget_group_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES budget_groups(id) ON DELETE CASCADE,
  merchant text,
  category text,
  amount real NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  shared integer DEFAULT 0,
  shared_with text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  text text NOT NULL,
  quantity text DEFAULT '1',
  estimated_cost real DEFAULT 0,
  done integer DEFAULT 0,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  initials text,
  tint text,
  access text DEFAULT 'View only',
  accounts text DEFAULT '[]',    -- JSON array of account UUIDs
  status text DEFAULT 'pending',
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ── Row Level Security ─────────────────────────────────────────

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their debts" ON debts FOR ALL USING (owner_id = auth.uid());

ALTER TABLE debt_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their debt schedules" ON debt_schedules FOR ALL USING (owner_id = auth.uid());

ALTER TABLE budget_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their budget groups" ON budget_groups FOR ALL USING (owner_id = auth.uid());

ALTER TABLE budget_group_contributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their contributors" ON budget_group_contributors FOR ALL USING (owner_id = auth.uid());

ALTER TABLE budget_group_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their group expenses" ON budget_group_expenses FOR ALL USING (owner_id = auth.uid());

ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their shopping lists" ON shopping_lists FOR ALL USING (owner_id = auth.uid());

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their shopping items" ON shopping_items FOR ALL USING (owner_id = auth.uid());

ALTER TABLE shared_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their shared people" ON shared_people FOR ALL USING (owner_id = auth.uid());

-- ── Merchant rules (AI learning) ──────────────────────────────

CREATE TABLE IF NOT EXISTS merchant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,             -- lowercase, space-collapsed merchant name
  category text NOT NULL,            -- CategoryId user assigned
  correction_count integer DEFAULT 0,
  confirmation_count integer DEFAULT 0,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (owner_id, pattern)
);

ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their merchant rules" ON merchant_rules FOR ALL USING (owner_id = auth.uid());

-- ── PowerSync publication (add new tables) ─────────────────────
-- If you have a PowerSync publication already, add the new tables:
-- ALTER PUBLICATION powersync ADD TABLE debts, debt_schedules, budget_groups,
--   budget_group_contributors, budget_group_expenses,
--   shopping_lists, shopping_items, shared_people, merchant_rules;
