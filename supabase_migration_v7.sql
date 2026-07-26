-- ============================================================================
-- FinXAI v7 Migration — server-side AI proxy + usage/cost logging
-- ============================================================================
--
-- WHY: AI API keys (Anthropic + Gemini) moved from "bring your own key,
-- stored on-device" to server-managed keys behind apps/web API routes
-- (/api/ai/classify-sms, /api/ai/chat, /api/ai/test) — removes the biggest
-- piece of new-user friction (nobody should need their own Anthropic/Gemini
-- account just to use FinXAI). Since FinXAI now pays for every AI call
-- instead of the user, this table gives visibility into that cost.
--
-- ai_usage_logs is written by the Next.js server routes only (never by the
-- mobile app directly) — it is not part of the PowerSync schema and does not
-- need a sync-rules bucket. It's read via Supabase directly from server-side
-- code (or the Supabase dashboard) for cost monitoring.
--
-- HOW TO RUN
--   1. Run this file in the Supabase SQL Editor.
--   2. Set ANTHROPIC_API_KEY and GEMINI_API_KEY in apps/web's server env
--      (.env.local for local dev; the production host's env for deployment).
--   3. No PowerSync change needed — this table is server-only.
--
-- Idempotent — safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,             -- 'anthropic' | 'gemini'
  model text NOT NULL,
  purpose text NOT NULL,              -- 'sms_parse' | 'chat'
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_owner_created
  ON ai_usage_logs (owner_id, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Each user can see (and the server logs, on their behalf) their own AI
-- usage — e.g. a future "usage this month" view. No UPDATE/DELETE policy:
-- usage log rows are append-only.
DROP POLICY IF EXISTS "Users read their own AI usage" ON ai_usage_logs;
CREATE POLICY "Users read their own AI usage" ON ai_usage_logs
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Server logs AI usage per user" ON ai_usage_logs;
CREATE POLICY "Server logs AI usage per user" ON ai_usage_logs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
