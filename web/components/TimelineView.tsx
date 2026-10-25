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
import { CallCardView } from './CallCardView';
import { FunFacts } from './FunFacts';
import { NudgeCard } from './NudgeCard';
import { QuestionsWaiting } from './QuestionsWaiting';
import { Repeats } from './Repeats';
import { Trends } from './Trends';

const POLL_BUSY_MS = 3_000;
const POLL_IDLE_MS = 15_000;
const CALLS_SHOWN = 4;

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function FixtureBar({ elderId, current }: { elderId: string; current: FixtureVariant }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-sand px-4 py-2 text-sm text-ink-soft">
      <span className="font-semibold">Fixture data:</span>
      {(Object.keys(FIXTURE_VARIANTS) as FixtureVariant[]).map((v) => (
        <Link
          key={v}
          href={`/elders/${elderId}?fixture=${v}`}
          className={`rounded-full px-3 py-0.5 ${v === current ? 'bg-ink text-paper' : 'hover:bg-white'}`}
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
  const fixture = use(searchParams).fixture;
  const variant: FixtureVariant = isFixtureVariant(fixture) ? fixture : 'drift';

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
      <main className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-ink-soft" role="status">{error ? `Couldn’t load: ${error}` : 'Loading…'}</p>
      </main>
    );
  }

  const name = timeline.elder.preferredName;
  const confirmed = timeline.consent.elderConfirmed;
  const lastCall = timeline.calls[0];
  const nudges = timeline.nudges.filter((n) => !hiddenNudges.has(n.id));
  const calls = showAll ? timeline.calls : timeline.calls.slice(0, CALLS_SHOWN);
  const anySimulated = timeline.calls.some((c) => c.isSimulated);

  const hide = (nudgeId: string) => {
    setHiddenNudges((prev) => new Set(prev).add(nudgeId));
    dismissNudge(nudgeId).catch(() => {});
  };

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-5 py-8 sm:py-10">
      {USE_FIXTURES && <FixtureBar elderId={id} current={variant} />}

      <header className="space-y-2">
        <p className="text-ink-soft">{timeline.elder.displayName}</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{name}’s chats</h1>
        <p className="text-ink-soft">
          {lastCall ? `Last chat ${formatRelative(lastCall.startedAt)}` : 'No chats yet.'}
          {timeline.processing && <span className="ml-2 font-semibold text-accent">· Remi is writing up a chat…</span>}
        </p>
        {anySimulated && (
          <p className="text-sm text-ink-soft">
            Chats marked <span className="font-bold uppercase tracking-wider">Simulated</span> are demo history created for this presentation.
          </p>
        )}
        {error && <p className="text-sm text-amber-ink" role="status">Having trouble refreshing — showing the last update.</p>}
      </header>

      {!confirmed && (
        <p className="rounded-3xl border border-line bg-card p-5 text-[1.05rem]">{copy.notYetConfirmed(name)}</p>
      )}

      {nudges.map((n) => (
        <NudgeCard key={n.id} nudge={n} onDismiss={() => hide(n.id)} />
      ))}

      <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
        <Section title="Recent chats" id="recent">
          <div className="space-y-4">
            {calls.map((c) => (
              <CallCardView key={c.id} call={c} name={name} confirmed={confirmed} isNew={newIds.has(c.id)} />
            ))}
          </div>
          {timeline.calls.length > CALLS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="rounded-full border border-line px-5 py-2.5 font-semibold text-accent transition hover:bg-card"
            >
              {showAll ? 'Show fewer' : `Show all ${timeline.calls.length} chats`}
            </button>
          )}
        </Section>

        <div className="space-y-10">
          {elder && <QuestionsWaiting questions={elder.questions} name={name} />}
          {confirmed && (
            <Section title="Fun facts" id="facts">
              <FunFacts facts={timeline.funFacts} newIds={newIds} />
            </Section>
          )}
        </div>
      </div>

      {timeline.markers.length > 0 && (
        <Section title={`How ${name}’s been talking`} id="trends">
          <Trends markers={timeline.markers} name={name} />
        </Section>
      )}

      {timeline.markers.length > 0 && (
        <Section title="Stories told more than once in a week" id="repeats">
          <Repeats repeats={timeline.repeats} />
        </Section>
      )}

      <footer className="border-t border-line pt-6 text-sm text-ink-soft">
        <p className="max-w-3xl">{copy.timelineFooter(name)}</p>
      </footer>
    </main>
  );
}
