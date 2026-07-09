import {createClient} from '@/lib/supabase/server';
import {CATS, T, fmtMoney, resolveCat} from '@/lib/theme';
import type {Budget, BudgetItem, Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage() {
  const supabase = await createClient();
  const [budgetsRes, itemsRes, txRes] = await Promise.all([
    supabase.from('budgets').select('*').order('created_at', {ascending: false}),
    supabase.from('budget_items').select('*'),
    supabase
      .from('transactions')
      .select('budget_id,amount,fees,transaction_type')
      .not('budget_id', 'is', null),
  ]);

  const budgets = (budgetsRes.data ?? []) as Budget[];
  const items = (itemsRes.data ?? []) as BudgetItem[];
  const tx = (txRes.data ?? []) as Transaction[];

  const spentByBudget = new Map<string, number>();
  for (const t of tx) {
    if (!t.budget_id || t.transaction_type !== 'expense') continue;
    spentByBudget.set(
      t.budget_id,
      (spentByBudget.get(t.budget_id) ?? 0) + (t.amount ?? 0) + (t.fees ?? 0),
    );
  }

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
            const spent = spentByBudget.get(b.id) ?? 0;
            const total = b.amount ?? 0;
            const pct =
              total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
            const over = spent > total && total > 0;
            const cats = items.filter(i => i.budget_id === b.id);
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
                    {b.name ?? 'Budget'}
                  </div>
                  <div style={{fontSize: 12.5, color: T.text3}}>
                    {b.period ?? ''}
                  </div>
                </div>
                <div style={{fontSize: 13, color: T.text2}}>
                  {fmtMoney(spent)} of {fmtMoney(total)}
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
                  {cats.map(i => {
                    const c = CATS[resolveCat(i.category ?? '')];
                    return (
                      <span
                        key={i.id}
                        className="pill"
                        style={{background: c.color + '22', color: c.color}}>
                        {c.emoji} {c.label}
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
