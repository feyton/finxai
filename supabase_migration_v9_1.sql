-- ============================================================================
-- FinXAI v9.1 Migration — corrects user_settings' primary key
-- ============================================================================
--
-- ONLY NEEDED IF you ran the first version of supabase_migration_v9.sql, which
-- created user_settings with `owner_id` as the PRIMARY KEY and no `id` column.
-- (v9.sql has since been corrected, so a fresh environment can skip this file —
-- running it anyway is harmless.)
--
-- WHY IT WAS WRONG: PowerSync's local schema always carries an implicit `id`
-- column, and SupabaseConnector.uploadData upserts `{...op.opData, id: op.id}`.
-- A synced table with no `id` column rejects every write coming from the app,
-- so the provider setting would have appeared to save on-device and then
-- silently failed to sync — with the failed upload retrying and potentially
-- blocking the CRUD queue behind it. Every other synced table in this schema
-- uses `id uuid PRIMARY KEY` with `owner_id` as a plain column.
--
-- SAFE TO DROP AND RECREATE: nothing writes to this table yet — the Settings UI
-- that populates it ships in the same release as this migration, so there is no
-- data to preserve. The guard below still refuses to destroy a non-empty table,
-- in case this is run later than intended.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. Make sure the PowerSync sync rules' user_data bucket contains:
--        - SELECT * FROM user_settings WHERE owner_id = bucket.user_id
--
-- Idempotent — safe to re-run.
-- ============================================================================

DO $$
DECLARE
  row_count bigint;
  has_id boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_settings'
  ) THEN
    RAISE NOTICE 'user_settings does not exist — run supabase_migration_v9.sql instead.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'id'
  ) INTO has_id;

  IF has_id THEN
    RAISE NOTICE 'user_settings already has an id column — nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM user_settings' INTO row_count;
  IF row_count > 0 THEN
    RAISE EXCEPTION
      'user_settings has % row(s); refusing to recreate. Migrate the data by hand.', row_count;
  END IF;

  RAISE NOTICE 'Recreating user_settings with id as the primary key.';
  DROP TABLE user_settings;

  CREATE TABLE user_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    ai_provider text,
    updated_at text,
    UNIQUE (owner_id)
  );

  ALTER TABLE user_settings
    ADD CONSTRAINT user_settings_ai_provider_check
    CHECK (ai_provider IS NULL OR ai_provider IN ('anthropic', 'gemini'));

  ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users read their own settings" ON user_settings
    FOR SELECT USING (owner_id = auth.uid());
  CREATE POLICY "Users insert their own settings" ON user_settings
    FOR INSERT WITH CHECK (owner_id = auth.uid());
  CREATE POLICY "Users update their own settings" ON user_settings
    FOR UPDATE USING (owner_id = auth.uid());
  CREATE POLICY "Users delete their own settings" ON user_settings
    FOR DELETE USING (owner_id = auth.uid());
END $$;

COMMENT ON COLUMN user_settings.ai_provider IS
  'Which AI provider serves BOTH SMS classification and the Finance Coach for this user. NULL = use the server default (AI_PROVIDER_DEFAULT).';
