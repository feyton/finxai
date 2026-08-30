-- Migration v16 — payment-channel intelligence (ROADMAP §4).
--
-- WHY: the app already knows WHAT you paid and to WHOM, but not HOW — which
-- rail the money took, and the code that identifies the payee on that rail.
-- That last field is what makes "pay this merchant again" possible: MoMoPay
-- resolves a merchant by a short numeric code, send-money by phone number, and
-- both are dialled as a USSD string the user can fire from the app.
--
-- Until now `channel` existed only as a transient field on the parse result and
-- a device-local AsyncStorage map (src/tools/merchantMemory.ts), and `pay_code`
-- had a TypeScript field with no producer anywhere in the codebase. Both are
-- promoted here to synced columns, so the web sees them, a reinstall keeps
-- them, and the learned mapping survives on the merchant rule.
--
-- ORDER (see ROADMAP §5): this file FIRST, then confirm sync rules, then the
-- client schema. The sync rules need NO change — every data query in
-- powersync/sync-rules.yaml is `SELECT *`, so new columns stream down on their
-- own. Only after this migration is applied may the client start WRITING these
-- columns, or every upsert 400s on an unknown column and the connector's
-- permanent-failure path silently discards the batch.
--
-- Nullable and unconstrained on purpose: `channel` is a small vocabulary today
-- ('MoMoPay', 'Send money', 'Receive', 'Bank transfer', 'Cash Power',
-- 'Airtime', 'Bill', 'Other') but it is produced by a model, and a CHECK
-- constraint on a model output turns a new rail into a rejected write that
-- wedges the upload queue. The client owns the vocabulary; see CHANNELS in
-- src/tools/smsParser.ts.

-- The transaction records the rail it actually used (provenance: this specific
-- payment went out this way), which is also what the merchant search aggregates.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS pay_code text;

-- Pending SMS carry it through review so confirming does not lose it — the
-- same mistake that dropped locations on confirm before the promotion path was
-- unified (see src/tools/smsIngest.ts).
ALTER TABLE public.auto_records ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.auto_records ADD COLUMN IF NOT EXISTS pay_code text;

-- The learned mapping, keyed by the same normalised merchant pattern the
-- category learning already uses. This is what a future payment reads to
-- rebuild the USSD string without re-deriving it from message text.
ALTER TABLE public.merchant_rules ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE public.merchant_rules ADD COLUMN IF NOT EXISTS pay_code text;

-- The merchant search screen looks up "how do I normally pay X", so the access
-- pattern is by owner and merchant, restricted to rows that actually carry a
-- code. Partial index: the overwhelming majority of rows have no pay_code
-- (income, transfers, bank narrations), and indexing those wastes write time
-- on every insert for a lookup nobody performs.
CREATE INDEX IF NOT EXISTS idx_transactions_owner_paycode
  ON public.transactions (owner_id, merchant)
  WHERE pay_code IS NOT NULL;

-- Verify — expect 2 rows per table, all `text`, all is_nullable = YES:
--   SELECT table_name, column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND column_name IN ('channel', 'pay_code')
--    ORDER BY table_name, column_name;
