import { getSqlite } from '@/db/client';
import { noContent, notFound } from '@/lib/server/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const res = getSqlite().prepare('DELETE FROM family_questions WHERE id = ?').run(id);
  return res.changes ? noContent() : notFound('question not found');
}
