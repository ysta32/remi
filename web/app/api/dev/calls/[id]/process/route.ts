import { getCallElder, startProcessing } from '@/lib/server/calls';
import { json, notFound, requireDevTools } from '@/lib/server/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const blocked = requireDevTools();
  if (blocked) return blocked;
  const { id } = await params;
  if (!getCallElder(id)) return notFound('call not found');
  startProcessing(id);
  return json({ status: 'processing' }, 202);
}
