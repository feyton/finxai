'use client';

// People & places on the web — the same rules as the phone's PeopleScreen
// (lib/shared/people is a generated copy of shared/people.ts), so a person set
// up here files payments exactly as the phone's classifier will.

import {useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {CATS, type CategoryId as Cat, categoriesForDirection, fmtAmount} from '@/lib/theme';
import type {Person as PersonRow} from '@/lib/types';
import {
  type Person,
  type PersonSuggestion,
  type PlaceSuggestion,
  RELATIONSHIPS,
  RELATIONSHIP_ORDER,
  type Relationship,
  peopleSuggestionsFromRows,
  personFromRow,
  personKeys,
  placeSuggestionsFromRows,
  refilePlanFromRows,
} from '@/lib/shared/people';
import {Icon} from '@/components/Icon';
import {Card, Pill, WEmpty} from '@/components/ui';

export interface PeopleTxRow {
  id: string;
  merchant: string | null;
  payee: string | null;
  pay_code: string | null;
  amount: number | null;
  category: string | null;
  transaction_type: string | null;
  transfer_direction: string | null;
  transfer_account_id: string | null;
  date_time: string | null;
}

const PAGE = 6;
const OUT_CATS = categoriesForDirection('out');
const IN_CATS = categoriesForDirection('in');

function CatSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: Cat | null;
  options: Cat[];
  placeholder: string;
  onChange: (c: Cat | null) => void;
}) {
  return (
    <select
      className="select min-w-0 flex-1"
      value={value ?? ''}
      onChange={e => onChange((e.target.value || null) as Cat | null)}>
      <option value="">{placeholder}</option>
      {options.map(id => (
        <option key={id} value={id}>
          {CATS[id].emoji} {CATS[id].label}
        </option>
      ))}
    </select>
  );
}

