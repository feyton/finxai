import {CATS, type CategoryId, fmtAmount, resolveCat} from '@/lib/theme';
import {
  categoryTotals,
  effectiveRows,
  loadDatasets,
  monthStartISO,
  monthlySeries,
  netWorthSeries,
} from '@/lib/insights';
import {BarChart, Donut, HBarChart, LineChart} from '@/components/charts';
import {Card, Legend, Progress, Topbar, WSection} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const d = await loadDatasets(6);
  const s = monthlySeries(d.tx, 6);
  const owned = d.accounts.filter(a => a.owner_id === d.uid);
  const total = owned.reduce((sum, a) => sum + (a.available_balance ?? 0), 0);
  const netWorth = netWorthSeries(total, s);

  // Category donut over the whole range (split-aware)
  const rows = effectiveRows(d.tx, d.splits);
  const catTotals = categoryTotals(rows, monthStartISO(-5));
  const catSegs = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([cat, value]) => ({label: CATS[cat].label, color: CATS[cat].color, value}));
  const totalSpend = [...catTotals.values()].reduce((a, b) => a + b, 0);

  // Merchant analysis (expenses, whole range)
  const merchantTotals = new Map<string, {value: number; cat: CategoryId}>();
  for (const t of d.tx) {
    if (t.transaction_type !== 'expense') continue;
    const name = (t.merchant || t.payee || '').trim();
    if (!name || name.toLowerCase() === 'unknown') continue;
    const cur = merchantTotals.get(name) ?? {value: 0, cat: resolveCat(t.category ?? '')};
    cur.value += t.amount ?? 0;
    merchantTotals.set(name, cur);
  }
  const topMerchants = [...merchantTotals.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 8)
    .map(([label, v]) => ({label, value: v.value, color: CATS[v.cat].color}));

  // Budget vs actual (claimed spending per budget, this period)
  const plannedByBudget = new Map<string, number>();
  for (const it of d.items) {
    plannedByBudget.set(it.budget_id ?? '', (plannedByBudget.get(it.budget_id ?? '') ?? 0) + (it.amount ?? 0));
  }
  const claimedByBudget = new Map<string, number>();
  for (const t of d.tx) {
    if (!t.budget_id || t.transaction_type !== 'expense') continue;
    claimedByBudget.set(t.budget_id, (claimedByBudget.get(t.budget_id) ?? 0) + (t.amount ?? 0));
  }

  return (
    <>
      <Topbar
        title="Analytics"
        sub="Trends, breakdowns and projections across all accounts"
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />

      <div className="grid gap-[18px] px-5 pb-14 pt-5 md:px-7 lg:grid-cols-2">
        <Card>
          <WSection title="Spending trend" sub="Total monthly expenses">
            <LineChart months={s.months} area series={[{label: 'Expenses', color: 'var(--expense)', values: s.expense}]} />
          </WSection>
        </Card>

        <Card>
          <WSection title="Net worth over time" sub="Derived from balances + monthly flows">
            <LineChart months={s.months} area series={[{label: 'Net worth', color: 'var(--accent-700)', values: netWorth}]} />
          </WSection>
        </Card>

        <Card>
          <WSection title="Cash flow" sub="Income vs expenses">
            <BarChart
              months={s.months}
              series={[
                {label: 'Income', color: 'var(--income)', values: s.income},
                {label: 'Expenses', color: 'var(--expense)', values: s.expense},
              ]}
            />
            <div className="mt-2 flex gap-4">
              <Legend color="var(--income)" label="Income" />
              <Legend color="var(--expense)" label="Expenses" />
            </div>
          </WSection>
        </Card>

        <Card>
          <WSection title="Category breakdown" sub={`${fmtAmount(totalSpend)} RWF, last 6 months · split-aware`}>
            {catSegs.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-ink3">No spending in range.</div>
            ) : (
              <div className="flex items-center gap-5">
                <Donut segments={catSegs} size={140} />
                <div className="flex flex-1 flex-col gap-[7px]">
                  {catSegs.map(c => (
                    <div key={c.label} className="flex items-center gap-2 text-[12px]">
                      <span style={{width: 8, height: 8, borderRadius: 8, background: c.color}} />
                      <span className="flex-1 text-ink2">{c.label}</span>
                      <span className="tabnum font-semibold">
                        {totalSpend > 0 ? Math.round((c.value / totalSpend) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </WSection>
        </Card>

        <Card style={{gridColumn: '1 / -1'}}>
          <WSection title="Merchant analysis" sub="Top merchants by total spend, last 6 months">
            {topMerchants.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-ink3">No merchant data yet.</div>
            ) : (
              <HBarChart items={topMerchants} />
            )}
          </WSection>
        </Card>

        <Card style={{gridColumn: '1 / -1'}}>
          <WSection title="Budget vs actual" sub="Claimed spending per budget">
            <div className="flex flex-col gap-2.5">
              {d.budgets.map(b => {
                const planned = plannedByBudget.get(b.id) || b.amount || 0;
                const spent = claimedByBudget.get(b.id) ?? 0;
                const over = planned > 0 && spent > planned;
                return (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="w-[140px] truncate text-[12px] font-medium">{b.name ?? 'Budget'}</div>
                    <div className="flex-1">
                      <Progress value={spent} max={Math.max(planned, 1)} color={over ? 'var(--expense)' : 'var(--accent)'} />
                    </div>
                    <div
                      className="tabnum w-[160px] text-right text-[12px]"
                      style={{color: over ? 'var(--expense)' : 'var(--text-2)'}}>
                      {fmtAmount(spent)} / {fmtAmount(planned)}
                    </div>
                  </div>
                );
              })}
              {d.budgets.length === 0 && (
                <div className="py-6 text-center text-[12px] text-ink3">No budgets yet.</div>
              )}
            </div>
          </WSection>
        </Card>
      </div>
    </>
  );
}
