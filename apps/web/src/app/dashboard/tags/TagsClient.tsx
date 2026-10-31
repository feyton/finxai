'use client';

import {format} from 'date-fns';
import Link from 'next/link';
import {useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, fmtAmount, resolveCat} from '@/lib/theme';
import type {Account, Tag, Transaction} from '@/lib/types';
import {TAG_COLORS, parseTagIds, tagTotals} from '@/lib/shared/tags';
import {applyTag, ensureTag} from '@/lib/tagActions';
import {Icon} from '@/components/Icon';
import {TagChip, tagColor} from '@/components/TagChip';
import {Card, CatChip, Money, Pill, WEmpty} from '@/components/ui';

function csvFor(rows: Transaction[], accName: Map<string, string>): string {
  const head = 'date,merchant,category,type,account,amount,signed_amount,note';
  const lines = rows.map(t => {
    const incoming =
      t.transaction_type === 'income' || (t.transaction_type === 'transfer' && t.transfer_direction === 'in');
    const a = Math.abs(t.amount ?? 0);
    return [
      t.date_time ?? '',
      JSON.stringify(t.merchant ?? t.payee ?? ''),
      JSON.stringify(t.transaction_type === 'transfer' ? 'Transfer' : t.category ?? ''),
      t.transaction_type ?? '',
      JSON.stringify(accName.get(t.account_id ?? '') ?? ''),
      a,
      incoming ? a : -a,
      JSON.stringify(t.note ?? ''),
    ].join(',');
  });
  return [head, ...lines].join('\n');
}