export function PeopleClient({
  initialPeople,
  rows: initialRows,
  ownerId,
  setupError,
}: {
  initialPeople: PersonRow[];
  rows: PeopleTxRow[];
  ownerId: string;
  setupError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [people, setPeople] = useState<Person[]>(() => initialPeople.map(personFromRow));
  const [rows, setRows] = useState<PeopleTxRow[]>(initialRows);
  const [err, setErr] = useState<string | null>(setupError);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [morePeople, setMorePeople] = useState(false);
  const [morePlaces, setMorePlaces] = useState(false);

  const personSuggestions = useMemo(() => peopleSuggestionsFromRows(rows, people), [rows, people]);
  const placeSuggestions = useMemo(
    () => placeSuggestionsFromRows(rows.filter(r => r.transaction_type === 'expense'), people),
    [rows, people],
  );
  const knownPeople = people.filter(p => p.kind === 'person');
  const knownPlaces = people.filter(p => p.kind === 'merchant');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  /** Write a person — merged into one already holding any of these spellings or numbers. */
  const upsert = async (
    input: {kind: 'person' | 'merchant'; name: string; spellings: string[]; phones: string[]; relationship: Relationship;
      categoryOut: Cat | null; categoryIn: Cat | null},
  ): Promise<Person> => {
    const {keys, phones} = personKeys(input.spellings, input.phones);
    const existing = people.find(p => p.matchKeys.some(k => keys.includes(k)) || p.phones.some(ph => phones.includes(ph)));
    const merged: Person = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: input.kind,
      name: input.name.trim() || existing?.name || input.spellings[0] || 'Someone',
      matchKeys: Array.from(new Set([...(existing?.matchKeys ?? []), ...keys])),
      phones: Array.from(new Set([...(existing?.phones ?? []), ...phones])),
      relationship: input.relationship,
      categoryOut: input.categoryOut,
      categoryIn: input.categoryIn,
      note: existing?.note ?? null,
    };
    const row = {
      kind: merged.kind,
      name: merged.name,
      match_keys: JSON.stringify(merged.matchKeys),
      phones: JSON.stringify(merged.phones),
      relationship: merged.relationship,
      category_out: merged.categoryOut,
      category_in: merged.categoryIn,
      note: merged.note,
    };
    const {error} = existing
      ? await supabase.from('people').update(row).eq('id', merged.id)
      : await supabase
          .from('people')
          .insert({...row, id: merged.id, owner_id: ownerId, created_at: new Date().toISOString()});
    if (error) throw error;
    setPeople(ps => [merged, ...ps.filter(p => p.id !== merged.id)]);
    return merged;
  };

  /** Move this person's past payments to what they now file as. */
  const refile = async (person: Person) => {
    const plans = refilePlanFromRows(rows, person);
    if (!plans.length) {
      setNotice(`Nothing to re-file for ${person.name}.`);
      return;
    }
    // One UPDATE per distinct outcome, in id batches — usually one or two groups.
    const groups = new Map<string, string[]>();
    for (const p of plans) {
      const k = JSON.stringify([p.category, p.subcategory || null, p.type, p.transferDirection]);
      groups.set(k, [...(groups.get(k) ?? []), p.id]);
    }
    for (const [k, ids] of groups) {
      const [category, subcategory, type, dir] = JSON.parse(k);
      for (let i = 0; i < ids.length; i += 150) {
        const {error} = await supabase
          .from('transactions')
          .update({category, subcategory, transaction_type: type, transfer_direction: dir})
          .in('id', ids.slice(i, i + 150));
        if (error) throw error;
      }
    }
    const byId = new Map(plans.map(p => [p.id, p]));
    setRows(rs =>
      rs.map(r => {
        const p = byId.get(r.id);
        return p ? {...r, category: p.category, transaction_type: p.type, transfer_direction: p.transferDirection} : r;
      }),
    );
    setNotice(`Re-filed ${plans.length} past payment${plans.length === 1 ? '' : 's'} for ${person.name}.`);
  };

  const remove = (person: Person) =>
    run(async () => {
      if (!confirm(`Forget ${person.name}? Past payments keep their categories.`)) return;
      const {error} = await supabase.from('people').delete().eq('id', person.id);
      if (error) throw error;
      setPeople(ps => ps.filter(p => p.id !== person.id));
    });

  const confirmPerson = (s: PersonSuggestion, rel: Relationship) =>
    run(async () => {
      const person = await upsert({
        kind: 'person', name: s.name, spellings: s.spellings, phones: s.phones, relationship: rel,
        categoryOut: null, categoryIn: null,
      });
      await refile(person);
    });

  const confirmPlace = (s: PlaceSuggestion, cat: Cat) =>
    run(async () => {
      const place = await upsert({
        kind: 'merchant', name: s.name, spellings: s.spellings, phones: [], relationship: 'business',
        categoryOut: cat, categoryIn: null,
      });
      await refile(place);
    });

  // `upsert` matches on spellings/phones; an edit passes neither, so update by id.
  const editById = (p: Person, patch: Partial<Pick<Person, 'relationship' | 'categoryOut' | 'categoryIn'>>) =>
    run(async () => {
      const next: Person = {...p, ...patch};
      const {error} = await supabase
        .from('people')
        .update({relationship: next.relationship, category_out: next.categoryOut, category_in: next.categoryIn})
        .eq('id', p.id);
      if (error) throw error;
      setPeople(ps => ps.map(x => (x.id === p.id ? next : x)));
    });

  const shownPeople = morePeople ? personSuggestions : personSuggestions.slice(0, PAGE);
  const shownPlaces = morePlaces ? placeSuggestions : placeSuggestions.slice(0, PAGE);

  return (
    <div className="flex flex-col gap-5 px-5 py-5 md:px-7">
      {err && (
        <div className="rounded-[10px] px-3 py-2 text-[12.5px]" style={{background: 'var(--surface-2)', color: 'var(--expense)'}}>
          {err}
        </div>
      )}
      {notice && (
        <div className="rounded-[10px] px-3 py-2 text-[12.5px]" style={{background: 'var(--surface-2)', color: 'var(--income)'}}>
          {notice}
        </div>
      )}

      {/* ── Who is this? ── */}
      <Card>
        <div className="mb-1 text-[15px] font-bold">Who is this?</div>
        <div className="mb-4 text-[12.5px] text-ink2">
          People you send money to or receive from. Pick who they are — their past payments that sit in a general
          category move, and new ones file themselves.
        </div>
        {personSuggestions.length === 0 ? (
          <WEmpty icon="users" title="Nobody new to name" sub="Everyone you pay often is already known." />
        ) : (
          <div className="flex flex-col gap-3">
            {shownPeople.map(s => (
              <div key={s.key} className="rounded-[12px] border border-line p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[13.5px] font-semibold">{s.name}</div>
                  <div className="tabnum text-[11.5px] text-ink3">
                    {s.count} payments
                    {s.outTotal > 0 && ` · sent ${fmtAmount(s.outTotal)}`}
                    {s.inTotal > 0 && ` · received ${fmtAmount(s.inTotal)}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {RELATIONSHIP_ORDER.map(rel => (
                    <button
                      key={rel}
                      disabled={busy}
                      className="press rounded-full border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink2 hover:bg-surface2"
                      onClick={() => confirmPerson(s, rel)}>
                      {RELATIONSHIPS[rel].short}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {personSuggestions.length > PAGE && (
              <button
                className="press self-start text-[12px] font-semibold"
                style={{color: 'var(--accent-700)'}}
                onClick={() => setMorePeople(v => !v)}>
                {morePeople ? 'Show fewer' : `Show all ${personSuggestions.length}`}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── Your regular places ── */}
      <Card>
        <div className="mb-1 text-[15px] font-bold">Your regular places</div>
        <div className="mb-4 text-[12.5px] text-ink2">
          Shops and services you pay often. Confirm what each one is and every payment there files that way.
        </div>
        {placeSuggestions.length === 0 ? (
          <WEmpty icon="pin" title="No new places" sub="Places you pay three times or more show up here." />
        ) : (
          <div className="flex flex-col gap-2">
            {shownPlaces.map(s => (
              <PlaceRow key={s.key} s={s} busy={busy} onConfirm={cat => confirmPlace(s, cat)} />
            ))}
            {placeSuggestions.length > PAGE && (
              <button
                className="press self-start text-[12px] font-semibold"
                style={{color: 'var(--accent-700)'}}
                onClick={() => setMorePlaces(v => !v)}>
                {morePlaces ? 'Show fewer' : `Show all ${placeSuggestions.length}`}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* ── Known ── */}
      {[
        {title: 'People you know', list: knownPeople},
        {title: 'Places you know', list: knownPlaces},
      ].map(({title, list}) =>
        list.length === 0 ? null : (
          <Card key={title}>
            <div className="mb-3 text-[15px] font-bold">{title}</div>
            <div className="flex flex-col gap-2.5">
              {list.map(p => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line p-3">
                  <div className="min-w-[160px] flex-[1_1_160px]">
                    <div className="text-[13.5px] font-semibold">{p.name}</div>
                    <div className="text-[11px] text-ink3">
                      {p.phones.length > 0 && `${p.phones.length} number${p.phones.length === 1 ? '' : 's'} · `}
                      {p.matchKeys.length} spelling{p.matchKeys.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  {p.kind === 'person' && (
                    <select
                      className="select"
                      value={p.relationship}
                      disabled={busy}
                      onChange={e => editById(p, {relationship: e.target.value as Relationship})}>
                      {RELATIONSHIP_ORDER.map(rel => (
                        <option key={rel} value={rel}>
                          {RELATIONSHIPS[rel].label}
                        </option>
                      ))}
                    </select>
                  )}
                  <CatSelect
                    value={p.categoryOut}
                    options={OUT_CATS}
                    placeholder={
                      RELATIONSHIPS[p.relationship].out
                        ? `Paying: ${CATS[RELATIONSHIPS[p.relationship].out!].label} (default)`
                        : 'Paying: ask each time'
                    }
                    onChange={c => editById(p, {categoryOut: c})}
                  />
                  {p.kind === 'person' && (
                    <CatSelect
                      value={p.categoryIn}
                      options={IN_CATS}
                      placeholder={
                        RELATIONSHIPS[p.relationship].in
                          ? `Receiving: ${CATS[RELATIONSHIPS[p.relationship].in!].label} (default)`
                          : 'Receiving: ask each time'
                      }
                      onChange={c => editById(p, {categoryIn: c})}
                    />
                  )}
                  <button
                    className="press rounded-[8px] px-2 py-1 text-[11.5px] font-semibold"
                    style={{color: 'var(--accent-700)'}}
                    disabled={busy}
                    title="Move past payments in a general category to what this one files as"
                    onClick={() => run(() => refile(p))}>
                    Re-file past
                  </button>
                  <button className="press text-ink3" disabled={busy} title="Forget" onClick={() => remove(p)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ),
      )}
    </div>
  );
}

function PlaceRow({s, busy, onConfirm}: {s: PlaceSuggestion; busy: boolean; onConfirm: (c: Cat) => void}) {
  const [pick, setPick] = useState<Cat | null>(s.usual && OUT_CATS.includes(s.usual) ? s.usual : null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-line p-3">
      <div className="min-w-[160px] flex-[1_1_160px]">
        <div className="text-[13.5px] font-semibold">{s.name}</div>
        <div className="tabnum text-[11px] text-ink3">
          {s.count} payments · {fmtAmount(s.outTotal)}
        </div>
      </div>
      {s.usual && <Pill>usually {CATS[s.usual].label}</Pill>}
      <CatSelect value={pick} options={OUT_CATS.filter(id => CATS[id].kind === 'expense')} placeholder="What is it?" onChange={setPick} />
      <button
        className="press rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
        style={{background: 'var(--accent)'}}
        disabled={busy || !pick}
        onClick={() => pick && onConfirm(pick)}>
        Confirm
      </button>
    </div>
  );
}
