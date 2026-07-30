-- ============================================================================
-- FinXAI v10 Migration — remove duplicate SMS transactions
-- ============================================================================
--
-- WHY: measuring the classifier against real data (scripts/eval-sms.mts) turned
-- up 30 duplicates among 263 confirmed SMS transactions — about 11%. The same
-- bank reference is stored twice, and in a few cases the byte-identical SMS body
-- is stored twice. Duplicated expenses inflate spending totals and category
-- charts, and they corrupt the balance replay in src/tools/balance.ts, which
-- sums movements after an anchor.
--
-- HOW IT HAPPENED: dedupe relied on two in-memory sets built from PowerSync
-- queries. Those miss when (a) a run is interrupted between the INSERT and the
-- log_date update, so the message is reprocessed next launch, and (b) TWO
-- DEVICES process the same SMS before either has synced — neither query can see
-- the other's row. (b) is not fixable with local state.
--
-- THE FORWARD FIX ships alongside this: transaction ids are now a pure function
-- of (owner, account, bank ref | body+timestamp) — see src/tools/txnId.ts — so a
-- repeat write targets the SAME primary key and upserts instead of inserting.
-- Note this migration does NOT retrofit those ids onto existing rows: changing
-- a primary key would break every foreign reference (split_details.transaction_id)
-- and force a full client resync. Existing rows keep their random ids; only new
-- writes are deduplicated by construction.
--
-- WHAT THIS DOES: keeps the OLDEST row of each duplicate group (it is the one
-- other records are most likely to reference) and deletes the rest, for one
-- owner at a time. Balances are recomputed by the app afterwards.
--
-- HOW TO RUN
--   1. Run the SELECT in step 1 first and read the counts. Nothing is deleted.
--   2. If the counts look right, run step 2 (wrapped in a transaction).
--   3. In the app, pull-to-refresh on Home (or open each account) to let
--      syncAccountBalance re-anchor and replay the corrected history.
--
-- Idempotent — a second run finds nothing to delete.
-- ============================================================================

-- ── Step 1: INSPECT (read-only) ─────────────────────────────────────────────
-- Duplicate groups keyed on the bank's own reference, which is the strongest
-- identity a message carries and is shared across a bank's multiple alerts for
-- one transaction.
WITH dupes AS (
  SELECT
    owner_id,
    account_id,
    txn_ref,
    count(*)          AS copies,
    min(created_at)   AS first_seen,
    sum(amount)       AS total_amount
  FROM transactions
  WHERE source = 'sms'
    AND txn_ref IS NOT NULL
  GROUP BY owner_id, account_id, txn_ref
  HAVING count(*) > 1
)
SELECT
  owner_id,
  count(*)                      AS duplicate_groups,
  sum(copies - 1)               AS rows_to_delete,
  sum((copies - 1) * (total_amount / copies))::numeric(14,2) AS inflated_amount
FROM dupes
GROUP BY owner_id
ORDER BY rows_to_delete DESC;

-- Same, for messages that carry no reference at all: identical body on the same
-- account. Deliberately requires an identical BODY — two separate purchases of
-- the same amount at the same shop are legitimately distinct.
WITH body_dupes AS (
  SELECT owner_id, account_id, sms, count(*) AS copies
  FROM transactions
  WHERE source = 'sms'
    AND txn_ref IS NULL
    AND sms IS NOT NULL
  GROUP BY owner_id, account_id, sms
  HAVING count(*) > 1
)
SELECT owner_id, count(*) AS duplicate_groups, sum(copies - 1) AS rows_to_delete
FROM body_dupes
GROUP BY owner_id
ORDER BY rows_to_delete DESC;

-- ── Step 2: DELETE ──────────────────────────────────────────────────────────
-- Uncomment and run once the counts above look right.
-- Scope to yourself by setting the owner explicitly; leaving it NULL applies to
-- every user, which is only appropriate if you have reviewed all of them.

-- BEGIN;
--
-- WITH target_owner AS (SELECT NULL::uuid AS id)   -- <- put your owner_id here
--
-- , ranked_by_ref AS (
--   SELECT
--     t.id,
--     row_number() OVER (
--       PARTITION BY t.owner_id, t.account_id, t.txn_ref
--       ORDER BY t.created_at ASC, t.id ASC
--     ) AS rn
--   FROM transactions t, target_owner o
--   WHERE t.source = 'sms'
--     AND t.txn_ref IS NOT NULL
--     AND (o.id IS NULL OR t.owner_id = o.id)
-- )
-- , ranked_by_body AS (
--   SELECT
--     t.id,
--     row_number() OVER (
--       PARTITION BY t.owner_id, t.account_id, t.sms
--       ORDER BY t.created_at ASC, t.id ASC
--     ) AS rn
--   FROM transactions t, target_owner o
--   WHERE t.source = 'sms'
--     AND t.txn_ref IS NULL
--     AND t.sms IS NOT NULL
--     AND (o.id IS NULL OR t.owner_id = o.id)
-- )
-- , doomed AS (
--   SELECT id FROM ranked_by_ref  WHERE rn > 1
--   UNION
--   SELECT id FROM ranked_by_body WHERE rn > 1
-- )
-- -- split_details rows hang off a transaction; drop them with their parent so
-- -- no orphans are left behind.
-- , cleaned_splits AS (
--   DELETE FROM split_details WHERE transaction_id IN (SELECT id FROM doomed)
--   RETURNING 1
-- )
-- DELETE FROM transactions WHERE id IN (SELECT id FROM doomed);
--
-- COMMIT;

-- ── Step 3: VERIFY ──────────────────────────────────────────────────────────
-- Re-run Step 1 — both queries should return no rows.
