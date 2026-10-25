'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FixtureVariant } from '@/lib/api';
import { dayKey, monthCells } from '@/lib/recap';
import type { Timeline } from '@/lib/types';
import { recapHref } from '../ChatCard';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// One small month beside the recap. Arrows change the month; a chat is opened by clicking its day.
export function RecapCalendar({
  timeline, selectedId, selectedAt, elderId, fixture,
}: { timeline: Timeline; selectedId: string; selectedAt: string; elderId: string; fixture?: FixtureVariant }) {
  const [y0, m0] = dayKey(selectedAt).split('-').map(Number);
  const [shown, setShown] = useState<{ selectedId: string; y: number; m: number } | null>(null);
  // Opening another chat resets the view to that chat's month.
  const { y, m } = shown?.selectedId === selectedId ? shown : { y: y0, m: m0 };
  const step = (by: number) => {
    const d = new Date(Date.UTC(y, m - 1 + by, 1));
    setShown({ selectedId, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  };
  const title = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const arrow = 'grid size-9 place-items-center rounded-full border border-line bg-card text-lg font-black hover:border-ink-2';

  return (
    <section aria-label="Pick a chat" className="rounded-3xl border border-line bg-card px-[18px] py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-black" aria-live="polite">{title}</h2>
        <span className="flex gap-1.5">
          <button type="button" className={arrow} onClick={() => step(-1)} aria-label="Previous month">‹</button>
          <button type="button" className={arrow} onClick={() => step(1)} aria-label="Next month">›</button>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => <span key={i} className="text-base font-bold text-ink-2" aria-hidden>{w}</span>)}
        {monthCells(timeline, y, m).map((c, i) => {
          if (c.day === null) return <span key={`blank-${i}`} />;
          if (!c.callId) return <span key={c.day} className="grid h-9 place-items-center text-base text-[#8592a6]">{c.day}</span>;
          const current = c.callId === selectedId;
          return (
            <Link
              key={c.day}
              href={recapHref(elderId, c.callId, fixture)}
              aria-current={current ? 'page' : undefined}
              aria-label={`Chat on ${title.split(' ')[0]} ${c.day}${c.live ? ', happening now' : ''}`}
              className={`relative grid h-9 place-items-center rounded-[10px] text-base font-black ${
                current ? 'bg-ink text-white' : 'bg-sky-soft text-ink hover:bg-hero'
              } ${c.live ? 'shadow-[inset_0_0_0_2px_var(--ok)]' : ''}`}
            >
              {c.day}
              {c.highlight && (
                <span className="absolute -right-[3px] -top-[3px] size-3 rounded-full border-2 border-white bg-[#f28a5c]" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
