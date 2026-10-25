import { formatShortDate } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

export function Repeats({ repeats }: { repeats: Timeline['repeats'] }) {
  return (
    <ul className="grid gap-3">
      {repeats.map((r) => (
        <li key={r.summary} className="flex flex-wrap items-start gap-3 rounded-[20px] border border-line bg-card p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{r.summary}</p>
            <p className="text-base text-ink-2">Told {r.dates.length} times: {r.dates.map((d) => formatShortDate(d)).join(', ')}</p>
          </div>
          {r.isSimulated && <SimulatedBadge />}
        </li>
      ))}
    </ul>
  );
}
