'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getElder, getTimeline, type ElderProfile } from '@/lib/api';
import { DEMO_ELDER_PATH } from '@/lib/demo';
import { formatRelative } from '@/lib/format';
import { pollDelay, settled } from '@/lib/live';
import { buildSignals } from '@/lib/signals';
import type { Timeline } from '@/lib/types';
import { SunGlyph } from '../GentleNote';
import { SignalCard } from '../SignalCard';
import { SnapshotCard } from '../SnapshotCard';

// The home page's live window onto Hal's page: updates during the demo call.
export function TodayRow({ elderId }: { elderId: string }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [elder, setElder] = useState<ElderProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const lastProcessing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const [t, e] = await Promise.allSettled([getTimeline(elderId), getElder(elderId)]);
      if (cancelled) return;
      setElder((prev) => settled(e, prev));
      if (t.status === 'fulfilled') {
        lastProcessing.current = t.value.processing;
        setTimeline(t.value);
        setFailed(false);
      } else {
        setFailed(true); // keep the last good data if there is any
      }
      timer = setTimeout(tick, pollDelay(lastProcessing.current));
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [elderId]);

  if (!timeline) {
    return failed ? (
      <p className="rounded-[20px] border border-line bg-card p-4">
        Hal&apos;s latest isn&apos;t available right now.{' '}
        <Link href={DEMO_ELDER_PATH} className="font-bold underline decoration-2 underline-offset-4">Open his page</Link>
      </p>
    ) : (
      <p className="text-ink-2" role="status">Loading Hal&apos;s latest…</p>
    );
  }

  const name = timeline.elder.preferredName;
  const newest = timeline.calls[0];
  const pauses = buildSignals(timeline.markers)[0];
  const hasNote = timeline.nudges.length > 0;
  const heading = 'mb-3 text-[22px] font-extrabold';

  return (
    <div className="grid gap-5 md:grid-cols-3">
      <section aria-labelledby="latest" className="flex flex-col">
        <h2 id="latest" className={heading}>
          Latest snapshot{newest && <span className="font-normal text-ink-2"> · {formatRelative(newest.startedAt)}</span>}
        </h2>
        {newest ? (
          <div className="grid flex-1">
            <SnapshotCard key={`${newest.id}:${newest.status}`} call={newest} variant="compact" isNew={false}
              confirmed={timeline.consent.elderConfirmed} photos={elder?.photos ?? []} name={name} />
          </div>
        ) : (
          <p className="rounded-[20px] border border-line bg-card p-4">No chats yet.</p>
        )}
      </section>
      <section aria-labelledby="doing" className="flex flex-col">
        <h2 id="doing" className={heading}>How he&apos;s doing</h2>
        {timeline.markers.length > 0 ? (
          <div className="grid flex-1"><SignalCard signal={pauses} compact /></div>
        ) : (
          <p className="rounded-[20px] border border-line bg-card p-4">Remi will start comparing after a few more chats.</p>
        )}
      </section>
      <section aria-labelledby="notes" className="flex flex-col">
        <h2 id="notes" className={heading}>Gentle notes</h2>
        <div className="flex flex-1 items-start gap-3 rounded-[20px] border border-line bg-card p-4">
          <SunGlyph size={40} />
          {hasNote ? (
            <p>
              There&apos;s a gentle note on {name}&apos;s page.{' '}
              <Link href={DEMO_ELDER_PATH} className="font-bold underline decoration-2 underline-offset-4">Read it</Link>
            </p>
          ) : (
            <p>None right now. If several things shift for a few weeks, you&apos;ll see a gentle note here.</p>
          )}
        </div>
      </section>
    </div>
  );
}
