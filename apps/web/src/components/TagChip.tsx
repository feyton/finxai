'use client';

import {useState} from 'react';
import {colorForName, findTagByName} from '@/lib/shared/tags';
import type {Tag} from '@/lib/types';
import {Icon} from './Icon';

export function tagColor(t: Pick<Tag, 'name' | 'color'>): string {
  return t.color || colorForName(t.name ?? '');
}

export function TagChip({
  tag,
  onRemove,
  size = 'sm',
}: {
  tag: Pick<Tag, 'name' | 'color'>;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}) {
  const c = tagColor(tag);
  return (
    <span
      className="inline-flex max-w-[160px] items-center gap-1 rounded-full font-semibold"
      style={{
        color: c,
        background: c + '16',
        border: `1px solid ${c}30`,
        fontSize: size === 'sm' ? 10.5 : 12,
        padding: size === 'sm' ? '1px 7px' : '3px 9px',
      }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background: c}} />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          className="press -mr-0.5 opacity-70 hover:opacity-100"
          title={`Remove ${tag.name}`}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}>
          <Icon name="x" size={10} sw={2.6} />
        </button>
      )}
    </span>
  );
}

/**
 * Search-or-create list of tags. Typing a name that does not exist offers
 * "Create …"; typing one that does (any case) offers the existing tag instead,
 * so the same errand never ends up under two spellings.
 */
export function TagPickerList({
  tags,
  isOn,
  onPick,
  onCreate,
}: {
  tags: Tag[];
  /** true = ticked, 'some' = on part of a multi-row selection. */
  isOn: (t: Tag) => boolean | 'some';
  onPick: (t: Tag) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = tags.filter(t => !t.archived && (t.name ?? '').toLowerCase().includes(needle));
  const exact = needle ? findTagByName(tags, q) : undefined;
  return (
    <div className="flex flex-col">
      <input
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Enter' || !needle) return;
          e.preventDefault();
          if (exact) onPick(exact);
          else onCreate(q);
          setQ('');
        }}
        placeholder="Find or create a tag…"
        className="input mb-1 w-full text-[12.5px]"
      />
      {shown.map(t => {
        const on = isOn(t);
        return (
          <div
            key={t.id}
            onClick={() => onPick(t)}
            className="press flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] hover:bg-surface2">
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
              style={{
                border: `1.5px solid ${on ? tagColor(t) : 'var(--border-2, var(--border))'}`,
                background: on === true ? tagColor(t) : 'transparent',
                color: '#fff',
              }}>
              {on === true && <Icon name="check" size={11} sw={3} />}
              {on === 'some' && <span className="h-0.5 w-2 rounded" style={{background: tagColor(t)}} />}
            </span>
            <span className="truncate">{t.name}</span>
          </div>
        );
      })}
      {needle && !exact && (
        <div
          onClick={() => {
            onCreate(q);
            setQ('');
          }}
          className="press flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] font-semibold hover:bg-surface2"
          style={{color: 'var(--accent-700)'}}>
          <Icon name="plus" size={13} />
          Create “{q.trim()}”
        </div>
      )}
      {!needle && shown.length === 0 && (
        <div className="px-2 py-3 text-[11.5px] text-ink3">
          No tags yet. Type a name — e.g. “Shopping for Aline” — and press Enter.
        </div>
      )}
    </div>
  );
}
