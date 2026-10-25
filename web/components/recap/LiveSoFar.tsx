'use client';

import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/format';
import type { CallCard } from '@/lib/types';

function elapsed(startedAt: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(startedAt)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "Chatting now · 3:42" while the call is going; "Just finished" while it's being written up.
export function LivePill({ call }: { call: CallCard }) {
  const [now, setNow] = useState(() => Date.now());
  const going = call.status === 'in_progress';
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [going]);
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-0.5 text-base font-bold text-white">
      <span className="live-pulse size-2.5 rounded-full bg-ok" aria-hidden />
      {going ? <>Chatting now · <span className="tabular-nums">{elapsed(call.startedAt, now)}</span></> : 'Just finished'}
    </span>
  );
}

// What has happened so far in a call that is still going, from the agent's live events.
export function LiveSoFar({ call }: { call: CallCard }) {
  const items = [
    `Remi said hello at ${formatTime(call.startedAt)}`,
    ...call.photosShown.map((p) => `Showed the photo “${p.caption}”`),
    ...(call.familyQuestion ? [`Asked ${call.familyQuestion.askedBy}’s question: “${call.familyQuestion.text}”`] : []),
  ];
  return (
    <ul className="grid gap-1.5" role="status" aria-live="polite">
      {items.map((text) => (
        <li key={text} className="animate-arrive flex items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full bg-hero" aria-hidden />
          {text}
        </li>
      ))}
      <li className="flex items-center gap-2.5 text-ink-2">
        <span className="size-2 shrink-0 rounded-full bg-line" aria-hidden />
        {call.status === 'processing' ? 'He hung up. Writing up the chat now…' : 'More shows up here as they talk'}
      </li>
    </ul>
  );
}
