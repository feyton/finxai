'use client';

import {endOfMonth, format, startOfMonth, subDays, subMonths} from 'date-fns';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {
  CATS,
  type CategoryId,
  builtinSubcats,
  categoriesForDirection,
  categoriesForType,
  coerceForType,
  fmtAmount,
  resolveCat,
  validForType,
} from '@/lib/theme';
import type {Account, Subcategory, Tag, Transaction} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Card, CatChip, Conf, LocationLink, Money, Pill, WEmpty} from '@/components/ui';
import {rebalanceAccount, recordMerchantRule} from '@/lib/reviewActions';
import {normalizeMerchant} from '@/lib/shared/merchantNormalize';
import {parseTagIds, serializeTagIds, tagTotals} from '@/lib/shared/tags';
import {applyTag, ensureTag} from '@/lib/tagActions';
import {TagChip, TagPickerList, tagColor as tagColorOf} from '@/components/TagChip';

const CAT_LIST = Object.values(CATS);
const TYPE_OPTIONS = ['expense', 'income', 'transfer'] as const;

const PERIODS = {
  all: 'Any time',
  d7: 'Last 7 days',
  d30: 'Last 30 days',
  month: 'This month',
  lastMonth: 'Last month',
} as const;
type Period = keyof typeof PERIODS;

function periodRange(p: Period): [number, number] {
  const now = new Date();
  switch (p) {
    case 'd7':
      return [subDays(now, 7).getTime(), Infinity];
    case 'd30':
      return [subDays(now, 30).getTime(), Infinity];
    case 'month':
      return [startOfMonth(now).getTime(), Infinity];
    case 'lastMonth': {
      const m = subMonths(now, 1);
      return [startOfMonth(m).getTime(), endOfMonth(m).getTime()];
    }
    default:
      return [-Infinity, Infinity];
  }
}

type SortKey = 'date' | 'amount';

/** Money out / in / moved for a set of rows. Transfers are kept apart: counting
 *  MoMo → savings as spending is how "you spent 2M this month" stops being true. */
function totalsOf(rows: Transaction[]) {
  let out = 0;
  let inn = 0;
  let moved = 0;
  for (const t of rows) {
    const a = Math.abs(t.amount ?? 0);
    if (t.transaction_type === 'income') inn += a;
    else if (t.transaction_type === 'transfer') moved += a;
    else out += a;
  }
  return {out, inn, moved, net: inn - out};
}

// `.in('id', ids)` puts every id in the query string. 36 chars each, so a "select
// all 600" bulk edit is a ~22KB URL — past what proxies reliably pass. Batches keep
// each request small; 150 ids is ~5.5KB.
function chunk<T>(xs: T[], n = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function merchantKey(t: Transaction): string {
  return normalizeMerchant(t.merchant || t.payee || '').key;
}

function toCsv(rows: Transaction[], accName: Map<string, string>, tagName: Map<string, string> = new Map()): string {
  const head = 'date,merchant,category,subcategory,type,account,amount,fees,note,tags';
  const lines = rows.map(t =>
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
      JSON.stringify(
        parseTagIds(t.tag_ids)
          .map(id => tagName.get(id))
          .filter(Boolean)
          .join('; '),
      ),
    ].join(','),
  );
  return [head, ...lines].join('\n');
}

