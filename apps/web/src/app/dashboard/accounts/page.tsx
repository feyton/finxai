import {createClient} from '@/lib/supabase/server';
import {T, fmtMoney, accountTint} from '@/lib/theme';
import type {Account} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const supabase = await createClient();
  const {data} = await supabase.from('accounts').select('*');
  const accounts = (data ?? []) as Account[];
  const total = accounts.reduce((s, a) => s + (a.available_balance ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-sub">Total {fmtMoney(total)}</div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="card">
          <div className="empty">No accounts yet.</div>
        </div>
      ) : (
        <div className="grid grid-3">
          {accounts.map(a => {
            const tint = accountTint(a.name ?? '');
            return (
              <div className="card" key={a.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 16,
                  }}>
                  <div
                    className="avatar"
                    style={{background: tint + '22', color: tint}}>
                    {a.auto ? '📡' : '💳'}
                  </div>
                  <div>
                    <div style={{fontWeight: 600, fontSize: 15}}>
                      {a.name ?? 'Account'}
                    </div>
                    <div style={{fontSize: 12.5, color: T.text3}}>
                      {a.type ?? '—'}
                      {a.number ? ` · ${a.number}` : ''}
                    </div>
                  </div>
                </div>
                <div className="stat-label">Available balance</div>
                <div className="stat-value" style={{fontSize: 22}}>
                  {fmtMoney(a.available_balance ?? 0)}
                </div>
                {a.auto ? (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      color: T.accent,
                    }}>
                    ● Auto-synced from SMS
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
