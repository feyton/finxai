'use client';

// SVG/HTML chart primitives — design handoff geometry, upgraded with the
// details the prototype lacked: y-axis value labels, a hover crosshair with
// a full tooltip on line charts, and hoverable bar groups. Paths render in a
// stretched SVG (non-scaling strokes); points, labels and the tooltip are
// HTML positioned in %, so nothing distorts.
import {useRef, useState} from 'react';
import {fmtAmount} from '@/lib/theme';

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function pathFromPoints(pts: [number, number][]): string {
  return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
}

export function fmtShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1) + 'M';
  if (a >= 1_000) return Math.round(v / 1_000) + 'k';
  return String(Math.round(v));
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

// ── Line / area chart with crosshair tooltip + y labels ─────────────────────
export function LineChart({
  months,
  series,
  height = 200,
  area = false,
}: {
  months: string[];
  series: Series[];
  height?: number;
  area?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 100;
  const H = 100; // percent space; the container fixes the real height
  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all) * 1.1;
  const min = Math.min(0, ...all);
  const x = scaleLinear([0, Math.max(months.length - 1, 1)], [0, W]);
  const y = scaleLinear([min, max], [H, 4]);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (months.length - 1));
    setHover(Math.min(months.length - 1, Math.max(0, i)));
  };

  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div
        ref={ref}
        className="relative w-full"
        style={{height}}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}>
        {/* grid + y labels (HTML — undistorted) */}
        {gridFracs.map(f => {
          const val = min + (max - min) * f;
          const top = `${y(val)}%`;
          return (
            <div key={f}>
              <div
                className="absolute left-0 right-0"
                style={{top, height: 1, background: 'var(--border)'}}
              />
              <span
                className="tabnum absolute right-0 -translate-y-full pb-0.5 text-[9.5px]"
                style={{top, color: 'var(--text-3)'}}>
                {fmtShort(val)}
              </span>
            </div>
          );
        })}

        {/* paths */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{overflow: 'visible'}}>
          {series.map((s, si) => {
            const pts: [number, number][] = s.values.map((v, i) => [x(i), y(v)]);
            const d = pathFromPoints(pts);
            const areaD = area
              ? d + ` L${x(s.values.length - 1).toFixed(2)},${y(min).toFixed(2)} L0,${y(min).toFixed(2)} Z`
              : null;
            return (
              <g key={si}>
                {area && areaD && <path d={areaD} fill={s.color} opacity={0.1} />}
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.8}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={0}
              y2={H}
              stroke="var(--border-2)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* hover points (HTML dots — perfectly round) */}
        {hover != null &&
          series.map((s, si) => (
            <span
              key={si}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${x(hover)}%`,
                top: `${y(s.values[hover] ?? 0)}%`,
                background: s.color,
                boxShadow: '0 0 0 2px var(--surface)',
              }}
            />
          ))}

        {/* tooltip */}
        {hover != null && (
          <div
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-[10px] p-2.5"
            style={{
              left: `min(max(${x(hover)}%, 10%), 78%)`,
              top: 4,
              transform: 'translateX(-50%)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
            }}>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{color: 'var(--text-3)'}}>
              {months[hover]}
            </div>
            {series.map(s => (
              <div key={s.label} className="flex items-center gap-1.5 py-0.5 text-[11.5px]">
                <span style={{width: 7, height: 7, borderRadius: 7, background: s.color}} />
                <span className="flex-1" style={{color: 'var(--text-2)'}}>
                  {s.label}
                </span>
                <span className="tabnum font-semibold" style={{color: 'var(--text)'}}>
                  {fmtAmount(s.values[hover] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between">
        {months.map((m, i) => (
          <span
            key={`${m}-${i}`}
            className="text-[10.5px]"
            style={{color: hover === i ? 'var(--text)' : 'var(--text-3)', fontWeight: hover === i ? 600 : 400}}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grouped bar chart (HTML bars, hover tooltip per month) ──────────────────
export function BarChart({
  months,
  series,
  height = 200,
}: {
  months: string[];
  series: Series[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all) * 1.1;
  const gridFracs = [0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="relative w-full" style={{height}}>
        {gridFracs.map(f => (
          <div key={f}>
            <div
              className="absolute left-0 right-0"
              style={{bottom: `${f * 100}%`, height: 1, background: 'var(--border)'}}
            />
            <span
              className="tabnum absolute right-0 pb-0.5 text-[9.5px]"
              style={{bottom: `${f * 100}%`, color: 'var(--text-3)'}}>
              {fmtShort(max * f)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end">
          {months.map((m, mi) => (
            <div
              key={`${m}-${mi}`}
              className="relative flex h-full flex-1 items-end justify-center gap-[3px] px-[6%]"
              onMouseEnter={() => setHover(mi)}
              onMouseLeave={() => setHover(null)}
              style={{background: hover === mi ? 'var(--surface-2)' : 'transparent', borderRadius: 8}}>
              {series.map(s => (
                <div
                  key={s.label}
                  className="w-full max-w-[22px] rounded-t-[4px]"
                  style={{
                    height: `${((s.values[mi] ?? 0) / max) * 100}%`,
                    minHeight: (s.values[mi] ?? 0) > 0 ? 2 : 0,
                    background: s.color,
                  }}
                />
              ))}
              {hover === mi && (
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-1 min-w-[140px] rounded-[10px] p-2.5"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-lg)',
                  }}>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{color: 'var(--text-3)'}}>
                    {m}
                  </div>
                  {series.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 py-0.5 text-[11.5px]">
                      <span style={{width: 7, height: 7, borderRadius: 7, background: s.color}} />
                      <span className="flex-1" style={{color: 'var(--text-2)'}}>
                        {s.label}
                      </span>
                      <span className="tabnum font-semibold" style={{color: 'var(--text)'}}>
                        {fmtAmount(s.values[mi] ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex">
        {months.map((m, i) => (
          <span
            key={`${m}-${i}`}
            className="flex-1 text-center text-[10.5px]"
            style={{color: hover === i ? 'var(--text)' : 'var(--text-3)', fontWeight: hover === i ? 600 : 400}}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal bar leaderboard ───────────────────────────────────────────────
export function HBarChart({
  items,
  barH = 20,
}: {
  items: {label: string; value: number; color: string}[];
  barH?: number;
}) {
  const max = Math.max(1, ...items.map(i => i.value)) * 1.05;
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="font-medium" style={{color: 'var(--text)'}}>
              {it.label}
            </span>
            <span className="tabnum" style={{color: 'var(--text-2)'}}>
              {fmtAmount(it.value)} <span style={{color: 'var(--text-3)', fontSize: 10}}>RWF</span>
            </span>
          </div>
          <div style={{height: barH, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden'}}>
            <div
              style={{width: (it.value / max) * 100 + '%', height: '100%', background: it.color, borderRadius: 6}}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Donut with center total ──────────────────────────────────────────────────
export function Donut({
  segments,
  size = 150,
  thickness = 22,
}: {
  segments: {label: string; value: number; color: string}[];
  size?: number;
  thickness?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2;
  const inner = r - thickness;
  const mid = (r + inner) / 2;
  const circumference = 2 * Math.PI * mid;
  let acc = 0;
  const active = hover != null ? segments[hover] : null;
  return (
    <div className="relative" style={{width: size, height: size}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`translate(${r},${r}) rotate(-90)`}>
          {segments.map((s, i) => {
            const frac = s.value / total;
            const dash = Math.max(frac * circumference - 2, 0.5);
            const rot = (acc / total) * 360;
            acc += s.value;
            return (
              <circle
                key={i}
                r={mid}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? thickness + 3 : thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                transform={`rotate(${rot})`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{cursor: 'pointer', transition: 'stroke-width .12s ease'}}
              />
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tabnum text-[15px] font-bold" style={{color: 'var(--text)'}}>
          {fmtShort(active ? active.value : total)}
        </span>
        <span className="max-w-[70%] truncate text-[9.5px]" style={{color: 'var(--text-3)'}}>
          {active ? active.label : 'total RWF'}
        </span>
      </div>
    </div>
  );
}

// ── Small inline sparkline ───────────────────────────────────────────────────
export function Sparkline({
  values,
  width = 80,
  height = 28,
  color = 'var(--accent)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const x = scaleLinear([0, values.length - 1], [1, width - 1]);
  const y = scaleLinear([min, max || 1], [height - 2, 2]);
  const pts: [number, number][] = values.map((v, i) => [x(i), y(v)]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={pathFromPoints(pts)} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Ring gauge ───────────────────────────────────────────────────────────────
export function RingGauge({
  pct,
  size = 78,
  sw = 8,
  color = 'var(--accent)',
}: {
  pct: number;
  size?: number;
  sw?: number;
  color?: string;
}) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const over = pct > 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? 'var(--expense)' : color}
        strokeWidth={sw}
        strokeDasharray={`${(clamped / 100) * c} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight={700} fill="var(--text)" className="tabnum">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
