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
import type { Timeline } from '@/lib/types';
import { FunFacts } from './FunFacts';
import { GentleNote } from './GentleNote';
import { HowHesDoing } from './HowHesDoing';
import { QuestionsWaiting } from './QuestionsWaiting';
import { SiteNav } from './SiteNav';
import { SnapshotCard } from './SnapshotCard';
import { TimelineTabs } from './TimelineTabs';

const POLL_BUSY_MS = 3_000;
const POLL_IDLE_MS = 15_000;
const EARLIER_SHOWN = 4;

function FixtureBar({ elderId, current, tab }: { elderId: string; current: FixtureVariant; tab: 'chats' | 'doing' }) {
  return (
    <nav aria-label="Demo data" className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-2 text-base text-ink-2">
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

  // Poll every 3 s while a call is processing, otherwise every 15 s (SPEC §13).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    if (known.current?.elderId !== id) known.current = null;

    async function tick() {
      let busy = false;
      try {
        const [t, e] = await Promise.all([getTimeline(id, variant), getElder(id)]);
        if (cancelled) return;
        busy = t.processing;
        // A call's key includes its status, so "processing → done" also counts as new.
        const ids = [...t.calls.map((c) => `${c.id}|${c.status}`), ...t.funFacts.map((f) => f.id)];
        if (known.current) {
          const seen = known.current.ids;
          const fresh = ids.filter((x) => !seen.has(x)).map((x) => x.split('|')[0]);
          if (fresh.length) setNewIds((prev) => new Set([...prev, ...fresh]));
        } else {
          setNewIds(new Set());
        }
        known.current = { elderId: id, ids: new Set(ids) };
        setTimeline(t);
        setElder(e);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the timeline.');
      } finally {
        if (!cancelled) timer = setTimeout(tick, busy ? POLL_BUSY_MS : POLL_IDLE_MS);
      }
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

            <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-8">
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

              {nudges.map((n) => (
                <GentleNote key={n.id} nudge={n} onDismiss={() => hide(n.id)} />
              ))}

              {earlier.length > 0 && (
                <section aria-labelledby="earlier" className="space-y-3">
                  <h2 id="earlier" className="text-[30px] font-black tracking-tight">Earlier chats</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {shownEarlier.map((c) => (
                      <SnapshotCard
                        key={`${c.id}:${c.status}`}
                        call={c} variant="compact" isNew={newIds.has(c.id)}
                        confirmed={confirmed} photos={photos} name={name}
                      />
                    ))}
                  </div>
                  {earlier.length > EARLIER_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="rounded-full border border-line bg-card px-5 py-2.5 font-bold hover:border-ink-2"
                    >
                      {showAll ? 'Show fewer' : `Show all ${earlier.length} earlier chats`}
                    </button>
                  )}
                </section>
              )}
              </div>
              <div className="space-y-6">
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
