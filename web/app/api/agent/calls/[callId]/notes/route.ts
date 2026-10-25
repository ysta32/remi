import { addLiveNote, liveNoteSchema } from '@/lib/server/live-notes';
import { noContent, notFound, parseBody, requireAgentAuth } from '@/lib/server/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ callId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const { callId } = await params;
  const body = await parseBody(req, liveNoteSchema);
  if (body instanceof Response) return body;
  return addLiveNote(callId, body) ? noContent() : notFound('call not found');
}
