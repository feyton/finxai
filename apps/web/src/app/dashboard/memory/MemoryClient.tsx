'use client';

// The classifier's memory on the web — the same `memories` rows the phone's
// Memory screen and the coach's `remember` write (src/tools/memory.ts). The
// classifier picks the ones about an SMS's counterparty first, then a few
// general ones, so short, specific facts work best.

import {format} from 'date-fns';
import {useMemo, useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import type {Memory} from '@/lib/types';
import {Icon} from '@/components/Icon';
import {Card, Pill, WEmpty} from '@/components/ui';

// Same cap as the phone (MEMORY_MAX_CHARS): every fact may ride along with
// every SMS, so its length is a cost paid thousands of times.
const MAX = 240;
const clean = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, MAX);

const EXAMPLES = [
  'Payments to the corner shop are groceries, not eating out',
  'Money from my sister is usually paying me back, not a gift',
  'The 5,000 every Monday is my child’s school transport',
];

export function MemoryClient({
  initial,
  ownerId,
  setupError,
}: {
  initial: Memory[];
  ownerId: string;
  setupError: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Memory[]>(initial);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(setupError);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const t = clean(text);
    if (!t) return;
    // A repeated fact is not a new one (the phone dedupes the same way).
    if (items.some(m => m.text.trim().toLowerCase() === t.toLowerCase())) {
      setErr('That is already remembered.');
      return;
    }
    setBusy(true);
    setErr(null);
    const row: Memory = {
      id: crypto.randomUUID(),
      text: t,
      subject: null,
      source: 'user',
      owner_id: ownerId,
      created_at: new Date().toISOString(),
    };
    const {error} = await supabase.from('memories').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    setItems(xs => [row, ...xs]);
    setText('');
  };

  const remove = async (m: Memory) => {
    if (!confirm('Forget this?')) return;
    setBusy(true);
    const {error} = await supabase.from('memories').delete().eq('id', m.id);
    setBusy(false);
    if (error) return setErr(error.message);
    setItems(xs => xs.filter(x => x.id !== m.id));
  };

  return (
    <div className="flex flex-col gap-5 px-5 py-5 md:px-7">
      {err && (
        <div
          className="rounded-[10px] px-3 py-2 text-[12.5px]"
          style={{background: 'var(--surface-2)', color: 'var(--expense)'}}>
          {err}
        </div>
      )}

      <Card>
        <div className="mb-1 text-[15px] font-bold">Teach it something</div>
        <div className="mb-3 text-[12.5px] text-ink2">
          One fact per line, in your own words. Mention the person, place or number it is about.
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-[1_1_320px]"
            value={text}
            maxLength={MAX}
            placeholder={EXAMPLES[0]}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <button
            className="press rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{background: 'var(--accent)'}}
            disabled={busy || !clean(text)}
            onClick={add}>
            Remember
          </button>
        </div>
        <div className="mt-2 text-right text-[11px] text-ink3 tabnum">
          {text.length}/{MAX}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[15px] font-bold">What it knows</div>
          <span className="text-[12px] text-ink3">{items.length} facts</span>
        </div>
        {items.length === 0 ? (
          <WEmpty
            icon="sparkles"
            title="Nothing yet"
            sub={`For example: “${EXAMPLES[1]}” or “${EXAMPLES[2]}”.`}
          />
        ) : (
          <div className="flex flex-col">
            {items.map(m => (
              <div key={m.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px]">{m.text}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink3">
                    {m.created_at && <span>{format(new Date(m.created_at), 'd MMM yyyy')}</span>}
                    {m.source === 'coach' && <Pill>from the coach</Pill>}
                    {m.subject && <Pill>about {m.subject}</Pill>}
                  </div>
                </div>
                <button className="press text-ink3" disabled={busy} title="Forget" onClick={() => remove(m)}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
