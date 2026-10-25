'use client';

import Link from 'next/link';
import { use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dismissNudge, FIXTURE_VARIANTS, isFixtureVariant, type FixtureVariant } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { copy } from '@/lib/copy';
import { formatRelative } from '@/lib/format';
import { hasHighlight, recapHighlights } from '@/lib/recap';
import { isSyntheticTranscriptDemo, syntheticTranscriptNotice } from '@/lib/synthetic-demo';
import { RepeatDetections } from './RepeatDetections';
import { ChatCard, recapHref } from './ChatCard';
import { FunFacts } from './FunFacts';
import { GentleNote } from './GentleNote';
import { HowHesDoing } from './HowHesDoing';
import { NextChatPanel } from './NextChatPanel';
import { SiteNav } from './SiteNav';
import { SnapshotCard } from './SnapshotCard';
import { TimelineTabs } from './TimelineTabs';
import { useTimelinePoll } from './useTimelinePoll';

const FACTS_SHOWN = 3;
const EARLIER_STEP = 6; // two rows of three; older chats are a click away (and on each recap's calendar)

export function earlierCallsForTarget<T extends { id: string }>(calls: T[], showAll: boolean, target: unknown, limit = 4): T[] {
  return showAll || (typeof target === 'string' && calls.some(call => call.id === target))
    ? calls : calls.slice(0, limit);
}

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

  const { timeline, elder, error, newIds, refresh } = useTimelinePoll(id, variant);
  const [earlierShown, setEarlierShown] = useState(EARLIER_STEP);
  const [hiddenNudges, setHiddenNudges] = useState<Set<string>>(new Set());
  const [allFacts, setAllFacts] = useState(false);

  // Beside a gentle note, the right column (panel + facts) should end level with the left (newest +
  // note). Start with three facts and drop one at a time while the right side runs longer; when the
  // left side or the panel changes size, start again from three.
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [factsFit, setFactsFit] = useState(FACTS_SHOWN);
  const [layoutTick, setLayoutTick] = useState(0); // forces a re-check even when factsFit is already 3
  useLayoutEffect(() => {
    const left = leftRef.current, right = rightRef.current;
    if (!left || !right || allFacts || !window.matchMedia('(min-width: 1024px)').matches) return;
    if (right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom > 24 && factsFit > 1) {
      setFactsFit((n) => n - 1);
    }
  }, [allFacts, factsFit, timeline, elder, hiddenNudges, layoutTick]);
  const loaded = timeline !== null;
  useEffect(() => {
    const watched = [leftRef.current, panelRef.current].filter((e): e is HTMLDivElement => !!e);
    if (!watched.length) return;
    const sizes = new Map<Element, number>();
    const ro = new ResizeObserver((entries) => {
      const changed = entries.some((e) => {
        const h = Math.round(e.contentRect.height);
        const was = sizes.get(e.target);
        sizes.set(e.target, h);
        return was !== undefined && was !== h;
      });
      if (changed) restart();
    });
    const restart = () => { setFactsFit(FACTS_SHOWN); setLayoutTick((t) => t + 1); };
    watched.forEach((e) => ro.observe(e));
    window.addEventListener('resize', restart);
    return () => { ro.disconnect(); window.removeEventListener('resize', restart); };
  }, [loaded]);

  // A stable dependency avoids moving the reader back to the card on every poll.
  const targetCallId = typeof query.call === 'string' && timeline?.calls.some(call => call.id === query.call) ? query.call : null;
  useEffect(() => {
    if (tab !== 'chats' || !targetCallId) return;
    document.getElementById(`call-${targetCallId}`)?.scrollIntoView({ block: 'start' });
  }, [targetCallId, tab]);

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
  const shownEarlier = earlierCallsForTarget(earlier, earlierShown >= earlier.length, query.call, earlierShown);
  const nudges = timeline.nudges.filter((n) => !hiddenNudges.has(n.id));
  // Beside a gentle note, facts stack under the panel and fill to fit; with no note, three run in a row.
  const factsBeside = nudges.length > 0;
  const factsShown = factsBeside ? factsFit : FACTS_SHOWN;
  const fixture = USE_FIXTURES ? variant : undefined;
  const anySimulated = timeline.calls.some((c) => c.isSimulated);
  const transcriptDemo = elder?.id === timeline.elder.id && isSyntheticTranscriptDemo(elder, timeline.calls);
  const photos = elder?.photos ?? [];

  // Facts pile up with every call, so only the newest few show; each chat's recap keeps its own.
  const facts = (
    <section aria-labelledby="facts" className="order-4 space-y-3">
      <h2 id="facts" className="text-[30px] font-black tracking-tight">Fun facts</h2>
      <FunFacts facts={allFacts ? timeline.funFacts : timeline.funFacts.slice(0, factsShown)} newIds={newIds} columns={!factsBeside} />
      {timeline.funFacts.length > factsShown && (
        <div className="-mt-1 text-right">
          <button
            type="button"
            aria-expanded={allFacts}
            onClick={() => setAllFacts((v) => !v)}
            className="text-base font-semibold text-[#7b879a] transition-colors hover:text-ink"
          >
            {allFacts ? 'Show fewer' : `See all ${timeline.funFacts.length} fun facts`}
          </button>
        </div>
      )}
    </section>
  );

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
          {transcriptDemo && <p className="text-base text-ink-2">{syntheticTranscriptNotice(Boolean(timeline.repeatAnalysis))}</p>}
          {error && <p className="text-base text-ink" role="status">Having trouble refreshing. Showing the last update.</p>}
          <TimelineTabs elderId={id} tab={tab} fixture={USE_FIXTURES ? variant : undefined} />
        </header>

        {tab === 'doing' ? (
          <HowHesDoing timeline={timeline} />
        ) : (
          <>
            {timeline.repeatAnalysis && <RepeatDetections analysis={timeline.repeatAnalysis} elderId={id} />}
            {!confirmed && <p className="rounded-[20px] border border-line bg-card p-5">{copy.notYetConfirmed(name)}</p>}

            {/* Desktop: two independent columns (newest + note | panel + facts), so one side growing never
                opens a gap in the other; earlier chats run full width below. Phones: one column in the
                order newest, panel, note, facts, earlier (the column wrappers become `contents`). */}
            <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start">
              <div ref={leftRef} className="contents lg:flex lg:flex-col lg:gap-8">
              <div className="order-1">

                {newest ? (
                  <SnapshotCard
                    key={`${newest.id}:${newest.status}`}
                    call={newest} variant="feature" isNew={newIds.has(newest.id)}
                    confirmed={confirmed} photos={photos} name={name}
                    href={recapHref(id, newest.id, fixture)}
                  />
                ) : (
                  <p className="rounded-[20px] border border-line bg-card p-5">
                    No chats yet. Once {name} calls Remi, his first snapshot shows up here.
                  </p>
                )}
              </div>

              {nudges.length > 0 && (
                <div className="order-3 space-y-4">
                  {nudges.map((n) => <GentleNote key={n.id} nudge={n} onDismiss={() => hide(n.id)} />)}
                </div>
              )}
              </div>

              <div ref={rightRef} className="contents lg:flex lg:flex-col lg:gap-8">
                <div ref={panelRef} className="order-2">
                  {elder && <NextChatPanel elderId={id} elder={elder} name={name} onChanged={refresh} />}
                </div>
                {confirmed && factsBeside && facts}
              </div>

              {confirmed && !factsBeside && <div className="order-4 lg:col-span-2">{facts}</div>}

              {earlier.length > 0 && (
                <section aria-labelledby="earlier" className="order-5 space-y-4 lg:col-span-2">
                  <h2 id="earlier" className="text-[30px] font-black tracking-tight">Earlier chats</h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {shownEarlier.map((c) => (
                      <ChatCard key={`${c.id}:${c.status}`} call={c} href={recapHref(id, c.id, fixture)}
                        highlight={confirmed && hasHighlight(timeline, c)}
                        factCount={confirmed ? recapHighlights(timeline, c).facts.length : 0} />
                    ))}
                  </div>
                  {earlier.length > EARLIER_STEP && !earlier.some(call => call.id === query.call) && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => setEarlierShown((n) => (n >= earlier.length ? EARLIER_STEP : n + EARLIER_STEP))}
                        className="text-base font-semibold text-[#7b879a] transition-colors hover:text-ink"
                      >
                        {earlierShown >= earlier.length
                          ? 'Show fewer'
                          : `Show ${Math.min(EARLIER_STEP, earlier.length - earlierShown)} more of ${earlier.length}`}
                      </button>
                    </div>
                  )}
                </section>
              )}
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
