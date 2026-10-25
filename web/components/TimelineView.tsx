'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import {
  dismissNudge, FIXTURE_VARIANTS, getElder, getTimeline, isFixtureVariant,
  type ElderProfile, type FixtureVariant,
} from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { copy } from '@/lib/copy';
import { formatRelative } from '@/lib/format';
import { freshIds, pollDelay, settled } from '@/lib/live';
import type { Timeline } from '@/lib/types';
import { FunFacts } from './FunFacts';
import { GentleNote } from './GentleNote';
import { HowHesDoing } from './HowHesDoing';
import { QuestionsWaiting } from './QuestionsWaiting';
import { SiteNav } from './SiteNav';
import { SnapshotCard } from './SnapshotCard';
import { TimelineTabs } from './TimelineTabs';

const EARLIER_SHOWN = 4;

function FixtureBar({ elderId, current, tab }: { elderId: string; current: FixtureVariant; tab: 'chats' | 'doing' }) {
  return (
    <nav aria-label="Demo data" className="flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-2xl bg-card px-4 py-2 text-base text-ink-2">
      <span className="font-bold">Sample data:</span>
      {(Object.keys(FIXTURE_VARIANTS) as FixtureVariant[]).map((v) => (
        <Link
          key={v}
          href={`/elders/${elderId}?fixture=${v}${tab === 'doing' ? '&tab=doing' : ''}`}
          scroll={false}
          className={`rounded-full px-3 py-0.5 ${v === current ? 'bg-ink text-white' : 'hover:bg-ground'}`}
        >
          {v}
        </Link>
      ))}
    </nav>
  );
}

