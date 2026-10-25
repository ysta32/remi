'use client';

import {
  Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatShortDate, formatValue, unitLabel } from '@/lib/format';
import type { MarkerSeries } from '@/lib/types';

// Hex mirrors of the CSS tokens: SVG presentation attributes don't reliably resolve var().
export const CHART = {
  accent: '#2f6b5e',
  band: '#e3efea',
  sim: '#9a8f86',
  line: '#e6ddd2',
  inkSoft: '#5c534c',
};

type Point = MarkerSeries['points'][number];
interface Datum { t: number; v: number | null; p: Point }

// Live points: solid accent. Simulated points: small and muted. Low confidence: hollow.
function Dot(props: { cx?: number; cy?: number; payload?: Datum; index?: number }) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || !payload || payload.v == null) return <g key={`d-${index}`} />;
  const { isSimulated, confidence } = payload.p;
  const color = isSimulated ? CHART.sim : CHART.accent;
  const r = isSimulated ? 3.5 : 6;
  const hollow = confidence !== 'high';
  return (
    <circle
      key={`d-${index}`}
      cx={cx} cy={cy} r={r}
      fill={hollow ? '#fff' : color}
      stroke={color}
      strokeWidth={hollow ? 2.5 : isSimulated ? 0 : 2}
    />
  );
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Datum }[]; unit: string }) {
  const d = payload?.[0]?.payload;
  if (!active || !d || d.v == null) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold">
        {formatValue(d.v, unit)} {unitLabel(unit)}
      </p>
      <p className="text-ink-soft">
        {formatShortDate(d.t)}
        {d.p.isSimulated ? ' · simulated' : ' · live call'}
        {d.p.confidence === 'low' && ' · short call'}
      </p>
    </div>
  );
}

export function MarkerChart({ series }: { series: MarkerSeries }) {
  const data: Datum[] = series.points.map((p) => ({ t: new Date(p.at).getTime(), v: p.value, p }));
  const b = series.baseline;
  const band = b ? ([b.median - 1.4826 * b.mad, b.median + 1.4826 * b.mad] as const) : null;

  const values = data.flatMap((d) => (d.v == null ? [] : [d.v]));
  const lo = Math.min(...values, ...(band ? [band[0]] : []));
  const hi = Math.max(...values, ...(band ? [band[1]] : []));
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.18;
  const domain: [number, number] = [Math.max(0, lo - pad), hi + pad];

  return (
    <div className="h-36 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          {band && <ReferenceArea y1={band[0]} y2={band[1]} fill={CHART.band} fillOpacity={1} stroke="none" />}
          {b && <ReferenceLine y={b.median} stroke={CHART.accent} strokeOpacity={0.35} strokeDasharray="4 4" />}
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={(t: number) => formatShortDate(t)} minTickGap={28}
            tick={{ fontSize: 12, fill: CHART.inkSoft }} tickLine={false} axisLine={{ stroke: CHART.line }}
          />
          <YAxis
            domain={domain} width={46} tickCount={3} allowDecimals={series.unit !== 'count'}
            tickFormatter={(v: number) => formatValue(v, series.unit)}
            tick={{ fontSize: 12, fill: CHART.inkSoft }} tickLine={false} axisLine={false}
          />
          <Tooltip content={<ChartTooltip unit={series.unit} />} cursor={{ stroke: CHART.line }} />
          <Line
            dataKey="v" type="monotone" stroke={CHART.sim} strokeWidth={2} strokeDasharray="5 4"
            dot={(p) => <Dot {...(p as Parameters<typeof Dot>[0])} />} activeDot={false} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
