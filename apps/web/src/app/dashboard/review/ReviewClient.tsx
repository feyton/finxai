'use client';

import {format} from 'date-fns';
import {useCallback, useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, type CategoryId, builtinSubcats, resolveCat} from '@/lib/theme';
import {
  ignoreAutoRecord,
  promoteAutoRecord,
  recordMerchantRule,
  syncAccountBalance,
} from '@/lib/reviewActions';
import type {Account, AutoRecord, Subcategory} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Modal} from '@/components/Modal';
import {Card, CatChip, Conf, LocationLink, Money, Pill, WEmpty} from '@/components/ui';

const CAT_LIST = Object.values(CATS);
const TYPE_OPTIONS = [
  {id: 'expense', label: 'Money out'},
  {id: 'income', label: 'Money in'},
  {id: 'transfer', label: 'Transfer'},
] as const;

type TxType = (typeof TYPE_OPTIONS)[number]['id'];

interface Fix {
  merchant: string;
  category: CategoryId;
  subcategory: string;
  accountId: string;
  type: TxType;
  note: string;
}

export function ReviewClient({
  initialRecords,
  accounts,
  customSubcats,
  ownerId,
}: {
  initialRecords: AutoRecord[];
  accounts: Account[];
  customSubcats: Subcategory[];
  ownerId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [records, setRecords] = useState<AutoRecord[]>(initialRecords);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fixing, setFixing] = useState<AutoRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const accName = useMemo(
    () => new Map(accounts.map(a => [a.id, a.name ?? 'Account'])),
    [accounts],
  );

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

  const drop = (id: string) => setRecords(prev => prev.filter(r => r.id !== id));

  /**
   * Confirm as-is: the AI's reading was right. Files the transaction, recomputes the
   * account balance, and counts a confirmation for this counterparty so the same
   * reading scores higher next time.
   */
  const confirm = useCallback(
    async (record: AutoRecord) => {
      setBusyId(record.id);
      setErr(null);
      try {
        const {txType} = await promoteAutoRecord(supabase, {record, ownerId, accounts});
        await syncAccountBalance(supabase, record.account_id ?? '');
        if (record.merchant) {
          // Confirming a transfer reinforces the transfer rule for this counterparty;
          // otherwise the category rule, exactly as the phone does it.
          await recordMerchantRule(supabase, {
            merchant: record.merchant,
            category: txType === 'transfer' ? 'transfer' : record.category ?? '',
            subcategory: txType === 'transfer' ? '' : record.subcategory ?? '',
            ownerId,
            kind: 'confirmation',
          });
        }
        drop(record.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not confirm this record');
      } finally {
        setBusyId(null);
      }
    },
    [supabase, ownerId, accounts],
  );

  /** Save the corrections, file the record, and teach the classifier what was wrong. */
  const applyFix = useCallback(
    async (record: AutoRecord, fix: Fix) => {
      setBusyId(record.id);
      setErr(null);
      try {
        const merchant = fix.merchant || record.merchant || record.payee || '';
        const {accountId} = await promoteAutoRecord(supabase, {
          record,
          ownerId,
          accounts,
          overrides: {
            // The id, not the label: this is what the phone's review path writes, and
            // every reader runs the value through resolveCat either way.
            category: fix.category,
            subcategory: fix.subcategory,
            merchant,
            accountId: fix.accountId,
            type: fix.type,
            note: fix.note,
          },
        });
        await syncAccountBalance(supabase, accountId);
        if (merchant) {
          // 'transfer' is a learned outcome just like a category — this counterparty
          // will auto-classify as a transfer next time, and a real category explicitly
          // teaches "NOT a transfer". The typed name is stored as the display name so
          // a badly-extracted counterparty is renamed on future messages too.
          await recordMerchantRule(supabase, {
            merchant,
            category: fix.type === 'transfer' ? 'transfer' : fix.category,
            subcategory: fix.type === 'transfer' ? '' : fix.subcategory,
            ownerId,
            kind: 'correction',
            displayName: merchant,
          });
        }
        setFixing(null);
        drop(record.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not save this correction');
      } finally {
        setBusyId(null);
      }
    },
    [supabase, ownerId, accounts],
  );

  /** Not a transaction at all — remember the message so the phone stops offering it. */
  const ignore = useCallback(
    async (record: AutoRecord) => {
      setBusyId(record.id);
      setErr(null);
      try {
        await ignoreAutoRecord(supabase, {record, ownerId});
        drop(record.id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Could not ignore this record');
      } finally {
        setBusyId(null);
      }
    },
    [supabase, ownerId],
  );

  return (
    <div className="flex flex-col gap-4 px-5 pb-14 pt-5 md:px-7">
      {err && <div className="banner-err">{err}</div>}

      {records.length > 0 && (
        <div
          className="flex items-center gap-2 rounded-[11px] px-3.5 py-2.5 text-[12.5px]"
          style={{background: 'var(--accent-soft)', color: 'var(--accent-700)'}}>
          <Icon name="sparkles" size={14} sw={2.2} />
          Every fix trains your AI — it won&apos;t make the same mistake twice. Records
          cleared here disappear from the phone as soon as it syncs.
        </div>
      )}

      {records.length === 0 ? (
        <Card pad={0}>
          <WEmpty
            icon="check"
            title="All sorted"
            sub="Nothing is waiting for review. Check back after your next transaction."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {records.map(r => (
            <ReviewCard
              key={r.id}
              record={r}
              accountName={accName.get(r.account_id ?? '') ?? '—'}
              busy={busyId === r.id}
              onConfirm={() => confirm(r)}
              onIgnore={() => ignore(r)}
              onFix={() => setFixing(r)}
            />
          ))}
        </div>
      )}

      {fixing && (
        <FixModal
          key={fixing.id}
          record={fixing}
          accounts={accounts}
          optionsFor={optionsFor}
          busy={busyId === fixing.id}
          onCancel={() => setFixing(null)}
          onSave={fix => applyFix(fixing, fix)}
        />
      )}
    </div>
  );
}

// ── One pending record ───────────────────────────────────────────────────────
function ReviewCard({
  record,
  accountName,
  busy,
  onConfirm,
  onFix,
  onIgnore,
}: {
  record: AutoRecord;
  accountName: string;
  busy: boolean;
  onConfirm: () => void;
  onFix: () => void;
  onIgnore: () => void;
}) {
  const catId = resolveCat(record.category ?? '');
  const isTransfer = record.transaction_type === 'transfer';

  return (
    <Card pad={0}>
      {/* Raw SMS — for double-checking what the AI actually read */}
      <div className="border-b border-line bg-surface2 px-4 py-3">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-ink3">
            {record.sender ?? 'SMS'}
          </span>
          {/* Which path classified this. A row that never reached the model is wrong
              for a different reason than one the AI classified confidently, and the
              phone is the only place it can be re-run — so the badge says so rather
              than offering a button this page cannot honour. */}
          {record.parse_source === 'ai' ? (
            <Pill color="var(--accent-700)" bg="var(--accent-soft)" icon="sparkles">
              AI
            </Pill>
          ) : (
            <Pill color="var(--warn)" bg="rgba(217,119,6,0.14)" icon="alert">
              {record.parse_source === 'regex'
                ? 'offline — re-run on the phone'
                : 'provenance unknown'}
            </Pill>
          )}
          <span className="ml-auto text-[11px] text-ink3">
            {record.date_time ? format(new Date(record.date_time), 'd MMM yyyy · HH:mm') : '—'}
            {' · '}
            {accountName}
          </span>
        </div>
        <div className="font-mono text-[11px] leading-relaxed text-ink2">
          {record.sms ?? '—'}
        </div>
      </div>

      {/* What the AI made of it */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <CatChip cat={record.category ?? ''} size={38} />
        <div className="min-w-[160px] flex-1">
          <div className="text-[14px] font-semibold">
            {record.merchant || record.payee || 'Unknown'}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink3">
            {isTransfer ? 'Between your accounts' : CATS[catId]?.label ?? catId}
            {!isTransfer && record.subcategory && (
              <Pill color="var(--accent-700)" bg="var(--accent-soft)" icon="sparkles">
                {record.subcategory}
              </Pill>
            )}
            {(record.fees ?? 0) > 0 && <span>· fee {record.fees} RWF</span>}
          </div>
        </div>
        {isTransfer && (
          <Pill icon="swap" color="var(--info)" bg="rgba(37,99,235,0.12)">
            Transfer
          </Pill>
        )}
        <div className="flex flex-col items-end gap-1">
          <Money amount={record.amount ?? 0} type={record.transaction_type} size={15} />
          <Conf value={record.confidence} />
        </div>
      </div>

      {/* Where the phone was when the alert arrived. Often the fastest way to settle
          the question this card is asking — a bare "payment of 6,300 RWF to Lambert
          005868" is unrecognisable as text, but the place it happened is not. Money-out
          only, so most records will not show it. */}
      {record.lat != null && record.lon != null && (
        <div className="flex items-center gap-2 px-4 pb-3 text-[11.5px] text-ink3">
          <span>Where this happened</span>
          <LocationLink lat={record.lat} lon={record.lon} accuracyM={record.accuracy_m} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <button className="btn btn-danger" disabled={busy} onClick={onIgnore}>
          <Icon name="x" size={13} />
          Not a transaction
        </button>
        <div className="flex-1" />
        <button className="btn" disabled={busy} onClick={onFix}>
          <Icon name="pencil" size={13} />
          Fix
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          <Icon name="check" size={13} />
          {busy ? 'Working…' : 'Confirm'}
        </button>
      </div>
    </Card>
  );
}

// ── Correction form ──────────────────────────────────────────────────────────
function FixModal({
  record,
  accounts,
  optionsFor,
  busy,
  onCancel,
  onSave,
}: {
  record: AutoRecord;
  accounts: Account[];
  optionsFor: (cat: CategoryId) => {name: string; icon: string}[];
  busy: boolean;
  onCancel: () => void;
  onSave: (fix: Fix) => void;
}) {
  const [merchant, setMerchant] = useState(record.merchant || record.payee || '');
  const [category, setCategory] = useState<CategoryId>(resolveCat(record.category ?? ''));
  const [subcategory, setSubcategory] = useState(record.subcategory ?? '');
  const [accountId, setAccountId] = useState(record.account_id ?? '');
  const [note, setNote] = useState(record.note ?? '');
  const [type, setType] = useState<TxType>(
    record.transaction_type === 'income'
      ? 'income'
      : record.transaction_type === 'transfer'
      ? 'transfer'
      : 'expense',
  );
  const subcatOptions = useMemo(() => optionsFor(category), [optionsFor, category]);

  const save = () =>
    onSave({
      merchant: merchant.trim(),
      category,
      subcategory,
      accountId,
      type,
      note: note.trim(),
    });

  return (
    <Modal
      open
      onClose={onCancel}
      title="Fix this transaction"
      sub="Your edits are saved with the record and train the AI to tag future SMS correctly."
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={13} />
            {busy ? 'Saving…' : 'Save & confirm'}
          </button>
        </>
      }>
      <div className="flex flex-col gap-4">
        <div
          className="rounded-[10px] p-3 font-mono text-[10.5px] leading-relaxed text-ink2"
          style={{background: 'var(--surface-2)', border: '1px solid var(--border)'}}>
          {record.sms ?? '—'}
        </div>

        {/* Kept next to the raw SMS: naming an unrecognisable counterparty is the
            hardest field on this form, and the place it happened is usually the only
            clue the message itself does not carry. */}
        {record.lat != null && record.lon != null && (
          <div className="flex items-center gap-2 text-[11.5px] text-ink3">
            <span>Where this happened</span>
            <LocationLink lat={record.lat} lon={record.lon} accuracyM={record.accuracy_m} />
          </div>
        )}

        <div>
          <label className="lbl" htmlFor="fix-type">
            Type
          </label>
          <div className="seg" id="fix-type">
            {TYPE_OPTIONS.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={type === t.id}
                onClick={() => setType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {type === 'transfer' && (
            <p className="mt-1.5 text-[11.5px] text-ink3">
              Between your own accounts — excluded from income &amp; spending. The AI
              will remember this counterparty as a transfer.
            </p>
          )}
        </div>

        <div>
          <label className="lbl" htmlFor="fix-merchant">
            Merchant name
          </label>
          <input
            id="fix-merchant"
            className="inp"
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            placeholder="e.g. Simba Supermarket"
            onKeyDown={e => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault();
                save();
              }
            }}
          />
        </div>

        <div>
          <label className="lbl" htmlFor="fix-account">
            Payment channel
          </label>
          <select
            id="fix-account"
            className="select w-full"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category is meaningless for a transfer — it is money moving between the
            user's own accounts, not spending. */}
        {type !== 'transfer' && (
          <>
            <div>
              <label className="lbl" htmlFor="fix-category">
                Category
              </label>
              <select
                id="fix-category"
                className="select w-full"
                value={category}
                onChange={e => {
                  setCategory(e.target.value as CategoryId);
                  // Subcategories belong to one category; keeping the old one would
                  // file the record under a pair that does not exist.
                  setSubcategory('');
                }}>
                {CAT_LIST.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.label}
                  </option>
                ))}
              </select>
            </div>

            {subcatOptions.length > 0 && (
              <div>
                <label className="lbl" htmlFor="fix-subcategory">
                  Subcategory
                </label>
                <select
                  id="fix-subcategory"
                  className="select w-full"
                  value={subcategory}
                  onChange={e => setSubcategory(e.target.value)}>
                  <option value="">— none —</option>
                  {subcatOptions.map(s => (
                    <option key={s.name} value={s.name}>
                      {s.icon} {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div>
          <label className="lbl" htmlFor="fix-note">
            Note (optional)
          </label>
          <textarea
            id="fix-note"
            className="inp resize-y"
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Why this transaction, who it was with…"
          />
        </div>
      </div>
    </Modal>
  );
}
