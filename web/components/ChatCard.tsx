import Link from 'next/link';
import type { FixtureVariant } from '@/lib/api';
import { formatDay } from '@/lib/format';
import type { CallCard } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

const MOOD: Record<NonNullable<CallCard['mood']>, string> = {
  positive: 'In good spirits',
  neutral: 'Steady',
  low: 'Seemed a bit low',
};

export function recapHref(elderId: string, callId: string, fixture?: FixtureVariant) {
  return `/elders/${elderId}/chats/${callId}${fixture ? `?fixture=${fixture}` : ''}`;
}

// An earlier chat in the list. The whole card opens that chat's recap.
export function ChatCard({
  call, href, highlight, factCount,
}: { call: CallCard; href: string; highlight: boolean; factCount: number }) {
  const tags = [
    call.familyQuestion?.answer && { text: `${call.familyQuestion.askedBy}’s question answered`, cls: 'bg-family text-family-ink' },
    factCount > 0 && { text: 'Fun fact', cls: 'bg-[#fff4cf] text-[#6b4e00]' },
    call.photosShown.length > 0 && {
      text: `${call.photosShown.length} photo${call.photosShown.length > 1 ? 's' : ''}`, cls: 'bg-ground text-ink-2',
    },
  ].filter(Boolean) as { text: string; cls: string }[];

  return (
    <Link
      id={`call-${call.id}`}
      href={href}
      className="group relative flex flex-col gap-3.5 rounded-3xl border border-line bg-card px-7 pb-5 pt-6 shadow-[0_2px_6px_rgba(29,43,69,0.04)] hover:border-ink-2"
    >
      {highlight && (
        <span className="absolute -right-1 -top-1 size-4 rounded-full border-[3px] border-ground bg-[#f28a5c]" aria-hidden />
      )}
      <span className="flex flex-col gap-1">
        <span className="text-xl font-black leading-tight">{formatDay(call.startedAt)}</span>
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-base text-ink-2">
          {call.mood && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-ok" aria-hidden />{MOOD[call.mood]}
            </span>
          )}
          {call.isSimulated && <SimulatedBadge />}
        </span>
      </span>
      <p className="line-clamp-3">{call.summary ?? 'Details appear after he confirms sharing.'}</p>
      {tags.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t.text} className={`rounded-full px-2.5 py-px text-base font-bold ${t.cls}`}>{t.text}</span>)}
        </span>
      )}
      <span className="mt-auto border-t border-line pt-3.5 text-right text-base font-bold text-ink-2 group-hover:text-ink">
        See the full recap →
      </span>
    </Link>
  );
}
