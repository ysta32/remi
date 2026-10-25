'use client';

import {
  Bar, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// Hex mirrors of the CSS tokens (SVG attributes don't reliably resolve var()). Series colours
// validated with the dataviz palette checker against the white card (light mode).
export const R = {
  ink: '#1d2b45', ink2: '#4f5b70', band: '#d6e8f8', line: '#e3ebf3', card: '#ffffff',
  weekly: '#5b8bd0', ewma: '#c2571f', faded: '#b9cbe6',
};

export interface WeekPoint {
  week: number;
  calls?: number;
  weeklyD: number | null;
  ewma?: number | null;
  baselineWeek: boolean;
  watch: boolean;
  nudge: boolean;
  wellbeingCard?: boolean;
  routedToWellbeing?: boolean;
}

const fmt = (v: number | null | undefined) => (v == null ? 'not enough chats' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`);

function Tip({ active, payload }: { active?: boolean; payload?: { payload: WeekPoint }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-base shadow-[0_8px_20px_-12px_rgba(0,0,0,0.3)]">
      <p className="font-bold">Week {d.week}{d.baselineWeek ? ' · learning his usual' : ''}</p>
      <p className="text-ink-2">Weekly score {fmt(d.weeklyD)}</p>
      {d.ewma != null && !d.baselineWeek && <p className="text-ink-2">Smoothed {fmt(d.ewma)}</p>}
      {d.calls != null && <p className="text-ink-2">{d.calls} chats</p>}
      {d.nudge && <p className="font-bold">Family note sent</p>}
      {!d.nudge && d.watch && <p className="text-ink-2">Watching (dashboard only)</p>}
      {d.wellbeingCard && <p className="text-ink-2">Wellbeing card shown</p>}
    </div>
  );
}

const axis = { tick: { fontSize: 16, fill: R.ink2 }, tickLine: false } as const;

/** Weekly Drift Index bars, smoothed (EWMA) line, "usual" band ±1 and the 1.5 nudge line. */
export function DriftIndexChart({
  weeks, height = 220, threshold = 1.5, domain = [-1.5, 4.5], title,
}: { weeks: WeekPoint[]; height?: number; threshold?: number; domain?: [number, number]; title: string }) {
  const data = weeks.map((w) => ({ ...w, ewmaPlot: w.baselineWeek ? null : w.ewma ?? null }));
  const hasEwma = weeks.some((w) => w.ewma != null);
  const clampD = (v: number) => Math.max(domain[0], Math.min(domain[1], v));
  return (
    <figure>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 12, bottom: 0, left: 0 }} barCategoryGap="25%">
            <ReferenceArea y1={-1} y2={1} fill={R.band} fillOpacity={1} stroke="none" />
            <XAxis dataKey="week" tickFormatter={(w: number) => `wk ${w}`} axisLine={{ stroke: R.line }} {...axis} />
            <YAxis domain={domain} ticks={[-1, 0, 1, threshold, 3, 4]} width={34} axisLine={false}
              allowDataOverflow tickFormatter={(v: number) => (v === threshold ? '' : String(v))} {...axis} />
            <ReferenceLine y={threshold} stroke={R.ink} strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: `${threshold}`, position: 'left', fill: R.ink, fontSize: 16, fontWeight: 700 }} />
            <Tooltip content={<Tip />} cursor={{ fill: R.line, fillOpacity: 0.6 }} />
            <Bar dataKey={(d: WeekPoint) => (d.weeklyD == null ? null : clampD(d.weeklyD))} radius={3} maxBarSize={34}
              isAnimationActive={false}
              label={(p: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
                const w = data[p.index ?? -1];
                const [x, y, width] = [Number(p.x), Number(p.y), Number(p.width)];
                if (!w?.nudge || ![x, y, width].every(Number.isFinite)) return <g />;
                return (
                  <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={16} fontWeight={800} fill={R.ink}>
                    Note
                  </text>
                );
              }}>
              {data.map((d) => (
                <Cell key={d.week} fill={d.baselineWeek ? R.faded : R.weekly} stroke={R.card} strokeWidth={2} />
              ))}
            </Bar>
            {hasEwma && (
              <Line dataKey="ewmaPlot" stroke={R.ewma} strokeWidth={2} isAnimationActive={false} connectNulls={false}
                dot={{ r: 4, fill: R.ewma, stroke: R.card, strokeWidth: 2 }} activeDot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Week</th><th>Weekly score</th><th>Smoothed</th><th>State</th></tr></thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td>{w.week}</td><td>{fmt(w.weeklyD)}</td><td>{fmt(w.ewma)}</td>
              <td>{w.baselineWeek ? 'learning his usual' : w.nudge ? 'family note' : w.watch ? 'watching' : 'steady'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function DriftLegend({ showEwma = true }: { showEwma?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: R.weekly }} /> Weekly score
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: R.faded }} /> Learning his usual
      </span>
      {showEwma && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-5" style={{ background: R.ewma }} /> Smoothed trend
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: R.band }} /> His usual range
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-5 border-t-2 border-dashed" style={{ borderColor: R.ink }} /> Note line (1.5)
      </span>
    </p>
  );
}
