import { getSqlite } from '@/db/client';
import { notFound, requireAgentAuth } from '@/lib/server/http';
import { imageResponse } from '@/lib/server/uploads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Serves bytes only. last_shown_at is updated by the photo_shown event, never here (the agent may prefetch). */
export async function GET(req: Request, { params }: Ctx) {
  const unauthorized = requireAgentAuth(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const p = getSqlite().prepare('SELECT file_path, mime FROM photos WHERE id = ?').get(id) as
    | { file_path: string; mime: string }
    | undefined;
  if (!p) return notFound('photo not found');
  return imageResponse(p.file_path, p.mime) ?? notFound('photo file missing');
}
