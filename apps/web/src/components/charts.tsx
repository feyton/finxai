// SVG chart primitives from the design handoff (web-charts.jsx), TS-ported.
// Data-driven only — no decorative SVG. No hooks; server- and client-safe.
import {fmtAmount} from '@/lib/theme';

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function pathFromPoints(pts: [number, number][]): string {
  return pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
}

export interface Series {
  label: string;
  color: string;
  values: number[];
}

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
  const width = 100;
  const pad = {l: 0, r: 0, t: 14, b: 6};
  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all) * 1.12;
  const min = Math.min(0, ...all);
  const x = scaleLinear([0, Math.max(months.length - 1, 1)], [pad.l, width - pad.r]);
  const y = scaleLinear([min, max], [height - pad.b, pad.t]);
  return (
    <div style={{width: '100%'}}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{overflow: 'visible'}}>
        {Array.from({length: 5}).map((_, i) => {
          const gy = pad.t + ((height - pad.t - pad.b) / 4) * i;
          return (
            <line key={i} x1={0} x2={width} y1={gy} y2={gy} stroke="var(--border)" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
          );
        })}
        {series.map((s, si) => {
          const pts: [number, number][] = s.values.map((v, i) => [x(i), y(v)]);
          const d = pathFromPoints(pts);
          const areaD = area
            ? d + ` L${x(s.values.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`
            : null;
          return (
            <g key={si}>
              {area && areaD && <path d={areaD} fill={s.color} opacity={0.12} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={1.2} fill={s.color}>
                  <title>{`${months[i]} · ${s.label}: ${fmtAmount(s.values[i])} RWF`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between">
        {months.map(m => (
          <span key={m} className="text-[10.5px] text-ink3">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  months,
  series,
  height = 200,
}: {
  months: string[];
  series: Series[];
  height?: number;
}) {
  const width = 100;
  const pad = {t: 14, b: 4};
  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all) * 1.15;
  const y = scaleLinear([0, max], [height - pad.b, pad.t]);
  const groupW = width / months.length;
  const barW = (groupW * 0.6) / series.length;
  return (
    <div style={{width: '100%'}}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <line x1={0} x2={width} y1={height - pad.b} y2={height - pad.b} stroke="var(--border)" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        {months.map((m, mi) =>
          series.map((s, si) => {
            const v = s.values[mi] ?? 0;
            const bx = mi * groupW + groupW * 0.2 + si * barW;
            const by = y(v);
            return (
              <rect key={`${mi}-${si}`} x={bx} y={by} width={barW * 0.82} height={height - pad.b - by} fill={s.color} rx={0.6}>
                <title>{`${m} · ${s.label}: ${fmtAmount(v)} RWF`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <div className="mt-1 flex justify-between">
        {months.map(m => (
          <span key={m} className="text-[10.5px] text-ink3">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HBarChart({
  items,
  barH = 20,
}: {
  items: {label: string; value: number; color: string}[];
  barH?: number;
}) {
  const max = Math.max(1, ...items.map(i => i.value)) * 1.05;
  const w = scaleLinear([0, max], [0, 100]);
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="font-medium text-ink">{it.label}</span>
            <span className="tabnum text-ink2">{fmtAmount(it.value)}</span>
          </div>
          <div style={{height: barH, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden'}}>
            <div style={{width: w(it.value) + '%', height: '100%', background: it.color, borderRadius: 6}} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Donut({
  segments,
  size = 150,
  thickness = 22,
}: {
  segments: {label: string; value: number; color: string}[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2;
  const inner = r - thickness;
  const mid = (r + inner) / 2;
  const circumference = 2 * Math.PI * mid;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <g transform={`translate(${r},${r}) rotate(-90)`}>
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const rot = (acc / total) * 360;
          acc += s.value;
          return (
            <circle
              key={i}
              r={mid}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              transform={`rotate(${rot})`}>
              <title>{`${s.label}: ${fmtAmount(s.value)} RWF (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}

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
