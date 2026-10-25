import { getSqlite } from '@/db/client';
import { noContent, notFound } from '@/lib/server/http';
import { nowIso } from '@/lib/server/ids';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM nudges WHERE id = ?').get(id)) return notFound('nudge not found');
  db.prepare('UPDATE nudges SET dismissed_at = COALESCE(dismissed_at, ?) WHERE id = ?').run(nowIso(), id);
  return noContent();
}
