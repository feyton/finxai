import {format} from 'date-fns';
import {createClient} from '@/lib/supabase/server';
import {CATS, T, fmtMoney, resolveCat, accountTint} from '@/lib/theme';
import type {Account, Budget, BudgetItem, Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default async function OverviewPage() {
  const supabase = await createClient();

  const [accountsRes, monthTxRes, recentTxRes, budgetsRes, itemsRes] =
    await Promise.all([
      supabase.from('accounts').select('*'),
      supabase
        .from('transactions')
        .select('*')
        .gte('date_time', monthStartISO()),
      supabase
        .from('transactions')
        .select('*')
        .order('date_time', {ascending: false})
        .limit(8),
      supabase.from('budgets').select('*').limit(4),
      supabase.from('budget_items').select('*'),
    ]);

  const accounts = (accountsRes.data ?? []) as Account[];
  const monthTx = (monthTxRes.data ?? []) as Transaction[];
  const recentTx = (recentTxRes.data ?? []) as Transaction[];
  const budgets = (budgetsRes.data ?? []) as Budget[];
  const items = (itemsRes.data ?? []) as BudgetItem[];

  const totalBalance = accounts.reduce(
    (s, a) => s + (a.available_balance ?? 0),
    0,
  );
  const income = monthTx
    .filter(t => t.transaction_type === 'income')
    .reduce((s, t) => s + (t.amount ?? 0), 0);
  const expense = monthTx
    .filter(t => t.transaction_type === 'expense')
    .reduce((s, t) => s + (t.amount ?? 0) + (t.fees ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-sub">{format(new Date(), 'MMMM yyyy')}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{marginBottom: 20}}>
        <div className="card">
          <div className="stat-label">Total balance</div>
          <div className="stat-value">{fmtMoney(totalBalance)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Income · this month</div>
          <div className="stat-value pos">+{fmtMoney(income)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Spent · this month</div>
          <div className="stat-value neg">-{fmtMoney(expense)}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-title">Accounts</div>
          {accounts.length === 0 ? (
            <div className="empty">No accounts yet.</div>
          ) : (
            accounts.map(a => {
              const tint = accountTint(a.name ?? '');
              return (
                <div className="row" key={a.id}>
                  <div
                    className="avatar"
                    style={{background: tint + '22', color: tint}}>
                    💳
                  </div>
                  <div className="row-mid">
                    <div className="row-title">{a.name ?? 'Account'}</div>
                    <div className="row-sub">{a.type ?? '—'}</div>
                  </div>
                  <div className="row-amt muted">
                    {fmtMoney(a.available_balance ?? 0)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="section-title">Recent transactions</div>
          {recentTx.length === 0 ? (
            <div className="empty">No transactions yet.</div>
          ) : (
            recentTx.map(t => <TxRow key={t.id} t={t} />)
          )}
        </div>
      </div>

      {budgets.length > 0 && (
        <div className="card" style={{marginTop: 20}}>
          <div className="section-title">Budgets</div>
          <div className="grid grid-2">
            {budgets.map(b => {
              const cats = items
                .filter(i => i.budget_id === b.id)
                .map(i => CATS[resolveCat(i.category ?? '')].label);
              const pct =
                b.amount && b.amount > 0
                  ? Math.min(100, Math.round((0 / b.amount) * 100))
                  : 0;
              return (
                <div key={b.id} style={{padding: '6px 0'}}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14,
                    }}>
                    <span style={{fontWeight: 500}}>{b.name ?? 'Budget'}</span>
                    <span style={{color: T.text3}}>
                      {fmtMoney(b.amount ?? 0)}
                    </span>
                  </div>
                  <div className="bar">
                    <div
                      className="bar-fill"
                      style={{width: `${pct}%`, background: T.accent}}
                    />
                  </div>
                  <div
                    style={{fontSize: 12, color: T.text3, marginTop: 6}}>
                    {cats.length ? cats.join(' · ') : b.period ?? ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function TxRow({t}: {t: Transaction}) {
  const cat = CATS[resolveCat(t.category ?? '')];
  const isTransfer = t.transaction_type === 'transfer';
  const isIncome = t.transaction_type === 'income';
  const cls = isTransfer ? 'muted' : isIncome ? 'pos' : 'neg';
  const sign = isTransfer ? '' : isIncome ? '+' : '-';
  const label = t.merchant || t.payee || t.category || 'Transaction';
  return (
    <div className="row">
      <div className="avatar" style={{background: cat.color + '22'}}>
        {cat.emoji}
      </div>
      <div className="row-mid">
        <div className="row-title">{label}</div>
        <div className="row-sub">
          {t.date_time ? format(new Date(t.date_time), 'd MMM · HH:mm') : ''}
        </div>
      </div>
      <div className={`row-amt ${cls}`}>
        {sign}
        {fmtMoney(t.amount ?? 0)}
      </div>
    </div>
  );
}
