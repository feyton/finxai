import Link from 'next/link';
import {formatDistanceToNowStrict} from 'date-fns';
import {fmtAmount, accountTint} from '@/lib/theme';
import {loadDatasets, monthlySeries, netWorthSeries} from '@/lib/insights';
import {Donut, LineChart, Sparkline} from '@/components/charts';
import {Icon} from '@/components/Icon';
import {Card, Pill, Topbar, WSection} from '@/components/ui';
import type {Transaction} from '@/lib/types';

export const dynamic = 'force-dynamic';

// Per-account balance history: walk the account's current balance backwards
// through its own monthly net flows (same technique as net worth).
function accountSeries(balance: number, txs: Transaction[], months: number): number[] {
  const s = monthlySeries(txs, months);
  return netWorthSeries(balance, s);
}

export default async function AccountsPage() {
  const d = await loadDatasets(6);
  const owned = d.accounts.filter(a => a.owner_id === d.uid);
  const sharedIn = new Set(
    d.shares.filter(s => s.shared_with_id === d.uid && s.status === 'active').map(s => s.account_id),
  );
  const total = owned.reduce((s, a) => s + (a.available_balance ?? 0), 0);
  const s6 = monthlySeries(d.tx.filter(t => owned.some(a => a.id === t.account_id)), 6);
  const netWorth = netWorthSeries(total, s6);

  const donutSegs = owned
    .filter(a => (a.available_balance ?? 0) > 0)
    .map(a => ({label: a.name ?? 'Account', value: a.available_balance ?? 0, color: accountTint(a.name ?? '')}));

  return (
    <>
      <Topbar
        title="Accounts"
        sub={`${d.accounts.length} connected · mobile is the source of truth, web mirrors synced data`}
        syncLabel={d.syncLabel}
        reviewCount={d.reviewCount}
      />

      <div className="flex flex-col gap-5 px-5 pb-14 pt-5 md:px-7">
        <div className="grid gap-[18px] lg:grid-cols-3">
          <Card style={{gridColumn: 'span 2'}}>
            <WSection title="Net worth" sub="Your accounts, last 6 months">
              <div className="tabnum mb-2.5 text-[30px] font-bold">
                {fmtAmount(total)}
                <span className="ml-1.5 text-[14px] text-ink3">RWF</span>
              </div>
              <LineChart months={s6.months} area series={[{label: 'Net worth', color: 'var(--accent-700)', values: netWorth}]} />
            </WSection>
          </Card>
          <Card>
            <WSection title="Allocation" sub="Where the money sits">
              <div className="mb-3.5 flex justify-center">
                <Donut segments={donutSegs} />
              </div>
              <div className="flex flex-col gap-1.5">
                {donutSegs.map(a => (
                  <div key={a.label} className="flex items-center gap-2 text-[11.5px]">
                    <span style={{width: 8, height: 8, borderRadius: 8, background: a.color}} />
                    <span className="flex-1 text-ink2">{a.label}</span>
                    <span className="tabnum font-semibold">{total > 0 ? Math.round((a.value / total) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            </WSection>
          </Card>
        </div>

        <WSection title="All accounts">
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {d.accounts.map(a => {
              const tint = accountTint(a.name ?? '');
              const isShared = sharedIn.has(a.id);
              const accTx = d.tx.filter(t => t.account_id === a.id);
              const spark = accountSeries(a.available_balance ?? 0, accTx, 6);
              return (
                <Link key={a.id} href={`/dashboard/transactions?account=${a.id}`}>
                  <Card pad={16} className="press h-full">
                    <div className="mb-3.5 flex items-center justify-between">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                        style={{background: tint + '1e', color: tint}}>
                        <Icon name={a.auto ? 'phone' : 'landmark'} size={19} sw={2.1} />
                      </div>
                      {isShared && (
                        <Pill icon="users" color="var(--accent-700)" bg="var(--accent-soft)">
                          Shared
                        </Pill>
                      )}
                    </div>
                    <div className="text-[13px] text-ink2">{a.name}</div>
                    <div className="tabnum mb-2.5 mt-0.5 text-[19px] font-bold">
                      {fmtAmount(a.available_balance ?? 0)}
                      <span className="ml-1 text-[11px] text-ink3">RWF</span>
                    </div>
                    <Sparkline values={spark} color={tint} width={160} height={30} />
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink3">
                      <Icon name="refresh" size={11} />
                      {a.log_date
                        ? `Synced ${formatDistanceToNowStrict(new Date(a.log_date), {addSuffix: true})}`
                        : a.auto
                        ? 'Auto-reads SMS on the phone'
                        : 'Manual account'}
                      {' · '}
                      {accTx.length} txns
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </WSection>
      </div>
    </>
  );
}
