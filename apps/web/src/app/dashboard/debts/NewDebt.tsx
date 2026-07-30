'use client';

import {useMemo, useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
import {Modal} from '@/components/Modal';
import {Icon} from '@/components/Icon';
import {fmtAmount} from '@/lib/theme';
import type {Account} from '@/lib/types';

/**
 * Record a debt from the web.
 *
 * A loan is the most form-shaped thing in the app — principal, rate, term,
 * instalment, first due date, which account it settles from — and it is entered
 * once and then lived with for months. Exactly the wrong job for a phone keyboard
 * and exactly the right one for a desk.
 *
 * The instalment is derived rather than asked for: given a principal, a rate and
 * a term, there is one correct payment, and making the user compute it invites a
 * number that never reconciles with the schedule.
 */

const FREQUENCIES = [
  {id: 'monthly', label: 'Monthly', perYear: 12},
  {id: 'weekly', label: 'Weekly', perYear: 52},
  {id: 'none', label: 'No schedule', perYear: 0},
];

/**
 * Standard amortising payment. Falls back to straight division when there is no
 * interest, which is the common case for money borrowed from a person.
 */
function payment(principal: number, annualRatePct: number, periods: number, perYear: number) {
  if (principal <= 0 || periods <= 0) {
    return 0;
  }
  const r = annualRatePct / 100 / (perYear || 12);
  if (r <= 0) {
    return Math.round(principal / periods);
  }
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -periods)));
}

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
  const [frequency, setFrequency] = useState('monthly');
  const [term, setTerm] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [accountId, setAccountId] = useState('');

  const principalNum = parseInt(principal, 10) || 0;
  const rateNum = parseFloat(rate) || 0;
  const termNum = parseInt(term, 10) || 0;
  const perYear = FREQUENCIES.find(f => f.id === frequency)?.perYear ?? 12;
  const scheduled = frequency !== 'none';
  const installment = scheduled ? payment(principalNum, rateNum, termNum, perYear) : 0;
  const totalPayable = installment > 0 && termNum > 0 ? installment * termNum : principalNum;
  const interest = Math.max(0, totalPayable - principalNum);

  const canSave = party.trim().length > 0 && principalNum > 0 && !saving;

  const reset = () => {
    setDir('borrowed');
    setParty('');
    setSub('');
    setPrincipal('');
    setRate('');
    setFrequency('monthly');
    setTerm('');
    setNextDue('');
    setAccountId('');
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

    const {error} = await supabase.from('debts').insert({
      id: crypto.randomUUID(),
      dir,
      party: party.trim(),
      sub: sub.trim() || null,
      principal: principalNum,
      // Nothing has been repaid yet, so the balance starts at the full amount.
      outstanding: principalNum,
      rate: rateNum || null,
      frequency: scheduled ? frequency : null,
      installment: installment || null,
      next_due: nextDue ? new Date(`${nextDue}T00:00:00`).toISOString() : null,
      account_id: accountId || null,
      term: termNum || null,
      paid: 0,
      tint: dir === 'borrowed' ? '#EF4444' : '#0D9668',
      icon: dir === 'borrowed' ? 'coins' : 'landmark',
      owner_id: ownerId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      setErr(error.message);
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
        New debt
      </button>

      <Modal
        open={open}
        onClose={close}
        title="New debt"
        sub="Money you owe, or money someone owes you."
        width={600}
        footer={
          <>
            <span className="mr-auto text-[12px] text-ink2">
              {installment > 0 ? (
                <>
                  <strong className="tabnum text-[13px] text-ink">
                    {fmtAmount(installment)}
                  </strong>{' '}
                  RWF{' '}
                  {frequency === 'weekly' ? 'a week' : 'a month'}
                  {interest > 0 && (
                    <> · {fmtAmount(interest)} RWF interest over the term</>
                  )}
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
            <button type="button" aria-pressed={dir === 'borrowed'} onClick={() => setDir('borrowed')}>
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
          <div>
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
      </Modal>
    </>
  );
}