function download(csv: string, name: string) {
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** A dropdown panel that closes on an outside click. */
function Menu({
  open,
  onClose,
  button,
  children,
  align = 'left',
}: {
  open: boolean;
  onClose: () => void;
  button: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative">
      {button}
      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-[110%] z-30 max-h-[320px] min-w-[210px] overflow-y-auto rounded-[10px] p-1.5`}
          style={{background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)'}}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({onClick, children}: {onClick: () => void; children: React.ReactNode}) {
  return (
    <div
      onClick={onClick}
      className="press flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] hover:bg-surface2">
      {children}
    </div>
  );
}

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
// `type`, when given, limits the menu to categories valid for it — there is no
// income called Groceries (taxonomy v2). Omitted only where every category is a
// legitimate answer (a merchant rule applies in either direction).
function InlineCatSelect({
  value,
  onChange,
  type,
  direction,
}: {
  value: CategoryId;
  onChange: (c: CategoryId) => void;
  type?: string | null;
  direction?: 'in' | 'out';
}) {
  const choices = type
    ? categoriesForType(type)
        .filter(id => (type === 'transfer' && direction ? categoriesForDirection(direction).includes(id) : true))
        .map(id => CATS[id])
    : CAT_LIST;
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
          {choices.map(ct => (
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
  initialTags,
  ownerId,
  presetAccount = 'all',
  presetTag = 'all',
}: {
  initialTx: Transaction[];
  accounts: Account[];
  initialSplits: any[];
  initialRules: any[];
  initialTags: Tag[];
  ownerId: string;
  presetAccount?: string;
  presetTag?: string;
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
  const [period, setPeriod] = useState<Period>('all');
  const [tags, setTags] = useState<Tag[]>(initialTags);
  // 'all' | 'any' (has at least one tag) | 'none' | a tag id
  const [tagFilter, setTagFilter] = useState(presetTag);
  const [sort, setSort] = useState<{key: SortKey; dir: 'asc' | 'desc'}>({key: 'date', dir: 'desc'});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<'cat' | 'type' | 'tag' | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Off by default: a bulk recategorize is often a one-off cleanup ("these were
  // all a trip"), and a rule would keep filing that merchant there forever.
  const [teach, setTeach] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Shift-click range selection needs the row the previous click landed on.
  const anchor = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
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
  }, [q, acct, cat, source, type, onlyReview, period, tagFilter]);

  useEffect(() => {
    supabase
      .from('subcategories')
      .select('*')
      .then(({data}) => setCustomSubcats((data ?? []) as Subcategory[]));
  }, [supabase]);


  const accName = useMemo(() => new Map(accounts.map(a => [a.id, a.name ?? 'Account'])), [accounts]);
  const tagById = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags]);
  const tagName = useMemo(() => new Map(tags.map(t => [t.id, t.name])), [tags]);
  // Ids with no tag row behind them (deleted, or a shared editor's own tag) are
  // skipped rather than rendered as blank chips.
  const tagsOf = useCallback(
    (t: Transaction) => parseTagIds(t.tag_ids).map(id => tagById.get(id)).filter((x): x is Tag => !!x),
    [tagById],
  );
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

  const filtered = useMemo(() => {
    const [from, to] = periodRange(period);
    const needle = q.trim().toLowerCase();
    const rows = tx.filter(t => {
      if (needle) {
        const hay = `${t.merchant ?? ''} ${t.payee ?? ''} ${t.note ?? ''} ${t.subcategory ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (acct !== 'all' && t.account_id !== acct) return false;
      if (cat !== 'all' && resolveCat(t.category ?? '') !== cat) return false;
      if (source !== 'all' && (t.source ?? 'manual') !== source) return false;
      if (type !== 'all' && t.transaction_type !== type) return false;
      if (onlyReview && !needsReview(t)) return false;
      if (tagFilter !== 'all') {
        const ids = parseTagIds(t.tag_ids).filter(id => tagById.has(id));
        if (tagFilter === 'any' ? ids.length === 0 : tagFilter === 'none' ? ids.length > 0 : !ids.includes(tagFilter)) {
          return false;
        }
      }
      if (period !== 'all') {
        const ts = t.date_time ? new Date(t.date_time).getTime() : NaN;
        if (!(ts >= from && ts <= to)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const when = (t: Transaction) => (t.date_time ? new Date(t.date_time).getTime() : 0);
    rows.sort((a, b) =>
      sort.key === 'amount'
        ? dir * (Math.abs(a.amount ?? 0) - Math.abs(b.amount ?? 0)) || when(b) - when(a)
        : dir * (when(a) - when(b)),
    );
    return rows;
  }, [tx, q, acct, cat, source, type, onlyReview, needsReview, period, sort, tagFilter, tagById]);

  const filtersActive =
    q !== '' || acct !== 'all' || cat !== 'all' || source !== 'all' || type !== 'all' || onlyReview || period !== 'all' || tagFilter !== 'all';
  const resetFilters = () => {
    setQ('');
    setAcct('all');
    setCat('all');
    setSource('all');
    setType('all');
    setOnlyReview(false);
    setPeriod('all');
    setTagFilter('all');
  };
  const reviewCount = useMemo(() => tx.filter(needsReview).length, [tx, needsReview]);
  const filteredTotals = useMemo(() => totalsOf(filtered), [filtered]);

  // Selection is kept by id across filter changes on purpose — narrowing a filter to
  // find more rows to add is the normal way a selection is built. But that means some
  // selected rows can be off screen, and a bulk action must never surprise anyone by
  // touching rows they cannot see, so the bar says how many are hidden.
  const selRows = useMemo(() => tx.filter(t => sel.has(t.id)), [tx, sel]);
  const selTotals = useMemo(() => totalsOf(selRows), [selRows]);
  const hiddenSel = useMemo(() => {
    const vis = new Set(filtered.map(t => t.id));
    return selRows.filter(t => !vis.has(t.id)).length;
  }, [selRows, filtered]);

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
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
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
            anchor.current = cursor;
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
      // Stored as the v2 id, checked against the row's own type and direction.
      const row = tx.find(t => t.id === id);
      const stored = coerceForType(catId, row?.transaction_type, row?.transfer_direction);
      patchLocal(id, {category: stored, subcategory: null});
      const {error} = await supabase
        .from('transactions')
        .update({category: stored, subcategory: null})
        .eq('id', id);
      if (error) setErr(error.message);
    },
    [supabase, patchLocal, tx],
  );

  // One wrapper for every bulk action: busy flag, error banner, a short confirmation
  // of what actually happened (including what was skipped and why).
  const runBulk = useCallback(async (fn: () => Promise<string>) => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    setMenu(null);
    try {
      setNotice(await fn());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const skipped = (n: number, why: string) => (n > 0 ? ` · skipped ${n} ${why}` : '');

  const bulkRecategorize = (catId: CategoryId) =>
    runBulk(async () => {
      const label = CATS[catId].label;
      // Only rows the category is valid for (taxonomy v2): "Salary" cannot be
      // bulk-applied to money going out, nor "Groceries" to money coming in.
      const rows = selRows.filter(t => validForType(catId, t.transaction_type));
      const misfit = selRows.length - rows.length;
      const ids = rows.map(t => t.id);
      for (const part of chunk(ids)) {
        // Subcategory cleared, same as the inline picker: subcategories belong to one
        // category, and the old code left "Produce and Vegetables" under Shopping.
        const {error} = await supabase
          .from('transactions')
          .update({category: catId, subcategory: null})
          .in('id', part);
        if (error) throw error;
      }
      const idSet = new Set(ids);
      setTx(prev => prev.map(t => (idSet.has(t.id) ? {...t, category: catId, subcategory: null} : t)));

      let learned = 0;
      if (teach) {
        const seen = new Set<string>();
        for (const t of rows) {
          const name = t.merchant || t.payee || '';
          const key = normalizeMerchant(name).key;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          await recordMerchantRule(supabase, {
            merchant: name,
            category: catId,
            ownerId: t.owner_id,
            kind: 'correction',
          });
          learned++;
        }
        const {data} = await supabase
          .from('merchant_rules')
          .select('*')
          .order('confirmation_count', {ascending: false});
        if (data) setRules(data);
      }
      setSel(new Set());
      return (
        `Moved ${ids.length} to ${label}` +
        (learned ? ` · learned ${learned} merchant rule${learned === 1 ? '' : 's'}` : '') +
        skipped(misfit, `that ${CATS[catId].label} does not fit (money in vs out)`)
      );
    });

  const bulkSetType = (to: 'expense' | 'income') =>
    runBulk(async () => {
      // Transfers are left out: making one into income or expense needs a direction
      // and usually a counterpart row, which is a per-row decision for the drawer.
      const rows = selRows.filter(t => t.transaction_type !== 'transfer' && t.transaction_type !== to);
      const ids = rows.map(t => t.id);
      for (const part of chunk(ids)) {
        const {error} = await supabase
          .from('transactions')
          .update({transaction_type: to, transfer_direction: null})
          .in('id', part);
        if (error) throw error;
      }
      // Same balance rule as the drawer: reverse the old movement, apply the new one,
      // and only after the rows are written so replay reads the new history.
      const deltas = new Map<string, number>();
      for (const t of rows) {
        if (!t.account_id) continue;
        const dl = (movementSign(to) - movementSign(t.transaction_type)) * (t.amount ?? 0);
        deltas.set(t.account_id, (deltas.get(t.account_id) ?? 0) + dl);
      }
      for (const [accId, dl] of deltas) await rebalanceAccount(supabase, accId, dl);

      const idSet = new Set(ids);
      setTx(prev =>
        prev.map(t => (idSet.has(t.id) ? {...t, transaction_type: to, transfer_direction: null} : t)),
      );
      setSel(new Set());
      return (
        `Marked ${ids.length} as ${to}` +
        skipped(selRows.filter(t => t.transaction_type === 'transfer').length, 'transfers') +
        skipped(selRows.filter(t => t.transaction_type === to).length, `already ${to}`)
      );
    });

  const bulkDelete = () => {
    const t = selTotals;
    const ok = window.confirm(
      `Delete ${selRows.length} transaction${selRows.length === 1 ? '' : 's'}?\n\n` +
        `Out ${fmtAmount(t.out)} · In ${fmtAmount(t.inn)}` +
        (t.moved ? ` · Transfers ${fmtAmount(t.moved)}` : '') +
        (hiddenSel ? `\n\n${hiddenSel} of them are hidden by the current filters.` : '') +
        `\n\nThis also deletes them on the phone and cannot be undone.`,
    );
    if (!ok) return;
    return runBulk(async () => {
      const ids = selRows.map(r => r.id);
      let deleted = 0;
      for (const part of chunk(ids)) {
        const {error: se} = await supabase.from('split_details').delete().in('transaction_id', part);
        if (se) throw se;
        // Ask for the ids back: RLS turns a forbidden delete into a silent no-op
        // (see deleteAutoRecord), and the count below must be what really went.
        const {data, error} = await supabase.from('transactions').delete().in('id', part).select('id');
        if (error) throw error;
        deleted += data?.length ?? 0;
      }
      const deltas = new Map<string, number>();
      for (const r of selRows) {
        if (!r.account_id) continue;
        const dl = -movementSign(r.transaction_type, r.transfer_direction) * (r.amount ?? 0);
        deltas.set(r.account_id, (deltas.get(r.account_id) ?? 0) + dl);
      }
      for (const [accId, dl] of deltas) await rebalanceAccount(supabase, accId, dl);

      const idSet = new Set(ids);
      setTx(prev => prev.filter(r => !idSet.has(r.id)));
      setSplits(prev => prev.filter(s => !idSet.has(s.transaction_id)));
      setSel(new Set());
      if (deleted < ids.length) {
        throw new Error(
          `Deleted ${deleted} of ${ids.length} — the rest were not yours to delete (shared account?). Refresh to see them again.`,
        );
      }
      return `Deleted ${deleted}`;
    });
  };

  const createTag = useCallback(
    async (name: string): Promise<Tag> => {
      const {tag, created} = await ensureTag(supabase, tags, name, ownerId);
      if (created) setTags(prev => [tag, ...prev]);
      return tag;
    },
    [supabase, tags, ownerId],
  );

  /** Ticked if every selected row has it, 'some' if only part of them do. */
  const selTagState = (tag: Tag): boolean | 'some' => {
    const n = selRows.filter(t => parseTagIds(t.tag_ids).includes(tag.id)).length;
    return n === 0 ? false : n === selRows.length ? true : 'some';
  };

  // Clicking a fully-ticked tag removes it; anything else adds it to the rows that
  // lack it. Same as a mail client's label menu — and the reason the 'some' state
  // exists, so a click never strips a tag from rows the user didn't realise had it.
  const bulkTag = (tag: Tag, mode?: 'add' | 'remove') =>
    runBulk(async () => {
      const m = mode ?? (selTagState(tag) === true ? 'remove' : 'add');
      const changed = await applyTag(supabase, selRows, tag.id, m);
      setTx(prev => prev.map(t => (changed.has(t.id) ? {...t, tag_ids: changed.get(t.id) ?? null} : t)));
      // The selection is kept: tagging is usually one step of several on the same rows.
      return m === 'add'
        ? `Tagged ${changed.size} with “${tag.name}”` + skipped(selRows.length - changed.size, 'already tagged')
        : `Removed “${tag.name}” from ${changed.size}`;
    });

  const bulkCreateTag = (name: string) =>
    runBulk(async () => {
      const tag = await createTag(name);
      const changed = await applyTag(supabase, selRows, tag.id, 'add');
      setTx(prev => prev.map(t => (changed.has(t.id) ? {...t, tag_ids: changed.get(t.id) ?? null} : t)));
      return `Tagged ${changed.size} with “${tag.name}”`;
    });

  // The report for the tag being filtered on. Deliberately the tag's WHOLE history,
  // not the filtered rows: "what is the balance on Aline's errands" must not change
  // because the date filter happens to say "this month".
  const activeTag = tagById.get(tagFilter) ?? null;
  const activeTagTotals = useMemo(
    () => (activeTag ? tagTotals(tx.filter(t => parseTagIds(t.tag_ids).includes(activeTag.id))) : null),
    [tx, activeTag],
  );

  /** Grow the selection to every visible row with the same merchant as one already
   *  selected — "fix all of these" in one click, instead of hunting them down. */
  const selectSameMerchant = () => {
    const keys = new Set(selRows.map(merchantKey).filter(Boolean));
    setSel(prev => {
      const n = new Set(prev);
      for (const t of filtered) if (keys.has(merchantKey(t))) n.add(t.id);
      return n;
    });
  };

  const toggleRow = (i: number, shift: boolean) => {
    const id = visible[i]?.id;
    if (!id) return;
    setSel(prev => {
      const n = new Set(prev);
      if (shift && anchor.current !== null && anchor.current < visible.length) {
        // Range takes the state of the row being clicked, like every file manager.
        const on = !prev.has(id);
        const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
        for (let k = a; k <= b; k++) {
          if (on) n.add(visible[k].id);
          else n.delete(visible[k].id);
        }
      } else if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
    anchor.current = i;
  };

  const allVisibleSelected = visible.length > 0 && visible.every(t => sel.has(t.id));
  const someVisibleSelected = visible.some(t => sel.has(t.id));
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  const stamp = () => format(new Date(), 'yyyyMMdd');
  const exportCsv = useCallback(
    () =>
      download(
        toCsv(filtered, accName, tagName),
        activeTag
          ? `finxai-tag-${activeTag.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${stamp()}.csv`
          : `finxai-transactions-${stamp()}.csv`,
      ),
    [filtered, accName, tagName, activeTag],
  );

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? {key, dir: s.dir === 'desc' ? 'asc' : 'desc'} : {key, dir: 'desc'}));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '');

  const openTxn = tx.find(t => t.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4 px-5 pb-14 pt-5 md:px-7">
      {err && <div className="banner-err">{err}</div>}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[220px] items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2">
          <Icon name="search" size={15} color="var(--text-3)" />
          <input
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setQ('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Search merchant, note…  ( / )"
            className="w-full border-none bg-transparent text-[12.5px] outline-none placeholder:text-ink3"
          />
          {q && (
            <button className="press text-ink3" onClick={() => setQ('')} title="Clear search">
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
        <select className="select" value={period} onChange={e => setPeriod(e.target.value as Period)}>
          {(Object.keys(PERIODS) as Period[]).map(p => (
            <option key={p} value={p}>
              {PERIODS[p]}
            </option>
          ))}
        </select>
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
        <select className="select" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="all">Any tag</option>
          <option value="any">Tagged</option>
          <option value="none">Untagged</option>
          {tags.filter(t => !t.archived || t.id === tagFilter).map(t => (
            <option key={t.id} value={t.id}>
              # {t.name}
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
          {reviewCount > 0 && <span className="tabnum opacity-70">{reviewCount}</span>}
        </button>
        {filtersActive && (
          <button className="press text-[12px] font-semibold text-ink2 underline-offset-2 hover:underline" onClick={resetFilters}>
            Reset filters
          </button>
        )}
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

      {activeTag && activeTagTotals && (
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[11px] px-4 py-3"
          style={{background: 'var(--surface)', border: `1px solid ${tagColorOf(activeTag)}40`}}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <TagChip tag={activeTag} size="md" />
            {activeTag.note && <span className="text-[11.5px] text-ink3">{activeTag.note}</span>}
          </div>
          <Stat label="Spent" value={`−${fmtAmount(activeTagTotals.out)}`} color="var(--expense)" />
          <Stat label="Received" value={`+${fmtAmount(activeTagTotals.in)}`} color="var(--income)" />
          {activeTagTotals.settled ? (
            <Pill icon="check" color="var(--income)" bg="rgba(22,163,74,0.12)">
              Settled
            </Pill>
          ) : (
            <Stat
              label={activeTagTotals.net < 0 ? 'Still out' : 'Ahead'}
              value={fmtAmount(Math.abs(activeTagTotals.net))}
              color={activeTagTotals.net < 0 ? 'var(--expense)' : 'var(--income)'}
            />
          )}
          <span className="text-[11px] text-ink3">
            All {activeTagTotals.count} tagged rows, whatever the other filters say
          </span>
          <div className="flex-1" />
          <a className="btn" href="/dashboard/tags">
            <Icon name="tag" size={12} />
            All tags
          </a>
        </div>
      )}

      {notice && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{background: 'var(--accent-soft)', color: 'var(--accent-700)'}}>
          <Icon name="check" size={13} />
          <span className="flex-1">{notice}</span>
          <button className="press" onClick={() => setNotice(null)}>
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Bulk bar when something is selected, otherwise totals for the filter. Same
          slot, so the page does not jump, and the numbers always describe exactly
          the rows an action would touch. */}
      {sel.size > 0 ? (
        <div
          className="sticky top-2 z-20 flex flex-wrap items-center gap-2.5 rounded-[11px] px-3.5 py-2.5"
          style={{background: 'var(--surface)', border: '1px solid var(--accent)', boxShadow: 'var(--shadow-lg)'}}>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-semibold">
              {sel.size} selected
              {hiddenSel > 0 && (
                <span className="font-normal text-ink3"> · {hiddenSel} hidden by filters</span>
              )}
            </span>
            <TotalsLine t={selTotals} />
          </div>
          <div className="mx-1 h-8 w-px bg-line" />
          <Menu
            open={menu === 'cat'}
            onClose={closeMenu}
            button={
              <button className="btn btn-soft" disabled={busy} onClick={() => setMenu(m => (m === 'cat' ? null : 'cat'))}>
                <Icon name="pencil" size={12} />
                Recategorize
                <Icon name="chevronDown" size={11} />
              </button>
            }>
            {CAT_LIST.map(c => (
              <MenuItem key={c.id} onClick={() => bulkRecategorize(c.id)}>
                <CatChip cat={c.id} size={22} r={7} />
                {c.label}
              </MenuItem>
            ))}
            <label className="mt-1 flex cursor-pointer items-start gap-2 border-t border-line px-2 pb-1 pt-2 text-[11.5px] text-ink2">
              <input type="checkbox" className="checkbox mt-0.5" checked={teach} onChange={() => setTeach(v => !v)} />
              <span>Also remember for future SMS from these merchants</span>
            </label>
          </Menu>
          <Menu
            open={menu === 'type'}
            onClose={closeMenu}
            button={
              <button className="btn" disabled={busy} onClick={() => setMenu(m => (m === 'type' ? null : 'type'))}>
                <Icon name="swap" size={12} />
                Set type
                <Icon name="chevronDown" size={11} />
              </button>
            }>
            <MenuItem onClick={() => bulkSetType('expense')}>
              <Icon name="upRight" size={14} color="var(--expense)" /> Expense
            </MenuItem>
            <MenuItem onClick={() => bulkSetType('income')}>
              <Icon name="downLeft" size={14} color="var(--income)" /> Income
            </MenuItem>
          </Menu>
          <Menu
            open={menu === 'tag'}
            onClose={closeMenu}
            button={
              <button className="btn" disabled={busy} onClick={() => setMenu(m => (m === 'tag' ? null : 'tag'))}>
                <Icon name="tag" size={12} />
                Tag
                <Icon name="chevronDown" size={11} />
              </button>
            }>
            <TagPickerList tags={tags} isOn={selTagState} onPick={t => bulkTag(t)} onCreate={bulkCreateTag} />
          </Menu>
          <button
            className="btn"
            disabled={busy}
            onClick={selectSameMerchant}
            title="Add every visible row from the same merchants">
            <Icon name="users" size={12} />
            Same merchant
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => download(toCsv(selRows, accName, tagName), `finxai-selected-${stamp()}.csv`)}>
            <Icon name="download" size={12} />
            Export
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={bulkDelete}>
            Delete
          </button>
          <div className="flex-1" />
          {busy && <span className="text-[11.5px] text-ink3">Working…</span>}
          {allVisibleSelected && filtered.length > visible.length && sel.size < filtered.length && (
            <button
              className="press text-[12px] font-semibold"
              style={{color: 'var(--accent-700)'}}
              onClick={() => setSel(new Set(filtered.map(t => t.id)))}>
              Select all {filtered.length.toLocaleString()} matching
            </button>
          )}
          <button className="btn" onClick={() => setSel(new Set())} title="Clear selection (Esc)">
            <Icon name="x" size={12} />
            Clear
          </button>
        </div>
      ) : (
        filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
            <Stat label="Transactions" value={filtered.length.toLocaleString()} />
            <Stat label="Money out" value={`−${fmtAmount(filteredTotals.out)}`} color="var(--expense)" />
            <Stat label="Money in" value={`+${fmtAmount(filteredTotals.inn)}`} color="var(--income)" />
            <Stat
              label="Net"
              value={`${filteredTotals.net < 0 ? '−' : '+'}${fmtAmount(Math.abs(filteredTotals.net))}`}
              color={filteredTotals.net < 0 ? 'var(--expense)' : 'var(--income)'}
            />
            {filteredTotals.moved > 0 && <Stat label="Transfers" value={fmtAmount(filteredTotals.moved)} />}
            <span className="text-[11px] text-ink3">Tip: shift-click a checkbox to select a range</span>
          </div>
        )
      )}

      {/* Table */}
      <Card pad={0}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{borderBottom: '1px solid var(--border)'}}>
                <th className="th w-10 pl-4">
                  {/* Selects what is on screen, not everything the filter matched —
                      rows past the page cap are invisible, and "Select all N
                      matching" in the bulk bar makes reaching for them deliberate. */}
                  <input
                    ref={headerBox}
                    type="checkbox"
                    className="checkbox"
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSel(s => {
                        const n = new Set(s);
                        for (const t of visible) {
                          if (allVisibleSelected) n.delete(t.id);
                          else n.add(t.id);
                        }
                        return n;
                      })
                    }
                  />
                </th>
                <th className="th">
                  <button className="press uppercase" onClick={() => toggleSort('date')}>
                    Date{sortMark('date')}
                  </button>
                </th>
                <th className="th">Merchant</th>
                <th className="th">Category</th>
                <th className="th">Account</th>
                <th className="th" style={{textAlign: 'right'}}>
                  <button className="press uppercase" onClick={() => toggleSort('amount')}>
                    Amount{sortMark('amount')}
                  </button>
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
                const picked = sel.has(t.id);
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
                        : picked
                        ? 'rgba(22,163,74,0.06)'
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
                        checked={picked}
                        // onClick, not onChange: only the mouse event carries shiftKey.
                        onChange={() => {}}
                        onClick={e => toggleRow(i, e.shiftKey)}
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
                          {tagsOf(t).length > 0 && (
                            <div className="my-0.5 flex flex-wrap gap-1">
                              {tagsOf(t).map(tg => (
                                <button
                                  key={tg.id}
                                  className="press"
                                  title={`Show only “${tg.name}”`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setTagFilter(tg.id);
                                  }}>
                                  <TagChip tag={tg} />
                                </button>
                              ))}
                            </div>
                          )}
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
                        <InlineCatSelect
                          value={resolveCat(t.category ?? '', t.transaction_type, t.transfer_direction)}
                          type={t.transaction_type}
                          direction={t.transfer_direction === 'in' ? 'in' : 'out'}
                          onChange={c => applyCategory(t.id, c)}
                        />
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
                <Kbd>/</Kbd> search
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
          tags={tags}
          onCreateTag={createTag}
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
                        // The id: a rule is direction-free, and is resolved against each
                        // transaction's own direction when it is applied.
                        setRules(prev => prev.map(x => (x.id === r.id ? {...x, category: c} : x)));
                        await supabase.from('merchant_rules').update({category: c}).eq('id', r.id);
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
  tags,
  onCreateTag,
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
  tags: Tag[];
  onCreateTag: (name: string) => Promise<Tag>;
  onClose: () => void;
  onLocal: (id: string, patch: Partial<Transaction>) => void;
  onSplitsChange: (txId: string, rows: any[]) => void;
  onDeleted: (id: string) => void;
  setErr: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [merchant, setMerchant] = useState(txn.merchant || txn.payee || '');
  const [catId, setCatId] = useState<CategoryId>(
    resolveCat(txn.category ?? '', txn.transaction_type, txn.transfer_direction),
  );
  const [subcategory, setSubcategory] = useState(txn.subcategory ?? '');
  const [txType, setTxType] = useState(txn.transaction_type ?? 'expense');
  const [amount, setAmount] = useState(String(Math.round(txn.amount ?? 0)));
  const [accountId, setAccountId] = useState(txn.account_id ?? '');
  const [note, setNote] = useState(txn.note ?? '');
  const [tagIds, setTagIds] = useState<string[]>(parseTagIds(txn.tag_ids));
  const [tagMenu, setTagMenu] = useState(false);
  const closeTagMenu = useCallback(() => setTagMenu(false), []);
  const tagById = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags]);
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
      // Reverse the OLD movement, then apply the NEW one. These are two
      // different signs whenever the type changed: re-applying with the
      // original sign moved a flipped expense->income the wrong way, by twice
      // the amount. Replay hides that on any account with a bank-reported
      // balance, which is why it survived — but the delta below is the whole
      // story for manual-only accounts, where nothing ever corrects it.
      const sign = movementSign(txn.transaction_type, txn.transfer_direction);
      const newDirection =
        txType === 'transfer' ? txn.transfer_direction ?? (sign > 0 ? 'in' : 'out') : null;
      const newSign = movementSign(txType, newDirection);
      const deltas = new Map<string, number>();
      const add = (acc: string | null, dl: number) => {
        if (!acc) return;
        deltas.set(acc, (deltas.get(acc) ?? 0) + dl);
      };
      add(txn.account_id, -(sign * (txn.amount ?? 0)));
      add(accountId || txn.account_id, newSign * numericAmount);
      // Balances are settled AFTER the transaction is written, further down —
      // replay reads the rows, so adjusting first would recompute the old state.
      // This also replaces a SELECT-then-UPDATE pair whose gap silently lost a
      // delta whenever the phone synced or a second tab saved in between.

      const cleanMerchant = merchant.trim();
      const patch: Partial<Transaction> = {
        amount: numericAmount,
        account_id: accountId || txn.account_id,
        // The v2 id, valid for the final type (transfers have real categories too).
        category: coerceForType(catId, txType, newDirection),
        subcategory: subcategory || null,
        transaction_type: txType,
        transfer_direction: newDirection,
        note: note || null,
        // `payee` is written alongside `merchant` because the two are kept in step
        // everywhere else — the mobile ingest sets both from the same value, and
        // several lists fall back to `payee` when `merchant` is empty. Updating only
        // one would make a row render its old name in some places and the new one in
        // others. Empty input clears both rather than storing "".
        merchant: cleanMerchant || null,
        payee: cleanMerchant || null,
      };
      // Only written when it changed. Re-sending an unchanged value would overwrite a
      // tag the phone added since this drawer opened, with nothing to show it happened.
      const nextTags = serializeTagIds(tagIds);
      if (nextTags !== serializeTagIds(parseTagIds(txn.tag_ids))) {
        patch.tag_ids = nextTags;
      }
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
      for (const [accId, dl] of deltas) {
        await rebalanceAccount(supabase, accId, dl);
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
      await supabase.from('split_details').delete().eq('transaction_id', txn.id);
      const {error} = await supabase.from('transactions').delete().eq('id', txn.id);
      if (error) throw error;
      // After the delete, so replay sees the history it is meant to recompute.
      // A deletion can also change WHICH row is the balance anchor, which is
      // precisely why a decrement is the wrong tool here.
      if (txn.account_id) {
        await rebalanceAccount(supabase, txn.account_id, -sign * (txn.amount ?? 0));
      }
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

          {(
            <>
              <FieldRow label="Category">
                <InlineCatSelect
                  value={coerceForType(catId, txType, txn.transfer_direction)}
                  type={txType}
                  direction={txn.transfer_direction === 'in' ? 'in' : 'out'}
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

          {/* Tags sit beside the money fields rather than at the bottom: "who was this
              for" is decided at the same moment as "what was it". */}
          <div className="flex items-start justify-between gap-3">
            <span className="pt-1 text-[12.5px] text-ink2">Tags</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {tagIds
                .map(id => tagById.get(id))
                .filter((t): t is Tag => !!t)
                .map(t => (
                  <TagChip key={t.id} tag={t} size="md" onRemove={() => setTagIds(ids => ids.filter(x => x !== t.id))} />
                ))}
              <Menu
                open={tagMenu}
                onClose={closeTagMenu}
                align="right"
                button={
                  <button
                    className="press inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-semibold"
                    style={{border: '1px dashed var(--border)', color: 'var(--text-2)'}}
                    onClick={() => setTagMenu(v => !v)}>
                    <Icon name="plus" size={11} />
                    Tag
                  </button>
                }>
                <TagPickerList
                  tags={tags}
                  isOn={t => tagIds.includes(t.id)}
                  onPick={t =>
                    setTagIds(ids => (ids.includes(t.id) ? ids.filter(x => x !== t.id) : [...ids, t.id]))
                  }
                  onCreate={async name => {
                    try {
                      const t = await onCreateTag(name);
                      setTagIds(ids => (ids.includes(t.id) ? ids : [...ids, t.id]));
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : 'Could not create tag');
                    }
                  }}
                />
              </Menu>
            </div>
          </div>

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
                        {category: 'other_spending', subcategory: '', amount: Math.floor(numericAmount / 2)},
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

function Stat({label, value, color}: {label: string; value: string; color?: string}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.03em] text-ink3">{label}</span>
      <span className="tabnum text-[14px] font-bold" style={{color}}>
        {value}
      </span>
    </div>
  );
}

function TotalsLine({t}: {t: ReturnType<typeof totalsOf>}) {
  return (
    <span className="tabnum text-[11.5px] text-ink2">
      {t.out > 0 && <span style={{color: 'var(--expense)'}}>−{fmtAmount(t.out)} out</span>}
      {t.out > 0 && t.inn > 0 && ' · '}
      {t.inn > 0 && <span style={{color: 'var(--income)'}}>+{fmtAmount(t.inn)} in</span>}
      {(t.out > 0 || t.inn > 0) && t.moved > 0 && ' · '}
      {t.moved > 0 && <span>{fmtAmount(t.moved)} transferred</span>}
    </span>
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
