import { getSqlite } from '@/db/client';
import { noContent, notFound } from '@/lib/server/http';
import { deleteUpload } from '@/lib/server/uploads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getSqlite();
  const p = db.prepare('SELECT file_path FROM photos WHERE id = ?').get(id) as { file_path: string } | undefined;
  if (!p) return notFound('photo not found');
  db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  deleteUpload(p.file_path);
  return noContent();
}
