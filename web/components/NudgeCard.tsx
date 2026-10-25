import { APP_NAME } from '@/lib/config';
import { copy } from '@/lib/copy';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

type Nudge = Timeline['nudges'][number];

// Gentle amber card, never red. The message comes pre-rendered from the API (safety-and-copy.md §3).
export function NudgeCard({ nudge, onDismiss }: { nudge: Nudge; onDismiss: () => void }) {
  return (
    <section
      aria-label={`A note from ${APP_NAME}`}
      className="animate-arrive rounded-3xl border border-amber-line bg-amber-bg p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-white/70 text-amber-ink">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" />
          </svg>
        </span>
        <h2 className="font-display text-xl font-semibold text-amber-ink">A gentle note from {APP_NAME}</h2>
        {nudge.isSimulated && <SimulatedBadge />}
      </div>
      <p className="mt-4 max-w-3xl text-[1.05rem] leading-relaxed">{nudge.message}</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        {nudge.link && (
          <a
            href={nudge.link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber-ink underline decoration-amber-line decoration-2 underline-offset-4 hover:decoration-amber-ink"
          >
            {copy.nudgeLinkLabel} ↗
          </a>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-4 py-2 font-semibold text-ink-soft transition hover:bg-white/70 hover:text-ink"
        >
          Got it, hide this
        </button>
      </div>
    </section>
  );
}
