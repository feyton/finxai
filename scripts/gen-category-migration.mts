#!/usr/bin/env node
/**
 * Generates supabase_migration_v23.sql — the one-time rewrite of every stored
 * category to taxonomy v2 — from the app's OWN rules (shared/categories.ts), so
 * the migration and the app cannot disagree.
 *
 * Input: eval/v23-export.local.json (supabase_migration_v23_export.sql). Only its
 * `combos` are used: distinct (category, subcategory, type, direction) values and
 * counts — no names, no amounts — so the result applies to EVERY user without
 * anyone's SMS being read. Rows whose category depends on the SMS wording are
 * handled by text rules inside the SQL itself.
 *
 *   npx tsx scripts/gen-category-migration.mts [export.json] [out.sql]
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {
  CATEGORY_IDS,
  CATEGORY_META,
  type CategoryId,
  matchCategory,
  resolveCat,
  subcategoriesOf,
  typeForCategory,
} from '../shared/categories';

const [inPath = 'eval/v23-export.local.json', outPath = 'supabase_migration_v23.sql'] =
  process.argv.slice(2);

let data: any = JSON.parse(readFileSync(inPath, 'utf8'));
if (data.export) data = data.export;
const combos: any[] = data.combos ?? [];

const q = (v: unknown) =>
  v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;

/**
 * Where one stored combination goes. The concept comes from the stored value;
 * the TYPE may change, because v2 says savings and loans are transfers and a
 * transfer to a person is spending or income by purpose.
 */
function target(c: any): {cat: CategoryId; type: string | null; dir: string | null} {
  const type: string | null = c.transaction_type ?? null;
  const base = matchCategory(c.category);
  if (c.tbl === 'merchant_rules' || c.tbl === 'subcategories' || c.tbl === 'budget_items') {
    // Direction-free: a rule applies either way and is resolved per transaction.
    return {cat: base ?? 'other_spending', type: null, dir: null};
  }
  if (type === 'transfer') {
    const dir = c.transfer_direction ?? null;
    if (c.proven) {
      // Proven own-account pair. Savings/loan wording keeps its idea.
      const k = base ? CATEGORY_META[base].kind : null;
      const cat = k === 'transfer' || k === 'loan' ? resolveCat(c.category, 'transfer', dir) : 'own_transfer';
      return {cat, type: 'transfer', dir};
    }
    // Unproven transfer. v1 wrote 'savings' (or 'transfer') on EVERY transfer it
    // detected, so those labels say nothing: Between My Accounts, then the SMS
    // text rules below decide savings/loan. A real PURPOSE label (family, misc,
    // shopping…) on a transfer to a person is spending or income in v2.
    const generic = !base || ['to_savings', 'from_savings', 'own_transfer'].includes(base) || /^other$/i.test(c.category ?? '');
    if (generic) {
      return {cat: 'own_transfer', type: 'transfer', dir};
    }
    if (typeForCategory(base) === 'transfer') {
      return {cat: resolveCat(c.category, 'transfer', dir), type: 'transfer', dir};
    }
    const newType = dir === 'in' ? 'income' : 'expense';
    return {cat: resolveCat(c.category, newType), type: newType, dir: null};
  }
  // expense / income row whose concept is a transfer or loan → becomes a transfer.
  if (base && typeForCategory(base) === 'transfer' && (type === 'expense' || type === 'income')) {
    const dir = type === 'income' ? 'in' : 'out';
    return {cat: resolveCat(c.category, 'transfer', dir), type: 'transfer', dir};
  }
  return {cat: resolveCat(c.category, type), type, dir: c.transfer_direction ?? null};
}

// v1 subcategory names → v2 names (same idea, renamed). Anything not listed and
// not a v2 built-in is kept only if it is the user's own custom subcategory.
const SUB_RENAME: Record<string, string> = {
  'rent/mortgage': 'Rent',
  'repairs & maintenance': 'Repairs',
  'moto transport': 'Moto',
  'public transport': 'Bus (Tap&Go)',
  'vehicle maintenance': 'Vehicle upkeep',
  'takeout/delivery': 'Takeaway & delivery',
  'coffee & snacks': 'Coffee & snacks',
  'doctor visits': 'Clinic & hospital',
  'dental care': 'Clinic & hospital',
  medication: 'Pharmacy',
  'health insurance': 'Mutuelle & insurance',
  'gym membership': 'Fitness',
  'hair & beauty': 'Hair & beauty',
  'personal products': 'Toiletries',
  clothes: 'Clothes & shoes',
  shoes: 'Clothes & shoes',
  'movies & streaming': 'Streaming',
  'music & concerts': 'Events & outings',
  'video games': 'Hobbies',
  'books & magazines': 'Hobbies',
  'tuition & fees': 'School fees',
  'books & supplies': 'Books & supplies',
  'online courses': 'Courses',
  internet: 'Home internet',
  'trash collection': 'Waste & sanitation',
  devices: 'Electronics',
  software: 'Electronics',
  'produce and vegetables': 'Produce',
  'fresh fruits': 'Produce',
  'meat,poultry,seafood': 'Meat & fish',
  'emergency fund': 'MoKash',
  investments: 'Investments',
};

