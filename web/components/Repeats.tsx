import { formatShortDate } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

export function Repeats({ repeats }: { repeats: Timeline['repeats'] }) {
  if (repeats.length === 0) return <p className="text-ink-soft">No stories retold within a week.</p>;
  return (
    <ul className="grid gap-3">
      {repeats.map((r) => (
        <li key={r.summary} className="flex flex-wrap items-start gap-3 rounded-3xl border border-line bg-card p-5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{r.summary}</p>
            <p className="mt-1 text-sm text-ink-soft">
              Told {r.dates.length} times: {r.dates.map((d) => formatShortDate(d)).join(', ')}
            </p>
          </div>
          {r.isSimulated && <SimulatedBadge />}
        </li>
      ))}
    </ul>
  );
}
