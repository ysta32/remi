import { json, notFound } from '@/lib/server/http';
import { buildTimeline } from '@/lib/server/timeline';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Consent filtering is done inside buildTimeline, server-side. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const timeline = buildTimeline(id);
  return timeline ? json(timeline) : notFound('elder not found');
}
