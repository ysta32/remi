import Link from 'next/link';
import type { FixtureVariant } from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { axisTicks, dayKey, recapHighlights, soundRows, xPercent, type SoundRow } from '@/lib/recap';
import type { CallCard, Timeline } from '@/lib/types';
import { recapHref } from '../ChatCard';

// One lane of every chat so far: his usual as a soft band, this chat as the dark dot.
function Lane({ row, call, timeline, href }: { row: SoundRow; call: CallCard; timeline: Timeline; href: (id: string) => string }) {
  const vals = row.points.map((p) => p.value).concat(row.band ?? []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const y = (v: number) => (hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84); // % from top, 8% headroom
  return (
    <div className="relative mx-2.5 h-[60px]" role="img" aria-label={`${row.title} across every chat`}>
      {row.band && (
        <div className="absolute -inset-x-2.5 rounded-lg bg-sky-soft" style={{ top: `${y(row.band[1])}%`, bottom: `${100 - y(row.band[0])}%` }} />
      )}
      <div className="absolute inset-y-0 md:-bottom-4 md:-top-4 w-0.5 -translate-x-1/2 bg-ink/20" style={{ left: `${xPercent(timeline, call.startedAt)}%` }} aria-hidden />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <polyline fill="none" stroke="var(--hero)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          points={row.points.map((p) => `${xPercent(timeline, p.at)},${y(p.value)}`).join(' ')} />
      </svg>
      {row.points.map((p) => {
        const sel = p.callId === call.id;
        return (
          <Link key={p.callId} href={href(p.callId)} aria-label={`Open the chat on ${formatShortDate(p.at)}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-white ${
              sel ? 'size-[18px] border-[3px] bg-ink' : 'size-3 border-2 bg-[#7d9cc0] hover:bg-ink-2'
            }`}
            style={{ left: `${xPercent(timeline, p.at)}%`, top: `${y(p.value)}%` }} />
        );
      })}
    </div>
  );
}

const SAY: Record<string, string> = {
  usual: 'before:bg-ok',
  learning: 'text-ink-2 font-semibold before:bg-line',
  more: 'text-family-ink before:bg-family-strong',
  less: 'text-family-ink before:bg-family-strong',
};

function Say({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <span className={`mt-0.5 flex items-center gap-2 font-bold before:size-2.5 before:shrink-0 before:rounded-full before:content-[''] ${SAY[status]}`}>
      {children}
    </span>
  );
}

export function SoundedChart({
  timeline, call, elderId, fixture,
}: { timeline: Timeline; call: CallCard; elderId: string; fixture?: FixtureVariant }) {
  const live = call.status === 'in_progress' || call.status === 'processing';
  const when = dayKey(call.startedAt) === dayKey(new Date().toISOString())
    ? 'today'
    : `on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(call.startedAt))}`;
  const href = (id: string) => recapHref(elderId, id, fixture);
  const rows = soundRows(timeline, call.id);
  const { retold } = recapHighlights(timeline, call);
  const grid = 'grid items-center gap-x-7 gap-y-1.5 border-t border-line py-4 first:border-t-0 md:grid-cols-[290px_1fr]';

  return (
    <section aria-labelledby="sounded" className="rounded-3xl border border-line bg-card px-6 pb-5 pt-6 shadow-[0_2px_6px_rgba(29,43,69,0.04)] md:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sounded" className="text-[22px] font-black">How he sounded {when}</h2>
        <Link href={`/elders/${elderId}?tab=doing${fixture ? `&fixture=${fixture}` : ''}`} className="text-base font-bold text-ink-2 underline decoration-2 underline-offset-4 hover:text-ink">
          See every chat →
        </Link>
        {!live && (
          <p className="basis-full text-base text-ink-2">
            Each row is every chat so far. The blue band is his usual; the dark dot is this chat. Tap a dot to open that chat.
          </p>
        )}
      </div>

      {live ? (
        <p className="mt-3 rounded-2xl bg-ground px-4 py-3.5 text-ink-2">
          {call.status === 'in_progress'
            ? 'These fill in a minute or so after he hangs up.'
            : 'Almost ready: working out how this chat compares with his usual.'}
        </p>
      ) : (
        <>
          <div className="mt-2.5">
            {rows.filter((r) => r.status).map((r) => (
              <div key={r.key} className={grid}>
                <div>
                  <b className="block text-[19px] font-black">{r.title}</b>
                  <Say status={r.status!}>{r.words}</Say>
                  {(r.detail || r.rough) && (
                    <span className="block text-base text-ink-2">
                      {r.detail}{r.detail && r.rough && <br />}{r.rough && 'Short chat, so a rough reading'}
                    </span>
                  )}
                </div>
                <Lane row={r} call={call} timeline={timeline} href={href} />
              </div>
            ))}
            <div className={grid}>
              <div>
                <b className="block text-[19px] font-black">Retold stories</b>
                {retold.length ? retold.map((r) => (
                  <span key={r.summary}>
                    <Say status="more">{r.nth === 1 ? 'Told a story for the first time' : `Told a story again (${r.nth} times now)`}</Say>
                    <span className="mt-1 block font-caption text-[21px] leading-tight">{r.summary}</span>
                  </span>
                )) : <Say status="usual">No repeats this chat</Say>}
              </div>
              <div className="relative mx-2.5 h-[60px]">
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-line" />
                <div className="absolute inset-y-0 md:-bottom-4 md:-top-4 w-0.5 -translate-x-1/2 bg-ink/20" style={{ left: `${xPercent(timeline, call.startedAt)}%` }} aria-hidden />
                {timeline.repeats.flatMap((r) => r.dates).map((d) => {
                  const c = timeline.calls.find((x) => dayKey(x.startedAt) === dayKey(d));
                  if (!c) return null;
                  const sel = c.id === call.id;
                  return (
                    <Link key={d} href={href(c.id)} aria-label={`Retold on ${formatShortDate(d)}`}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-white ${
                        sel ? 'size-[18px] border-[3px] bg-family-ink' : 'size-3 border-2 bg-family-strong'
                      }`}
                      style={{ left: `${xPercent(timeline, d)}%` }} />
                  );
                })}
              </div>
            </div>
            <div className="grid gap-x-7 md:grid-cols-[290px_1fr]">
              <div className="hidden md:block" />
              <div className="relative mx-2.5 h-6 text-base text-ink-2">
                {axisTicks(timeline).map((t) => (
                  <span key={t.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${xPercent(timeline, t.at)}%` }}>{t.label}</span>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-2 max-w-[70ch] text-base text-ink-2">
            One chat on its own doesn&apos;t mean much. Remi only suggests a check-in when several of these stay different for a few weeks.
          </p>
        </>
      )}
    </section>
  );
}
