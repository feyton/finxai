-- ============================================================================
-- FinXAI v9 Migration — per-user AI provider selection
-- ============================================================================
--
-- WHY: FinXAI has been calling TWO providers at once — Gemini 3.5 Flash for SMS
-- classification and Claude Sonnet 4.6 for the Finance Coach. That means two
-- sets of failure modes, two prompt dialects, two price rows, and no way to tell
-- which one is actually better for Rwandan SMS. Consolidating onto one
-- user-chosen provider for BOTH jobs makes the pipeline comparable end to end
-- (see scripts/eval-sms.mts) and halves the surface to reason about.
--
-- The choice is per user and synced rather than per device, so it follows the
-- user across installs and is visible to the web dashboard.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. Add user_settings to the PowerSync sync rules' user_data bucket:
--        - SELECT * FROM user_settings WHERE owner_id = bucket.user_id
--      (New COLUMNS sync automatically because the existing lines are
--      `SELECT *`, but a brand-new TABLE does have to be added to the bucket.)
--   3. Optionally set AI_PROVIDER_DEFAULT ('anthropic' | 'gemini') in the
--      server env — used for users who have not chosen yet.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- NOTE on the primary key: `id` must be the PK, matching every other synced
-- table. PowerSync's local schema always carries an implicit `id`, and
-- SupabaseConnector.uploadData upserts `{...opData, id: op.id}` — a table
-- without an `id` column rejects every write from the app. "One row per user"
-- is expressed as UNIQUE (owner_id) instead.
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- 'anthropic' | 'gemini'. NULL means "not chosen" → server default applies.
  ai_provider text,
  updated_at text,
  UNIQUE (owner_id)
);

-- Reject anything the server doesn't know how to route, rather than silently
-- falling back at request time and leaving the user's choice looking ignored.
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_ai_provider_check;
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_ai_provider_check
  CHECK (ai_provider IS NULL OR ai_provider IN ('anthropic', 'gemini'));

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own settings" ON user_settings;
CREATE POLICY "Users read their own settings" ON user_settings
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users insert their own settings" ON user_settings;
CREATE POLICY "Users insert their own settings" ON user_settings
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own settings" ON user_settings;
CREATE POLICY "Users update their own settings" ON user_settings
  FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users delete their own settings" ON user_settings;
CREATE POLICY "Users delete their own settings" ON user_settings
  FOR DELETE USING (owner_id = auth.uid());

COMMENT ON COLUMN user_settings.ai_provider IS
  'Which AI provider serves BOTH SMS classification and the Finance Coach for this user. NULL = use the server default (AI_PROVIDER_DEFAULT).';
