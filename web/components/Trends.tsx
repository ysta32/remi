import { copy } from '@/lib/copy';
import { formatValue, unitLabel } from '@/lib/format';
import type { MarkerSeries } from '@/lib/types';
import { CHART, MarkerChart } from './MarkerChart';

function Legend() {
  const item = 'inline-flex items-center gap-2';
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
      <li className={item}>
        <span aria-hidden className="h-3 w-6 rounded-sm" style={{ background: CHART.band }} /> His usual range
      </li>
      <li className={item}>
        <span aria-hidden className="size-2.5 rounded-full" style={{ background: CHART.sim }} /> Simulated history
      </li>
      <li className={item}>
        <span aria-hidden className="size-3.5 rounded-full" style={{ background: CHART.accent }} /> Live call
      </li>
      <li className={item}>
        <span aria-hidden className="size-3.5 rounded-full border-[2.5px] bg-white" style={{ borderColor: CHART.accent }} /> Short call (less reliable)
      </li>
    </ul>
  );
}

function describe(s: MarkerSeries) {
  const latest = [...s.points].reverse().find((p) => p.value != null);
  if (!latest || latest.value == null) return null;
  const u = unitLabel(s.unit);
  const now = `${formatValue(latest.value, s.unit)}${u ? ` ${u}` : ''}`;
  return s.baseline ? `Latest ${now} · usual about ${formatValue(s.baseline.median, s.unit)}` : `Latest ${now}`;
}

export function Trends({ markers, name }: { markers: MarkerSeries[]; name: string }) {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-ink-soft">{copy.trendsHeader(name)}</p>
      <Legend />
      <div className="grid gap-4 md:grid-cols-2">
        {markers.map((s) => (
          <figure key={s.key} className="rounded-3xl border border-line bg-card p-5">
            <figcaption>
              <h3 className="font-display text-lg font-semibold">{s.label}</h3>
              <p className="text-sm text-ink-soft">{s.explainer}</p>
            </figcaption>
            <div className="mt-3">
              <MarkerChart series={s} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{describe(s)}</p>
          </figure>
        ))}
      </div>
    </div>
  );
}
