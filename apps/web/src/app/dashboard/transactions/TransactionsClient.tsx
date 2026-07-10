'use client';

import {format} from 'date-fns';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, type CategoryId, builtinSubcats, fmtAmount, resolveCat} from '@/lib/theme';
import type {Account, Subcategory, Transaction} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Card, CatChip, Conf, Money, Pill, WEmpty} from '@/components/ui';

const CAT_LIST = Object.values(CATS);
const TYPE_OPTIONS = ['expense', 'income', 'transfer'] as const;

// Balance-movement sign as originally recorded — type flips re-classify only.
function movementSign(type: string | null, transferDirection?: string | null): number {
  if (type === 'income') return 1;
  if (type === 'transfer') return transferDirection === 'in' ? 1 : -1;
  return -1;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Inline category pill dropdown (design: InlineCatSelect) ─────────────────
function InlineCatSelect({value, onChange}: {value: CategoryId; onChange: (c: CategoryId) => void}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = CATS[value];
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="press inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2 text-[11.5px] font-semibold"
        style={{border: `1px solid ${c.color}33`, background: c.color + '16', color: c.color}}>
        {c.emoji} {c.label}
        <Icon name="chevronDown" size={11} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-[110%] z-30 max-h-[260px] min-w-[190px] overflow-y-auto rounded-[10px] p-1.5"
          style={{background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)'}}>
          {CAT_LIST.map(ct => (
            <div
              key={ct.id}
              onClick={e => {
                e.stopPropagation();
                onChange(ct.id);
                setOpen(false);
              }}
              className="press flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] hover:bg-surface2">
              <CatChip cat={ct.id} size={22} r={7} />
              {ct.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SplitRow {
  id?: string;
  category: CategoryId;
  amount: number;
}

export function TransactionsClient({
  initialTx,
  accounts,
  initialSplits,
  initialRules,
  presetAccount = 'all',
}: {
  initialTx: Transaction[];
  accounts: Account[];
  initialSplits: any[];
  initialRules: any[];
  presetAccount?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tx, setTx] = useState<Transaction[]>(initialTx);
  const [splits, setSplits] = useState<any[]>(initialSplits);
  const [rules, setRules] = useState<any[]>(initialRules);
  const [q, setQ] = useState('');
  const [acct, setAcct] = useState(presetAccount);
  const [cat, setCat] = useState('all');
  const [source, setSource] = useState('all');
  const [type, setType] = useState('all');
  const [onlyReview, setOnlyReview] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [customSubcats, setCustomSubcats] = useState<Subcategory[]>([]);

  useEffect(() => {
    supabase
      .from('subcategories')
      .select('*')
      .then(({data}) => setCustomSubcats((data ?? []) as Subcategory[]));
  }, [supabase]);

  const accName = useMemo(() => new Map(accounts.map(a => [a.id, a.name ?? 'Account'])), [accounts]);
  const splitsByTx = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of splits) {
      const l = m.get(s.transaction_id) ?? [];
      l.push(s);
      m.set(s.transaction_id, l);
    }
    return m;
  }, [splits]);

  const needsReview = useCallback(
    (t: Transaction) => t.source === 'sms' && (t.confidence ?? 1) < 0.85,
    [],
  );

  const filtered = useMemo(
    () =>
      tx.filter(t => {
        if (q) {
          const hay = `${t.merchant ?? ''} ${t.payee ?? ''} ${t.note ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (acct !== 'all' && t.account_id !== acct) return false;
        if (cat !== 'all' && resolveCat(t.category ?? '') !== cat) return false;
        if (source !== 'all' && (t.source ?? 'manual') !== source) return false;
        if (type !== 'all' && t.transaction_type !== type) return false;
        if (onlyReview && !needsReview(t)) return false;
        return true;
      }),
    [tx, q, acct, cat, source, type, onlyReview, needsReview],
  );

  const patchLocal = useCallback((id: string, patch: Partial<Transaction>) => {
    setTx(prev => prev.map(t => (t.id === id ? {...t, ...patch} : t)));
  }, []);

  const applyCategory = useCallback(
    async (id: string, catId: CategoryId) => {
      const label = CATS[catId].label;
      patchLocal(id, {category: label, subcategory: null});
      const {error} = await supabase
        .from('transactions')
        .update({category: label, subcategory: null})
        .eq('id', id);
      if (error) setErr(error.message);
    },
    [supabase, patchLocal],
  );

  const bulkRecategorize = useCallback(
    async (catId: CategoryId) => {
      const ids = [...sel];
      const label = CATS[catId].label;
      setBusy(true);
      setErr(null);
      try {
        const {error} = await supabase.from('transactions').update({category: label}).in('id', ids);
        if (error) throw error;
        setTx(prev => prev.map(t => (sel.has(t.id) ? {...t, category: label} : t)));
        setSel(new Set());
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Bulk update failed');
      } finally {
        setBusy(false);
        setBulkCat(false);
      }
    },
    [sel, supabase],
  );

  const exportCsv = useCallback(() => {
    const head = 'date,merchant,category,subcategory,type,account,amount,fees,note';
    const lines = filtered.map(t =>
      [
        t.date_time ?? '',
        JSON.stringify(t.merchant ?? t.payee ?? ''),
        JSON.stringify(t.category ?? ''),
        JSON.stringify(t.subcategory ?? ''),
        t.transaction_type ?? '',
        JSON.stringify(accName.get(t.account_id ?? '') ?? ''),
        t.amount ?? 0,
        t.fees ?? 0,
        JSON.stringify(t.note ?? ''),
      ].join(','),
    );
    const blob = new Blob([[head, ...lines].join('\n')], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finxai-transactions-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, accName]);

  const openTxn = tx.find(t => t.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4 px-5 pb-14 pt-5 md:px-7">
      {err && <div className="banner-err">{err}</div>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[220px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2">
          <Icon name="search" size={15} color="var(--text-3)" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search merchant, note…"
            className="w-full border-none bg-transparent text-[12.5px] outline-none placeholder:text-ink3"
          />
        </div>
        <select className="select" value={acct} onChange={e => setAcct(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="select" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {CAT_LIST.map(c => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="select" value={type} onChange={e => setType(e.target.value)}>
          <option value="all">Any type</option>
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select className="select" value={source} onChange={e => setSource(e.target.value)}>
          <option value="all">Any source</option>
          <option value="sms">SMS auto-tagged</option>
          <option value="manual">Manual entry</option>
        </select>
        <button
          onClick={() => setOnlyReview(v => !v)}
          className="press flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={{
            border: `1px solid ${onlyReview ? 'transparent' : 'var(--border)'}`,
            background: onlyReview ? 'var(--warn)' : 'var(--surface)',
            color: onlyReview ? '#3a2400' : 'var(--text-2)',
          }}>
          <Icon name="alert" size={13} sw={2.2} />
          Low confidence
        </button>
        <div className="flex-1" />
        <button className="btn" onClick={() => setRulesOpen(true)}>
          <Icon name="settings" size={13} />
          Rules ({rules.length})
        </button>
        <button className="btn" onClick={exportCsv}>
          <Icon name="download" size={13} />
          Export CSV
        </button>
      </div>

      {/* Bulk bar */}
      {sel.size > 0 && (
        <div className="flex items-center gap-2.5 rounded-[11px] border border-line bg-surface2 px-3.5 py-2.5">
          <span className="text-[12.5px] font-semibold">{sel.size} selected</span>
          <div className="relative">
            <button className="btn btn-soft" disabled={busy} onClick={() => setBulkCat(v => !v)}>
              <Icon name="pencil" size={12} />
              Recategorize
            </button>
            {bulkCat && (
              <div
                className="absolute left-0 top-[110%] z-30 max-h-[260px] min-w-[190px] overflow-y-auto rounded-[10px] p-1.5"
                style={{background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)'}}>
                {CAT_LIST.map(c => (
                  <div
                    key={c.id}
                    onClick={() => bulkRecategorize(c.id)}
                    className="press flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] hover:bg-surface2">
                    <CatChip cat={c.id} size={22} r={7} />
                    {c.label}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-danger" onClick={() => setSel(new Set())}>
            <Icon name="x" size={12} />
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <Card pad={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{borderBottom: '1px solid var(--border)'}}>
                <th className="th w-10 pl-4">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={sel.size > 0 && sel.size === filtered.length}
                    onChange={() =>
                      setSel(s => (s.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id))))
                    }
                  />
                </th>
                <th className="th">Date</th>
                <th className="th">Merchant</th>
                <th className="th">Category</th>
                <th className="th">Account</th>
                <th className="th" style={{textAlign: 'right'}}>
                  Amount
                </th>
                <th className="th" style={{textAlign: 'center'}}>
                  Confidence
                </th>
                <th className="th w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map(t => {
                const review = needsReview(t);
                const parts = splitsByTx.get(t.id) ?? [];
                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: review ? 'rgba(217,119,6,0.04)' : 'transparent',
                    }}>
                    <td className="td pl-4">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={sel.has(t.id)}
                        onChange={() =>
                          setSel(s => {
                            const n = new Set(s);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="td text-[12px] text-ink2">
                      {t.date_time ? format(new Date(t.date_time), 'd MMM yy') : '—'}
                    </td>
                    <td className="td cursor-pointer" onClick={() => setOpenId(t.id)}>
                      <div className="flex items-center gap-2.5">
                        <CatChip cat={t.category ?? ''} size={30} />
                        <div>
                          <div className="flex items-center gap-1.5 text-[13px] font-medium">
                            {t.merchant || t.payee || '—'}
                            {t.source === 'sms' && <Icon name="sparkles" size={11} color="var(--accent-700)" />}
                            {parts.length > 0 && (
                              <Pill color="var(--info)" bg="rgba(37,99,235,0.12)">
                                split ×{parts.length}
                              </Pill>
                            )}
                          </div>
                          <div className="text-[10.5px] text-ink3">
                            {t.date_time ? format(new Date(t.date_time), 'HH:mm') : ''}
                            {t.subcategory ? ` · ${t.subcategory}` : ''}
                            {t.note ? ' · 📝' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      {t.transaction_type === 'transfer' ? (
                        <Pill icon="swap" color="var(--info)" bg="rgba(37,99,235,0.12)">
                          Transfer
                        </Pill>
                      ) : (
                        <InlineCatSelect value={resolveCat(t.category ?? '')} onChange={c => applyCategory(t.id, c)} />
                      )}
                    </td>
                    <td className="td text-[12px]">{accName.get(t.account_id ?? '') ?? '—'}</td>
                    <td className="td text-right">
                      <Money amount={t.amount ?? 0} type={t.transaction_type} />
                    </td>
                    <td className="td text-center">
                      {t.source === 'sms' ? <Conf value={t.confidence} /> : <span className="text-[11px] text-ink3">manual</span>}
                    </td>
                    <td className="td">
                      <button className="press text-ink3" onClick={() => setOpenId(t.id)}>
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <WEmpty title="No transactions match" sub="Try adjusting filters" />}
      </Card>

      {/* Drawer */}
      {openTxn && (
        <TxnDrawer
          key={openTxn.id}
          txn={openTxn}
          parts={splitsByTx.get(openTxn.id) ?? []}
          accounts={accounts}
          customSubcats={customSubcats}
          onClose={() => setOpenId(null)}
          onLocal={patchLocal}
          onSplitsChange={(txId, rows) =>
            setSplits(prev => [...prev.filter(s => s.transaction_id !== txId), ...rows])
          }
          onDeleted={id => {
            setTx(prev => prev.filter(t => t.id !== id));
            setOpenId(null);
          }}
          setErr={setErr}
        />
      )}

      {/* Rules modal */}
      {rulesOpen && (
        <div
          onClick={() => setRulesOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{background: 'rgba(10,15,12,0.4)'}}>
          <div
            onClick={e => e.stopPropagation()}
            className="max-h-[86vh] w-[560px] max-w-[92vw] overflow-y-auto rounded-2xl"
            style={{background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)'}}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="text-[15.5px] font-bold">Auto-categorization rules</div>
              <button className="btn" onClick={() => setRulesOpen(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="p-5">
              <div className="mb-3.5 text-[12.5px] text-ink2">
                Learned from your corrections on the phone — a merchant match applies its category before AI scoring, on
                both mobile and web.
              </div>
              <div className="flex flex-col gap-2">
                {rules.map(r => (
                  <div key={r.id} className="flex items-center gap-3 rounded-[10px] bg-surface2 px-3 py-2.5">
                    <div className="flex-1 truncate font-mono text-[12px]">{r.pattern}</div>
                    <InlineCatSelect
                      value={resolveCat(r.category ?? '')}
                      onChange={async c => {
                        const label = CATS[c].label;
                        setRules(prev => prev.map(x => (x.id === r.id ? {...x, category: label} : x)));
                        await supabase.from('merchant_rules').update({category: label}).eq('id', r.id);
                      }}
                    />
                    <span className="tabnum text-[11px] text-ink3">
                      {(r.confirmation_count ?? 0) + (r.correction_count ?? 0)}×
                    </span>
                    <button
                      className="press text-ink3 hover:text-neg"
                      title="Delete rule"
                      onClick={async () => {
                        setRules(prev => prev.filter(x => x.id !== r.id));
                        await supabase.from('merchant_rules').delete().eq('id', r.id);
                      }}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
                {rules.length === 0 && (
                  <div className="py-6 text-center text-[12px] text-ink3">
                    No rules yet — fix a few SMS records on the phone and they appear here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Transaction drawer: classify, subcategory, note, split, raw SMS ─────────
function TxnDrawer({
  txn,
  parts,
  accounts,
  customSubcats,
  onClose,
  onLocal,
  onSplitsChange,
  onDeleted,
  setErr,
}: {
  txn: Transaction;
  parts: any[];
  accounts: Account[];
  customSubcats: Subcategory[];
  onClose: () => void;
  onLocal: (id: string, patch: Partial<Transaction>) => void;
  onSplitsChange: (txId: string, rows: any[]) => void;
  onDeleted: (id: string) => void;
  setErr: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [catId, setCatId] = useState<CategoryId>(resolveCat(txn.category ?? ''));
  const [subcategory, setSubcategory] = useState(txn.subcategory ?? '');
  const [txType, setTxType] = useState(txn.transaction_type ?? 'expense');
  const [amount, setAmount] = useState(String(Math.round(txn.amount ?? 0)));
  const [accountId, setAccountId] = useState(txn.account_id ?? '');
  const [note, setNote] = useState(txn.note ?? '');
  const [splitRows, setSplitRows] = useState<SplitRow[]>(
    parts.map(p => ({id: p.id, category: resolveCat(p.category ?? ''), amount: p.amount ?? 0})),
  );
  const [busy, setBusy] = useState(false);

  const acct = accounts.find(a => a.id === txn.account_id);
  const subcatOptions = useMemo(() => {
    const list = [...builtinSubcats(catId)];
    for (const s of customSubcats) {
      if (resolveCat(s.category ?? '') !== catId) continue;
      if (!list.some(x => x.name.toLowerCase() === (s.name ?? '').toLowerCase())) {
        list.push({name: s.name, icon: s.icon || '🏷️'});
      }
    }
    return list;
  }, [catId, customSubcats]);

  const splitSum = splitRows.reduce((s, x) => s + x.amount, 0);
  const numericAmount = Math.abs(parseInt(amount, 10) || 0);

  const save = async () => {
    if (numericAmount <= 0) return setErr('Enter a valid amount');
    if (splitRows.length > 0 && splitSum !== numericAmount) {
      return setErr(`Split parts must sum to the amount (${fmtAmount(splitSum)} of ${fmtAmount(numericAmount)})`);
    }
    setBusy(true);
    setErr(null);
    try {
      // balance adjustments with the ORIGINAL movement sign
      const sign = movementSign(txn.transaction_type, txn.transfer_direction);
      const deltas = new Map<string, number>();
      const add = (acc: string | null, dl: number) => {
        if (!acc) return;
        deltas.set(acc, (deltas.get(acc) ?? 0) + dl);
      };
      add(txn.account_id, -(sign * (txn.amount ?? 0)));
      add(accountId || txn.account_id, sign * numericAmount);
      for (const [accId, dl] of deltas) {
        if (Math.round(dl) === 0) continue;
        const {data} = await supabase.from('accounts').select('available_balance').eq('id', accId).single();
        await supabase
          .from('accounts')
          .update({available_balance: (data?.available_balance ?? 0) + dl})
          .eq('id', accId);
      }

      const patch: Partial<Transaction> = {
        amount: numericAmount,
        account_id: accountId || txn.account_id,
        category: txType === 'transfer' ? txn.category : CATS[catId].label,
        subcategory: txType === 'transfer' ? null : subcategory || null,
        transaction_type: txType,
        transfer_direction: txType === 'transfer' ? txn.transfer_direction ?? (sign > 0 ? 'in' : 'out') : null,
        note: note || null,
      };
      const {error} = await supabase.from('transactions').update(patch).eq('id', txn.id);
      if (error) throw error;

      // splits replaced atomically
      await supabase.from('split_details').delete().eq('transaction_id', txn.id);
      const newRows = splitRows.map(r => ({
        id: r.id ?? uuid(),
        transaction_id: txn.id,
        amount: r.amount,
        category: CATS[r.category].label,
        subcategory: '',
        note: '',
        owner_id: txn.owner_id,
      }));
      if (newRows.length > 0) {
        const {error: se} = await supabase.from('split_details').insert(newRows);
        if (se) throw se;
      }
      onSplitsChange(txn.id, newRows);
      onLocal(txn.id, patch);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      const sign = movementSign(txn.transaction_type, txn.transfer_direction);
      if (txn.account_id) {
        const {data} = await supabase.from('accounts').select('available_balance').eq('id', txn.account_id).single();
        await supabase
          .from('accounts')
          .update({available_balance: (data?.available_balance ?? 0) - sign * (txn.amount ?? 0)})
          .eq('id', txn.account_id);
      }
      await supabase.from('split_details').delete().eq('transaction_id', txn.id);
      const {error} = await supabase.from('transactions').delete().eq('id', txn.id);
      if (error) throw error;
      onDeleted(txn.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <div onClick={onClose} className="absolute inset-0" style={{background: 'rgba(10,15,12,0.32)'}} />
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col"
        style={{background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-16px 0 40px rgba(0,0,0,0.12)'}}>
        {/* header */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[16px] font-bold">{txn.merchant || txn.payee || 'Transaction'}</div>
            <div className="mt-0.5 text-[12px] text-ink2">
              {txn.date_time ? format(new Date(txn.date_time), 'MMM d, yyyy · HH:mm') : '—'}
              {' · '}
              {acct?.name ?? '—'}
            </div>
          </div>
          <button className="btn" onClick={onClose}>
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <div className="py-1 text-center">
            <CatChip cat={txn.category ?? ''} size={48} r={16} />
            <div className="mt-2">
              <Money amount={numericAmount} type={txType} size={28} />
            </div>
          </div>

          <FieldRow label="Type">
            <div className="flex gap-1.5">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t}
                  onClick={() => setTxType(t)}
                  className="press rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
                  style={{
                    background: txType === t ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: txType === t ? 'var(--accent-700)' : 'var(--text-2)',
                    border: `1px solid ${txType === t ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                  }}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </FieldRow>

          {txType !== 'transfer' && (
            <>
              <FieldRow label="Category">
                <InlineCatSelect
                  value={catId}
                  onChange={c => {
                    setCatId(c);
                    setSubcategory('');
                  }}
                />
              </FieldRow>
              <FieldRow label="Subcategory">
                <select className="select" value={subcategory} onChange={e => setSubcategory(e.target.value)}>
                  <option value="">— none —</option>
                  {subcatOptions.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.icon} {s.name}
                    </option>
                  ))}
                </select>
              </FieldRow>
            </>
          )}

          <FieldRow label="Amount (RWF)">
            <input
              className="input w-[130px] text-right"
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
            />
          </FieldRow>

          <FieldRow label="Account">
            <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Source">
            <Pill
              icon={txn.source === 'sms' ? 'sparkles' : 'pencil'}
              color={txn.source === 'sms' ? 'var(--accent-700)' : 'var(--text-2)'}
              bg={txn.source === 'sms' ? 'var(--accent-soft)' : 'var(--surface-2)'}>
              {txn.source === 'sms'
                ? `Auto-tagged from SMS · ${Math.round((txn.confidence ?? 0) * 100)}%`
                : 'Manual entry'}
            </Pill>
          </FieldRow>

          {txn.sms && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink2">Raw SMS</div>
              <div
                className="rounded-[10px] p-3 font-mono text-[10.5px] leading-relaxed text-ink2"
                style={{background: 'var(--surface-2)', border: '1px solid var(--border)'}}>
                {txn.sms}
              </div>
            </div>
          )}

          {/* Split */}
          {txType !== 'transfer' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11.5px] font-semibold text-ink2">Split transaction</div>
                {splitRows.length === 0 && (
                  <button
                    className="press text-[11.5px] font-semibold"
                    style={{color: 'var(--accent-700)'}}
                    onClick={() =>
                      setSplitRows([
                        {category: catId, amount: Math.ceil(numericAmount / 2)},
                        {category: 'shopping', amount: Math.floor(numericAmount / 2)},
                      ])
                    }>
                    + Split
                  </button>
                )}
              </div>
              {splitRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  {splitRows.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1">
                        <InlineCatSelect
                          value={s.category}
                          onChange={c2 => setSplitRows(sp => sp.map((x, xi) => (xi === i ? {...x, category: c2} : x)))}
                        />
                      </div>
                      <input
                        type="number"
                        className="input w-[100px] text-right"
                        value={s.amount}
                        onChange={e =>
                          setSplitRows(sp => sp.map((x, xi) => (xi === i ? {...x, amount: +e.target.value} : x)))
                        }
                      />
                      <button className="press text-ink3" onClick={() => setSplitRows(sp => sp.filter((_, xi) => xi !== i))}>
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button
                      className="press text-[11.5px] font-semibold"
                      style={{color: 'var(--accent-700)'}}
                      onClick={() => setSplitRows(sp => [...sp, {category: 'shopping', amount: 0}])}>
                      + Add part
                    </button>
                    <span
                      className="tabnum text-[11.5px]"
                      style={{color: splitSum === numericAmount ? 'var(--income)' : 'var(--expense)'}}>
                      {fmtAmount(splitSum)} of {fmtAmount(numericAmount)} allocated
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[11.5px] font-semibold text-ink2">Notes</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note for your records…"
              rows={3}
              className="input w-full resize-y"
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex gap-2.5 border-t border-line p-4">
          <button className="btn btn-danger" disabled={busy} onClick={del}>
            Delete
          </button>
          <div className="flex-1" />
          <button className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            <Icon name="check" size={13} />
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink2">{label}</span>
      {children}
    </div>
  );
}
