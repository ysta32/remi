import { Suspense } from 'react';
import { ChatRecapView } from '@/components/recap/ChatRecapView';

export default function ChatRecapPage({ params, searchParams }: PageProps<'/elders/[id]/chats/[callId]'>) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-10 text-ink-soft">Loading…</main>}>
      <ChatRecapView params={params} searchParams={searchParams} />
    </Suspense>
  );
}
