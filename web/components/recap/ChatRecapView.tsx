'use client';

import Link from 'next/link';
import { use } from 'react';
import { isFixtureVariant, type FixtureVariant } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { formatDay } from '@/lib/format';
import { dayKey, findCall, recapHighlights } from '@/lib/recap';
import type { CallCard } from '@/lib/types';
import { PhotoWindow } from '../PhotoWindow';
import { SimulatedBadge } from '../SimulatedBadge';
import { SiteNav } from '../SiteNav';
import { TimelineTabs } from '../TimelineTabs';
import { useTimelinePoll } from '../useTimelinePoll';
import { LivePill, LiveSoFar } from './LiveSoFar';
import { RecapCalendar } from './RecapCalendar';
import { SoundedChart } from './SoundedChart';

const MOOD: Record<NonNullable<CallCard['mood']>, string> = {
  positive: 'In good spirits',
  neutral: 'Steady',
  low: 'Seemed a bit low',
};

const card = 'rounded-3xl border border-line bg-card p-[22px] shadow-[0_2px_6px_rgba(29,43,69,0.04)]';

export function ChatRecapView({
  params, searchParams,
}: { params: Promise<{ id: string; callId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id, callId } = use(params);
  const query = use(searchParams);
  const variant: FixtureVariant = isFixtureVariant(query.fixture) ? query.fixture : 'drift';
  const fixture = USE_FIXTURES ? variant : undefined;
  const { timeline, elder, error } = useTimelinePoll(id, variant);
  const backHref = `/elders/${id}${fixture ? `?fixture=${fixture}` : ''}`;

  const shell = (children: React.ReactNode) => (
    <>
      <SiteNav variant="app" />
      <main className="mx-auto max-w-[1200px] px-4 pb-16 md:px-8">{children}</main>
    </>
  );

  if (!timeline) {
    return shell(<p className="text-ink-2" role="status">{error ? `Couldn’t load this chat: ${error}` : 'Loading…'}</p>);
  }

  const name = timeline.elder.preferredName;
  const back = (
    <Link href={backHref} className="mb-4 inline-flex font-bold text-ink-2 hover:text-ink">← All chats with {name}</Link>
  );
  const call = findCall(timeline, callId);
  if (!call) {
    return shell(<>{back}<p className={card}>We couldn’t find that chat. It may have been removed.</p></>);
  }

  const confirmed = timeline.consent.elderConfirmed;
  const live = call.status === 'in_progress' || call.status === 'processing';
  const { facts } = recapHighlights(timeline, call);
  const today = dayKey(call.startedAt) === dayKey(new Date().toISOString());
  const minutes = call.durationS ? Math.max(1, Math.round(call.durationS / 60)) : null;

  const highlights = !live && confirmed ? [
    call.familyQuestion && (
      <section key="q" className="rounded-3xl bg-family p-[22px]">
        <p className="text-base font-bold text-family-ink">{call.familyQuestion.askedBy} asked</p>
        <p className="mb-2.5 mt-1 text-[22px] font-black">“{call.familyQuestion.text}”</p>
        <p className="rounded-2xl bg-card px-4 py-3">
          <b className="block text-base text-family-ink">What {name} said</b>
          {call.familyQuestion.answer ?? 'Not answered this time.'}
        </p>
      </section>
    ),
    ...facts.map((f) => (
      <section key={f.id} className="rounded-3xl bg-[#fff4cf] p-[22px]">
        <h2 className="mb-2.5 text-[22px] font-black">Fun fact</h2>
        <p>{f.text}</p>
        {f.quote && <p className="mt-3 font-caption text-[25px] leading-tight text-[#5a4a1a]">“{f.quote}”</p>}
      </section>
    )),
    call.photosShown.length > 0 && (
      <section key="p" className={card}>
        <h2 className="mb-3 text-[22px] font-black">Photos Remi showed</h2>
        <div className="grid gap-3">
          {call.photosShown.map((p) => (
            <figure key={p.id} className="m-0 grid grid-cols-[120px_1fr] items-center gap-4">
              <div className="-rotate-2 border-[7px] border-b-[18px] border-white shadow-[0_3px_8px_rgba(29,43,69,0.12)]">
                <PhotoWindow photoId={p.id} caption={p.caption} photos={elder?.photos ?? []} size="compact" />
              </div>
              <figcaption className="font-caption text-[22px] leading-tight">{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    ),
  ].filter(Boolean) : [];

  return shell(
    <>
      {back}
      <div className="mb-6"><TimelineTabs elderId={id} tab="chats" fixture={fixture} /></div>
      <div className="mb-7 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-[34px] font-black leading-[1.05] tracking-tight [text-wrap:balance] md:text-[44px]">
            {today ? 'Today' : formatDay(call.startedAt)}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {live ? <LivePill call={call} /> : (
              <>
                {minutes && <span className="rounded-full border border-line bg-card px-3 py-0.5 text-base font-bold text-ink-2">{minutes}-minute chat</span>}
                {call.mood && <span className="rounded-full bg-ok px-3 py-0.5 text-base font-bold text-ok-ink">{MOOD[call.mood]}</span>}
              </>
            )}
            {call.isSimulated && <SimulatedBadge />}
          </div>
          {live ? (
            <div className="mt-6">
              <p className="mb-2 text-base font-bold text-ink-2">So far</p>
              {confirmed ? <LiveSoFar call={call} /> : <p>{name} is chatting with Remi right now.</p>}
            </div>
          ) : call.status === 'failed' ? (
            <p className="mt-5 max-w-[62ch] text-ink-2">We couldn’t write up this chat. It still counts as a call.</p>
          ) : (
            <p className="mt-5 max-w-[62ch] text-[20px] leading-normal md:text-[23px]">
              {call.summary ?? `${name} hasn’t said yes to sharing details yet, so only the date and length show.`}
            </p>
          )}
        </div>
        <RecapCalendar timeline={timeline} selectedId={call.id} selectedAt={call.startedAt} elderId={id} fixture={fixture} />
      </div>

      {highlights.length > 0 && (
        <div className="mb-5 grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">{highlights}</div>
      )}
      {confirmed && <SoundedChart timeline={timeline} call={call} elderId={id} fixture={fixture} />}
    </>,
  );
}
