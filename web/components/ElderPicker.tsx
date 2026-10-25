'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getElders, type ElderSummary } from '@/lib/api';

export function ElderPicker() {
  const [elders, setElders] = useState<ElderSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getElders().then(setElders, () => setError(true));
  }, []);

  if (error) return <p className="text-amber-ink">Couldn’t load profiles. Is the server running?</p>;
  if (!elders) return <p className="text-ink-soft" role="status">Loading…</p>;

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {elders.map((e) => (
        <li key={e.id}>
          <Link
            href={`/elders/${e.id}`}
            className="group block rounded-3xl border border-line bg-card p-6 transition hover:border-accent/50 hover:shadow-sm"
          >
            <p className="font-display text-2xl font-semibold">{e.preferredName}</p>
            <p className="text-ink-soft">{e.displayName}</p>
            <p className="mt-4 font-semibold text-accent">See his chats <span aria-hidden className="inline-block transition group-hover:translate-x-1">→</span></p>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href="/setup"
          className="grid h-full place-items-center rounded-3xl border-2 border-dashed border-line p-6 text-center font-semibold text-ink-soft transition hover:border-accent/50 hover:text-accent"
        >
          + Set up a new profile
        </Link>
      </li>
    </ul>
  );
}
