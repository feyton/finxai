'use client';

import {format} from 'date-fns';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, type CategoryId, builtinSubcats, fmtAmount, resolveCat} from '@/lib/theme';
import type {Account, Subcategory, Transaction} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Card, CatChip, Conf, LocationLink, Money, Pill, WEmpty} from '@/components/ui';

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
  /** Empty means "not set" — never inherited from the parent transaction. */
  subcategory: string;
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
  // The table used to render `filtered.slice(0, 300)` with nothing on screen to say
  // so. Past 300 matches the rest were simply absent — no count, no control — which
  // silently misrepresents a filter as showing everything it found. The cap stays (a
  // few thousand rows of DOM is genuinely slow) but it is now stated and liftable.
  const PAGE = 300;
  const [limit, setLimit] = useState(PAGE);
  // Back to the first page whenever the result set changes, so "Show all" on a narrow
  // filter does not silently carry a huge limit into a broad one.
  useEffect(() => {
    setLimit(PAGE);
  }, [q, acct, cat, source, type, onlyReview]);

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

  // ── Keyboard review ──────────────────────────────────────────────────────
  // The reason to do this work at a desk rather than on the phone is speed, and
  // reaching for the mouse on every row throws that away. j/k move, Enter opens,
  // Space selects, x toggles selection, Esc closes — the vocabulary people already
  // know from mail clients, so there is nothing new to learn.
  //
  // `cursor` is an index into the VISIBLE rows, so it follows filtering rather than
  // pointing at a row that scrolled out of the result set.
  const [cursor, setCursor] = useState<number>(-1);
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    // Keep the cursor inside the list as filters change.
    setCursor(c => (c >= visible.length ? visible.length - 1 : c));
  }, [visible.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never hijack typing. Without this, `j` in the search box would move the
      // cursor instead of filtering, which is the classic way keyboard shortcuts
      // become infuriating.
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (e.key === 'Escape') {
        if (openId) {
          setOpenId(null);
        } else if (sel.size) {
          setSel(new Set());
        }
        return;
      }
      // While the drawer is open the only key that should do anything is Escape —
      // arrowing the table underneath an open editor is disorienting.
      if (openId) {
        return;
      }

      const move = (delta: number) => {
        e.preventDefault();
        setCursor(c => {
          const next = Math.min(Math.max((c < 0 ? -1 : c) + delta, 0), visible.length - 1);
          const row = visible[next];
          if (row) {
            rowRefs.current.get(row.id)?.scrollIntoView({block: 'nearest'});
          }
          return next;
        });
      };

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          move(1);
          break;
        case 'k':
        case 'ArrowUp':
          move(-1);
          break;
        case 'Enter':
          if (cursor >= 0 && visible[cursor]) {
            e.preventDefault();
            setOpenId(visible[cursor].id);
          }
          break;
        case 'x':
        case ' ':
          if (cursor >= 0 && visible[cursor]) {
            e.preventDefault();
            const id = visible[cursor].id;
            setSel(s => {
              const n = new Set(s);
              if (n.has(id)) {
                n.delete(id);
              } else {
                n.add(id);
              }
              return n;
            });
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, cursor, openId, sel.size]);

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
              {visible.map((t, i) => {
                const review = needsReview(t);
                const parts = splitsByTx.get(t.id) ?? [];
                const atCursor = i === cursor;
                return (
                  <tr
                    key={t.id}
                    ref={el => {
                      if (el) {
                        rowRefs.current.set(t.id, el);
                      } else {
                        rowRefs.current.delete(t.id);
                      }
                    }}
                    // Clicking a row moves the cursor there, so mouse and keyboard
                    // share one position instead of fighting over two.
                    onMouseDown={() => setCursor(i)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: atCursor
                        ? 'var(--accent-soft)'
                        : review
                        ? 'rgba(217,119,6,0.04)'
                        : 'transparent',
                      // Inset rather than an outline so the row does not shift.
                      boxShadow: atCursor ? 'inset 3px 0 0 0 var(--accent)' : undefined,
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
                            {/* Which path classified this. An SMS row that never
                                reached the model is the single most useful thing to
                                see while reviewing — a dark classifier looks exactly
                                like a merchant-parsing problem otherwise, which is how
                                it went unnoticed for weeks. Shown only for 'regex',
                                since 'ai' is the expected case and a badge on every
                                row would be noise. */}
                            {t.source === 'sms' && t.parse_source === 'regex' && (
                              <Pill color="var(--warn)" bg="rgba(217,119,6,0.14)">
                                offline
                              </Pill>
                            )}
                            {/* A location means this was captured live as money out —
                                also the only rows the map can show. */}
                            {t.lat != null && (
                              <Icon name="pin" size={11} color="var(--accent-700)" />
                            )}
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

          {/* Row count, always shown. Says what is on screen versus what the filter
              actually matched, so a capped table can never read as a complete one. */}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line px-4 py-3">
              <span className="tabnum text-[12px] text-ink2">
                Showing {Math.min(limit, filtered.length).toLocaleString()} of{' '}
                {filtered.length.toLocaleString()}
                {filtered.length !== tx.length && ` (filtered from ${tx.length.toLocaleString()})`}
              </span>
              {/* Stated, because a keyboard shortcut nobody knows about is not a
                  feature. Kept to the four keys that carry the whole review loop. */}
              <span className="hidden items-center gap-1.5 text-[11px] text-ink3 md:flex">
                <Kbd>j</Kbd>
                <Kbd>k</Kbd> move
                <Kbd>↵</Kbd> open
                <Kbd>x</Kbd> select
                <Kbd>esc</Kbd> close
              </span>
              {limit < filtered.length && (
                <>
                  <button className="btn" onClick={() => setLimit(l => l + PAGE)}>
                    Show {Math.min(PAGE, filtered.length - limit)} more
                  </button>
                  <button className="btn" onClick={() => setLimit(filtered.length)}>
                    Show all {filtered.length.toLocaleString()}
                  </button>
                </>
              )}
            </div>
          )}
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
  const [merchant, setMerchant] = useState(txn.merchant || txn.payee || '');
  const [catId, setCatId] = useState<CategoryId>(resolveCat(txn.category ?? ''));
  const [subcategory, setSubcategory] = useState(txn.subcategory ?? '');
  const [txType, setTxType] = useState(txn.transaction_type ?? 'expense');
  const [amount, setAmount] = useState(String(Math.round(txn.amount ?? 0)));
  const [accountId, setAccountId] = useState(txn.account_id ?? '');
  const [note, setNote] = useState(txn.note ?? '');
  const [splitRows, setSplitRows] = useState<SplitRow[]>(
    parts.map(p => ({
      id: p.id,
      category: resolveCat(p.category ?? ''),
      subcategory: p.subcategory ?? '',
      amount: p.amount ?? 0,
    })),
  );
  const [busy, setBusy] = useState(false);

  const acct = accounts.find(a => a.id === txn.account_id);
  // Extracted so the split rows can offer subcategories for THEIR category rather than
  // the parent's. Kept as one function instead of a second copy of the built-in/custom
  // merge — two copies of this logic is how the pickers would quietly start disagreeing.
  const optionsFor = useCallback(
    (cat: CategoryId) => {
      const list = [...builtinSubcats(cat)];
      for (const s of customSubcats) {
        if (resolveCat(s.category ?? '') !== cat) continue;
        if (!list.some(x => x.name.toLowerCase() === (s.name ?? '').toLowerCase())) {
          list.push({name: s.name, icon: s.icon || '🏷️'});
        }
      }
      return list;
    },
    [customSubcats],
  );
  const subcatOptions = useMemo(() => optionsFor(catId), [optionsFor, catId]);

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

      const cleanMerchant = merchant.trim();
      const patch: Partial<Transaction> = {
        amount: numericAmount,
        account_id: accountId || txn.account_id,
        category: txType === 'transfer' ? txn.category : CATS[catId].label,
        subcategory: txType === 'transfer' ? null : subcategory || null,
        transaction_type: txType,
        transfer_direction: txType === 'transfer' ? txn.transfer_direction ?? (sign > 0 ? 'in' : 'out') : null,
        note: note || null,
        // `payee` is written alongside `merchant` because the two are kept in step
        // everywhere else — the mobile ingest sets both from the same value, and
        // several lists fall back to `payee` when `merchant` is empty. Updating only
        // one would make a row render its old name in some places and the new one in
        // others. Empty input clears both rather than storing "".
        merchant: cleanMerchant || null,
        payee: cleanMerchant || null,
      };
      const {error} = await supabase.from('transactions').update(patch).eq('id', txn.id);
      if (error) throw error;

      // splits replaced atomically
      await supabase.from('split_details').delete().eq('transaction_id', txn.id);
      const newRows = splitRows.map(r => ({
        id: r.id ?? uuid(),
        transaction_id: txn.id,
        amount: r.amount,
        // The ID, not the label. Every reader COALESCEs this with transactions.category
        // and runs the result through resolveCat, so storing a label made reporting depend
        // on fuzzy substring matching to undo it. Rows written earlier still hold labels;
        // __tests__/categoryRoundTrip.test.ts pins that both spellings resolve to the same
        // id, so no backfill is needed.
        category: r.category,
        // NULL, not ''. Readers do COALESCE(s.subcategory, t.subcategory), and COALESCE
        // only skips NULL — '' is a value and wins, so writing it erased the parent's
        // subcategory from reports the moment a transaction was split.
        subcategory: r.subcategory || null,
        note: null,
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
          <div className="min-w-0">
            <h2
              className="truncate text-[19px] font-bold tracking-[-0.01em]"
              style={{fontFamily: 'var(--font-display), system-ui, sans-serif'}}>
              {txn.merchant || txn.payee || 'Transaction'}
            </h2>
            <div className="mt-0.5 text-[12px] text-ink2">
              {txn.date_time ? format(new Date(txn.date_time), 'MMM d, yyyy · HH:mm') : '—'}
              {' · '}
              {acct?.name ?? '—'}
            </div>
            {/* Provenance, which the drawer never showed. When correcting a record the
                first useful question is where it came from and whether the model ever
                saw it — an SMS row marked "offline" is wrong for a different reason
                than one the AI classified confidently. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {txn.source === 'sms' && (
                <Pill color="var(--accent-700)" bg="var(--accent-soft)" icon="sparkles">
                  From SMS
                </Pill>
              )}
              {txn.source === 'sms' && txn.parse_source === 'regex' && (
                <Pill color="var(--warn)" bg="rgba(217,119,6,0.14)">
                  offline — never reached the AI
                </Pill>
              )}
              {txn.lat != null && txn.lon != null && (
                <LocationLink lat={txn.lat} lon={txn.lon} accuracyM={txn.accuracy_m} />
              )}
            </div>
          </div>
          <button className="btn shrink-0" onClick={onClose} title="Close (Esc)">
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

          {/* First field, because the name is what you are looking at when you decide
              a row is wrong. Roughly 10% of SMS rows still carry a parser artefact
              here — "Unknown", "sender:", or a whole "…was completed at…" clause — and
              until now there was no way to correct one from the web at all. */}
          <FieldRow label="Merchant">
            <input
              className="input w-full"
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              placeholder="Who this was with"
              // Enter saves, matching the drawer's primary action, so a name fix is
              // type-and-go rather than type-then-reach-for-the-mouse.
              onKeyDown={e => {
                if (e.key === 'Enter' && !busy) {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </FieldRow>

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
                        {category: catId, subcategory, amount: Math.ceil(numericAmount / 2)},
                        {category: 'shopping', subcategory: '', amount: Math.floor(numericAmount / 2)},
                      ])
                    }>
                    + Split
                  </button>
                )}
              </div>
              {splitRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  {splitRows.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <InlineCatSelect
                        value={s.category}
                        onChange={c2 =>
                          setSplitRows(sp =>
                            sp.map((x, xi) =>
                              // Clear the subcategory: they belong to one category.
                              xi === i ? {...x, category: c2, subcategory: ''} : x,
                            ),
                          )
                        }
                      />
                      {/* Only rendered when the part's category actually has
                          subcategories, so the row never shows an empty control. */}
                      {optionsFor(s.category).length > 0 && (
                        <select
                          className="select min-w-0 flex-1"
                          value={s.subcategory}
                          onChange={e =>
                            setSplitRows(sp =>
                              sp.map((x, xi) =>
                                xi === i ? {...x, subcategory: e.target.value} : x,
                              ),
                            )
                          }>
                          <option value="">— no subcategory —</option>
                          {optionsFor(s.category).map(o => (
                            <option key={o.name} value={o.name}>
                              {o.icon} {o.name}
                            </option>
                          ))}
                        </select>
                      )}
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
                      onClick={() => setSplitRows(sp => [...sp, {category: 'shopping', subcategory: '', amount: 0}])}>
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

/** Keycap, for the shortcut hint under the table. */
function Kbd({children}: {children: React.ReactNode}) {
  return (
    <kbd
      className="rounded border border-line bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold text-ink2"
      style={{fontFamily: 'var(--font-mono), ui-monospace, monospace'}}>
      {children}
    </kbd>
  );
}
