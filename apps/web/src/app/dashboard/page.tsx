import Link from 'next/link';
import {format} from 'date-fns';
import {createClient} from '@/lib/supabase/server';
import {CATS, type CategoryId, T, fmtAmount, fmtMoney, resolveCat} from '@/lib/theme';
import type {Account, AccountShare, Budget, BudgetItem, Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

// ── helpers ─────────────────────────────────────────────────────────────────
function monthStartISO(offset = 0): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toISOString();
}

interface MonthPoint {
  label: string;
  income: number;
  expense: number;
}

// Paired-column trend, server-rendered SVG. Two series (validated pair),
// 2px gaps, rounded data-ends, recessive grid, native <title> tooltips,
// selective direct labels (current month only).
function TrendChart({points}: {points: MonthPoint[]}) {
  const W = 560;
  const H = 150;
  const padL = 8;
  const padB = 18;
  const padT = 16;
  const max = Math.max(1, ...points.flatMap(p => [p.income, p.expense]));
  const groupW = (W - padL) / points.length;
  const barW = Math.min(16, groupW / 3);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const hOf = (v: number) => H - padB - y(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Money in vs money out, last 6 months">
      {/* recessive grid */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line
          key={f}
          x1={padL}
          x2={W}
          y1={y(max * f)}
          y2={y(max * f)}
          stroke="rgba(148,163,184,0.08)"
          strokeWidth={1}
        />
      ))}
      {points.map((p, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const last = i === points.length - 1;
        return (
          <g key={p.label}>
            <rect
              x={cx - barW - 1}
              y={y(p.income)}
              width={barW}
              height={Math.max(hOf(p.income), p.income > 0 ? 2 : 0)}
              rx={3}
              fill={T.chartIn}>
              <title>{`${p.label} — in ${fmtMoney(p.income)}`}</title>
            </rect>
            <rect
              x={cx + 1}
              y={y(p.expense)}
              width={barW}
              height={Math.max(hOf(p.expense), p.expense > 0 ? 2 : 0)}
              rx={3}
              fill={T.chartOut}>
              <title>{`${p.label} — out ${fmtMoney(p.expense)}`}</title>
            </rect>
            {last && p.income > 0 && (
              <text
                x={cx - barW / 2 - 1}
                y={y(p.income) - 4}
                textAnchor="middle"
                fontSize={9}
                fill={T.text2}>
                {fmtAmount(p.income)}
              </text>
            )}
            {last && p.expense > 0 && (
              <text
                x={cx + barW / 2 + 1}
                y={y(p.expense) - 4}
                textAnchor="middle"
                fontSize={9}
                fill={T.text2}>
                {fmtAmount(p.expense)}
              </text>
            )}
            <text x={cx} y={H - 5} textAnchor="middle" fontSize={9.5} fill={T.text3}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const since6m = monthStartISO(-5);
  const [accountsRes, sharesRes, txRes, splitsRes, budgetsRes, itemsRes] =
    await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('account_shares').select('*'),
      supabase
        .from('transactions')
        .select(
          'id,amount,category,subcategory,transaction_type,date_time,merchant,payee,account_id,budget_id',
        )
        .gte('date_time', since6m)
        .order('date_time', {ascending: false}),
      supabase.from('split_details').select('transaction_id,category,amount'),
      supabase.from('budgets').select('*'),
      supabase.from('budget_items').select('*'),
    ]);

  const accounts = (accountsRes.data ?? []) as Account[];
  const shares = (sharesRes.data ?? []) as AccountShare[];
  const tx = (txRes.data ?? []) as Transaction[];
  const splits = splitsRes.data ?? [];
  const budgets = (budgetsRes.data ?? []) as Budget[];
  const items = (itemsRes.data ?? []) as BudgetItem[];

  const sharedInIds = new Set(
    shares.filter(s => s.shared_with_id === uid && s.status === 'active').map(s => s.account_id),
  );
  const owned = accounts.filter(a => a.owner_id === uid);
  const accName = new Map(accounts.map(a => [a.id, a.name ?? 'Account']));

  // ── stat tiles ──
  const totalBalance = owned.reduce((s, a) => s + (a.available_balance ?? 0), 0);
  const mtd = monthStartISO(0);
  let incomeMtd = 0;
  let spendMtd = 0;
  for (const t of tx) {
    if ((t.date_time ?? '') < mtd) continue;
    if (t.transaction_type === 'income') incomeMtd += t.amount ?? 0;
    else if (t.transaction_type === 'expense') spendMtd += t.amount ?? 0;
  }

  // ── 6-month trend ──
  const points: MonthPoint[] = [];
  for (let off = -5; off <= 0; off++) {
    const s = monthStartISO(off);
    const e = monthStartISO(off + 1);
    let income = 0;
    let expense = 0;
    for (const t of tx) {
      const dt = t.date_time ?? '';
      if (dt < s || dt >= e) continue;
      if (t.transaction_type === 'income') income += t.amount ?? 0;
      else if (t.transaction_type === 'expense') expense += t.amount ?? 0;
    }
    points.push({label: format(new Date(s), 'MMM'), income, expense});
  }

  // ── category breakdown (this month, split-aware) ──
  const splitsByTx = new Map<string, {category: string | null; amount: number | null}[]>();
  for (const s of splits as {transaction_id: string; category: string | null; amount: number | null}[]) {
    const list = splitsByTx.get(s.transaction_id) ?? [];
    list.push(s);
    splitsByTx.set(s.transaction_id, list);
  }
  const catTotals = new Map<CategoryId, {amount: number; count: number}>();
  let catSum = 0;
  for (const t of tx) {
    if (t.transaction_type !== 'expense' || (t.date_time ?? '') < mtd) continue;
    const parts = splitsByTx.get(t.id) ?? [{category: t.category, amount: t.amount}];
    for (const p of parts) {
      const cat = resolveCat(p.category ?? '');
      const cur = catTotals.get(cat) ?? {amount: 0, count: 0};
      cur.amount += p.amount ?? 0;
      cur.count += 1;
      catTotals.set(cat, cur);
      catSum += p.amount ?? 0;
    }
  }
  const catList = [...catTotals.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 7);
  const catMax = catList[0]?.[1].amount ?? 0;

  // ── budgets snapshot (claimed spend / planned) ──
  const itemsByBudget = new Map<string, BudgetItem[]>();
  for (const it of items) {
    const list = itemsByBudget.get(it.budget_id ?? '') ?? [];
    list.push(it);
    itemsByBudget.set(it.budget_id ?? '', list);
  }
  const claimedByBudget = new Map<string, number>();
  for (const t of tx) {
    if (!t.budget_id || t.transaction_type !== 'expense') continue;
    claimedByBudget.set(t.budget_id, (claimedByBudget.get(t.budget_id) ?? 0) + (t.amount ?? 0));
  }
  const budgetSnap = budgets
    .map(b => {
      const planned =
        (itemsByBudget.get(b.id) ?? []).reduce((s, i) => s + (i.amount ?? 0), 0) ||
        (b.amount ?? 0);
      const spent = claimedByBudget.get(b.id) ?? 0;
      return {b, planned, spent, pct: planned > 0 ? spent / planned : 0};
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  const recent = tx.slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-sub">{format(new Date(), 'EEEE, MMM d yyyy')}</div>
        </div>
        <Link href="/dashboard/transactions" className="btn">
          Manage transactions →
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-4 mb-3">
        <div className="card">
          <div className="stat-label">Total balance</div>
          <div className="stat-value">{fmtMoney(totalBalance)}</div>
          <div className="stat-sub">{owned.length} accounts</div>
        </div>
        <div className="card">
          <div className="stat-label">Income · this month</div>
          <div className="stat-value pos">+{fmtAmount(incomeMtd)}</div>
          <div className="stat-sub">RWF</div>
        </div>
        <div className="card">
          <div className="stat-label">Spending · this month</div>
          <div className="stat-value neg">-{fmtAmount(spendMtd)}</div>
          <div className="stat-sub">RWF</div>
        </div>
        <div className="card">
          <div className="stat-label">Net · this month</div>
          <div className={`stat-value ${incomeMtd - spendMtd >= 0 ? 'pos' : 'neg'}`}>
            {incomeMtd - spendMtd >= 0 ? '+' : '-'}
            {fmtAmount(Math.abs(incomeMtd - spendMtd))}
          </div>
          <div className="stat-sub">income − spending</div>
        </div>
      </div>

      <div className="grid grid-2 mb-3">
        {/* Trend */}
        <div className="card">
          <div className="mb-1 flex items-center justify-between">
            <div className="section-title mb-0">Cash flow · 6 months</div>
            <div className="flex items-center gap-3 text-[10.5px] text-ink2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{background: T.chartIn}} />
                Money in
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{background: T.chartOut}} />
                Money out
              </span>
            </div>
          </div>
          <TrendChart points={points} />
        </div>

        {/* Category breakdown */}
        <div className="card">
          <div className="section-title">Spending by category · this month</div>
          {catList.length === 0 ? (
            <div className="empty">No spending yet this month.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {catList.map(([cat, v]) => {
                const meta = CATS[cat];
                const share = catSum > 0 ? Math.round((v.amount / catSum) * 100) : 0;
                return (
                  <div key={cat} title={`${v.count} transactions`}>
                    <div className="flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="truncate text-ink2">
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {fmtAmount(v.amount)}
                        <span className="ml-1.5 text-[10.5px] text-ink3">{share}%</span>
                      </span>
                    </div>
                    <div className="bar !mt-1">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${catMax > 0 ? (v.amount / catMax) * 100 : 0}%`,
                          background: meta.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-2 mb-3">
        {/* Recent transactions */}
        <div className="card !p-0">
          <div className="flex items-center justify-between px-4 pt-3.5">
            <div className="section-title mb-0">Recent activity</div>
            <Link href="/dashboard/transactions" className="text-[11px] text-accent2 hover:underline">
              View all
            </Link>
          </div>
          <div className="table-wrap mt-1">
            <table>
              <tbody>
                {recent.map(t => {
                  const cat = CATS[resolveCat(t.category ?? '')];
                  const isTransfer = t.transaction_type === 'transfer';
                  const isIncome = t.transaction_type === 'income';
                  return (
                    <tr key={t.id}>
                      <td className="w-8 text-center">{cat.emoji}</td>
                      <td>
                        <div className="font-medium text-ink">
                          {t.merchant || t.payee || cat.label}
                        </div>
                        <div className="text-[10.5px] text-ink3">
                          {accName.get(t.account_id ?? '') ?? '—'}
                          {' · '}
                          {t.date_time ? format(new Date(t.date_time), 'MMM d, HH:mm') : '—'}
                        </div>
                      </td>
                      <td
                        className={`row-amt text-right ${
                          isTransfer ? 'muted' : isIncome ? 'pos' : 'neg'
                        }`}>
                        {isTransfer ? '' : isIncome ? '+' : '-'}
                        {fmtAmount(t.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr>
                    <td className="empty">No transactions yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column: budgets + accounts */}
        <div className="flex flex-col gap-3">
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="section-title mb-0">Budgets</div>
              <Link href="/dashboard/budgets" className="text-[11px] text-accent2 hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {budgetSnap.map(({b, planned, spent}) => {
                const over = planned > 0 && spent > planned;
                return (
                  <div key={b.id}>
                    <div className="flex items-baseline justify-between text-[12px]">
                      <span className="truncate text-ink2">{b.name ?? 'Budget'}</span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {fmtAmount(spent)}
                        <span className="text-[10.5px] text-ink3"> / {fmtAmount(planned)}</span>
                      </span>
                    </div>
                    <div className="bar !mt-1">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${planned > 0 ? Math.min(100, (spent / planned) * 100) : 0}%`,
                          background: over ? T.expense : T.accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {budgetSnap.length === 0 && <div className="empty !py-4">No budgets yet.</div>}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div className="section-title mb-0">Accounts</div>
              <Link href="/dashboard/accounts" className="text-[11px] text-accent2 hover:underline">
                View all
              </Link>
            </div>
            <div className="mt-2 flex flex-col">
              {accounts.slice(0, 5).map(a => (
                <div
                  key={a.id}
                  className="flex items-center justify-between border-b border-line py-2 text-[12px] last:border-b-0">
                  <span className="flex items-center gap-2 truncate text-ink2">
                    {a.name}
                    {sharedInIds.has(a.id) && (
                      <span className="pill bg-accent-soft text-accent2">shared</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {fmtMoney(a.available_balance ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
