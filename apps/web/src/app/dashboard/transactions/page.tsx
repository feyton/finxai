import {format} from 'date-fns';
import {createClient} from '@/lib/supabase/server';
import {CATS, T, fmtMoney, resolveCat} from '@/lib/theme';
import type {Account, Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const supabase = await createClient();
  const [txRes, accRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .order('date_time', {ascending: false})
      .limit(200),
    supabase.from('accounts').select('id,name'),
  ]);

  const tx = (txRes.data ?? []) as Transaction[];
  const accounts = (accRes.data ?? []) as Pick<Account, 'id' | 'name'>[];
  const accName = new Map(accounts.map(a => [a.id, a.name ?? '']));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-sub">
            {tx.length} most recent · read-only
          </div>
        </div>
      </div>

      <div className="card">
        {tx.length === 0 ? (
          <div className="empty">No transactions yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th style={{textAlign: 'right'}}>Amount</th>
                  <th style={{textAlign: 'right'}}>Fees</th>
                </tr>
              </thead>
              <tbody>
                {tx.map(t => {
                  const cat = CATS[resolveCat(t.category ?? '')];
                  const isTransfer = t.transaction_type === 'transfer';
                  const isIncome = t.transaction_type === 'income';
                  const cls = isTransfer ? 'muted' : isIncome ? 'pos' : 'neg';
                  const sign = isTransfer ? '' : isIncome ? '+' : '-';
                  return (
                    <tr key={t.id}>
                      <td style={{color: T.text2}}>
                        {t.date_time
                          ? format(new Date(t.date_time), 'd MMM yy, HH:mm')
                          : '—'}
                      </td>
                      <td style={{fontWeight: 500}}>
                        {t.merchant || t.payee || '—'}
                      </td>
                      <td>
                        <span
                          className="pill"
                          style={{
                            background: cat.color + '22',
                            color: cat.color,
                          }}>
                          {cat.emoji} {cat.label}
                        </span>
                      </td>
                      <td style={{color: T.text2}}>
                        {accName.get(t.account_id ?? '') || '—'}
                      </td>
                      <td style={{color: T.text3, textTransform: 'capitalize'}}>
                        {t.transaction_type ?? '—'}
                      </td>
                      <td className={`row-amt ${cls}`} style={{textAlign: 'right'}}>
                        {sign}
                        {fmtMoney(t.amount ?? 0)}
                      </td>
                      <td style={{textAlign: 'right', color: T.text3}}>
                        {t.fees ? fmtMoney(t.fees) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
