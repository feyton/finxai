'use client';

import {useMemo, useState} from 'react';
import {format} from 'date-fns';
import {fmtAmount} from '@/lib/theme';
import type {Debt} from '@/lib/types';
import {LineChart} from '@/components/charts';
import {Icon} from '@/components/Icon';
import {Card, KpiCard, Legend, MiniStat, Pill, Progress, WEmpty, WSection} from '@/components/ui';

// Simple amortization: monthly interest on the outstanding balance, fixed
// installment (+optional extra). Returns outstanding-per-month until zero.
function projectPayoff(debt: Debt, extra: number): {base: number[]; withExtra: number[]; monthsSaved: number} {
  const run = (paymentBoost: number): number[] => {
    const rate = (debt.rate ?? 0) / 100 / 12;
    const payment =
      (debt.installment ?? 0) > 0
        ? (debt.installment ?? 0) + paymentBoost
        : Math.max((debt.outstanding ?? 0) / 12, 1) + paymentBoost;
    let bal = debt.outstanding ?? 0;
    const out = [Math.round(bal)];
    for (let i = 0; i < 60 && bal > 0; i++) {
      bal = bal * (1 + rate) - payment;
      out.push(Math.max(0, Math.round(bal)));
    }
    return out;
  };
  const base = run(0);
  const withExtra = run(extra);
  return {base, withExtra, monthsSaved: Math.max(0, base.length - withExtra.length)};
}

