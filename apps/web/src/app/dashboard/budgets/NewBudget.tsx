'use client';

import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {Modal} from '@/components/Modal';
import {Icon} from '@/components/Icon';
import {CatChip} from '@/components/ui';
import {CATS, type CategoryId, fmtAmount} from '@/lib/theme';

/**
 * Create a budget, with its category lines, from the web.
 *
 * This is the reason the web app exists: a budget is several decisions at once —
 * a period, and a limit per category — and entering five or six of those on a
 * phone keyboard is the worst version of the task. On a desk it is one screen.
 *
 * Writes the parent `budgets` row and its `budget_items` children, then calls
 * router.refresh() so the server component re-reads and the new budget appears
 * without this component having to own the list.
 */

// Expense categories only — a budget caps spending, so offering 'Salary' as a
// line would be nonsense.
const BUDGETABLE: CategoryId[] = [
  'groceries',
  'food',
  'transport',
  'utilities',
  'airtime',
  'rent',
  'housing',
  'personal_care',
  'health',
  'education',
  'shopping',
  'technology',
  'fun',
  'family',
  'gifts',
  'debt',
  'savings',
  'misc',
];

const EVENTS: {id: string; label: string; hint: string}[] = [
  {id: 'category', label: 'Monthly caps', hint: 'Limits per category. Spending is matched automatically.'},
  {id: 'shared', label: 'Household', hint: 'A shared pot — claim spending against it as it happens.'},
  {id: 'party', label: 'One-off event', hint: 'A wedding, a trip. Runs between two dates, then stops.'},
];

interface Line {
  key: string;
  category: CategoryId;
  amount: string;
}

const newLine = (category: CategoryId): Line => ({
  key: crypto.randomUUID(),
  category,
  amount: '',
});

function firstUnused(lines: Line[]): CategoryId {
  const used = new Set(lines.map(l => l.category));
  return BUDGETABLE.find(c => !used.has(c)) ?? 'misc';
}

function monthBounds() {
  const d = new Date();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return {
    start: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  };
}

