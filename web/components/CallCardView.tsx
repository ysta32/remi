import { formatDay, formatDuration, formatTime } from '@/lib/format';
import type { CallCard } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

const MOOD: Record<NonNullable<CallCard['mood']>, string> = {
  positive: 'In good spirits',
  neutral: 'Steady',
  low: 'Seemed a bit low',
};

export function CallCardView({
  call, name, confirmed, isNew,
}: { call: CallCard; name: string; confirmed: boolean; isNew: boolean }) {
  const duration = formatDuration(call.durationS);
  const busy = call.status === 'processing' || call.status === 'in_progress';

  return (
    <article
      className={`rounded-3xl border bg-card p-6 shadow-[0_1px_0_rgba(42,36,32,0.04)] ${
        isNew ? 'animate-arrive border-accent/50 ring-4 ring-accent-soft' : 'border-line'
      }`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="font-display text-lg font-semibold">{formatDay(call.startedAt)}</h3>
        <span className="text-ink-soft">
          {formatTime(call.startedAt)}
          {duration && ` · ${duration}`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {isNew && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
              New
            </span>
          )}
          {call.isSimulated && <SimulatedBadge />}
        </span>
      </header>

      {busy ? (
        <div className="mt-4 space-y-2" role="status">
          <p className="font-semibold text-accent">
            {call.status === 'in_progress' ? `${name} is chatting with Remi right now…` : 'Writing up today’s chat…'}
          </p>
          <div className="shimmer h-3 w-11/12 rounded-full" />
          <div className="shimmer h-3 w-4/5 rounded-full" />
          <div className="shimmer h-3 w-2/3 rounded-full" />
        </div>
      ) : call.status === 'failed' ? (
        <p className="mt-4 text-ink-soft">We couldn’t write up this chat. It still counts as a call.</p>
      ) : call.summary ? (
        <p className="mt-3 text-[1.05rem] leading-relaxed">{call.summary}</p>
      ) : (
        <p className="mt-3 text-ink-soft">
          {confirmed ? 'No summary for this chat.' : `Details appear after ${name} confirms sharing.`}
        </p>
      )}

      {confirmed && (call.photosShown.length > 0 || call.familyQuestion || call.mood) && (
        <div className="mt-5 flex flex-col gap-3">
          {call.familyQuestion && (
            <div className="rounded-2xl bg-sand px-4 py-3">
              <p className="text-sm font-semibold text-ink-soft">
                {call.familyQuestion.askedBy} asked: “{call.familyQuestion.text}”
              </p>
              {call.familyQuestion.answer ? (
                <p className="mt-1">{call.familyQuestion.answer}</p>
              ) : busy ? (
                <p className="mt-1 text-ink-soft">Answer coming up…</p>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {call.photosShown.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm text-ink-soft">
                <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="11" r="2" />
                  <path d="m21 16-5-5-8 8" />
                </svg>
                {p.caption}
              </span>
            ))}
            {call.mood && (
              <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
                {MOOD[call.mood]}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
