import { APP_NAME } from '@/lib/config';
import { copy } from '@/lib/copy';
import type { Timeline } from '@/lib/types';
import { SimulatedBadge } from './SimulatedBadge';

export function SunGlyph({ size = 44 }: { size?: number }) {
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-[#fff3c4]" style={{ width: size, height: size }}>
      <svg width={size / 2} height={size / 2} viewBox="0 0 24 24" fill="none" stroke="#9a6b00" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </span>
  );
}

// The check-in note, verbatim from the API (safety-and-copy.md §3). White and quiet, never alarm.
export function GentleNote({ nudge, onDismiss }: { nudge: Timeline['nudges'][number]; onDismiss: () => void }) {
  return (
    <section aria-label={`A gentle note from ${APP_NAME}`} className="rounded-[28px] border border-line bg-card p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <SunGlyph />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-[22px] font-extrabold">A gentle note</h2>
            {nudge.isSimulated && <SimulatedBadge />}
          </div>
          <p className="mt-2 max-w-[70ch]">{nudge.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {nudge.link && (
              <a href={nudge.link} target="_blank" rel="noreferrer" className="font-bold underline decoration-2 underline-offset-4">
                {copy.nudgeLinkLabel}
              </a>
            )}
            <button type="button" onClick={onDismiss} className="rounded-full border border-line px-4 py-1.5 font-bold text-ink-2 hover:border-ink-2 hover:text-ink">
              Got it, hide this
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
