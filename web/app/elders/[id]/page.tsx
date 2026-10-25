import { Suspense } from 'react';
import { TimelineView } from '@/components/TimelineView';

export default function ElderTimelinePage({ params, searchParams }: PageProps<'/elders/[id]'>) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-10 text-ink-soft">Loading…</main>}>
      <TimelineView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
