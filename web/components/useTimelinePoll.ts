'use client';

import { useEffect, useRef, useState } from 'react';
import { getElder, getTimeline, type ElderProfile, type FixtureVariant } from '@/lib/api';
import { freshIds, isBusy, pollDelay, settled } from '@/lib/live';
import type { Timeline } from '@/lib/types';

// Hal's timeline, kept fresh: every 3 s while a call is going or being written up, else every 15 s.
// Shared by Hal's chats page and the chat recap page.
export function useTimelinePoll(id: string, variant: FixtureVariant) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [elder, setElder] = useState<ElderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  // Ids seen so far for this elder; anything not in here on a later poll is highlighted as new.
  // Kept across fixture switches so processing → after-call plays the live-update moment.
  const known = useRef<{ elderId: string; ids: Set<string> } | null>(null);
  const lastBusy = useRef(false);
  const [nonce, setNonce] = useState(0); // bump to fetch again now, e.g. after adding a question

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
        lastBusy.current = isBusy(tl);
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
      timer = setTimeout(tick, pollDelay(lastBusy.current));
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, variant, nonce]);

  return { timeline, elder, error, newIds, refresh: () => setNonce((n) => n + 1) };
}