export function TagsClient({
  initialTags,
  tagged,
  accounts,
  ownerId,
  presetTag,
  setupError,
}: {
  initialTags: Tag[];
  tagged: Transaction[];
  accounts: Account[];
  ownerId: string;
  presetTag: string | null;
  setupError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [rows, setRows] = useState<Transaction[]>(tagged);
  const [openId, setOpenId] = useState<string | null>(presetTag ?? initialTags.find(t => !t.archived)?.id ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState('');
  const [err, setErr] = useState<string | null>(setupError);
  const [busy, setBusy] = useState(false);

  const accName = useMemo(() => new Map(accounts.map(a => [a.id, a.name ?? 'Account'])), [accounts]);

  const rowsByTag = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of rows) {
      for (const id of parseTagIds(t.tag_ids)) m.set(id, [...(m.get(id) ?? []), t]);
    }
    return m;
  }, [rows]);

  const list = tags.filter(t => showArchived || !t.archived);
  const open = tags.find(t => t.id === openId) ?? null;
  const openRows = useMemo(() => (open ? rowsByTag.get(open.id) ?? [] : []), [open, rowsByTag]);
  const totals = useMemo(() => tagTotals(openRows), [openRows]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of openRows) {
      const out = !(t.transaction_type === 'income' || (t.transaction_type === 'transfer' && t.transfer_direction === 'in'));
      if (!out) continue;
      const key = t.transaction_type === 'transfer' ? 'transfer' : resolveCat(t.category ?? '');
      m.set(key, (m.get(key) ?? 0) + Math.abs(t.amount ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [openRows]);

  const span = (rs: Transaction[]) => {
    const ds = rs.map(r => r.date_time).filter(Boolean).sort() as string[];
    if (!ds.length) return '';
    const a = format(new Date(ds[0]), 'd MMM yy');
    const b = format(new Date(ds[ds.length - 1]), 'd MMM yy');
    return a === b ? a : `${a} – ${b}`;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const update = (id: string, patch: Partial<Tag>) =>
    run(async () => {
      if (patch.name !== undefined) {
        const clean = patch.name.trim().replace(/\s+/g, ' ');
        if (!clean) throw new Error('A tag needs a name');
        const clash = tags.find(t => t.id !== id && t.name.toLowerCase() === clean.toLowerCase());
        if (clash) throw new Error(`There is already a tag called “${clash.name}”`);
        patch.name = clean;
      }
      setTags(prev => prev.map(t => (t.id === id ? {...t, ...patch} : t)));
      const {error} = await supabase.from('tags').update(patch).eq('id', id);
      if (error) throw error;
    });

  const create = () =>
    run(async () => {
      const {tag, created} = await ensureTag(supabase, tags, newName, ownerId);
      if (created) setTags(prev => [tag, ...prev]);
      setOpenId(tag.id);
      setNewName('');
    });

  const remove = (tag: Tag) => {
    const n = rowsByTag.get(tag.id)?.length ?? 0;
    if (
      !window.confirm(
        `Delete the tag “${tag.name}”?` +
          (n ? `\n\nIt is removed from ${n} transaction${n === 1 ? '' : 's'}; the transactions themselves stay.` : '') +
          `\n\nTo keep its history but hide it from pickers, archive it instead.`,
      )
    ) {
      return;
    }
    return run(async () => {
      // Strip it from the rows first, so a failure part-way leaves a tag with fewer
      // rows rather than rows pointing at a tag that no longer exists.
      const changed = await applyTag(supabase, rowsByTag.get(tag.id) ?? [], tag.id, 'remove');
      setRows(prev => prev.map(t => (changed.has(t.id) ? {...t, tag_ids: changed.get(t.id) ?? null} : t)));
      const {error} = await supabase.from('tags').delete().eq('id', tag.id);
      if (error) throw error;
      setTags(prev => prev.filter(t => t.id !== tag.id));
      setOpenId(null);
    });
  };

  const exportCsv = () => {
    if (!open) return;
    const blob = new Blob([csvFor(openRows, accName)], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finxai-tag-${open.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pb-14 pt-5 md:px-7">
      {err && <div className="banner-err">{err}</div>}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── Tag list ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName.trim() && create()}
              placeholder="New tag, e.g. Shopping for Aline"
            />
            <button className="btn btn-primary" disabled={busy || !newName.trim()} onClick={create}>
              <Icon name="plus" size={13} />
              Add
            </button>
          </div>

          {list.map(t => {
            const rs = rowsByTag.get(t.id) ?? [];
            const tt = tagTotals(rs);
            const active = t.id === openId;
            return (
              <div
                key={t.id}
                onClick={() => setOpenId(t.id)}
                className="press cursor-pointer rounded-[12px] px-3.5 py-3"
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${active ? tagColor(t) : 'var(--border)'}`,
                  boxShadow: active ? `inset 3px 0 0 0 ${tagColor(t)}` : undefined,
                  opacity: t.archived ? 0.6 : 1,
                }}>
                <div className="flex items-center justify-between gap-2">
                  <TagChip tag={t} size="md" />
                  {rs.length === 0 ? (
                    <span className="text-[11px] text-ink3">unused</span>
                  ) : tt.settled ? (
                    <Pill icon="check" color="var(--income)" bg="rgba(22,163,74,0.12)">
                      Settled
                    </Pill>
                  ) : (
                    <span
                      className="tabnum text-[13px] font-bold"
                      style={{color: tt.net < 0 ? 'var(--expense)' : 'var(--income)'}}>
                      {tt.net < 0 ? '−' : '+'}
                      {fmtAmount(Math.abs(tt.net))}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink3">
                  <span>
                    {rs.length} transaction{rs.length === 1 ? '' : 's'}
                    {t.archived ? ' · archived' : ''}
                  </span>
                  <span>{span(rs)}</span>
                </div>
              </div>
            );
          })}
          {list.length === 0 && !setupError && (
            <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[12px] text-ink3">
              No tags yet. Create one here, or select transactions on the Transactions page and use <b>Tag</b>.
            </div>
          )}
          {tags.some(t => t.archived) && (
            <button className="press self-start text-[12px] text-ink2 underline-offset-2 hover:underline" onClick={() => setShowArchived(v => !v)}>
              {showArchived ? 'Hide archived' : `Show archived (${tags.filter(t => t.archived).length})`}
            </button>
          )}
        </div>

        {/* ── Report for the open tag ──────────────────────────────────── */}
        {open ? (
          <Card pad={0}>
            <div className="flex flex-col gap-4 border-b border-line p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {/* Keyed by id so switching tags resets the uncontrolled inputs. */}
                  <input
                    key={`n-${open.id}`}
                    defaultValue={open.name}
                    onBlur={e => e.target.value.trim() !== open.name && update(open.id, {name: e.target.value})}
                    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-full border-none bg-transparent text-[20px] font-bold outline-none"
                    style={{fontFamily: 'var(--font-display), system-ui, sans-serif'}}
                  />
                  <input
                    key={`d-${open.id}`}
                    defaultValue={open.note ?? ''}
                    onBlur={e => (e.target.value || null) !== open.note && update(open.id, {note: e.target.value || null})}
                    placeholder="Add a note — who it is for, what it covers…"
                    className="w-full border-none bg-transparent text-[12.5px] text-ink2 outline-none placeholder:text-ink3"
                  />
                  <div className="flex items-center gap-1.5">
                    {TAG_COLORS.map(c => (
                      <button
                        key={c}
                        title="Colour"
                        onClick={() => update(open.id, {color: c})}
                        className="press h-4 w-4 rounded-full"
                        style={{background: c, outline: tagColor(open) === c ? `2px solid ${c}` : 'none', outlineOffset: 2}}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn" href={`/dashboard/transactions?tag=${open.id}`}>
                    <Icon name="receipt" size={12} />
                    Open in Transactions
                  </Link>
                  <button className="btn" onClick={exportCsv} disabled={!openRows.length}>
                    <Icon name="download" size={12} />
                    Export CSV
                  </button>
                  <button className="btn" disabled={busy} onClick={() => update(open.id, {archived: open.archived ? 0 : 1})}>
                    {open.archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => remove(open)}>
                    Delete
                  </button>
                </div>
              </div>

              {/* The three numbers the tag exists for. Transfers count by direction
                  (see shared/tags.ts) — a MoMo send to the person IS money out. */}
              <div className="grid grid-cols-3 gap-3">
                <Figure label="Spent" value={totals.out} color="var(--expense)" sign="−" />
                <Figure label="Received back" value={totals.in} color="var(--income)" sign="+" />
                {totals.settled ? (
                  <div className="rounded-[10px] px-3.5 py-3" style={{background: 'rgba(22,163,74,0.1)'}}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-ink3">Balance</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[18px] font-bold" style={{color: 'var(--income)'}}>
                      <Icon name="check" size={16} sw={2.6} /> Settled
                    </div>
                  </div>
                ) : (
                  <Figure
                    label={totals.net < 0 ? 'Still out of pocket' : 'Received more'}
                    value={Math.abs(totals.net)}
                    color={totals.net < 0 ? 'var(--expense)' : 'var(--income)'}
                  />
                )}
              </div>

              {byCategory.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-ink3">Where it went</div>
                  {byCategory.map(([k, v]) => {
                    const c = k === 'transfer' ? {label: 'Transfers', color: '#2563eb'} : CATS[k as keyof typeof CATS];
                    return (
                      <div key={k} className="flex items-center gap-2.5 text-[12px]">
                        <span className="w-[120px] truncate">{c.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{background: 'var(--surface-3)'}}>
                          <div
                            className="h-full rounded-full"
                            style={{width: `${(v / Math.max(totals.out, 1)) * 100}%`, background: c.color}}
                          />
                        </div>
                        <span className="tabnum w-[90px] text-right font-semibold">{fmtAmount(v)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {openRows.length ? (
              <table className="w-full border-collapse">
                <tbody>
                  {openRows.map(t => (
                    <tr key={t.id} style={{borderBottom: '1px solid var(--border)'}}>
                      <td className="td pl-5 text-[12px] text-ink2">
                        {t.date_time ? format(new Date(t.date_time), 'd MMM yy') : '—'}
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <CatChip cat={t.category ?? ''} size={26} />
                          <div>
                            <div className="text-[13px] font-medium">{t.merchant || t.payee || '—'}</div>
                            {t.note && <div className="text-[10.5px] text-ink3">{t.note}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="td text-[12px] text-ink2">{accName.get(t.account_id ?? '') ?? '—'}</td>
                      <td className="td pr-5 text-right">
                        {t.transaction_type === 'transfer' ? (
                          <span
                            className="tabnum text-[13px] font-semibold"
                            style={{color: t.transfer_direction === 'in' ? 'var(--income)' : 'var(--expense)'}}>
                            {t.transfer_direction === 'in' ? '+' : '−'}
                            {fmtAmount(t.amount ?? 0)}
                          </span>
                        ) : (
                          <Money amount={t.amount ?? 0} type={t.transaction_type} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <WEmpty
                icon="tag"
                title="Nothing tagged yet"
                sub="Select transactions on the Transactions page and choose Tag — or tag one from its detail on the phone"
              />
            )}
          </Card>
        ) : (
          <Card>
            <WEmpty icon="tag" title="Pick a tag" sub="Its spending, what came back, and what is still owed appear here" />
          </Card>
        )}
      </div>
    </div>
  );
}

function Figure({label, value, color, sign = ''}: {label: string; value: number; color: string; sign?: string}) {
  return (
    <div className="rounded-[10px] bg-surface2 px-3.5 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-ink3">{label}</div>
      <div className="tabnum mt-1 text-[18px] font-bold" style={{color}}>
        {value > 0 ? sign : ''}
        {fmtAmount(value)}
        <span className="ml-1 text-[11px] font-medium text-ink3">RWF</span>
      </div>
    </div>
  );
}
