import { callCompleteSchema, completeCall } from '@/lib/server/calls';
import { json, notFound, parseBody, requireAgentAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ callId: string }> };

/** Idempotent: a re-send overwrites utterances and re-runs the pipeline. */
export async function POST(req: Request, { params }: Ctx) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const { callId } = await params;
  const body = await parseBody(req, callCompleteSchema);
  if (body instanceof Response) return body;
  return completeCall(callId, body) ? json({ status: 'processing' }, 202) : notFound('call not found');
}
