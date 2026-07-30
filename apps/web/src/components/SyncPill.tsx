'use client';

import {useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {Icon} from './Icon';

/**
 * The freshness indicator, and the way to refresh.
 *
 * Two problems with what this replaces. It read "Synced from mobile · 2 hours
 * ago", which sounds like sync status but is actually the age of the NEWEST
 * TRANSACTION — so a quiet afternoon made a perfectly up-to-date dashboard look
 * two hours behind. During a real sync incident that label pointed at the wrong
 * side entirely: the web was current and the phone was the stale one.
 *
 * And there was no way to refresh. Every dashboard route is force-dynamic, so the
 * server reads Supabase on each request and a reload is all it takes — but a
 * browser tab left open all afternoon shows whatever it fetched when it loaded,
 * with nothing on screen to suggest otherwise.
 *
 * router.refresh() re-runs the server components and swaps in new data without
 * losing scroll position or client state.
 */
export function SyncPill({
  newestLabel,
  reviewCount = 0,
}: {
  /** Human age of the newest record, e.g. "2 hours ago". Empty when there are none. */
  newestLabel: string;
  reviewCount?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  const refresh = () => {
    setJustRefreshed(false);
    startTransition(() => {
      router.refresh();
      setJustRefreshed(true);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={pending}
        title="Re-read everything from the server"
        className="press inline-flex items-center gap-1.5 rounded-full border border-line
                   bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink2
                   hover:border-line2 hover:text-ink disabled:cursor-default disabled:opacity-60">
        <span className={pending ? 'animate-spin' : undefined}>
          <Icon name="refresh" size={13} sw={2.2} />
        </span>
        {pending ? 'Refreshing…' : justRefreshed ? 'Up to date' : 'Refresh'}
      </button>

      {/* Stated as what it is — the age of the latest record — so it can never
          again be read as "the web is behind". */}
      {newestLabel && (
        <span className="whitespace-nowrap text-[11.5px] text-ink3">
          Latest record {newestLabel}
        </span>
      )}

      {reviewCount > 0 && (
        <span
          className="pill tabnum"
          style={{
            background: 'var(--warn)',
            color: '#3a2400',
            padding: '3px 8px',
            fontSize: 10.5,
          }}>
          {reviewCount} to review on the phone
        </span>
      )}
    </div>
  );
}
