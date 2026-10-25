import { json, notFound } from '@/lib/server/http';
import { buildLiveView } from '@/lib/server/live-notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Consent filtering is done inside buildLiveView, server-side. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const view = buildLiveView(id);
  return view ? json(view) : notFound('elder not found');
}