export function NewBudget({ownerId}: {ownerId: string}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const bounds = useMemo(monthBounds, []);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [event, setEvent] = useState('category');
  const [start, setStart] = useState(bounds.start);
  const [end, setEnd] = useState(bounds.end);
  const [lines, setLines] = useState<Line[]>([newLine('groceries')]);

  // A one-off event has real dates; the other two repeat every month.
  const recurring = event !== 'party';
  const total = lines.reduce((s, l) => s + (parseInt(l.amount, 10) || 0), 0);
  const canSave = name.trim().length > 0 && total > 0 && !saving;

  const reset = () => {
    setName('');
    setEvent('category');
    setStart(bounds.start);
    setEnd(bounds.end);
    setLines([newLine('groceries')]);
    setErr(null);
  };

  const close = () => {
    if (saving) {
      return;
    }
    setOpen(false);
  };

  const save = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setErr(null);

    const budgetId = crypto.randomUUID();
    const now = new Date().toISOString();

    const {error: bErr} = await supabase.from('budgets').insert({
      id: budgetId,
      name: name.trim(),
      period: recurring ? 'monthly' : null,
      // A recurring budget's window is computed from "now" wherever it is read
      // (see computeSpend), so its stored dates are only a record of when it
      // began — but they must still be present and valid.
      start_date: new Date(`${start}T00:00:00`).toISOString(),
      end_date: new Date(`${end}T23:59:59`).toISOString(),
      amount: total,
      recurring: recurring ? 1 : 0,
      event,
      owner_id: ownerId,
      created_at: now,
    });
    if (bErr) {
      setErr(bErr.message);
      setSaving(false);
      return;
    }

    const itemRows = lines
      .filter(l => (parseInt(l.amount, 10) || 0) > 0)
      .map(l => ({
        id: crypto.randomUUID(),
        budget_id: budgetId,
        name: CATS[l.category].label,
        category: l.category,
        subcategory: null,
        amount: parseInt(l.amount, 10),
        owner_id: ownerId,
      }));

    const {error: iErr} = await supabase.from('budget_items').insert(itemRows);
    if (iErr) {
      // Don't leave a budget with no lines behind — it would show as a 0-limit
      // plan that cannot be fixed from here.
      await supabase.from('budgets').delete().eq('id', budgetId);
      setErr(`Could not save the categories, so the budget was not created: ${iErr.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => {
          reset();
          setOpen(true);
        }}>
        <Icon name="plus" size={14} sw={2.4} />
        New budget
      </button>

      <Modal
        open={open}
        onClose={close}
        title="New budget"
        sub="Set a limit per category. FinXAI matches your spending against it as it arrives."
        width={620}
        footer={
          <>
            <span className="mr-auto text-[12px] text-ink2">
              Total{' '}
              <strong className="tabnum text-[13px] text-ink">{fmtAmount(total)}</strong>{' '}
              RWF
              {recurring ? ' every month' : ' for the period'}
            </span>
            <button className="btn" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave}>
              {saving ? 'Creating…' : 'Create budget'}
            </button>
          </>
        }>
        {err && <div className="banner-err">{err}</div>}

        <div className="mb-4">
          <label className="lbl" htmlFor="b-name">
            Name
          </label>
          <input
            id="b-name"
            className="inp"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Running costs, Kigali trip"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <span className="lbl">Kind</span>
          <div className="flex flex-wrap gap-2">
            {EVENTS.map(ev => (
              <button
                key={ev.id}
                type="button"
                onClick={() => setEvent(ev.id)}
                aria-pressed={event === ev.id}
                className="press rounded-[10px] border px-3 py-2 text-left"
                style={{
                  borderColor: event === ev.id ? 'var(--accent)' : 'var(--border)',
                  background: event === ev.id ? 'var(--accent-soft)' : 'var(--surface)',
                }}>
                <span
                  className="block text-[12.5px] font-semibold"
                  style={{color: event === ev.id ? 'var(--accent-700)' : 'var(--text)'}}>
                  {ev.label}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink3">
            {EVENTS.find(e => e.id === event)?.hint}
          </p>
        </div>

        {!recurring && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="lbl" htmlFor="b-start">
                Starts
              </label>
              <input
                id="b-start"
                type="date"
                className="inp"
                value={start}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className="lbl" htmlFor="b-end">
                Ends
              </label>
              <input
                id="b-end"
                type="date"
                className="inp"
                value={end}
                min={start}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <span className="lbl">Categories</span>
          <div className="flex flex-col gap-2">
            {lines.map(line => (
              <div key={line.key} className="flex items-center gap-2">
                <CatChip cat={line.category} size={30} />
                <select
                  className="inp flex-1"
                  value={line.category}
                  onChange={e =>
                    setLines(prev =>
                      prev.map(l =>
                        l.key === line.key
                          ? {...l, category: e.target.value as CategoryId}
                          : l,
                      ),
                    )
                  }
                  aria-label="Category">
                  {BUDGETABLE.map(c => (
                    <option key={c} value={c}>
                      {CATS[c].label}
                    </option>
                  ))}
                </select>
                <input
                  className="inp inp-num w-[130px]"
                  inputMode="numeric"
                  placeholder="0"
                  value={line.amount}
                  aria-label={`Limit for ${CATS[line.category].label}`}
                  onChange={e =>
                    setLines(prev =>
                      prev.map(l =>
                        l.key === line.key
                          ? {...l, amount: e.target.value.replace(/\D/g, '')}
                          : l,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
                  disabled={lines.length === 1}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg
                             text-ink3 transition-colors hover:bg-surface2 hover:text-neg
                             disabled:cursor-default disabled:opacity-30"
                  aria-label={`Remove ${CATS[line.category].label}`}>
                  <Icon name="x" size={14} sw={2.2} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn mt-2.5"
            onClick={() => setLines(prev => [...prev, newLine(firstUnused(prev))])}
            disabled={lines.length >= BUDGETABLE.length}>
            <Icon name="plus" size={13} sw={2.4} />
            Add category
          </button>
        </div>
      </Modal>
    </>
  );
}
