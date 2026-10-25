import { getSqlite } from '@/db/client';
import { notFound } from '@/lib/server/http';
import { imageResponse } from '@/lib/server/uploads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = getSqlite().prepare('SELECT file_path, mime FROM photos WHERE id = ?').get(id) as
    | { file_path: string; mime: string }
    | undefined;
  if (!p) return notFound('photo not found');
  return imageResponse(p.file_path, p.mime) ?? notFound('photo file missing');
}
