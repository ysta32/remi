'use client';

import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { R } from './DriftIndexChart';

export interface SlowCall { day: number; wpm: number; inBaseline: boolean; flagged: boolean }

const axis = { tick: { fontSize: 16, fill: R.ink2 }, tickLine: false } as const;
const TOP_MARGIN = 34;
const FLAG_ROW_Y = 18;

function Tip({ active, payload }: { active?: boolean; payload?: { payload: SlowCall }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-base shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]">
      <p className="font-bold">{Math.round(d.wpm)} words a minute</p>
      <p className="text-ink-2">Day {Math.round(d.day)}{d.inBaseline ? ' · learning his usual' : ''}</p>
      {d.flagged && <p className="font-bold">Family check-in sent</p>}
    </div>
  );
}

function Dot(props: { cx?: number; cy?: number; payload?: SlowCall; index?: number }) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || !payload) return <g key={`d-${index}`} />;
  const fill = payload.flagged ? R.ewma : payload.inBaseline ? R.faded : R.weekly;
  return (
    <g key={`d-${index}`}>
      <circle cx={cx} cy={cy} r={payload.flagged ? 6 : 4} fill={fill} stroke={R.card} strokeWidth={2} />
      {payload.flagged && (
        <text x={cx} y={FLAG_ROW_Y} textAnchor="middle" fontSize={16} fontWeight={800} fill={R.ink}>Check-in</text>
      )}
    </g>
  );
}

/** Talking pace per call, his usual range, the flag line, and when the slowdown begins. */
export function SlowdownChart({
  calls, usual, flagZ, onsetDay, height = 260,
}: { calls: SlowCall[]; usual: { median: number; scale: number }; flagZ: number; onsetDay: number; height?: number }) {
  const flagLine = usual.median - flagZ * usual.scale;
  const lo = Math.floor((Math.min(...calls.map((c) => c.wpm), flagLine) - 5) / 10) * 10;
  const hi = Math.ceil((Math.max(...calls.map((c) => c.wpm), usual.median + usual.scale) + 5) / 10) * 10;
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={calls} margin={{ top: TOP_MARGIN, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={R.line} vertical={false} />
            <ReferenceArea y1={usual.median - usual.scale} y2={usual.median + usual.scale} fill={R.band} fillOpacity={1} stroke="none" />
            <XAxis dataKey="day" type="number" domain={[0, 'dataMax']} padding={{ left: 8, right: 8 }} ticks={[0, 14, 28, 42, 56, 70, 84]}
              tickFormatter={(d: number) => `wk ${d / 7 + 1}`} axisLine={{ stroke: R.line }} {...axis} />
            <YAxis domain={[lo, hi]} width={44} axisLine={false} {...axis} />
            <ReferenceLine y={flagLine} stroke={R.ink} strokeDasharray="5 4" strokeWidth={1.5} />
            <ReferenceLine x={onsetDay} stroke={R.ink2} strokeWidth={1.5}
              label={{ value: 'Slowdown starts', position: 'insideBottomRight', fill: R.ink2, fontSize: 15, offset: 8 }} />
            <Tooltip content={<Tip />} cursor={{ stroke: R.line }} />
            <Line dataKey="wpm" stroke={R.hero} strokeWidth={2.5} isAnimationActive={false}
              dot={(p) => <Dot {...(p as Parameters<typeof Dot>[0])} />} activeDot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: R.weekly }} /> Pace on each chat (words/min)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: R.ewma }} /> Check-in sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: R.band }} /> His usual range
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-5 border-t-2 border-dashed" style={{ borderColor: R.ink }} /> Much slower than usual
        </span>
      </p>
      <table className="sr-only">
        <caption>Talking pace per chat</caption>
        <thead><tr><th>Day</th><th>Words per minute</th><th>State</th></tr></thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.day}><td>{Math.round(c.day)}</td><td>{Math.round(c.wpm)}</td><td>{c.flagged ? 'check-in sent' : c.inBaseline ? 'learning his usual' : ''}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