// ── mapping rows ─────────────────────────────────────────────────────
const MAP_TABLES = ['transactions', 'auto_records', 'split_details', 'merchant_rules', 'subcategories', 'budget_items'];
const rows: string[] = [];
const summary: Record<string, number> = {};
for (const c of combos) {
  if (!MAP_TABLES.includes(c.tbl)) continue;
  const t = target(c);
  rows.push(
    `(${q(c.tbl)}, ${q(c.category)}, ${q(c.transaction_type)}, ${q(c.transfer_direction)}, ${
      c.proven === null || c.proven === undefined ? 'NULL' : c.proven ? 'true' : 'false'
    }, ${q(t.cat)}, ${q(t.type)}, ${q(t.dir)})`,
  );
  if (c.tbl === 'transactions') {
    const k = `${c.transaction_type}${c.proven ? '(proven)' : ''} ${c.category} → ${t.type} ${t.cat}`;
    summary[k] = (summary[k] ?? 0) + Number(c.n);
  }
}

const builtin = CATEGORY_IDS.flatMap(id => subcategoriesOf(id).map(s => `(${q(id)}, ${q(s.name)})`));
const renames = Object.entries(SUB_RENAME).map(([a, b]) => `(${q(a)}, ${q(b)})`);

const sql = `-- ============================================================================
-- FinXAI v23 — rewrite every stored category to taxonomy v2   (ALL users)
-- ============================================================================
-- GENERATED by scripts/gen-category-migration.mts from the app's own rules
-- (shared/categories.ts) — do not hand-edit; regenerate.
-- Generated: ${new Date().toISOString()}   combos: ${combos.length}
--
-- WHY: taxonomy v2 ties every category to the money's direction (no income
-- called Groceries; savings and loans are transfers; a transfer to a person is
-- spending or income by purpose). Rows written before it hold v1 ids/labels,
-- some contradicting their own type. This rewrites them ONCE, for every user,
-- by rule — no AI calls, and nobody's SMS is read by a person.
--
-- SAFETY
--   * Backups of every touched column are taken first (v23_backup_*). Undo is
--     at the bottom.
--   * The script ends in ROLLBACK. RUN IT AS-IS FIRST: it is a dry run that
--     shows the before → after counts. Then change ROLLBACK to COMMIT and run
--     it again.
--   * Idempotent: re-running maps v2 values onto themselves.
--
-- After COMMIT, PowerSync streams the changed rows to every phone.
-- ============================================================================

BEGIN;

-- ── 0. Backups (kept until you drop them) ────────────────────────────────
CREATE TABLE IF NOT EXISTS v23_backup_transactions AS
  SELECT id, category, subcategory, transaction_type, transfer_direction FROM transactions;
CREATE TABLE IF NOT EXISTS v23_backup_auto_records AS
  SELECT id, category, subcategory, transaction_type FROM auto_records;
CREATE TABLE IF NOT EXISTS v23_backup_split_details AS
  SELECT id, category, subcategory FROM split_details;
CREATE TABLE IF NOT EXISTS v23_backup_merchant_rules AS
  SELECT id, category, subcategory FROM merchant_rules;
CREATE TABLE IF NOT EXISTS v23_backup_subcategories AS
  SELECT id, category FROM subcategories;
CREATE TABLE IF NOT EXISTS v23_backup_budget_items AS
  SELECT id, category, subcategory FROM budget_items;

-- ── 1. The mapping, generated from shared/categories.ts ──────────────────
CREATE TEMP TABLE v23_map (
  tbl text, old_cat text, old_type text, old_dir text, proven boolean,
  new_cat text, new_type text, new_dir text
) ON COMMIT DROP;
INSERT INTO v23_map VALUES
${rows.join(',\n')};

CREATE TEMP TABLE v23_builtin (cat text, name text) ON COMMIT DROP;
INSERT INTO v23_builtin VALUES
${builtin.join(',\n')};

CREATE TEMP TABLE v23_sub_rename (old_name text, new_name text) ON COMMIT DROP;
INSERT INTO v23_sub_rename VALUES
${renames.join(',\n')};

-- ── 2. transactions: by stored combination ───────────────────────────────
UPDATE transactions t
   SET category = m.new_cat,
       transaction_type = COALESCE(m.new_type, t.transaction_type),
       transfer_direction = CASE WHEN COALESCE(m.new_type, t.transaction_type) = 'transfer'
                                 THEN COALESCE(m.new_dir, t.transfer_direction) ELSE NULL END
  FROM v23_map m
 WHERE m.tbl = 'transactions'
   AND m.old_cat IS NOT DISTINCT FROM t.category
   AND m.old_type IS NOT DISTINCT FROM t.transaction_type
   AND m.old_dir IS NOT DISTINCT FROM t.transfer_direction
   AND m.proven IS NOT DISTINCT FROM (t.transfer_account_id IS NOT NULL);

-- ── 3. transactions: the SMS wording decides (overrides step 2) ─────────
-- A loan repayment, even when it is deducted from MoKash.
UPDATE transactions SET category = 'loan_repayment', transaction_type = 'transfer',
       transfer_direction = 'out'
 WHERE sms ~* 'repay' AND sms ~* 'loan' AND sms !~* 'repaid to you';
-- EXACT MoKash phrases only. MTN receipts for unrelated payments (Cash Power,
-- merchants) often end in a MoKash promotion, and the dry run showed a looser
-- rule ("deposited"/"withdraw" + any mention of MoKash) moving utility bills into
-- savings. The real templates:
--   deposit, MoKash side : "You have deposited RWF 1000 into Mokash from your…"
--   deposit, MoMo side   : "A transaction of 1000 RWF by Mokash Savings Account…"
--   withdrawal           : "You have transferred RWF 5000 from your Mokash account…"
-- Out of savings.
UPDATE transactions SET category = 'from_savings', transaction_type = 'transfer',
       transfer_direction = COALESCE(transfer_direction, CASE WHEN transaction_type = 'income' THEN 'in' ELSE 'out' END)
 WHERE sms ~* 'from your mokash account'
   AND NOT (sms ~* 'repay' AND sms ~* 'loan');
-- Into savings: MoKash deposits (either leg), Ejo Heza.
UPDATE transactions SET category = 'to_savings', transaction_type = 'transfer',
       transfer_direction = COALESCE(transfer_direction, CASE WHEN transaction_type = 'income' THEN 'in' ELSE 'out' END)
 WHERE (sms ~* 'into mokash' OR sms ~* 'by mokash savings account' OR sms ~* 'ejo ?heza')
   AND NOT (sms ~* 'repay' AND sms ~* 'loan');
-- A row filed as savings whose SMS never mentions any savings product was v1's
-- generic "this is a transfer" marker: own money moving, not savings.
UPDATE transactions SET category = 'own_transfer'
 WHERE category IN ('to_savings', 'from_savings')
   AND COALESCE(sms, '') <> ''
   AND sms !~* 'mokash|ejo ?heza|sacco|ikimina|ibimina|saving|invest';

-- ── 4. auto_records (pending): same, minus direction (re-read at promotion) ─
UPDATE auto_records a
   SET category = m.new_cat,
       transaction_type = COALESCE(m.new_type, a.transaction_type)
  FROM v23_map m
 WHERE m.tbl = 'auto_records'
   AND m.old_cat IS NOT DISTINCT FROM a.category
   AND m.old_type IS NOT DISTINCT FROM a.transaction_type
   AND m.proven IS NOT DISTINCT FROM (a.transfer_account_id IS NOT NULL);
UPDATE auto_records SET category = 'loan_repayment', transaction_type = 'transfer'
 WHERE sms ~* 'repay' AND sms ~* 'loan' AND sms !~* 'repaid to you';
UPDATE auto_records SET category = 'from_savings', transaction_type = 'transfer'
 WHERE sms ~* 'from your mokash account'
   AND NOT (sms ~* 'repay' AND sms ~* 'loan');
UPDATE auto_records SET category = 'to_savings', transaction_type = 'transfer'
 WHERE (sms ~* 'into mokash' OR sms ~* 'by mokash savings account' OR sms ~* 'ejo ?heza')
   AND NOT (sms ~* 'repay' AND sms ~* 'loan');

-- ── 5. split_details: a split takes its parent's (new) direction ─────────
UPDATE split_details s
   SET category = m.new_cat
  FROM v23_map m, transactions t
 WHERE t.id = s.transaction_id AND m.tbl = 'split_details'
   AND m.old_cat IS NOT DISTINCT FROM s.category;
-- …then coerce to the parent's final type: no Groceries part on an income.
UPDATE split_details s SET category = CASE t.transaction_type
         WHEN 'income' THEN CASE WHEN s.category = 'family' THEN 'family_in' ELSE 'other_income' END
         ELSE 'other_spending' END
  FROM transactions t
 WHERE t.id = s.transaction_id
   AND (t.transaction_type = 'income') <> (s.category IN ('salary','business','family_in','refunds','interest','other_income'));

-- ── 6. direction-free tables: rules, custom subcategories, budget lines ──
UPDATE merchant_rules r SET category = m.new_cat
  FROM v23_map m WHERE m.tbl = 'merchant_rules' AND m.old_cat IS NOT DISTINCT FROM r.category;
UPDATE subcategories s SET category = m.new_cat
  FROM v23_map m WHERE m.tbl = 'subcategories' AND m.old_cat IS NOT DISTINCT FROM s.category;
UPDATE budget_items b SET category = m.new_cat
  FROM v23_map m WHERE m.tbl = 'budget_items' AND m.old_cat IS NOT DISTINCT FROM b.category;

-- ── 7. subcategories on rows: rename v1 → v2, keep built-ins and the
--       owner's custom ones, clear the rest ──────────────────────────────
UPDATE transactions t SET subcategory = r.new_name
  FROM v23_sub_rename r WHERE lower(t.subcategory) = r.old_name;
UPDATE transactions t SET subcategory = NULL
 WHERE COALESCE(t.subcategory, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM v23_builtin b WHERE b.cat = t.category AND b.name = t.subcategory)
   AND NOT EXISTS (SELECT 1 FROM subcategories s WHERE s.owner_id = t.owner_id
                    AND lower(s.name) = lower(t.subcategory));
UPDATE split_details d SET subcategory = r.new_name
  FROM v23_sub_rename r WHERE lower(d.subcategory) = r.old_name;
UPDATE split_details d SET subcategory = NULL
 WHERE COALESCE(d.subcategory, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM v23_builtin b WHERE b.cat = d.category AND b.name = d.subcategory)
   AND NOT EXISTS (SELECT 1 FROM subcategories s WHERE s.owner_id = d.owner_id
                    AND lower(s.name) = lower(d.subcategory));
UPDATE auto_records a SET subcategory = r.new_name
  FROM v23_sub_rename r WHERE lower(a.subcategory) = r.old_name;
UPDATE merchant_rules m2 SET subcategory = r.new_name
  FROM v23_sub_rename r WHERE lower(m2.subcategory) = r.old_name;

-- ── 8. What changed (the dry run shows this, then rolls back) ────────────
SELECT 'transactions' AS tbl,
       b.transaction_type || ' ' || COALESCE(b.category, '∅') AS before,
       t.transaction_type || ' ' || COALESCE(t.category, '∅') AS after,
       count(*) AS n
  FROM transactions t JOIN v23_backup_transactions b USING (id)
 WHERE b.category IS DISTINCT FROM t.category OR b.transaction_type IS DISTINCT FROM t.transaction_type
 GROUP BY 1, 2, 3
 ORDER BY n DESC;

ROLLBACK;   -- ← DRY RUN. When the counts above look right, change to: COMMIT;

-- ── UNDO (after a COMMIT), if ever needed ────────────────────────────────
-- UPDATE transactions t SET category = b.category, subcategory = b.subcategory,
--        transaction_type = b.transaction_type, transfer_direction = b.transfer_direction
--   FROM v23_backup_transactions b WHERE b.id = t.id;
-- (same pattern for auto_records, split_details, merchant_rules, subcategories,
--  budget_items from their v23_backup_* tables)
`;

writeFileSync(outPath, sql);
console.log(`wrote ${outPath}: ${rows.length} mapping rows, ${builtin.length} built-in subcategories`);
console.log('transactions by combination (before text rules):');
for (const [k, n] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(5), k);
}
