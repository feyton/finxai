'use client';

import {format} from 'date-fns';
import {useCallback, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, type CategoryId, T, fmtMoney, resolveCat} from '@/lib/theme';
import type {Account, Transaction} from '@/lib/types';

const CAT_LIST = Object.values(CATS);
const TYPE_OPTIONS = ['expense', 'income', 'transfer'] as const;

// Balance-movement sign of a transaction as originally recorded, mirroring
// the mobile app: changing the TYPE re-classifies a record — it does not
// move money again, so edits always use the ORIGINAL movement direction.
function movementSign(type: string | null, transferDirection?: string | null): number {
  if (type === 'income') return 1;
  if (type === 'transfer') return transferDirection === 'in' ? 1 : -1;
  return -1;
}

type EditDraft = {
  id: string;
  merchant: string;
  category: CategoryId;
  transaction_type: string;
  amount: string;
  account_id: string;
  note: string;
};

export function TransactionsClient({
  initialTx,
  accounts,
}: {
  initialTx: Transaction[];
  accounts: Account[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tx, setTx] = useState<Transaction[]>(initialTx);
  const [q, setQ] = useState('');
  const [accFilter, setAccFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accName = useMemo(
    () => new Map(accounts.map(a => [a.id, a.name ?? 'Account'])),
    [accounts],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tx.filter(t => {
      if (accFilter !== 'all' && t.account_id !== accFilter) return false;
      if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false;
      if (s) {
        const hay = `${t.merchant ?? ''} ${t.payee ?? ''} ${t.category ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [tx, q, accFilter, typeFilter]);

  const patchLocal = useCallback((id: string, patch: Partial<Transaction>) => {
    setTx(prev => prev.map(t => (t.id === id ? {...t, ...patch} : t)));
  }, []);

  // Fetch-then-set balance adjustment (supabase-js has no expression updates).
  const adjustBalance = useCallback(
    async (accountId: string | null, delta: number) => {
      if (!accountId || !delta) return;
      const {data, error} = await supabase
        .from('accounts')
        .select('available_balance')
        .eq('id', accountId)
        .single();
      if (error) throw error;
      const cur = data?.available_balance ?? 0;
      const {error: upErr} = await supabase
        .from('accounts')
        .update({available_balance: cur + delta})
        .eq('id', accountId);
      if (upErr) throw upErr;
    },
    [supabase],
  );

  const openEdit = useCallback((t: Transaction) => {
    setErr(null);
    setDraft({
      id: t.id,
      merchant: t.merchant ?? t.payee ?? '',
      category: resolveCat(t.category ?? ''),
      transaction_type: t.transaction_type ?? 'expense',
      amount: String(Math.round(t.amount ?? 0)),
      account_id: t.account_id ?? '',
      note: t.note ?? '',
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!draft) return;
    const orig = tx.find(t => t.id === draft.id);
    if (!orig) return;
    const amount = parseInt(draft.amount, 10) || 0;
    const categoryLabel = CATS[draft.category]?.label ?? draft.category;
    setBusy(true);
    setErr(null);
    try {
      // Net balance deltas per account: remove the original effect, add the
      // new — both with the ORIGINAL movement sign (type flips re-classify).
      const s = movementSign(orig.transaction_type, orig.transfer_direction);
      const deltas = new Map<string, number>();
      const add = (acc: string | null, d: number) => {
        if (!acc) return;
        deltas.set(acc, (deltas.get(acc) ?? 0) + d);
      };
      add(orig.account_id, -(s * (orig.amount ?? 0)));
      add(draft.account_id, s * amount);
      for (const [acc, d] of deltas) {
        if (Math.round(d) !== 0) await adjustBalance(acc, d);
      }

      const patch = {
        amount,
        account_id: draft.account_id || null,
        category: categoryLabel,
        merchant: draft.merchant || null,
        transaction_type: draft.transaction_type,
        note: draft.note || null,
      };
      const {error} = await supabase
        .from('transactions')
        .update(patch)
        .eq('id', draft.id);
      if (error) throw error;

      patchLocal(draft.id, patch as Partial<Transaction>);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }, [draft, tx, supabase, adjustBalance, patchLocal]);

  const deleteTx = useCallback(async () => {
    if (!draft) return;
    const orig = tx.find(t => t.id === draft.id);
    if (!orig) return;
    setBusy(true);
    setErr(null);
    try {
      // Reverse the transaction's effect on its account.
      await adjustBalance(
        orig.account_id,
        -(movementSign(orig.transaction_type, orig.transfer_direction) * (orig.amount ?? 0)),
      );
      const {error} = await supabase
        .from('transactions')
        .delete()
        .eq('id', draft.id);
      if (error) throw error;
      setTx(prev => prev.filter(t => t.id !== draft.id));
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }, [draft, tx, supabase, adjustBalance]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const bulkCategorize = useCallback(
    async (catId: CategoryId) => {
      if (!selected.size) return;
      const ids = [...selected];
      const label = CATS[catId].label;
      setBusy(true);
      setErr(null);
      try {
        const {error} = await supabase
          .from('transactions')
          .update({category: label})
          .in('id', ids);
        if (error) throw error;
        setTx(prev =>
          prev.map(t => (selected.has(t.id) ? {...t, category: label} : t)),
        );
        setSelected(new Set());
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Bulk update failed');
      } finally {
        setBusy(false);
      }
    },
    [selected, supabase],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Transactions</div>
          <div className="page-sub">
            {filtered.length} of {tx.length} · click a row to edit
          </div>
        </div>
      </div>

      {err && <div className="banner-err">{err}</div>}

      <div className="filters">
        <input
          className="input"
          placeholder="Search merchant, payee, category…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select
          className="select"
          value={accFilter}
          onChange={e => setAccFilter(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="card" style={{padding: 0}}>
        {filtered.length === 0 ? (
          <div className="empty">No transactions match.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{width: 34}}></th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th style={{textAlign: 'right'}}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const cat = CATS[resolveCat(t.category ?? '')];
                  const isTransfer = t.transaction_type === 'transfer';
                  const isIncome = t.transaction_type === 'income';
                  const cls = isTransfer ? 'muted' : isIncome ? 'pos' : 'neg';
                  const sgn = isTransfer ? '' : isIncome ? '+' : '-';
                  return (
                    <tr
                      key={t.id}
                      className="tx-row"
                      onClick={() => openEdit(t)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleSelect(t.id)}
                        />
                      </td>
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
                          style={{background: cat.color + '22', color: cat.color}}>
                          {cat.emoji} {cat.label}
                          {t.subcategory ? ` · ${t.subcategory}` : ''}
                        </span>
                      </td>
                      <td style={{color: T.text2}}>
                        {accName.get(t.account_id ?? '') || '—'}
                      </td>
                      <td style={{color: T.text3, textTransform: 'capitalize'}}>
                        {t.transaction_type ?? '—'}
                      </td>
                      <td className={`row-amt ${cls}`} style={{textAlign: 'right'}}>
                        {sgn}
                        {fmtMoney(t.amount ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bulkbar">
          <span>{selected.size} selected</span>
          <select
            className="select"
            defaultValue=""
            disabled={busy}
            onChange={e => {
              if (e.target.value) bulkCategorize(e.target.value as CategoryId);
              e.target.value = '';
            }}>
            <option value="">Set category…</option>
            {CAT_LIST.map(c => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* Edit drawer */}
      {draft && (
        <>
          <div className="drawer-backdrop" onClick={() => !busy && setDraft(null)} />
          <div className="drawer">
            <div className="drawer-title">Edit transaction</div>

            <label className="field">
              <span>Merchant</span>
              <input
                className="input"
                value={draft.merchant}
                onChange={e => setDraft({...draft, merchant: e.target.value})}
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select
                className="select"
                value={draft.category}
                onChange={e =>
                  setDraft({...draft, category: e.target.value as CategoryId})
                }>
                {CAT_LIST.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Type</span>
              <select
                className="select"
                value={draft.transaction_type}
                onChange={e =>
                  setDraft({...draft, transaction_type: e.target.value})
                }>
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Amount (RWF)</span>
              <input
                className="input"
                inputMode="numeric"
                value={draft.amount}
                onChange={e =>
                  setDraft({
                    ...draft,
                    amount: e.target.value.replace(/\D/g, ''),
                  })
                }
              />
            </label>

            <label className="field">
              <span>Account</span>
              <select
                className="select"
                value={draft.account_id}
                onChange={e => setDraft({...draft, account_id: e.target.value})}>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Note</span>
              <input
                className="input"
                value={draft.note}
                onChange={e => setDraft({...draft, note: e.target.value})}
              />
            </label>

            {err && <div className="login-err">{err}</div>}

            <div className="drawer-actions">
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={deleteTx}>
                Delete
              </button>
              <div style={{flex: 1}} />
              <button
                className="btn"
                disabled={busy}
                onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={saveEdit}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
