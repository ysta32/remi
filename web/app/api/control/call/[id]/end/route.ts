import { json, notFound } from '@/lib/server/http';
import { endJob } from '@/lib/server/control';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return endJob(id) ? json({ ok: true }) : notFound('no live call with that id');
}
