import { applyCallEvent, callEventSchema } from '@/lib/server/calls';
import { noContent, notFound, parseBody, requireAgentAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ callId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const { callId } = await params;
  const body = await parseBody(req, callEventSchema);
  if (body instanceof Response) return body;
  return applyCallEvent(callId, body) ? noContent() : notFound('call not found');
}
