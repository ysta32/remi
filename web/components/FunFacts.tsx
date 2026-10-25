import type { ReactNode } from 'react';
import { formatShortDate } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

// `more` sits quietly in the bottom-right of the last card (e.g. "See all 12 fun facts").
export function FunFacts({ facts, newIds, more }: { facts: Timeline['funFacts']; newIds: Set<string>; more?: ReactNode }) {
  if (facts.length === 0) return <p className="text-ink-2">Fun facts from his chats will show up here.</p>;
  return (
    <ul className="grid gap-3">
      {facts.map((f, i) => (
        <li key={f.id} className={`rounded-[20px] border bg-card p-4 ${newIds.has(f.id) ? 'animate-arrive border-family-strong' : 'border-line'}`}>
          <p className="font-bold leading-snug">{f.text}</p>
          {/* Answer-only facts arrive with an empty quote (B's handoff): show nothing then. */}
          {f.quote.trim() && <blockquote className="mt-2 italic text-ink-2">“{f.quote}”</blockquote>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-ink-2">
            {f.askedBy && (
              <span className="rounded-full bg-family px-3 py-0.5 font-bold text-family-ink">{f.askedBy} asked</span>
            )}
            <span>{formatShortDate(f.at)}</span>
            {f.isSimulated && <SimulatedBadge className="ml-auto" />}
          </div>
          {more && i === facts.length - 1 && <div className="mt-3 text-right">{more}</div>}
        </li>
      ))}
    </ul>
  );
}
