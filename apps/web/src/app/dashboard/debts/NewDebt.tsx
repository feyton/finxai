'use client';

import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {Modal} from '@/components/Modal';
import {Icon} from '@/components/Icon';
import {fmtAmount} from '@/lib/theme';
import {
  type AmortInput,
  type InterestMethod,
  buildPlan,
  buildScheduleWithOverrides,
  flatToReducingRatePct,
} from '@/lib/shared/amortize';
import type {Account} from '@/lib/types';

/**
 * Record a debt from the web.
 *
 * A loan is the most form-shaped thing in the app — principal, rate, method, term,
 * instalment, first due date, which account it settles from — and it is entered once and
 * then lived with for months. Exactly the wrong job for a phone keyboard and exactly the
 * right one for a desk, which is also why the full schedule is editable here and only
 * reviewable on the phone.
 *
 * The arithmetic comes from shared/amortize.ts, the same module the Android screens use.
 * This file previously carried its own annuity formula and estimated the total as
 * instalment × term, which ignores the balancing final payment — so the web and the phone
 * quoted different costs for the same loan.
 */

const FREQUENCIES = [
  {id: 'monthly', label: 'Monthly', cadence: 'Monthly'},
  {id: 'weekly', label: 'Weekly', cadence: 'Weekly'},
  {id: 'none', label: 'No schedule', cadence: 'One-off'},
];

const METHODS: {id: InterestMethod; label: string; blurb: string}[] = [
  {
    id: 'reducing',
    label: 'Reducing',
    blurb: 'Interest on what you still owe. The payment stays level; the split shifts.',
  },
  {
    id: 'flat',
    label: 'Flat',
    blurb:
      'Interest on the original amount for the whole term — far dearer than it sounds.',
  },
  {
    id: 'equal_principal',
    label: 'Equal principal',
    blurb: 'The same principal each time, so the payment itself falls month to month.',
  },
];

