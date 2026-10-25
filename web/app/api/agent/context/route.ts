import { buildCallContext } from '@/lib/server/context';
import { error, json, notFound, requireAgentAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const url = new URL(req.url);
  const elderId = url.searchParams.get('elderId');
  if (!elderId) return error(400, 'elderId query parameter is required');
  const ctx = buildCallContext(elderId, url.origin);
  return ctx ? json(ctx) : notFound('elder not found');
}
