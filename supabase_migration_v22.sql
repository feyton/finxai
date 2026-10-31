-- ============================================================================
-- FinXAI v22 Migration — memories (what the classifier knows about you)
-- ============================================================================
--
-- WHY: the classifier saw one SMS at a time with no knowledge of the person
-- behind it. "0788… is my landlord", "Hope Bread is the bakery by the office",
-- "anything to MUKAMANA is my mother" — facts the user knows and the model
-- cannot guess — had nowhere to live. Merchant rules map a name to a category;
-- they cannot hold a reason, a relationship, or a fact about a phone number.
-- So the same questions kept coming back to the review queue.
--
-- A memory is one short sentence in the user's own words. Relevant ones go into
-- the classifier prompt with each SMS (src/tools/memory.ts picks which), the
-- same way Claude Code's memory files ride along with a conversation: plain
-- notes the model reads, not a model of its own.
--
-- SHAPE:
--   memories   one row per fact: text, where it came from, optional subject
--
-- `subject` is the normalised key of the counterparty the fact is about (same
-- key as merchant_rules.pattern), when known — lets the client put facts about
-- THIS counterparty first without parsing sentences. NULL = a general fact.
--
-- No unique index on text, for the same reason v21 has none on tag names: one
-- 23505 makes the phone's connector discard a whole 500-op upload batch.
--
-- HOW TO RUN (order matters — a client writing memories before step 1 gets every
-- upload discarded as a permanent PGRST/42P01 failure):
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync dashboard → Sync Rules → add to the user_data bucket
--      (already in powersync/sync-rules.yaml), then Deploy:
--
--        - SELECT * FROM memories WHERE owner_id::text = bucket.user_id
--
--   3. node scripts/verify-columns.mjs   — must print memories OK
--      node scripts/verify-rls.mjs       — memories must not be anon-readable
--   4. Only then push the client.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,           -- the fact, in the user's words
  subject text,                 -- normalised counterparty key, NULL = general
  source text,                  -- 'user' (typed in Memory) | 'coach' (said in chat)
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_owner_idx ON memories (owner_id);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their memories" ON memories;
CREATE POLICY "Users own their memories" ON memories
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'memories'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE memories;
  END IF;
END $$;

-- Verify:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'memories';
--   SELECT policyname, qual FROM pg_policies WHERE tablename = 'memories';
