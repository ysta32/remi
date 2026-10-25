import { formatShortDate } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

export function FunFacts({ facts, newIds }: { facts: Timeline['funFacts']; newIds: Set<string> }) {
  if (facts.length === 0) {
    return <p className="text-ink-soft">Fun facts from his chats will show up here.</p>;
  }
  return (
    <ul className="grid gap-4">
      {facts.map((f) => (
        <li
          key={f.id}
          className={`rounded-3xl border bg-card p-5 ${newIds.has(f.id) ? 'animate-arrive border-accent/50 ring-4 ring-accent-soft' : 'border-line'}`}
        >
          <p className="font-semibold leading-snug">{f.text}</p>
          <blockquote className="mt-3 border-l-4 border-accent-soft pl-4 font-display text-[1.05rem] italic text-ink-soft">
            “{f.quote}”
          </blockquote>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            {f.askedBy && (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent">
                Answer to {f.askedBy}’s question
              </span>
            )}
            <span>{formatShortDate(f.at)}</span>
            {f.isSimulated && <SimulatedBadge className="ml-auto" />}
          </div>
        </li>
      ))}
    </ul>
  );
}