export function TimelineView({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = use(params);
  const query = use(searchParams);
  const variant: FixtureVariant = isFixtureVariant(query.fixture) ? query.fixture : 'drift';
  const tab = query.tab === 'doing' ? 'doing' : 'chats';

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [elder, setElder] = useState<ElderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [hiddenNudges, setHiddenNudges] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  // Ids seen so far for this elder; anything not in here on a later poll is highlighted as new.
  // Kept across fixture switches so processing → after-call plays the live-update moment.
  const known = useRef<{ elderId: string; ids: Set<string> } | null>(null);
  const lastProcessing = useRef(false);

  // Poll fast while a call is processing (lib/live.ts pollDelay).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    if (known.current?.elderId !== id) known.current = null;

    async function tick() {
      const [t, e] = await Promise.allSettled([getTimeline(id, variant), getElder(id, variant)]);
      if (cancelled) return;
      setElder((prev) => settled(e, prev));
      if (t.status === 'fulfilled') {
        const tl = t.value;
        lastProcessing.current = tl.processing;
        // A call's key includes its status, so "processing → done" also counts as new.
        const keys = [...tl.calls.map((c) => `${c.id}|${c.status}`), ...tl.funFacts.map((f) => f.id)];
        const fresh = freshIds(known.current?.ids ?? null, keys);
        // Replace, don't accumulate: an older card must not show "New" again when it moves down.
        if (!known.current) setNewIds(new Set());
        else if (fresh.length) setNewIds(new Set(fresh));
        known.current = { elderId: id, ids: new Set(keys) };
        setTimeline(tl);
        setError(null);
      } else {
        setError(t.reason instanceof Error ? t.reason.message : 'Could not load the timeline.');
      }
      timer = setTimeout(tick, pollDelay(lastProcessing.current));
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, variant]);

  if (!timeline) {
    return (
      <>
        <SiteNav variant="app" />
        <main className="mx-auto max-w-[1200px] px-4 py-8 md:px-8">
          <p className="text-ink-2" role="status">{error ? `Couldn’t load ${id}: ${error}` : 'Loading…'}</p>
        </main>
      </>
    );
  }

  const name = timeline.elder.preferredName;
  const confirmed = timeline.consent.elderConfirmed;
  const [newest, ...earlier] = timeline.calls;
  const nudges = timeline.nudges.filter((n) => !hiddenNudges.has(n.id));
  const shownEarlier = showAll ? earlier : earlier.slice(0, EARLIER_SHOWN);
  const anySimulated = timeline.calls.some((c) => c.isSimulated);
  const photos = elder?.photos ?? [];

  const hide = (nudgeId: string) => {
    setHiddenNudges((prev) => new Set(prev).add(nudgeId));
    dismissNudge(nudgeId).catch(() => {});
  };

  return (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto max-w-[1200px] space-y-8 px-4 pb-16 md:px-8">
        {USE_FIXTURES && <FixtureBar elderId={id} current={variant} tab={tab} />}

        <header className="space-y-3">
          <h1 className="text-[40px] font-black leading-[1.1] tracking-tight md:text-[60px]">{name}’s chats</h1>
          <p className="text-ink-2">
            {timeline.elder.displayName}
            {newest ? ` · Last chat ${formatRelative(newest.startedAt)}` : ' · No chats yet'}
            {timeline.processing && <span className="font-bold text-ink"> · Remi is writing up a chat…</span>}
          </p>
          {anySimulated && (
            <p className="text-base text-ink-2">Chats marked Simulated are demo history created for this presentation.</p>
          )}
          {error && <p className="text-base text-ink" role="status">Having trouble refreshing. Showing the last update.</p>}
          <TimelineTabs elderId={id} tab={tab} fixture={USE_FIXTURES ? variant : undefined} />
        </header>

        {tab === 'doing' ? (
          <HowHesDoing timeline={timeline} />
        ) : (
          <>
            {!confirmed && <p className="rounded-[20px] border border-line bg-card p-5">{copy.notYetConfirmed(name)}</p>}

            {/* Phones: newest, note, stories, then earlier chats. Desktop: stories span the right column. */}
            <div className="grid items-start gap-8 [grid-template-areas:'newest'_'note'_'side'_'earlier'] lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_auto_1fr] lg:[grid-template-areas:'newest_side'_'note_side'_'earlier_side']">
              <div className="[grid-area:newest]">
                {newest ? (
                  <SnapshotCard
                    key={`${newest.id}:${newest.status}`}
                    call={newest} variant="feature" isNew={newIds.has(newest.id)}
                    confirmed={confirmed} photos={photos} name={name}
                  />
                ) : (
                  <p className="rounded-[20px] border border-line bg-card p-5">
                    No chats yet. Once {name} calls Remi, his first snapshot shows up here.
                  </p>
                )}
              </div>

              {nudges.length > 0 && (
                <div className="space-y-4 [grid-area:note]">
                  {nudges.map((n) => <GentleNote key={n.id} nudge={n} onDismiss={() => hide(n.id)} />)}
                </div>
              )}

              {earlier.length > 0 && (
                <section aria-labelledby="earlier" className="space-y-3 [grid-area:earlier]">
                  <h2 id="earlier" className="text-[30px] font-black tracking-tight">Earlier chats</h2>
                  {/* Two stacks that alternate cards, so rows read in date order with no half-empty cells.
                      Phones get one column in date order. */}
                  {(() => {
                    const card = (c: (typeof shownEarlier)[number]) => (
                      <SnapshotCard key={`${c.id}:${c.status}`} call={c} variant="compact" isNew={newIds.has(c.id)}
                        confirmed={confirmed} photos={photos} name={name} />
                    );
                    return (
                      <>
                        <div className="space-y-4 sm:hidden">{shownEarlier.map(card)}</div>
                        <div className="hidden items-start gap-4 sm:grid sm:grid-cols-2">
                          {[0, 1].map((col) => (
                            <div key={col} className="space-y-4">
                              {shownEarlier.filter((_, i) => i % 2 === col).map(card)}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                  {earlier.length > EARLIER_SHOWN && (
                    <button
                      type="button"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((v) => !v)}
                      className="rounded-full border border-line bg-card px-5 py-2.5 font-bold hover:border-ink-2"
                    >
                      {showAll ? 'Show fewer' : `Show all ${earlier.length} earlier chats`}
                    </button>
                  )}
                </section>
              )}

              <div className="space-y-6 [grid-area:side]">
                {elder && <QuestionsWaiting questions={elder.questions} name={name} />}
                {confirmed && (
                  <section aria-labelledby="facts" className="space-y-3">
                    <h2 id="facts" className="text-[30px] font-black tracking-tight">Fun facts</h2>
                    <FunFacts facts={timeline.funFacts} newIds={newIds} />
                  </section>
                )}
              </div>
            </div>
          </>
        )}

        <footer className="border-t border-line pt-5 text-base text-ink-2">
          <p className="max-w-[75ch]">{copy.timelineFooter(name)}</p>
        </footer>
      </main>
    </>
  );
}
