'use client';

import {useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, fmtAmount, resolveCat} from '@/lib/theme';
import type {Budget, BudgetItem, Transaction} from '@/lib/types';
import type {SplitLite} from '@/lib/insights';
import {RingGauge} from '@/components/charts';
import {Card, CatChip, Pill, Progress, WEmpty, WSection} from '@/components/ui';

const EVENT_EMOJI: Record<string, string> = {category: '📊', shared: '🏠', party: '🎉'};

// Mirrors the mobile computeBudgetSpend: claimed rows always count; CATEGORY
// budgets also auto-match unclaimed in-period expenses by item category.
function computeSpend(
  b: Budget,
  items: BudgetItem[],
  rows: {budget_id: string | null; date_time: string | null; transaction_type: string | null; category: string | null; amount: number | null}[],
) {
  const isCategoryBudget = !b.event || b.event === '' || b.event === 'category';
  let winStart: string;
  let winEnd: string;
  if (b.recurring) {
    const d = new Date();
    winStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    winEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
  } else {
    winStart = b.start_date ?? '';
    winEnd = b.end_date ?? '9999';
  }
  const itemCats = new Set(items.map(it => resolveCat(it.category ?? '')));
  let spent = 0;
  let contributions = 0;
  const perItemAuto = new Map<string, number>();
  for (const r of rows) {
    const isClaimed = r.budget_id === b.id;
    const inWindow = (r.date_time ?? '') >= winStart && (r.date_time ?? '') <= winEnd;
    const isAuto =
      isCategoryBudget &&
      !r.budget_id &&
      r.transaction_type === 'expense' &&
      inWindow &&
      itemCats.has(resolveCat(r.category ?? ''));
    if (isClaimed) {
      if (r.transaction_type === 'income') contributions += r.amount ?? 0;
      else spent += r.amount ?? 0;
    } else if (isAuto) {
      spent += r.amount ?? 0;
    }
    if (isClaimed || isAuto) {
      if (r.transaction_type !== 'income') {
        const cat = resolveCat(r.category ?? '');
        perItemAuto.set(cat, (perItemAuto.get(cat) ?? 0) + (r.amount ?? 0));
      }
    }
  }
  return {spent, contributions, perCat: perItemAuto};
}

export function BudgetsClient({
  budgets,
  items,
  tx,
  splits,
}: {
  budgets: Budget[];
  items: BudgetItem[];
  tx: Transaction[];
  splits: SplitLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [itemRows, setItemRows] = useState<BudgetItem[]>(items);
  const [editItem, setEditItem] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const rows = useMemo(() => {
    const byTx = new Map<string, SplitLite[]>();
    for (const s of splits) {
      const list = byTx.get(s.transaction_id) ?? [];
      list.push(s);
      byTx.set(s.transaction_id, list);
    }
    return tx.flatMap(t => {
      const parts = byTx.get(t.id);
      if (!parts || parts.length === 0) return [t];
      return parts.map(p => ({...t, category: p.category, amount: p.amount}));
    });
  }, [tx, splits]);

  const computed = useMemo(
    () =>
      budgets.map(b => {
        const bItems = itemRows.filter(i => i.budget_id === b.id);
        const planned = bItems.reduce((s, i) => s + (i.amount ?? 0), 0) || (b.amount ?? 0);
        const spend = computeSpend(b, bItems, rows);
        return {b, bItems, planned, ...spend};
      }),
    [budgets, itemRows, rows],
  );

  const totalPlanned = computed.reduce((s, x) => s + x.planned, 0);
  const totalSpent = computed.reduce((s, x) => s + x.spent, 0);
  const pct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

  const setLimit = async (item: BudgetItem, value: number) => {
    setEditItem(null);
    if (!value || value === item.amount) return;
    setItemRows(prev => prev.map(i => (i.id === item.id ? {...i, amount: value} : i)));
    const {error} = await supabase.from('budget_items').update({amount: value}).eq('id', item.id);
    if (error) {
      setErr(error.message);
      setItemRows(prev => prev.map(i => (i.id === item.id ? {...i, amount: item.amount} : i)));
    }
  };

  return (
    <div className="flex flex-col gap-5 px-5 pb-14 pt-5 md:px-7">
      {err && <div className="banner-err">{err}</div>}

      {/* Summary ring */}
      <Card>
        <div className="flex items-center gap-5">
          <RingGauge pct={pct} size={90} />
          <div>
            <div className="text-[12px] text-ink2">Left to spend</div>
            <div
              className="tabnum text-[24px] font-bold"
              style={{color: totalPlanned - totalSpent < 0 ? 'var(--expense)' : 'var(--text)'}}>
              {fmtAmount(totalPlanned - totalSpent)}
              <span className="ml-1 text-[12px] text-ink3">RWF</span>
            </div>
            <div className="mt-1 text-[11.5px] text-ink2">
              {fmtAmount(totalSpent)} of {fmtAmount(totalPlanned)} across {budgets.length} budget
              {budgets.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </Card>

      {computed.length === 0 && (
        <Card>
          <WEmpty icon="pie" title="No budgets yet" sub="Create budgets on the phone — manage and analyze them here." />
        </Card>
      )}

      {/* Budget cards */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        {computed.map(({b, bItems, planned, spent, contributions, perCat}) => {
          const over = planned > 0 && spent > planned;
          const p = planned > 0 ? Math.round((spent / planned) * 100) : 0;
          return (
            <Card key={b.id} pad={16}>
              <div className="mb-2.5 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-surface2 text-[18px]">
                  {EVENT_EMOJI[b.event ?? 'category'] ?? '📊'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <span className="truncate">{b.name ?? 'Budget'}</span>
                    {!!b.recurring && (
                      <Pill color="var(--text-2)" bg="var(--surface-2)">
                        {b.period ?? 'monthly'}
                      </Pill>
                    )}
                  </div>
                  <div className="tabnum text-[11.5px] text-ink2">
                    {fmtAmount(spent)} spent
                    {contributions > 0 && (
                      <span style={{color: 'var(--income)'}}> · +{fmtAmount(contributions)} contributed</span>
                    )}
                  </div>
                </div>
                <span
                  className="tabnum text-[13px] font-bold"
                  style={{color: over ? 'var(--expense)' : p > 85 ? 'var(--warn)' : 'var(--text-2)'}}>
                  {p}%
                </span>
              </div>
              <Progress value={spent} max={Math.max(planned, 1)} color={over ? 'var(--expense)' : 'var(--accent)'} />

              {/* Items with inline limit editing */}
              <div className="mt-3 flex flex-col gap-2">
                {bItems.map(it => {
                  const catId = resolveCat(it.category ?? '');
                  const itemSpent = perCat.get(catId) ?? 0;
                  return (
                    <div key={it.id} className="flex items-center gap-2.5">
                      <CatChip cat={catId} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink2">
                        {it.name || it.subcategory || CATS[catId].label}
                      </span>
                      <div className="w-[110px]">
                        <Progress value={itemSpent} max={Math.max(it.amount ?? 0, 1)} color={CATS[catId].color} h={5} />
                      </div>
                      {editItem === it.id ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={it.amount ?? 0}
                          onBlur={e => setLimit(it, +e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className="input w-[92px] py-1 text-right text-[11.5px]"
                        />
                      ) : (
                        <button
                          onClick={() => setEditItem(it.id)}
                          className="press tabnum w-[92px] rounded-md px-1 py-0.5 text-right text-[11.5px] text-ink2 hover:bg-surface2"
                          title="Click to edit the limit">
                          {fmtAmount(it.amount ?? 0)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
