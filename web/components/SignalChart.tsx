'use client';

import {
  Bar, BarChart, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatShortDate, formatValue, unitLabel } from '@/lib/format';
import { zWords, type Signal, type SignalPoint } from '@/lib/signals';

// Hex mirrors of the CSS tokens: SVG presentation attributes don't reliably resolve var().
const C = { ink: '#1d2b45', ink2: '#4f5b70', band: '#d6e8f8', line: '#e3ebf3', card: '#ffffff' };

interface Datum { t: number; v: number | null; p: SignalPoint }

function describe(signal: Signal, v: number): string {
  if (signal.unit !== 'z') return `${formatValue(v, signal.unit)} ${unitLabel(signal.unit)}`.trim();
  return zWords(v);
}

// Live calls: larger solid ink dots. Simulated history: smaller grey dots. Short calls: hollow.
function Dot(props: { cx?: number; cy?: number; payload?: Datum; index?: number }) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || !payload || payload.v == null) return <g key={`d-${index}`} />;
  const sim = payload.p.isSimulated;
  const color = sim ? C.ink2 : C.ink;
  const hollow = payload.p.confidence !== 'high';
  return (
    <circle key={`d-${index}`} cx={cx} cy={cy} r={sim ? 4 : 6}
      fill={hollow ? C.card : color} stroke={hollow ? color : C.card} strokeWidth={2} />
  );
}

function Tip({ active, payload, signal }: { active?: boolean; payload?: { payload: Datum }[]; signal: Signal }) {
  const d = payload?.[0]?.payload;
  if (!active || !d || d.v == null) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-base shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]">
      <p className="font-bold">{describe(signal, d.v)}</p>
      <p className="text-ink-2">
        {formatShortDate(d.t)} · {d.p.isSimulated ? 'simulated' : 'live call'}
        {d.p.confidence === 'low' && ' · short call'}
      </p>
    </div>
  );
}

const axis = { tick: { fontSize: 16, fill: C.ink2 }, tickLine: false } as const;

export function SignalChart({ signal, height }: { signal: Signal; height: number }) {
  const data: Datum[] = signal.points.map((p) => ({ t: new Date(p.at).getTime(), v: p.value, p }));
  const values = data.flatMap((d) => (d.v == null ? [] : [d.v]));
  const lo = Math.min(...values, ...(signal.band ? [signal.band[0]] : [0]));
  const hi = Math.max(...values, ...(signal.band ? [signal.band[1]] : [1]));
  const pad = (hi - lo || 1) * 0.15;
  const domain: [number, number] = [signal.unit === 'z' ? lo - pad : Math.max(0, lo - pad), hi + pad];
  const xAxis = (
    // Padding keeps the first and last dots whole instead of cut in half at the edges.
    <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} minTickGap={36} padding={{ left: 8, right: 8 }}
      tickFormatter={(t: number) => formatShortDate(t)} axisLine={{ stroke: C.line }} {...axis} />
  );

  return (
    <div>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {signal.key === 'retold' ? (
            <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              {xAxis}
              <YAxis allowDecimals={false} width={44} axisLine={false} tickCount={3} {...axis} />
              <Tooltip content={<Tip signal={signal} />} cursor={{ fill: C.line }} />
              <Bar dataKey="v" fill={C.ink} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              {signal.band && (
                <ReferenceArea y1={signal.band[0]} y2={signal.band[1]} fill={C.band} fillOpacity={1} stroke="none" />
              )}
              {xAxis}
              {/* Every chart keeps the same 44px gutter so cards side by side line up; the pauses
                  score has no meaningful unit, so its gutter stays blank. */}
              <YAxis domain={domain} width={44} axisLine={false} tickCount={3}
                tickFormatter={(v: number) => formatValue(v, signal.unit)} {...axis}
                {...(signal.unit === 'z' ? { tick: false } : {})} />
              <Tooltip content={<Tip signal={signal} />} cursor={{ stroke: C.line }} />
              <Line dataKey="v" type="monotone" stroke={C.ink} strokeWidth={2} connectNulls={false}
                dot={(p) => <Dot {...(p as Parameters<typeof Dot>[0])} />} activeDot={false} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {signal.band && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-base text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: C.band }} /> his usual
          </span>
          {signal.unit === 'z' && <span>Higher means more pausing</span>}
        </p>
      )}
      <table className="sr-only">
        <caption>{signal.title} by chat</caption>
        <thead><tr><th>Date</th><th>Reading</th><th>Kind</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.p.callId}>
              <td>{formatShortDate(d.t)}</td>
              <td>{d.v == null ? 'not available' : describe(signal, d.v)}</td>
              <td>{d.p.isSimulated ? 'simulated' : 'live call'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
