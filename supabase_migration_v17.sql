-- Migration v17 — merchant→place memory (ROADMAP §2, Tier 2).
--
-- WHY: Tier 3 (a cached GPS fix read when the SMS arrives) shipped first, and
-- it only fires when the phone happens to hold a recent fix at that moment. In
-- practice most transactions carry no position at all, so the map plots a thin
-- sample of real spending and looks broken rather than sparse.
--
-- Tier 2 is the cheap half the roadmap called "what makes pinpoint-the-shop
-- work without draining the battery": once a merchant has been SEEN at a
-- location, later transactions from that same merchant inherit the pin. No GPS,
-- no radio, no permission prompt — it is a lookup against positions already
-- captured.
--
-- That makes provenance load-bearing. "You were here" and "this merchant is
-- usually here" are different claims, and silently merging them would let a
-- guess be read as evidence — the same mistake `parse_source` exists to prevent
-- for classification. Hence one column:
--
--   location_source = 'device'   a real cached fix, taken when the SMS arrived
--                   = 'merchant' inherited from a previous 'device' row
--
-- Inheritance reads ONLY from 'device' rows, never from another inherited one,
-- so a pin is always at most one hop from an actual observation and a wrong
-- position cannot propagate through the history.
--
-- ORDER (ROADMAP §5): this file, then the client. Sync rules need no change —
-- every data query in powersync/sync-rules.yaml is `SELECT *`.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS location_source text;
ALTER TABLE public.auto_records ADD COLUMN IF NOT EXISTS location_source text;

-- Every position that exists today came from a device fix — Tier 2 did not
-- exist to produce anything else — so state that rather than leaving rows
-- ambiguous. Without this the app cannot tell "captured, before v17" from
-- "inherited", and would have to treat real evidence as a guess.
UPDATE public.transactions
   SET location_source = 'device'
 WHERE lat IS NOT NULL AND location_source IS NULL;

UPDATE public.auto_records
   SET location_source = 'device'
 WHERE lat IS NOT NULL AND location_source IS NULL;

COMMENT ON COLUMN public.transactions.location_source IS
  '''device'' = a cached GPS fix taken when the SMS arrived; ''merchant'' = inherited from a previous device-located transaction with the same merchant. Never inherit from an inherited row.';

-- The inheritance lookup is "most recent DEVICE-located row for this merchant",
-- so it is served by owner + merchant restricted to rows that can be a source.
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_device_loc
  ON public.transactions (owner_id, merchant, date_time DESC)
  WHERE lat IS NOT NULL AND location_source = 'device';

-- Verify — expect both columns, and no located row left with a NULL source:
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND column_name = 'location_source';
--   SELECT count(*) FROM public.transactions
--    WHERE lat IS NOT NULL AND location_source IS NULL;   -- expect 0
