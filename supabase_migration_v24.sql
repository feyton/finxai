-- ============================================================================
-- FinXAI v24 Migration — people & places (who your counterparties are)
-- ============================================================================
--
-- WHY: after the v2 category rewrite, what is still filed generically is money
-- to and from PEOPLE ("payment of 6,000 RWF to Moise") — the purpose is not in
-- the SMS, and a merchant rule cannot hold "this is my mother". The user put it
-- plainly: every transfer to a number should not be assumed to be family; the
-- app should learn relatives and children over time.
--
-- A person row says who a counterparty IS (relationship) and how money to and
-- from them should be filed. A matched person files an SMS deterministically —
-- no AI call — which is also the cheapest classification there is.
--
-- Places too (kind = 'merchant'): the shops and services the user pays often —
-- "Hope Bread is the bakery" — so their payments are filed by what the user
-- says the place IS, the same deterministic way.
--
-- SHAPE:
--   people   kind (person | merchant), name, the spellings it appears as in SMS (match_keys), phone
--            numbers (last 9 digits), relationship, category for money out /
--            money in (NULL = still ask), note.
--
-- match_keys and phones are JSON arrays stored as TEXT (PowerSync convention —
-- see v21's tag_ids for why not jsonb). No unique index, as in v21/v22: one
-- 23505 makes the phone's connector discard a whole 500-op upload batch.
--
-- HOW TO RUN (order matters — a client writing people before step 1 gets every
-- upload discarded):
--   1. Run this file in the Supabase SQL Editor.
--   2. PowerSync dashboard → Sync Rules → add to the user_data bucket
--      (already in powersync/sync-rules.yaml), then Deploy:
--
--        - SELECT * FROM people WHERE owner_id::text = bucket.user_id
--
--   3. node scripts/verify-columns.mjs   — must print people OK
--      node scripts/verify-rls.mjs       — people must not be anon-readable
--   4. Only then push the client.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text DEFAULT 'person',   -- person | merchant
  name text NOT NULL,           -- how the user calls them ("Mama", "Hope Bread")
  match_keys text,              -- JSON array of normalised SMS spellings
  phones text,                  -- JSON array of last-9-digit phone numbers
  relationship text,            -- self | spouse | parent | child | sibling | relative
                                -- | friend | landlord | employer | business | other
  category_out text,            -- v2 category id for money TO them, NULL = ask
  category_in text,             -- v2 category id for money FROM them, NULL = ask
  note text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- In case an earlier draft of this file created the table without it.
ALTER TABLE people ADD COLUMN IF NOT EXISTS kind text DEFAULT 'person';

CREATE INDEX IF NOT EXISTS people_owner_idx ON people (owner_id);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own their people" ON people;
CREATE POLICY "Users own their people" ON people
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'people'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE people;
  END IF;
END $$;

-- Verify:
--   SELECT * FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'people';
--   SELECT policyname FROM pg_policies WHERE tablename = 'people';
