import { callCreateSchema, createCall } from '@/lib/server/calls';
import { json, notFound, parseBody, requireAgentAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const body = await parseBody(req, callCreateSchema);
  if (body instanceof Response) return body;
  const callId = createCall(body);
  return callId ? json({ callId }, 201) : notFound('elder not found');
}
