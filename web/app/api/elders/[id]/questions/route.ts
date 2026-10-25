import { getSqlite } from '@/db/client';
import { questionCreateSchema, questionView, type QuestionRow } from '@/lib/server/elders';
import { json, notFound, parseBody } from '@/lib/server/http';
import { newId, nowIso } from '@/lib/server/ids';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await parseBody(req, questionCreateSchema);
  if (body instanceof Response) return body;
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM elders WHERE id = ?').get(id)) return notFound('elder not found');
  const row: QuestionRow = {
    id: newId(),
    elder_id: id,
    text: body.text,
    asked_by: body.askedBy,
    status: 'pending',
    asked_call_id: null,
    is_simulated: 0,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO family_questions (id, elder_id, text, asked_by, status, asked_call_id, is_simulated, created_at)
     VALUES (@id, @elder_id, @text, @asked_by, @status, @asked_call_id, @is_simulated, @created_at)`,
  ).run(row);
  return json(questionView(row), 201);
}