export function NewDebt({ownerId, accounts}: {ownerId: string; accounts: Account[]}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dir, setDir] = useState<'borrowed' | 'lent'>('borrowed');
  const [party, setParty] = useState('');
  const [sub, setSub] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [method, setMethod] = useState<InterestMethod>('reducing');
  const [feePct, setFeePct] = useState('');
  const [feeFlat, setFeeFlat] = useState('');
  const [feeSpread, setFeeSpread] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [term, setTerm] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  // Hand-edited instalments by number, kept apart from the derived plan so that changing
  // a term re-derives everything else while deliberate edits survive.
  const [edits, setEdits] = useState<Record<number, number>>({});

  const principalNum = parseInt(principal, 10) || 0;
  const termNum = parseInt(term, 10) || 0;
  const scheduled = frequency !== 'none';

  const terms: AmortInput | null = useMemo(() => {
    const n = scheduled ? termNum : 1;
    if (principalNum <= 0 || n <= 0) {
      return null;
    }
    const first = nextDue ? new Date(`${nextDue}T00:00:00`) : new Date();
    return {
      principal: principalNum,
      annualRatePct: parseFloat(rate) || 0,
      term: n,
      cadence: FREQUENCIES.find(f => f.id === frequency)?.cadence ?? 'Monthly',
      firstDue: first,
      method,
      managementFeePct: parseFloat(feePct) || 0,
      managementFeeFlat: parseFloat(feeFlat) || 0,
      feeTiming: feeSpread ? 'spread' : 'upfront',
    };
  }, [
    principalNum,
    termNum,
    scheduled,
    rate,
    frequency,
    nextDue,
    method,
    feePct,
    feeFlat,
    feeSpread,
  ]);

  const rows = useMemo(
    () => (terms ? buildScheduleWithOverrides(terms, edits) : []),
    [terms, edits],
  );

  // Totals are summed from the rows shown below, so the footer and the table can never
  // disagree with each other.
  const plan = useMemo(() => {
    if (!terms || rows.length === 0) {
      return null;
    }
    const fees = rows.reduce((s, r) => s + r.fee, 0);
    const repaid = rows.reduce((s, r) => s + r.amount, 0);
    return {
      repaid,
      fees,
      interest: repaid - terms.principal - fees,
      costPct: ((repaid - terms.principal) / terms.principal) * 100,
      trueRate: flatToReducingRatePct(terms),
      shortfall: rows[rows.length - 1]?.remaining ?? 0,
      installment: rows[0]?.amount ?? 0,
    };
  }, [terms, rows]);

  const reducingCost = useMemo(
    () => (terms && method === 'flat' ? buildPlan({...terms, method: 'reducing'}) : null),
    [terms, method],
  );

  const canSave = party.trim().length > 0 && principalNum > 0 && !saving;

  const reset = () => {
    setDir('borrowed');
    setParty('');
    setSub('');
    setPrincipal('');
    setRate('');
    setMethod('reducing');
    setFeePct('');
    setFeeFlat('');
    setFeeSpread(false);
    setFrequency('monthly');
    setTerm('');
    setNextDue('');
    setAccountId('');
    setEdits({});
    setShowSchedule(false);
    setErr(null);
  };

  const close = () => {
    if (!saving) {
      setOpen(false);
    }
  };

  const save = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setErr(null);

    const debtId = crypto.randomUUID();
    const {error} = await supabase.from('debts').insert({
      id: debtId,
      dir,
      party: party.trim(),
      sub: sub.trim() || null,
      principal: principalNum,
      // Nothing has been repaid yet, so the balance starts at the full amount.
      outstanding: principalNum,
      rate: parseFloat(rate) || null,
      frequency: scheduled ? frequency : null,
      installment: plan?.installment || null,
      next_due: nextDue ? new Date(`${nextDue}T00:00:00`).toISOString() : null,
      account_id: accountId || null,
      term: termNum || null,
      paid: 0,
      tint: dir === 'borrowed' ? '#EF4444' : '#0D9668',
      icon: dir === 'borrowed' ? 'coins' : 'landmark',
      owner_id: ownerId,
      created_at: new Date().toISOString(),
      // Without the method the stored rate is ambiguous: 12% flat and 12% reducing are
      // nearly a factor of two apart, and the schedule could not be rebuilt later.
      method,
      management_fee_pct: parseFloat(feePct) || 0,
      management_fee_flat: parseFloat(feeFlat) || 0,
      fee_timing: feeSpread ? 'spread' : 'upfront',
    });

    if (error) {
      setErr(error.message);
      setSaving(false);
      return;
    }

    // Persist the schedule with its per-instalment split. Stored rather than recomputed
    // because a hand-edited row can no longer be derived from the loan's terms.
    if (rows.length > 0) {
      const {error: schedErr} = await supabase.from('debt_schedules').insert(
        rows.map(r => ({
          id: crypto.randomUUID(),
          debt_id: debtId,
          n: r.n,
          due_date: r.due.toISOString(),
          amount: r.amount,
          status: r.n === 1 ? 'due' : 'upcoming',
          owner_id: ownerId,
          principal: r.principal,
          interest: r.interest,
          fee: r.fee,
          edited: edits[r.n] !== undefined ? 1 : 0,
        })),
      );
      // The debt itself saved. Say what failed rather than rolling back silently — the
      // schedule can be rebuilt, the debt record is the part that matters.
      if (schedErr) {
        setErr(`Debt saved, but the schedule did not: ${schedErr.message}`);
        setSaving(false);
        router.refresh();
        return;
      }
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
        New debt
      </button>

      <Modal
        open={open}
        onClose={close}
        title="New debt"
        sub="Money you owe, or money someone owes you."
        width={720}
        footer={
          <>
            <span className="mr-auto text-[12px] text-ink2">
              {plan ? (
                <>
                  <strong className="tabnum text-[13px] text-ink">
                    {fmtAmount(plan.repaid)}
                  </strong>{' '}
                  RWF total
                  {plan.interest > 0 && <> · {fmtAmount(plan.interest)} interest</>}
                  {plan.fees > 0 && <> · {fmtAmount(plan.fees)} fees</>}
                </>
              ) : (
                'Add a term to see the repayment'
              )}
            </span>
            <button className="btn" onClick={close} disabled={saving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save debt'}
            </button>
          </>
        }>
        {err && <div className="banner-err">{err}</div>}

        <div className="mb-4">
          <span className="lbl">Direction</span>
          <div className="seg">
            <button
              type="button"
              aria-pressed={dir === 'borrowed'}
              onClick={() => setDir('borrowed')}>
              I borrowed
            </button>
            <button type="button" aria-pressed={dir === 'lent'} onClick={() => setDir('lent')}>
              I lent
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="lbl" htmlFor="d-party">
              {dir === 'borrowed' ? 'Owed to' : 'Owed by'}
            </label>
            <input
              id="d-party"
              className="inp"
              value={party}
              onChange={e => setParty(e.target.value)}
              placeholder={dir === 'borrowed' ? 'e.g. Bank of Kigali, Jean' : 'e.g. Claudine'}
              autoFocus
            />
          </div>
          <div>
            <label className="lbl" htmlFor="d-sub">
              What for <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="d-sub"
              className="inp"
              value={sub}
              onChange={e => setSub(e.target.value)}
              placeholder="e.g. Car loan, school fees"
            />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="lbl" htmlFor="d-principal">
              Amount (RWF)
            </label>
            <input
              id="d-principal"
              className="inp inp-num"
              inputMode="numeric"
              value={principal}
              onChange={e => setPrincipal(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
            />
          </div>
          <div>
            <label className="lbl" htmlFor="d-rate">
              Interest rate{' '}
              <span className="font-normal normal-case tracking-normal">(% a year, optional)</span>
            </label>
            <input
              id="d-rate"
              className="inp inp-num"
              inputMode="decimal"
              value={rate}
              onChange={e => setRate(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
            />
          </div>
        </div>

        <div className="mb-4">
          <span className="lbl">How the interest is charged</span>
          <div className="seg">
            {METHODS.map(m => (
              <button
                key={m.id}
                type="button"
                aria-pressed={method === m.id}
                onClick={() => {
                  setMethod(m.id);
                  setEdits({});
                }}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink3">
            {METHODS.find(m => m.id === method)?.blurb}
          </p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="lbl" htmlFor="d-feepct">
              Mgmt fee <span className="font-normal normal-case tracking-normal">(%)</span>
            </label>
            <input
              id="d-feepct"
              className="inp inp-num"
              inputMode="decimal"
              value={feePct}
              onChange={e => setFeePct(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
            />
          </div>
          <div>
            <label className="lbl" htmlFor="d-feeflat">
              Fee amount{' '}
              <span className="font-normal normal-case tracking-normal">(RWF)</span>
            </label>
            <input
              id="d-feeflat"
              className="inp inp-num"
              inputMode="numeric"
              value={feeFlat}
              onChange={e => setFeeFlat(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
            />
          </div>
          <div>
            <span className="lbl">Charged</span>
            <div className="seg">
              <button
                type="button"
                aria-pressed={!feeSpread}
                onClick={() => setFeeSpread(false)}>
                Upfront
              </button>
              <button type="button" aria-pressed={feeSpread} onClick={() => setFeeSpread(true)}>
                Spread
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <span className="lbl">Repayment</span>
          <div className="seg">
            {FREQUENCIES.map(f => (
              <button
                key={f.id}
                type="button"
                aria-pressed={frequency === f.id}
                onClick={() => setFrequency(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {scheduled && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="lbl" htmlFor="d-term">
                Number of payments
              </label>
              <input
                id="d-term"
                className="inp inp-num"
                inputMode="numeric"
                value={term}
                onChange={e => setTerm(e.target.value.replace(/\D/g, ''))}
                placeholder={frequency === 'weekly' ? 'e.g. 52' : 'e.g. 12'}
              />
            </div>
            <div>
              <label className="lbl" htmlFor="d-due">
                First payment due
              </label>
              <input
                id="d-due"
                type="date"
                className="inp"
                value={nextDue}
                onChange={e => setNextDue(e.target.value)}
              />
            </div>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="mb-4">
            <label className="lbl" htmlFor="d-acct">
              Settles from{' '}
              <span className="font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <select
              id="d-acct"
              className="inp"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}>
              <option value="">Not linked to an account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* The calculator: what this loan actually costs, before committing to it */}
        {plan && terms && (
          <div className="rounded-xl border border-line bg-surface2 p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="You repay" value={fmtAmount(plan.repaid)} />
              <Stat label="Interest" value={fmtAmount(plan.interest)} />
              {plan.fees > 0 && <Stat label="Fees" value={fmtAmount(plan.fees)} />}
              <Stat label="Total cost" value={`${plan.costPct.toFixed(1)}%`} />
            </div>

            {/* A flat quote is the commonest way to misjudge a loan. State what it really
                costs rather than leaving the borrower to work it out. */}
            {plan.trueRate !== null && plan.trueRate > 0 && reducingCost && (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-ink2">
                <strong>{rate}% flat is about {plan.trueRate.toFixed(1)}% reducing.</strong>{' '}
                The same loan on reducing terms would cost{' '}
                {fmtAmount(plan.interest - reducingCost.totalInterest)} RWF less in interest.
              </p>
            )}

            {plan.shortfall > 0 && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-red-600 dark:text-red-400">
                These payments leave {fmtAmount(plan.shortfall)} RWF outstanding at the end
                of the term.
              </p>
            )}

            <button
              type="button"
              className="mt-3 text-[12px] font-semibold text-brand hover:underline"
              onClick={() => setShowSchedule(s => !s)}>
              {showSchedule ? 'Hide schedule' : `Review & edit all ${rows.length} payments`}
            </button>

            {showSchedule && (
              <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-surface2">
                    <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink3">
                      <th className="px-2 py-1.5 font-medium">#</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 text-right font-medium">Principal</th>
                      <th className="px-2 py-1.5 text-right font-medium">Interest</th>
                      <th className="px-2 py-1.5 text-right font-medium">Payment</th>
                      <th className="px-2 py-1.5 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const edited = edits[r.n] !== undefined;
                      return (
                        <tr key={r.n} className="border-t border-line">
                          <td className="px-2 py-1 text-ink3">{r.n}</td>
                          <td className="px-2 py-1 text-ink2">
                            {r.due.toISOString().slice(0, 10)}
                          </td>
                          <td className="tabnum px-2 py-1 text-right text-ink2">
                            {fmtAmount(r.principal)}
                          </td>
                          <td className="tabnum px-2 py-1 text-right text-ink3">
                            {fmtAmount(r.interest + r.fee)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <input
                              className={`tabnum w-24 rounded border bg-transparent px-1.5 py-0.5 text-right ${
                                edited ? 'border-brand font-semibold text-brand' : 'border-line'
                              }`}
                              inputMode="numeric"
                              value={r.amount}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, '');
                                setEdits(prev => {
                                  // Emptying the cell drops the override and restores the
                                  // computed figure. Without this the input is a trap:
                                  // the value is controlled by the recomputed row, so
                                  // clearing it would just snap straight back.
                                  if (digits === '') {
                                    const {[r.n]: _cleared, ...rest} = prev;
                                    return rest;
                                  }
                                  return {...prev, [r.n]: parseInt(digits, 10)};
                                });
                              }}
                            />
                          </td>
                          <td className="tabnum px-2 py-1 text-right text-ink3">
                            {fmtAmount(r.remaining)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {showSchedule && Object.keys(edits).length > 0 && (
              <button
                type="button"
                className="mt-2 text-[11.5px] text-ink3 hover:underline"
                onClick={() => setEdits({})}>
                Reset {Object.keys(edits).length} edited payment
                {Object.keys(edits).length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-ink3">{label}</div>
      <div className="tabnum text-[15px] font-bold text-ink">{value}</div>
    </div>
  );
}
