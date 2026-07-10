import Link from 'next/link';
import {format} from 'date-fns';
import {CATS, fmtAmount, resolveCat} from '@/lib/theme';
import {
  categoryTotals,
  effectiveRows,
  loadDatasets,
  monthStartISO,
  monthlySeries,
  netWorthSeries,
  pctDelta,
} from '@/lib/insights';
import {LineChart, RingGauge, Sparkline} from '@/components/charts';
import {Icon} from '@/components/Icon';
import {
  Card,
  CatChip,
  Insight,
  KpiCard,
  Legend,
  MiniStat,
  Money,
  Progress,
  Topbar,
  WSection,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const d = await loadDatasets(6);
  const s = monthlySeries(d.tx, 6);
  const owned = d.accounts.filter(a => a.owner_id === d.uid);
  const totalBalance = owned.reduce((sum, a) => sum + (a.available_balance ?? 0), 0);
  const netWorth = netWorthSeries(totalBalance, s);

  const n = s.months.length;
  const curIncome = s.income[n - 1];
  const curExpense = s.expense[n - 1];
  const savingsRate = curIncome > 0 ? Math.round(((curIncome - curExpense) / curIncome) * 100) : 0;

  // budgets: planned from items, spent = claimed expenses
  const plannedByBudget = new Map<string, number>();
  for (const it of d.items) {
    plannedByBudget.set(it.budget_id ?? '', (plannedByBudget.get(it.budget_id ?? '') ?? 0) + (it.amount ?? 0));
  }
  const claimedByBudget = new Map<string, number>();
  for (const t of d.tx) {
    if (!t.budget_id || t.transaction_type !== 'expense') continue;
    claimedByBudget.set(t.budget_id, (claimedByBudget.get(t.budget_id) ?? 0) + (t.amount ?? 0));
  }
  const budgetLimit = d.budgets.reduce((sum, b) => sum + (plannedByBudget.get(b.id) || b.amount || 0), 0);
  const budgetSpent = d.budgets.reduce((sum, b) => sum + (claimedByBudget.get(b.id) ?? 0), 0);
  const pctBudget = budgetLimit > 0 ? Math.round((budgetSpent / budgetLimit) * 100) : 0;
  const overBudgets = d.budgets
    .map(b => ({b, planned: plannedByBudget.get(b.id) || b.amount || 0, spent: claimedByBudget.get(b.id) ?? 0}))
    .filter(x => x.planned > 0 && x.spent > x.planned);

  // debts
  const owe = d.debts.filter(x => x.dir === 'borrowed').reduce((sum, x) => sum + (x.outstanding ?? 0), 0);
  const owed = d.debts.filter(x => x.dir === 'lent').reduce((sum, x) => sum + (x.outstanding ?? 0), 0);

  // insights (rule-based, real numbers)
  const rows = effectiveRows(d.tx, d.splits);
  const mtdCats = categoryTotals(rows, monthStartISO(0));
  const prevCats = categoryTotals(
    rows.filter(r => (r.date_time ?? '') < monthStartISO(0)),
    monthStartISO(-1),
  );
  let spikeCat: {cat: string; cur: number; prev: number} | null = null;
  for (const [cat, cur] of mtdCats) {
    const prev = prevCats.get(cat) ?? 0;
    if (prev > 10000 && cur > prev * 1.5 && (!spikeCat || cur - prev > spikeCat.cur - spikeCat.prev)) {
      spikeCat = {cat, cur, prev};
    }
  }

  const accName = new Map(d.accounts.map(a => [a.id, a.name ?? 'Account']));
  const recent = d.tx.slice(0, 7);

  return (
    <>
      <Topbar
        title="Dashboard"
        sub={format(new Date(), 'EEEE, MMMM d yyyy')}
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />

      <div className="flex flex-col gap-5 px-5 pb-14 pt-5 md:px-7">
        {/* AI sync banner */}
        <div
          className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5"
          style={{
            background: 'linear-gradient(135deg, var(--accent-soft), transparent)',
            border: '1px solid rgba(22,163,74,0.2)',
          }}>
          <div
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl"
            style={{background: 'var(--accent-soft)', color: 'var(--accent-700)'}}>
            <Icon name="sparkles" size={22} sw={2.1} />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-semibold">
              AI synced {d.tx.length} transactions from your phone
            </div>
            <div className="text-[12px] text-ink2">
              {d.reviewCount > 0 ? (
                <b style={{color: 'var(--accent-700)'}}>{d.reviewCount} waiting for review on the phone</b>
              ) : (
                'Everything sorted'
              )}
              {' · '}
              {d.syncLabel.replace('Synced from mobile · ', 'last sync ')}
            </div>
          </div>
          <Link href="/dashboard/transactions" className="text-ink3">
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          <KpiCard
            label="Net worth"
            value={totalBalance}
            icon="wallet"
            tint="var(--accent-700)"
            delta={pctDelta(netWorth[n - 1], netWorth[n - 2])}
            deltaGood={netWorth[n - 1] >= netWorth[n - 2]}
            spark={<Sparkline values={netWorth} color="var(--accent-700)" />}
          />
          <KpiCard
            label={`Income (${s.months[n - 1]})`}
            value={curIncome}
            icon="downLeft"
            tint="var(--income)"
            delta={pctDelta(curIncome, s.income[n - 2])}
            deltaGood={curIncome >= s.income[n - 2]}
            spark={<Sparkline values={s.income} color="var(--income)" />}
          />
          <KpiCard
            label={`Expenses (${s.months[n - 1]})`}
            value={curExpense}
            icon="upRight"
            tint="var(--expense)"
            delta={pctDelta(curExpense, s.expense[n - 2])}
            deltaGood={curExpense <= s.expense[n - 2]}
            spark={<Sparkline values={s.expense} color="var(--expense)" />}
          />
          <KpiCard
            label="Savings rate"
            value={savingsRate}
            suffix="%"
            icon="target"
            tint="var(--info)"
            delta={savingsRate >= 20 ? 'Healthy' : 'Watch'}
            deltaGood={savingsRate >= 20}
          />
        </div>

        {/* Cash flow + budget ring */}
        <div className="grid gap-[18px] lg:grid-cols-3">
          <Card style={{gridColumn: 'span 2'}}>
            <WSection
              title="Cash flow"
              sub="Income vs expenses, last 6 months"
              action={
                <Link href="/dashboard/analytics" className="text-[12.5px] font-semibold" style={{color: 'var(--accent)'}}>
                  Full analytics
                </Link>
              }>
              <LineChart
                months={s.months}
                area
                series={[
                  {label: 'Income', color: 'var(--income)', values: s.income},
                  {label: 'Expenses', color: 'var(--expense)', values: s.expense},
                ]}
              />
              <div className="mt-2.5 flex gap-4">
                <Legend color="var(--income)" label="Income" />
                <Legend color="var(--expense)" label="Expenses" />
              </div>
            </WSection>
          </Card>
          <Card>
            <WSection
              title="Budget status"
              sub="Claimed spending this period"
              action={
                <Link href="/dashboard/budgets" className="text-[12.5px] font-semibold" style={{color: 'var(--accent)'}}>
                  Manage
                </Link>
              }>
              <div className="flex items-center gap-4">
                <RingGauge pct={pctBudget} size={84} />
                <div>
                  <div className="tabnum text-[18px] font-bold">
                    {fmtAmount(budgetLimit - budgetSpent)}
                    <span className="ml-1 text-[11px] text-ink3">RWF left</span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink2">of {fmtAmount(budgetLimit)} planned</div>
                </div>
              </div>
              {overBudgets.length > 0 && (
                <div
                  className="mt-3.5 rounded-[11px] p-3 text-[12px] text-ink2"
                  style={{background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)'}}>
                  <b style={{color: 'var(--expense)'}}>{overBudgets[0].b.name}</b> is over by{' '}
                  {fmtAmount(overBudgets[0].spent - overBudgets[0].planned)} RWF.
                </div>
              )}
            </WSection>
          </Card>
        </div>

        {/* Accounts + debts */}
        <div className="grid gap-[18px] lg:grid-cols-2">
          <Card>
            <WSection
              title="Accounts"
              sub={`${owned.length} yours · mobile is the source of truth`}
              action={
                <Link href="/dashboard/accounts" className="text-[12.5px] font-semibold" style={{color: 'var(--accent)'}}>
                  View all
                </Link>
              }>
              <div className="flex flex-col">
                {d.accounts.slice(0, 5).map((a, i, arr) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 py-2"
                    style={{borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none'}}>
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                      style={{background: 'var(--accent-soft)', color: 'var(--accent-700)'}}>
                      <Icon name={a.auto ? 'phone' : 'landmark'} size={15} sw={2.1} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        {a.name}
                        {a.owner_id !== d.uid && (
                          <span className="pill" style={{background: 'var(--accent-soft)', color: 'var(--accent-700)'}}>
                            shared
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-ink3">{a.type ?? 'Account'}</div>
                    </div>
                    <div className="tabnum text-[13px] font-semibold">{fmtAmount(a.available_balance ?? 0)}</div>
                  </div>
                ))}
              </div>
            </WSection>
          </Card>

          <Card>
            <WSection
              title="Debts & loans"
              sub="Outstanding balances"
              action={
                <Link href="/dashboard/debts" className="text-[12.5px] font-semibold" style={{color: 'var(--accent)'}}>
                  Details
                </Link>
              }>
              <div className="mb-3 flex gap-2.5">
                <MiniStat label="You owe" value={owe} color="var(--expense)" />
                <MiniStat label="Owed to you" value={owed} color="var(--income)" />
              </div>
              {d.debts
                .filter(x => x.dir === 'borrowed')
                .slice(0, 2)
                .map(x => (
                  <div key={x.id} className="mb-2.5">
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className="font-medium">{x.party}</span>
                      <span className="text-ink2">
                        {x.next_due ? `Next ${format(new Date(x.next_due), 'MMM d')}` : x.frequency}
                      </span>
                    </div>
                    <Progress
                      value={(x.principal ?? 0) - (x.outstanding ?? 0)}
                      max={x.principal ?? 1}
                      color={x.tint ?? 'var(--info)'}
                    />
                  </div>
                ))}
              {d.debts.length === 0 && <div className="py-4 text-center text-[12px] text-ink3">No debts tracked.</div>}
            </WSection>
          </Card>
        </div>

        {/* Recent + insights */}
        <div className="grid gap-[18px] lg:grid-cols-3">
          <Card style={{gridColumn: 'span 2'}}>
            <WSection
              title="Recent transactions"
              action={
                <Link href="/dashboard/transactions" className="text-[12.5px] font-semibold" style={{color: 'var(--accent)'}}>
                  View all
                </Link>
              }>
              <table className="w-full border-collapse">
                <tbody>
                  {recent.map(t => (
                    <tr key={t.id} style={{borderBottom: '1px solid var(--border)'}}>
                      <td className="w-10 py-2.5 pr-1">
                        <CatChip cat={t.category ?? ''} size={32} />
                      </td>
                      <td className="py-2.5">
                        <div className="text-[13px] font-medium">
                          {t.merchant || t.payee || CATS[resolveCat(t.category ?? '')].label}
                        </div>
                        <div className="text-[11px] text-ink2">
                          {accName.get(t.account_id ?? '') ?? '—'}
                          {' · '}
                          {t.date_time ? format(new Date(t.date_time), 'MMM d, HH:mm') : '—'}
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <Money amount={t.amount ?? 0} type={t.transaction_type} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WSection>
          </Card>

          <Card>
            <WSection title="Insights" sub="Computed from your data">
              <div className="flex flex-col gap-2.5">
                {overBudgets[0] && (
                  <Insight tint="var(--expense)" icon="alert">
                    <b>{overBudgets[0].b.name}</b> is {Math.round((overBudgets[0].spent / overBudgets[0].planned) * 100)}% of
                    its plan — {fmtAmount(overBudgets[0].spent - overBudgets[0].planned)} RWF over.
                  </Insight>
                )}
                {spikeCat && (
                  <Insight tint="var(--warn)" icon="trendUp">
                    <b>{CATS[resolveCat(spikeCat.cat)].label}</b> is at {fmtAmount(spikeCat.cur)} RWF this month vs{' '}
                    {fmtAmount(spikeCat.prev)} last month.
                  </Insight>
                )}
                {d.reviewCount > 0 && (
                  <Insight tint="var(--accent-700)" icon="sparkles">
                    <b>{d.reviewCount}</b> SMS records are waiting for a quick check on your phone.
                  </Insight>
                )}
                {savingsRate > 0 && (
                  <Insight tint="var(--info)" icon="target">
                    You kept <b>{savingsRate}%</b> of this month&apos;s income
                    {savingsRate >= 20 ? ' — healthy.' : ' — below the 20% guideline.'}
                  </Insight>
                )}
                {!overBudgets[0] && !spikeCat && d.reviewCount === 0 && savingsRate <= 0 && (
                  <div className="py-4 text-center text-[12px] text-ink3">Nothing notable this month yet.</div>
                )}
              </div>
            </WSection>
          </Card>
        </div>
      </div>
    </>
  );
}
