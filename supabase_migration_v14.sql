-- Migration v14 — loan terms and per-instalment breakdown
--
-- WHY: the debt screens are gaining a real amortisation planner (shared/loan.ts), and
-- neither table can currently hold what it produces.
--
-- `debts` records a rate but not HOW that rate is applied. Flat and reducing interest at
-- the same quoted percentage differ by nearly a factor of two over a year — 12% flat is
-- about 22% reducing — so storing "12" without the method loses the more important half
-- of the fact. Lenders here also commonly add a management fee that the headline rate
-- hides entirely, and there was nowhere to record it.
--
-- `debt_schedules` stores only a total `amount` per instalment. That is enough to show a
-- due date and a figure, but not to show what the payment is MADE of — and once the user
-- edits a row (a diminishing-balance loan where each month differs, or a month with an
-- extra fee), the split can no longer be recomputed from the terms. The breakdown has to
-- be stored alongside it.
--
-- Purely additive. Every column is nullable with no default, so no existing row is
-- rewritten and nothing that reads these tables today changes behaviour. Safe to re-run.

-- ── How the loan is structured ─────────────────────────────────────────────
ALTER TABLE public.debts
  -- 'flat' | 'reducing' | 'equal_principal'. NULL on existing rows, which the app treats
  -- as 'reducing' — the assumption most likely to be right and the least alarming if
  -- wrong, since it understates rather than overstates cost.
  ADD COLUMN IF NOT EXISTS method text,
  -- One-off management fee, as a percentage of principal and/or a flat amount. Both can
  -- apply; lenders quote them either way.
  ADD COLUMN IF NOT EXISTS management_fee_pct real,
  ADD COLUMN IF NOT EXISTS management_fee_flat real,
  -- 'upfront' (all on the first instalment) | 'spread' (divided across the term).
  ADD COLUMN IF NOT EXISTS fee_timing text;

-- ── What each instalment is made of ────────────────────────────────────────
ALTER TABLE public.debt_schedules
  ADD COLUMN IF NOT EXISTS principal real,
  ADD COLUMN IF NOT EXISTS interest real,
  ADD COLUMN IF NOT EXISTS fee real,
  -- True once a row has been hand-edited, so regenerating a schedule after a terms change
  -- can preserve deliberate edits instead of silently overwriting them. That distinction
  -- only exists if it is recorded at write time.
  ADD COLUMN IF NOT EXISTS edited integer;

-- No sync-rule change needed: the user_data bucket selects both tables with SELECT *, so
-- new COLUMNS are picked up automatically. Only new TABLES have to be added by hand.

-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'debts'
--      AND column_name IN ('method','management_fee_pct','management_fee_flat','fee_timing');
--   -- expect 4 rows
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'debt_schedules'
--      AND column_name IN ('principal','interest','fee','edited');
--   -- expect 4 rows
