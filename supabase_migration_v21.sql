-- ============================================================================
-- FinXAI v21 Migration — tags
-- ============================================================================
--
-- WHY: categories answer "what kind of spending was this", never "what was it
-- FOR". The case that prompted this: someone asks you to buy things for them.
-- Those purchases are Groceries, Transport, Shopping — scattered across
-- categories and accounts — and there was no way to pull them back together,
-- total them, or see whether the money they sent back covers it.
--
-- A tag is a free label on a transaction. Repayment is NOT modelled: you tag
-- the money they send back with the same tag, and the tag's net (in − out)
-- reaching zero IS "settled". No status column to fall out of step with the
-- money.
--
-- SHAPE:
--   tags                  one row per label (name, colour, note)
--   transactions.tag_ids  JSON array of tag ids, as TEXT
--
-- Why a column and not a transaction_tags join table: the shared_accounts sync
-- bucket can only filter on columns of the row itself (no joins), so a join
-- table would never reach a shared editor's phone — the exact trap
-- split_details is stuck in (see powersync/sync-rules.yaml). A column on
-- transactions travels with the row everywhere it already goes.
--
-- Why TEXT and not jsonb/text[]: PowerSync stores arrays as JSON strings on the
-- device and the connector uploads them as strings. Into a jsonb column that
-- would become a JSON *string scalar* ("[\"a\"]"), not an array — silently
-- wrong. Same convention as shared_people.accounts. Reports can still cast:
--   WHERE tag_ids::jsonb ? '<tag id>'
--
-- Ids, not names, so renaming a tag never rewrites transactions.
--
-- HOW TO RUN (order matters — a client writing tag_ids before step 1 gets every
-- upload discarded as a permanent 42703 failure):
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync dashboard → Sync Rules → add to the user_data bucket
--      (already in powersync/sync-rules.yaml), then Deploy:
--
--        - SELECT * FROM tags WHERE owner_id::text = bucket.user_id
--
--   3. node scripts/verify-columns.mjs   — must print tags + tag_ids OK
--      node scripts/verify-rls.mjs       — tags must not be anon-readable
--   4. Only then push the client.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,                   -- hex, e.g. '#16a34a'; NULL = default
  note text,                    -- e.g. "Shopping for Aline's wedding"
  archived integer DEFAULT 0,   -- 0/1; hidden from pickers, kept for history
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Deliberately NO unique index on (owner_id, lower(name)), though it looks
-- like the obvious way to stop duplicate tags. The phone's upload connector
-- discards a WHOLE batch (up to 500 queued writes) on any 23xxx error — so the
-- same tag name created offline on the phone and on the web would silently
-- take unrelated transactions down with it. Both clients reuse an existing tag
-- by name before creating one (shared/tags.ts findTagByName); a rare duplicate
-- from two offline devices is a cosmetic problem, a dropped batch is not.

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their tags" ON tags;
CREATE POLICY "Users own their tags" ON tags
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tag_ids text;

COMMENT ON COLUMN transactions.tag_ids IS
  'JSON array of tags.id, stored as text (PowerSync convention). NULL or ''[]'' = untagged.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'tags'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE tags;
  END IF;
END $$;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'transactions' AND column_name = 'tag_ids';
--   SELECT * FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'tags';