export function DebtsClient({debts, schedules}: {debts: Debt[]; schedules: any[]}) {
  const borrowed = debts.filter(x => x.dir === 'borrowed');
  const [focusId, setFocusId] = useState<string>(borrowed[0]?.id ?? '');
  const [extra, setExtra] = useState(20000);

  const owe = borrowed.reduce((s, x) => s + (x.outstanding ?? 0), 0);
  const owed = debts.filter(x => x.dir === 'lent').reduce((s, x) => s + (x.outstanding ?? 0), 0);

  const focus = debts.find(x => x.id === focusId) ?? borrowed[0];
  const proj = useMemo(() => (focus ? projectPayoff(focus, extra) : null), [focus, extra]);
  const focusSchedule = schedules.filter(s => s.debt_id === focus?.id);

  return (
    <div className="flex flex-col gap-5 px-5 pb-14 pt-5 md:px-7">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3.5">
        <KpiCard label="You owe" value={owe} icon="upRight" tint="var(--expense)" />
        <KpiCard label="Owed to you" value={owed} icon="downLeft" tint="var(--income)" />
        <KpiCard label="Active debts" value={debts.length} suffix="" icon="coins" tint="var(--info)" />
      </div>

      {debts.length === 0 && (
        <Card>
          <WEmpty icon="coins" title="No debts tracked" sub="Add debts from the mobile app — they sync here." />
        </Card>
      )}

      {/* Payoff projection */}
      {focus && proj && (
        <Card>
          <WSection
            title="Payoff projection"
            sub={`${focus.party} · ${focus.sub ?? focus.frequency ?? ''}`}
            action={
              borrowed.length > 1 ? (
                <select className="select" value={focusId} onChange={e => setFocusId(e.target.value)}>
                  {borrowed.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.party}
                    </option>
                  ))}
                </select>
              ) : undefined
            }>
            <div className="grid gap-6 lg:grid-cols-3">
              <div style={{gridColumn: 'span 2'}}>
                <LineChart
                  months={Array.from({length: proj.base.length}, (_, i) => (i % 3 === 0 ? `M${i}` : ''))}
                  series={[
                    {label: 'Baseline', color: 'var(--text-3)', values: proj.base},
                    {label: 'With extra payment', color: 'var(--accent-700)', values: proj.withExtra},
                  ]}
                  height={190}
                />
                <div className="mt-2 flex gap-4">
                  <Legend color="var(--text-3)" label="Baseline installments" />
                  <Legend color="var(--accent-700)" label={`+${fmtAmount(extra)} extra/month`} />
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                <div>
                  <div className="mb-1.5 flex justify-between text-[12px]">
                    <span className="text-ink2">Extra payment / month</span>
                    <span className="tabnum font-bold">{fmtAmount(extra)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100000}
                    step={5000}
                    value={extra}
                    onChange={e => setExtra(+e.target.value)}
                    className="w-full"
                  />
                </div>
                <MiniStat label="Months saved" value={proj.monthsSaved} color="var(--accent-700)" suffix=" mo" />
                <MiniStat label="Payoff in" value={proj.withExtra.length - 1} color="var(--info)" suffix=" mo" />
              </div>
            </div>
          </WSection>
        </Card>
      )}

      {/* Debt list */}
      {debts.length > 0 && (
        <WSection title="All debts">
          <div className="grid gap-3.5 lg:grid-cols-2">
            {debts.map(x => {
              const paidAmt = (x.principal ?? 0) - (x.outstanding ?? 0);
              const isBorrowed = x.dir === 'borrowed';
              return (
                <Card key={x.id} pad={16}>
                  <div className="mb-2.5 flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                      style={{background: (x.tint ?? 'var(--info)') + '1e', color: x.tint ?? 'var(--info)'}}>
                      <Icon name="coins" size={18} sw={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                        {x.party}
                        <Pill
                          color={isBorrowed ? 'var(--expense)' : 'var(--income)'}
                          bg={(isBorrowed ? 'var(--expense)' : 'var(--income)') + '18'}>
                          {isBorrowed ? 'You owe' : 'Owes you'}
                        </Pill>
                      </div>
                      <div className="text-[11px] text-ink3">
                        {x.sub ?? ''}
                        {x.rate ? ` · ${x.rate}% APR` : ''}
                        {x.next_due ? ` · next ${format(new Date(x.next_due), 'MMM d')}` : ''}
                      </div>
                    </div>
                    <div className="tabnum text-right text-[15px] font-bold">
                      {fmtAmount(x.outstanding ?? 0)}
                      <div className="text-[10px] font-medium text-ink3">of {fmtAmount(x.principal ?? 0)}</div>
                    </div>
                  </div>
                  <Progress value={paidAmt} max={x.principal ?? 1} color={x.tint ?? 'var(--info)'} />
                  <div className="mt-2 text-[11px] text-ink3">
                    {x.paid ?? 0}/{x.term ?? '—'} installments · {fmtAmount(x.installment ?? 0)} {x.frequency ?? ''}
                  </div>
                </Card>
              );
            })}
          </div>
        </WSection>
      )}

      {/* Schedule of the focused debt */}
      {focus && focusSchedule.length > 0 && (
        <Card pad={0}>
          <div className="px-5 pt-4">
            <WSection title={`Repayment schedule · ${focus.party}`}>
              <span />
            </WSection>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{borderBottom: '1px solid var(--border)'}}>
                <th className="th pl-5">#</th>
                <th className="th">Due date</th>
                <th className="th" style={{textAlign: 'right'}}>
                  Amount
                </th>
                <th className="th" style={{textAlign: 'center'}}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {focusSchedule.map((row: any, i: number, arr: any[]) => (
                <tr key={row.id} style={{borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none'}}>
                  <td className="td pl-5 text-[12px] text-ink2">{row.n}</td>
                  <td className="td text-[12.5px]">{row.due_date ? format(new Date(row.due_date), 'MMM d, yyyy') : '—'}</td>
                  <td className="td tabnum text-right text-[12.5px] font-semibold">{fmtAmount(row.amount ?? 0)}</td>
                  <td className="td text-center">
                    <Pill
                      color={row.status === 'paid' ? 'var(--income)' : row.status === 'due' ? 'var(--warn)' : 'var(--text-2)'}
                      bg={
                        (row.status === 'paid' ? 'var(--income)' : row.status === 'due' ? 'var(--warn)' : 'var(--text-3)') +
                        '18'
                      }>
                      {row.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
