'use client';

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { R } from './DriftIndexChart';

export interface SweepPoint { name: string; detectedPct: number; delayMedian: number; stableAlertsPerYear: number; moodCognitivePct: number }

const SHORT: Record<string, string> = {
  'default (8-call baseline, skip 2, ≥1.5 in 3 of 4)': 'Chosen setting',
  'threshold 2.0': 'Stricter line (2.0)',
  '2 of 4 weeks': '2 of 4 weeks',
  '12-call baseline': 'Longer baseline',
  'threshold 1.25': 'Looser line (1.25)',
};

function Tip({ active, payload }: { active?: boolean; payload?: { payload: SweepPoint }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="max-w-[280px] rounded-xl border border-line bg-card px-3 py-2 text-base shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]">
      <p className="font-bold">{d.name}</p>
      <p className="text-ink-2">Change caught by week 8: {d.detectedPct.toFixed(0)}%</p>
      <p className="text-ink-2">Typical wait after it starts: {d.delayMedian} weeks</p>
      <p className="text-ink-2">Unneeded notes a year (steady person): {d.stableAlertsPerYear.toFixed(2)}</p>
    </div>
  );
}

function Dot(props: { cx?: number; cy?: number; payload?: SweepPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return <g />;
  const chosen = payload.name.startsWith('default');
  const label = SHORT[payload.name];
  return (
    <g>
      <circle cx={cx} cy={cy} r={chosen ? 8 : 6} fill={chosen ? R.ewma : R.weekly} stroke={R.card} strokeWidth={2} />
      {label && (
        <text x={cx + 12} y={cy + 5} fontSize={15} fontWeight={chosen ? 800 : 600} fill={R.ink}>{label}</text>
      )}
    </g>
  );
}

const axis = { tick: { fontSize: 16, fill: R.ink2 }, tickLine: false } as const;

/** Each dot is one rule setting: how often it catches the planted change vs how many unneeded notes a steady person gets. */
export function TradeoffChart({ sweep, height = 320 }: { sweep: SweepPoint[]; height?: number }) {
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 130, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={R.line} />
            <XAxis type="number" dataKey="stableAlertsPerYear" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
              axisLine={{ stroke: R.line }} {...axis}
              label={{ value: 'Unneeded notes per year, steady person →', position: 'insideBottom', offset: -20, fill: R.ink2, fontSize: 16 }} />
            <YAxis type="number" dataKey="detectedPct" domain={[70, 100]} ticks={[70, 80, 90, 100]} width={44}
              tickFormatter={(v: number) => `${v}%`} axisLine={false} {...axis} />
            <Tooltip content={<Tip />} cursor={false} />
            <Scatter data={sweep} shape={(p: unknown) => <Dot {...(p as Parameters<typeof Dot>[0])} />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Rule settings: change caught vs unneeded notes</caption>
        <thead><tr><th>Setting</th><th>Caught by week 8</th><th>Median wait (weeks)</th><th>Unneeded notes per year</th><th>Mood dip read as change</th></tr></thead>
        <tbody>
          {sweep.map((s) => (
            <tr key={s.name}><td>{s.name}</td><td>{s.detectedPct}%</td><td>{s.delayMedian}</td><td>{s.stableAlertsPerYear}</td><td>{s.moodCognitivePct}%</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
