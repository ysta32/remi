'use client';

import {
  Bar, BarChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { R } from './DriftIndexChart';

export interface CorpusRow {
  call: number; week: number; plantedPauseMs: number; meanPauseMs: number | null; speechRate: number | null;
  d: number | null; repeats7d: number; repeatsAll: number;
}

const axis = { tick: { fontSize: 16, fill: R.ink2 }, tickLine: false } as const;

function Tip({ active, payload, show }: { active?: boolean; payload?: { payload: CorpusRow }[]; show: (r: CorpusRow) => string }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-base shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]">
      <p className="font-bold">Chat {d.call} · week {d.week}</p>
      <p className="text-ink-2">{show(d)}</p>
    </div>
  );
}

function Panel({ title, children, height = 170 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <div>
      <h4 className="text-[18px] font-extrabold">{title}</h4>
      <div style={{ height }} className="mt-1" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/** Small multiples for the 12 generated chats: pause length, Drift Index, and retold stories by window. */
export function CorpusCharts({ rows }: { rows: CorpusRow[] }) {
  const xAxis = <XAxis dataKey="call" padding={{ left: 8, right: 8 }} tickFormatter={(c: number) => `${c}`} axisLine={{ stroke: R.line }} {...axis} />;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Average pause length (ms)">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          {xAxis}
          <YAxis domain={[400, 1500]} ticks={[600, 1000, 1400]} width={44} axisLine={false} {...axis} />
          <Tooltip content={<Tip show={(r) => `${Math.round(r.meanPauseMs ?? 0)} ms measured (planted ≈ ${r.plantedPauseMs} ms)`} />} cursor={{ stroke: R.line }} />
          <Line dataKey="meanPauseMs" stroke={R.hero} strokeWidth={2.5} isAnimationActive={false}
            dot={{ r: 4, fill: R.weekly, stroke: R.card, strokeWidth: 2 }} activeDot={false} />
        </LineChart>
      </Panel>
      <Panel title="Drift Index per chat">
        <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <ReferenceArea y1={-1} y2={1} fill={R.band} fillOpacity={1} stroke="none" />
          {xAxis}
          <YAxis domain={[-1.5, 6]} ticks={[-1, 0, 1, 3, 5]} width={44} axisLine={false} {...axis} />
          <ReferenceLine y={1.5} stroke={R.ink} strokeDasharray="5 4" strokeWidth={1.5} />
          <Tooltip content={<Tip show={(r) => `Drift Index ${r.d == null ? '—' : r.d.toFixed(1)}`} />} cursor={{ stroke: R.line }} />
          <Line dataKey="d" stroke={R.hero} strokeWidth={2.5} isAnimationActive={false}
            dot={{ r: 4, fill: R.weekly, stroke: R.card, strokeWidth: 2 }} activeDot={false} />
        </LineChart>
      </Panel>
      <Panel title="Retold stories counted">
        <BarChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }} barGap={2}>
          {xAxis}
          <YAxis allowDecimals={false} domain={[0, 3]} ticks={[0, 1, 2, 3]} width={44} axisLine={false} {...axis} />
          <Tooltip content={<Tip show={(r) => `${r.repeats7d} within 7 days · ${r.repeatsAll} against any earlier chat`} />} cursor={{ fill: R.line }} />
          <Bar dataKey="repeats7d" fill={R.weekly} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
          <Bar dataKey="repeatsAll" fill={R.ewma} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
        </BarChart>
      </Panel>
      <table className="sr-only">
        <caption>Generated chats: measured markers</caption>
        <thead><tr><th>Chat</th><th>Week</th><th>Pause length (ms)</th><th>Drift Index</th><th>Retold within 7 days</th><th>Retold, any earlier chat</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.call}><td>{r.call}</td><td>{r.week}</td><td>{Math.round(r.meanPauseMs ?? 0)}</td><td>{r.d?.toFixed(1) ?? '—'}</td><td>{r.repeats7d}</td><td>{r.repeatsAll}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CorpusLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: R.weekly }} /> Retold, within 7 days (current counter)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: R.ewma }} /> Retold, any earlier chat
      </span>
    </p>
  );
}
