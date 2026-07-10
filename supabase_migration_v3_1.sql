-- ============================================================================
-- FinXAI v3.1 Migration — user-created subcategories
-- ============================================================================
--
-- Adds ONE new table: subcategories (custom subcategories the user creates in
-- Manage Categories; pickers merge them with the built-ins from data.json).
--
-- HOW TO RUN (same order as v3):
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync dashboard → Sync Rules → add ONE line to the user_data
--      bucket (new TABLES are never picked up automatically):
--
--        - SELECT * FROM subcategories WHERE owner_id::text = bucket.user_id
--
--      (While in there: transfers + split_details each appear twice in the
--       currently deployed rules — delete the duplicates.)
--   3. Then install the app build that writes this table.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,       -- CategoryId: 'food', 'transport', …
  name text NOT NULL,
  icon text DEFAULT '🏷️',
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (owner_id, category, name)
);

ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their subcategories" ON subcategories;
CREATE POLICY "Users own their subcategories" ON subcategories
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'subcategories'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE subcategories;
  END IF;
END $$;
