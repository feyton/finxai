// Shared primitives from the design handoff (web-ui.jsx), TS-ported.
// No hooks here — usable from server and client components alike.
import type {CSSProperties, ReactNode} from 'react';
import {CATS, type CategoryId, fmtAmount, resolveCat} from '@/lib/theme';
import {Icon} from './Icon';

export function Card({
  children,
  pad = 20,
  style,
  className = '',
}: {
  children: ReactNode;
  pad?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`card ${className}`} style={{padding: pad, ...style}}>
      {children}
    </div>
  );
}

export function Pill({
  children,
  color = 'var(--text-2)',
  bg = 'var(--surface-2)',
  icon,
  size = 10.5,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  icon?: string;
  size?: number;
}) {
  return (
    <span className="pill" style={{color, background: bg, fontSize: size}}>
      {icon && <Icon name={icon} size={size + 1.5} sw={2.4} />}
      {children}
    </span>
  );
}

export function CatChip({
  cat,
  size = 30,
  r,
}: {
  cat: CategoryId | string;
  size?: number;
  r?: number;
}) {
  const c = CATS[resolveCat(String(cat))];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: r ?? Math.round(size * 0.32),
        background: c.color + '1e',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        flexShrink: 0,
      }}>
      {c.emoji}
    </span>
  );
}

export function Money({
  amount,
  type,
  size = 13,
}: {
  amount: number;
  type?: string | null; // 'income' | 'expense' | 'transfer'
  size?: number;
}) {
  const isTransfer = type === 'transfer';
  const isIncome = type === 'income';
  const color = isTransfer ? 'var(--text-2)' : isIncome ? 'var(--income)' : 'var(--expense)';
  const sign = isTransfer ? '' : isIncome ? '+' : '−';
  return (
    <span className="tabnum" style={{fontSize: size, fontWeight: 600, color}}>
      {sign}
      {fmtAmount(amount)}
    </span>
  );
}

export function Progress({
  value,
  max,
  color = 'var(--accent)',
  h = 7,
}: {
  value: number;
  max: number;
  color?: string;
  h?: number;
}) {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  return (
    <div style={{height: h, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden'}}>
      <div style={{width: `${pct}%`, height: '100%', background: color, borderRadius: 99}} />
    </div>
  );
}

export function Conf({value}: {value: number | null}) {
  const v = value ?? 0;
  const color = v >= 0.9 ? 'var(--income)' : v >= 0.75 ? 'var(--warn)' : 'var(--expense)';
  return (
    <span className="pill tabnum" style={{color, background: color + '18'}}>
      {Math.round(v * 100)}%
    </span>
  );
}

export function WSection({
  title,
  sub,
  action,
  children,
  style,
}: {
  title?: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
            {sub && <div className="mt-0.5 text-[11.5px] text-ink2">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Legend({color, label}: {color: string; label: string}) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-ink2">
      <span style={{width: 8, height: 8, borderRadius: 8, background: color}} />
      {label}
    </div>
  );
}

export function MiniStat({label, value, color, suffix = ''}: {label: string; value: number; color: string; suffix?: string}) {
  return (
    <div className="flex-1 rounded-[11px] bg-surface2 px-3 py-2.5">
      <div className="text-[10.5px] text-ink2">{label}</div>
      <div className="tabnum text-[15px] font-bold" style={{color}}>
        {fmtAmount(value)}
        {suffix}
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  suffix = 'RWF',
  delta,
  deltaGood = true,
  icon,
  tint = 'var(--accent)',
  spark,
}: {
  label: string;
  value: number;
  suffix?: string;
  delta?: string | null;
  deltaGood?: boolean;
  icon?: string;
  tint?: string;
  spark?: ReactNode;
}) {
  return (
    <Card pad={16} style={{flex: 1, minWidth: 0}}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink2">{label}</span>
        {icon && (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[9px]"
            style={{background: tint + '1a', color: tint}}>
            <Icon name={icon} size={15} sw={2.2} />
          </div>
        )}
      </div>
      <div className="tabnum text-[24px] font-bold tracking-tight">
        {fmtAmount(value)}
        <span className="ml-1 text-[12px] font-semibold text-ink3">{suffix}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {delta != null ? (
          <Pill
            color={deltaGood ? 'var(--income)' : 'var(--expense)'}
            bg={(deltaGood ? 'var(--income)' : 'var(--expense)') + '1a'}
            icon={deltaGood ? 'trendUp' : 'trendDown'}>
            {delta}
          </Pill>
        ) : (
          <span />
        )}
        {spark}
      </div>
    </Card>
  );
}

export function Insight({
  tint,
  icon,
  children,
}: {
  tint: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2.5 rounded-[11px] bg-surface2 p-3">
      <div
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg"
        style={{background: tint + '1a', color: tint}}>
        <Icon name={icon} size={14} />
      </div>
      <div className="flex-1 text-[12px] leading-relaxed text-ink2">{children}</div>
    </div>
  );
}

export function WEmpty({icon = 'search', title, sub}: {icon?: string; title: string; sub?: string}) {
  return (
    <div className="px-5 py-10 text-center text-ink2">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface2 text-ink3">
        <Icon name={icon} size={22} />
      </div>
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      {sub && <div className="mt-1 text-[12px]">{sub}</div>}
    </div>
  );
}

export function Topbar({
  title,
  sub,
  right,
  syncLabel,
  reviewCount = 0,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  syncLabel?: string;
  reviewCount?: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-5 py-4 md:px-7">
      <div className="min-w-0 flex-[1_1_240px]">
        <h1 className="m-0 text-[21px] font-bold tracking-tight">{title}</h1>
        {sub && <div className="mt-0.5 text-[12.5px] text-ink2">{sub}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        {syncLabel && (
          <span
            className="pill"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-700)',
              border: '1px solid rgba(22,163,74,0.22)',
              padding: '7px 12px',
              fontSize: 12,
            }}>
            <Icon name="refresh" size={13} sw={2.2} />
            {syncLabel}
            {reviewCount > 0 && (
              <span
                className="tabnum"
                style={{
                  background: 'var(--warn)',
                  color: '#3a2400',
                  borderRadius: 99,
                  padding: '1px 6px',
                  fontSize: 10.5,
                  fontWeight: 700,
                }}>
                {reviewCount} to review
              </span>
            )}
          </span>
        )}
        {right}
      </div>
    </div>
  );
}
