'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { dismissNudge, FIXTURE_VARIANTS, isFixtureVariant, type FixtureVariant } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { copy } from '@/lib/copy';
import { formatRelative } from '@/lib/format';
import { hasHighlight, recapHighlights } from '@/lib/recap';
import { ChatCard, recapHref } from './ChatCard';
import { FunFacts } from './FunFacts';
import { GentleNote } from './GentleNote';
import { HowHesDoing } from './HowHesDoing';
import { QuestionsWaiting } from './QuestionsWaiting';
import { SiteNav } from './SiteNav';
import { SnapshotCard } from './SnapshotCard';
import { TimelineTabs } from './TimelineTabs';
import { useTimelinePoll } from './useTimelinePoll';

const FACTS_SHOWN = 3;

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

  const { timeline, elder, error, newIds } = useTimelinePoll(id, variant);
  const [hiddenNudges, setHiddenNudges] = useState<Set<string>>(new Set());
  const [allFacts, setAllFacts] = useState(false);

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
  const fixture = USE_FIXTURES ? variant : undefined;
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

            {/* Phones: newest, note, stories, then earlier chats. Desktop: stories sit right of the newest chat and note; earlier chats run full width below. */}
            <div className="grid items-start gap-8 [grid-template-areas:'newest'_'note'_'side'_'earlier'] lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_1fr_auto] lg:[grid-template-areas:'newest_side'_'note_side'_'earlier_earlier']">
              <div className="[grid-area:newest]">
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
                <div className="space-y-4 [grid-area:note]">
                  {nudges.map((n) => <GentleNote key={n.id} nudge={n} onDismiss={() => hide(n.id)} />)}
                </div>
              )}

              {earlier.length > 0 && (
                <section aria-labelledby="earlier" className="space-y-4 [grid-area:earlier]">
                  <h2 id="earlier" className="text-[30px] font-black tracking-tight">Earlier chats</h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {earlier.map((c) => (
                      <ChatCard key={`${c.id}:${c.status}`} call={c} href={recapHref(id, c.id, fixture)}
                        highlight={confirmed && hasHighlight(timeline, c)}
                        factCount={confirmed ? recapHighlights(timeline, c).facts.length : 0} />
                    ))}
                  </div>
                </section>
              )}

              <div className="space-y-6 [grid-area:side]">
                {elder && <QuestionsWaiting questions={elder.questions} name={name} />}
                {confirmed && (
                  <section aria-labelledby="facts" className="space-y-3">
                    <h2 id="facts" className="text-[30px] font-black tracking-tight">Fun facts</h2>
                    {/* Facts pile up with every call, so the sidebar shows the newest few; each
                        chat's recap keeps its own facts one click away. */}
                    <FunFacts
                      facts={allFacts ? timeline.funFacts : timeline.funFacts.slice(0, FACTS_SHOWN)}
                      newIds={newIds}
                      more={timeline.funFacts.length > FACTS_SHOWN && (
                        <button
                          type="button"
                          aria-expanded={allFacts}
                          onClick={() => setAllFacts((v) => !v)}
                          className="text-base font-semibold text-ink-2 hover:text-ink hover:underline hover:underline-offset-4"
                        >
                          {allFacts ? 'Show fewer' : `See all ${timeline.funFacts.length} fun facts →`}
                        </button>
                      )}
                    />
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
