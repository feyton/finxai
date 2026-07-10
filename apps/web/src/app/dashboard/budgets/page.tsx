import {createClient} from '@/lib/supabase/server';
import {CATS, T, fmtMoney, resolveCat} from '@/lib/theme';
import type {Budget, BudgetItem, SplitDetail, Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

const EVENT_EMOJI: Record<string, string> = {
  category: '📊',
  shared: '🏠',
  party: '🎉',
};

// Mirrors the mobile app's computeBudgetSpend (BudgetScreen.tsx):
// claimed rows always count; CATEGORY budgets also auto-match unclaimed
// expenses in the period by item category. Split parts replace the parent.
function computeSpend(
  b: Budget,
  items: BudgetItem[],
  rows: {
    budget_id: string | null;
    date_time: string | null;
    transaction_type: string | null;
    category: string | null;
    amount: number | null;
  }[],
) {
  const isCategoryBudget = !b.event || b.event === '' || b.event === 'category';
  let winStart: string;
  let winEnd: string;
  if (b.recurring) {
    const d = new Date();
    winStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    winEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
  } else {
    winStart = b.start_date ?? '';
    winEnd = b.end_date ?? '9999';
  }
  const itemCats = new Set(items.map(it => resolveCat(it.category ?? '')));

  let spent = 0;
  let contributions = 0;
  for (const r of rows) {
    if (r.budget_id === b.id) {
      if (r.transaction_type === 'income') contributions += r.amount ?? 0;
      else spent += r.amount ?? 0;
      continue;
    }
    if (
      isCategoryBudget &&
      !r.budget_id &&
      r.transaction_type === 'expense' &&
      (r.date_time ?? '') >= winStart &&
      (r.date_time ?? '') <= winEnd &&
      itemCats.has(resolveCat(r.category ?? ''))
    ) {
      spent += r.amount ?? 0;
    }
  }
  return {spent, contributions};
}

export default async function BudgetsPage() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const [budgetsRes, itemsRes, txRes, splitsRes] = await Promise.all([
    supabase.from('budgets').select('*').order('created_at', {ascending: false}),
    supabase.from('budget_items').select('*'),
    supabase
      .from('transactions')
      .select('id,budget_id,amount,transaction_type,category,date_time')
      .in('transaction_type', ['expense', 'income'])
      .gte('date_time', since),
    supabase.from('split_details').select('transaction_id,category,amount'),
  ]);

  const budgets = (budgetsRes.data ?? []) as Budget[];
  const items = (itemsRes.data ?? []) as BudgetItem[];
  const tx = (txRes.data ?? []) as Transaction[];
  const splits = (splitsRes.data ?? []) as Pick<
    SplitDetail,
    'transaction_id' | 'category' | 'amount'
  >[];

  // Effective category rows: split parts replace the parent's single category.
  const splitsByTx = new Map<string, typeof splits>();
  for (const s of splits) {
    const list = splitsByTx.get(s.transaction_id) ?? [];
    list.push(s);
    splitsByTx.set(s.transaction_id, list);
  }
  const rows = tx.flatMap(t => {
    const parts = splitsByTx.get(t.id);
    if (!parts || parts.length === 0) return [t];
    return parts.map(p => ({...t, category: p.category, amount: p.amount}));
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Budgets</div>
          <div className="page-sub">{budgets.length} active</div>
        </div>
      </div>

      {budgets.length === 0 ? (
        <div className="card">
          <div className="empty">No budgets yet.</div>
        </div>
      ) : (
        <div className="grid grid-2">
          {budgets.map(b => {
            const bItems = items.filter(i => i.budget_id === b.id);
            const total =
              bItems.reduce((s, i) => s + (i.amount ?? 0), 0) || (b.amount ?? 0);
            const {spent, contributions} = computeSpend(b, bItems, rows);
            const pct =
              total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
            const over = spent > total && total > 0;
            const emoji = EVENT_EMOJI[b.event ?? 'category'] ?? '📊';
            return (
              <div className="card" key={b.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 4,
                  }}>
                  <div style={{fontWeight: 600, fontSize: 15.5}}>
                    {emoji} {b.name ?? 'Budget'}
                  </div>
                  <div style={{fontSize: 12.5, color: T.text3}}>
                    {b.recurring ? b.period ?? '' : 'one-off'}
                  </div>
                </div>
                <div style={{fontSize: 13, color: T.text2}}>
                  {fmtMoney(spent)} of {fmtMoney(total)}
                  {contributions > 0 && (
                    <span style={{color: T.income, marginLeft: 8}}>
                      +{fmtMoney(contributions)} contributed
                    </span>
                  )}
                </div>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${pct}%`,
                      background: over ? T.expense : T.accent,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 14,
                  }}>
                  {bItems.map(i => {
                    const c = CATS[resolveCat(i.category ?? '')];
                    return (
                      <span
                        key={i.id}
                        className="pill"
                        style={{background: c.color + '22', color: c.color}}
                        title={`${c.label}${i.subcategory ? ` · ${i.subcategory}` : ''} — ${fmtMoney(i.amount ?? 0)}`}>
                        {c.emoji} {i.name || i.subcategory || c.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
