import {createClient} from '@/lib/supabase/server';
import {T, fmtMoney, accountTint} from '@/lib/theme';
import type {Account, AccountShare} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const [{data}, sharesRes] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('account_shares').select('*'),
  ]);
  const accounts = (data ?? []) as Account[];
  const shares = (sharesRes.data ?? []) as AccountShare[];
  const sharedIn = new Set(
    shares
      .filter(s => s.shared_with_id === uid && s.status === 'active')
      .map(s => s.account_id),
  );
  const total = accounts
    .filter(a => a.owner_id === uid)
    .reduce((s, a) => s + (a.available_balance ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Accounts</div>
          <div className="page-sub">Total {fmtMoney(total)} (your accounts)</div>
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
                    <div style={{fontWeight: 600, fontSize: 14}}>
                      {a.name ?? 'Account'}{' '}
                      {sharedIn.has(a.id) && (
                        <span className="pill bg-accent-soft text-accent2">shared</span>
                      )}
                    </div>
                    <div style={{fontSize: 11.5, color: T.text3}}>
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
