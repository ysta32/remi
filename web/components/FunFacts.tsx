import { formatShortDate } from '@/lib/format';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

// `columns` lays the cards out three across on wide screens (Hal's page); otherwise one stack.
export function FunFacts({ facts, newIds, columns = false }: { facts: Timeline['funFacts']; newIds: Set<string>; columns?: boolean }) {
  if (facts.length === 0) return <p className="text-ink-2">Fun facts from his chats will show up here.</p>;
  return (
    <ul className={`grid gap-3 ${columns ? 'items-stretch md:grid-cols-2 lg:grid-cols-3 lg:gap-6' : ''}`}>
      {facts.map((f) => (
        <li key={f.id} className={`flex flex-col rounded-[20px] border bg-card p-4 ${newIds.has(f.id) ? 'animate-arrive border-family-strong' : 'border-line'}`}>
          <p className="font-bold leading-snug">{f.text}</p>
          {/* Answer-only facts arrive with an empty quote (B's handoff): show nothing then. */}
          {f.quote.trim() && <blockquote className="mt-2 italic text-ink-2">“{f.quote}”</blockquote>}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-base text-ink-2">
            {f.askedBy && (
              <span className="rounded-full bg-family px-3 py-0.5 font-bold text-family-ink">{f.askedBy} asked</span>
            )}
            <span>{formatShortDate(f.at)}</span>
            {f.isSimulated && <SimulatedBadge className="ml-auto" />}
          </div>
        </li>
      ))}
    </ul>
  );
}
