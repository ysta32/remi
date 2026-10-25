import { formatValue, unitLabel } from '@/lib/format';
import { STATUS_TEXT, zWords, type Signal } from '@/lib/signals';
import { SignalChart } from './SignalChart';

const PILL: Record<Signal['status'], string> = {
  usual: 'bg-ok text-ok-ink',
  different: 'bg-sky-soft text-ink',
  retold: 'bg-sky-soft text-ink',
  learning: 'border border-line text-ink-2',
  not_analyzed: 'border border-line text-ink-2',
};

function latestLine(signal: Signal): string | null {
  if (signal.unit === 'count') return null;
  const latest = [...signal.points].reverse().find((p) => p.value != null);
  if (!latest || latest.value == null) return null;
  if (signal.unit === 'z') return `Latest chat: ${zWords(latest.value).toLowerCase()}`;
  const u = unitLabel(signal.unit);
  const usual = signal.band ? ` · his usual is about ${formatValue((signal.band[0] + signal.band[1]) / 2, signal.unit)}` : '';
  return `Latest ${formatValue(latest.value, signal.unit)} ${u}${usual}`;
}

export function StatusPill({ status }: { status: Signal['status'] }) {
  return <span className={`rounded-full px-3 py-0.5 text-base font-bold ${PILL[status]}`}>{STATUS_TEXT[status]}</span>;
}

export function SignalCard({ signal, compact = false, chartHeight }: { signal: Signal; compact?: boolean; chartHeight?: number }) {
  const latest = latestLine(signal);
  return (
    <article className="rounded-[28px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="text-[22px] font-extrabold">{signal.title}</h3>
        <StatusPill status={signal.status} />
      </div>
      <div className={compact ? 'mt-3 space-y-2' : 'mt-3 grid gap-4 md:grid-cols-[3fr_2fr] md:items-center'}>
        <SignalChart signal={signal} height={chartHeight ?? (compact ? 110 : 150)} />
        <div className="space-y-1">
          <p className="text-ink-2">{signal.explainer}</p>
          {latest && <p className="text-base text-ink-2">{latest}</p>}
        </div>
      </div>
    </article>
  );
}
