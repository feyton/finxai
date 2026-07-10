// Server-side data loading + derived series shared by the admin pages.
import {formatDistanceToNowStrict} from 'date-fns';
import {createClient} from '@/lib/supabase/server';
import {type CategoryId, resolveCat} from '@/lib/theme';
import type {Account, AccountShare, Budget, BudgetItem, Debt, Transaction} from '@/lib/types';

export function monthStartISO(offset = 0): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toISOString();
}

export interface SplitLite {
  transaction_id: string;
  category: string | null;
  amount: number | null;
}

export interface Datasets {
  uid: string;
  userName: string;
  accounts: Account[];
  shares: AccountShare[];
  tx: Transaction[];
  splits: SplitLite[];
  budgets: Budget[];
  items: BudgetItem[];
  debts: Debt[];
  reviewCount: number;
  syncLabel: string;
}

export async function loadDatasets(monthsBack = 6): Promise<Datasets> {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  const since = monthStartISO(-(monthsBack - 1));
  const [accountsRes, sharesRes, txRes, splitsRes, budgetsRes, itemsRes, debtsRes, reviewRes] =
    await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('account_shares').select('*'),
      supabase
        .from('transactions')
        .select('*')
        .gte('date_time', since)
        .order('date_time', {ascending: false})
        .limit(4000),
      supabase.from('split_details').select('transaction_id,category,amount'),
      supabase.from('budgets').select('*'),
      supabase.from('budget_items').select('*'),
      supabase.from('debts').select('*'),
      supabase.from('auto_records').select('id', {count: 'exact', head: true}),
    ]);

  const tx = (txRes.data ?? []) as Transaction[];
  const latest = tx[0]?.created_at ?? tx[0]?.date_time;
  const syncLabel = latest
    ? `Synced from mobile · ${formatDistanceToNowStrict(new Date(latest), {addSuffix: true})}`
    : 'Synced from mobile';

  return {
    uid: user?.id ?? '',
    userName:
      (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      user?.email ||
      'You',
    accounts: (accountsRes.data ?? []) as Account[],
    shares: (sharesRes.data ?? []) as AccountShare[],
    tx,
    splits: (splitsRes.data ?? []) as SplitLite[],
    budgets: (budgetsRes.data ?? []) as Budget[],
    items: (itemsRes.data ?? []) as BudgetItem[],
    debts: (debtsRes.data ?? []) as Debt[],
    reviewCount: reviewRes.count ?? 0,
    syncLabel,
  };
}

export interface MonthlySeries {
  months: string[];
  income: number[];
  expense: number[];
}

export function monthlySeries(tx: Transaction[], monthsBack = 6): MonthlySeries {
  const months: string[] = [];
  const income: number[] = [];
  const expense: number[] = [];
  for (let off = -(monthsBack - 1); off <= 0; off++) {
    const s = monthStartISO(off);
    const e = monthStartISO(off + 1);
    let inc = 0;
    let exp = 0;
    for (const t of tx) {
      const dt = t.date_time ?? '';
      if (dt < s || dt >= e) continue;
      if (t.transaction_type === 'income') inc += t.amount ?? 0;
      else if (t.transaction_type === 'expense') exp += t.amount ?? 0;
    }
    months.push(new Date(s).toLocaleString('en-US', {month: 'short'}));
    income.push(inc);
    expense.push(exp);
  }
  return {months, income, expense};
}

// Walk the current balance backwards through monthly net flows to derive a
// net-worth-over-time series ending at today's total.
export function netWorthSeries(currentTotal: number, s: MonthlySeries): number[] {
  const out = new Array<number>(s.months.length);
  let v = currentTotal;
  for (let i = s.months.length - 1; i >= 0; i--) {
    out[i] = Math.max(0, Math.round(v));
    v -= s.income[i] - s.expense[i];
  }
  return out;
}

// Effective category rows: split parts replace the parent's single category.
export function effectiveRows(
  tx: Transaction[],
  splits: SplitLite[],
): {category: string | null; amount: number | null; date_time: string | null; transaction_type: string | null; budget_id: string | null; merchant: string | null}[] {
  const byTx = new Map<string, SplitLite[]>();
  for (const s of splits) {
    const list = byTx.get(s.transaction_id) ?? [];
    list.push(s);
    byTx.set(s.transaction_id, list);
  }
  return tx.flatMap(t => {
    const parts = byTx.get(t.id);
    if (!parts || parts.length === 0) return [t];
    return parts.map(p => ({...t, category: p.category, amount: p.amount}));
  });
}

export function categoryTotals(
  rows: ReturnType<typeof effectiveRows>,
  sinceISO: string,
  type: 'expense' | 'income' = 'expense',
): Map<CategoryId, number> {
  const map = new Map<CategoryId, number>();
  for (const r of rows) {
    if (r.transaction_type !== type || (r.date_time ?? '') < sinceISO) continue;
    const cat = resolveCat(r.category ?? '');
    map.set(cat, (map.get(cat) ?? 0) + (r.amount ?? 0));
  }
  return map;
}

export function pctDelta(cur: number, prev: number): string | null {
  if (prev <= 0) return null;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}% MoM`;
}
