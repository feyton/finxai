-- ============================================================================
-- FinXAI v23 — EXPORT for the taxonomy-v2 rewrite (read-only, changes nothing)
-- ============================================================================
--
-- Taxonomy v2 (shared/categories.ts) ties every category to a direction. The
-- one-time rewrite of existing rows (supabase_migration_v23.sql) is GENERATED
-- from this export, using the app's own resolveCat — so the migration and the
-- app cannot disagree, and no AI calls are made.
--
-- It returns ONE cell of JSON:
--   combos     every distinct (category, subcategory, type, direction) stored in
--              the six category-bearing tables, with counts. No names, no amounts.
--   review     YOUR rows whose category depends on the SMS WORDS, not a rule:
--              every transfer (v1 wrote "savings" for every transfer it detected,
--              so the label says nothing), and every row labelled savings or debt
--              (into vs out of MoKash, loan vs savings is stated in the text).
--   me_found   1 if the email below matched an account. 0 = fix the email.
--
-- HOW TO RUN
--   1. Put your FinXAI login email on the line marked below.
--   2. Run in the Supabase SQL Editor.
--   3. Click the single result cell, copy it, and save it as
--        E:\finxai\eval\v23-export.local.json
--      (eval/*.local.json is gitignored — it holds real names and SMS text.)
-- ============================================================================

WITH me AS (
  SELECT id FROM auth.users
  WHERE email = 'YOUR_LOGIN_EMAIL'          -- <── put your login email here
)
SELECT json_build_object(
  'exported_at', now(),
  'combos', (
    SELECT coalesce(json_agg(c ORDER BY c.tbl, c.n DESC), '[]'::json) FROM (
      SELECT 'transactions'::text AS tbl, category, subcategory, transaction_type,
             transfer_direction, (transfer_account_id IS NOT NULL) AS proven, count(*) AS n
        FROM transactions GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'auto_records', category, subcategory, transaction_type,
             NULL::text, (transfer_account_id IS NOT NULL), count(*)
        FROM auto_records GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      -- A split's direction is its parent transaction's.
      SELECT 'split_details', s.category, s.subcategory, t.transaction_type,
             t.transfer_direction, NULL::boolean, count(*)
        FROM split_details s LEFT JOIN transactions t ON t.id = s.transaction_id
       GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'merchant_rules', category, subcategory, NULL::text, NULL::text, NULL::boolean, count(*)
        FROM merchant_rules GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'subcategories', category, name, NULL::text, NULL::text, NULL::boolean, count(*)
        FROM subcategories GROUP BY 1, 2, 3, 4, 5, 6
      UNION ALL
      SELECT 'budget_items', category, subcategory, NULL::text, NULL::text, NULL::boolean, count(*)
        FROM budget_items GROUP BY 1, 2, 3, 4, 5, 6
    ) c
  ),
  'review', (
    SELECT coalesce(json_agg(a ORDER BY a.date_time DESC), '[]'::json) FROM (
      SELECT t.id, t.date_time, t.amount, t.transaction_type, t.transfer_direction,
             (t.transfer_account_id IS NOT NULL) AS proven, t.category, t.subcategory,
             t.merchant, t.payee, t.note, a.name AS account, left(t.sms, 220) AS sms
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.owner_id = (SELECT id FROM me)
         AND (t.transaction_type = 'transfer'
              OR t.category ILIKE '%saving%'
              OR t.category ILIKE '%debt%'
              OR t.category ILIKE '%loan%')
    ) a
  ),
  'me_found', (SELECT count(*) FROM me),
  'my_rows', (SELECT count(*) FROM transactions WHERE owner_id = (SELECT id FROM me))
) AS export;
