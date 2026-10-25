'use client';

// Live tab: what Remi notes during the call happening now ("Favorite fruit is an apple."),
// polled every 2 s. Notes only, never the transcript (lib/server/live-notes.ts).
import { useEffect, useRef, useState } from 'react';
import { getLive, type LiveNote, type LiveView } from '@/lib/api';
import { copy } from '@/lib/copy';
import { formatRelative } from '@/lib/format';

const POLL_MS = 2_000;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function NoteRow({ note, fresh }: { note: LiveNote; fresh: boolean }) {
  return (
    <li
      className={`flex items-baseline gap-4 rounded-2xl px-4 py-3 transition-colors duration-[1500ms] ${
        fresh ? 'bg-ground' : 'bg-transparent'
      }`}
    >
      <span className="w-20 shrink-0 text-base text-ink-2">{clock(note.createdAt)}</span>
      <span className="text-[19px] leading-snug text-ink">{note.text}</span>
      {note.kind === 'moment' && <span className="ml-auto shrink-0 text-base text-ink-2">Story</span>}
    </li>
  );
}

export function LiveNotes({ elderId }: { elderId: string }) {
  const [view, setView] = useState<LiveView | null>(null);
  const [failed, setFailed] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const v = await getLive(elderId);
        if (cancelled) return;
        const ids = [...v.thisCall, ...v.facts].map((n) => n.id);
        if (seen.current) {
          const added = ids.filter((id) => !seen.current!.has(id));
          if (added.length) {
            setFresh(new Set(added));
            setTimeout(() => !cancelled && setFresh(new Set()), 2500);
          }
        }
        seen.current = new Set(ids);
        setView(v);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [elderId]);

  if (!view) {
    return (
      <section className="rounded-[20px] border border-line bg-card p-6 text-ink-2" aria-busy="true">
        {failed ? 'Can’t reach the live call right now. Retrying…' : 'Connecting to the live call…'}
      </section>
    );
  }

  const name = view.elderName;
  const live = view.call?.status === 'in_progress';
  const status = live
    ? `${name} is talking with Remi now · started ${clock(view.call!.startedAt)}`
    : view.call
      ? `No call right now · last call ${formatRelative(view.call.startedAt)}`
      : 'No calls yet. When Remi calls, notes show up here as they talk.';

  return (
    <section aria-label="Live call" className="space-y-6">
      <div className="flex items-center gap-3 rounded-[20px] border border-line bg-card px-6 py-5" role="status" aria-live="polite">
        <span className="relative flex h-3 w-3 shrink-0">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2f9e5b] opacity-60 motion-reduce:animate-none" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${live ? 'bg-[#2f9e5b]' : 'bg-line'}`} />
        </span>
        <p className="text-[19px] font-bold text-ink">{status}</p>
        {failed && <p className="ml-auto text-base text-ink-2">Reconnecting…</p>}
      </div>

      {!view.sharing ? (
        <p className="rounded-[20px] border border-line bg-card p-5">{copy.notYetConfirmed(name)}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-[20px] border border-line bg-card p-6">
            <h2 className="mb-1 text-[24px] font-black tracking-tight">{live ? 'This call, as it happens' : 'From the last call'}</h2>
            <p className="mb-4 text-base text-ink-2">Remi jots down what {name} shares. Newest first.</p>
            {view.thisCall.length ? (
              <ul className="-mx-4 space-y-1" aria-live="polite">
                {view.thisCall.map((n) => <NoteRow key={n.id} note={n} fresh={fresh.has(n.id)} />)}
              </ul>
            ) : (
              <p className="text-ink-2">{live ? `Listening… notes appear as ${name} shares things.` : 'Nothing noted on that call.'}</p>
            )}
          </div>
          <div className="rounded-[20px] border border-line bg-card p-6">
            <h2 className="mb-1 text-[24px] font-black tracking-tight">Remi remembers</h2>
            <p className="mb-4 text-base text-ink-2">Things {name} asked Remi to remember. Remi brings them up on later calls.</p>
            {view.facts.length ? (
              <ul className="-mx-4 space-y-1">
                {view.facts.map((n) => <NoteRow key={n.id} note={n} fresh={fresh.has(n.id)} />)}
              </ul>
            ) : (
              <p className="text-ink-2">Nothing yet. Try “Remember, my favorite fruit is an apple.”</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
