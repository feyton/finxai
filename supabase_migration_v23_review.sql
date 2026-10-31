-- ============================================================================
-- FinXAI v23 — REVIEW export (read-only). Run AFTER supabase_migration_v23.sql
-- has been COMMITTED.
-- ============================================================================
--
-- The migration files everything it can decide by rule. What is left here is
-- what a rule could only file generically — a person reads these and decides:
--   * transfers never proven to be between the owner's own accounts that ended
--     as "Between My Accounts" (v1 called every transfer "savings"), and
--   * anything in Other Spending / Other Income.
-- Both users of the app (with their permission) — owner email included so the
-- answers can be checked per person.
--
-- HOW TO RUN: Supabase SQL Editor → copy the single result cell → save as
--   E:\finxai\eval\v23-review.local.json   (gitignored: real names and SMS)
-- ============================================================================

SELECT coalesce(json_agg(r ORDER BY r.owner, r.date_time DESC), '[]'::json) AS review
  FROM (
    SELECT t.id, u.email AS owner, t.date_time, t.amount, t.transaction_type,
           t.transfer_direction, t.category, t.subcategory, t.merchant, t.payee,
           t.note, a.name AS account, left(t.sms, 240) AS sms
      FROM transactions t
      LEFT JOIN auth.users u ON u.id = t.owner_id
      LEFT JOIN accounts a ON a.id = t.account_id
     WHERE (t.transaction_type = 'transfer' AND t.transfer_account_id IS NULL
            AND t.category = 'own_transfer')
        OR t.category IN ('other_spending', 'other_income')
  ) r;
