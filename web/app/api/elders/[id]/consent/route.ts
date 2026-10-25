import { getSqlite } from '@/db/client';
import { consentView } from '@/lib/server/consent';
import { getConsentRow } from '@/lib/server/context';
import { consentPutSchema } from '@/lib/server/elders';
import { json, notFound, parseBody } from '@/lib/server/http';
import { nowIso } from '@/lib/server/ids';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Family-proposed consent. Never touches the elder_* columns. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await parseBody(req, consentPutSchema);
  if (body instanceof Response) return body;
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM elders WHERE id = ?').get(id)) return notFound('elder not found');
  const b = (v: boolean) => (v ? 1 : 0);
  db.prepare(
    `INSERT INTO consents (elder_id, fam_summaries, fam_fun_facts, fam_speech_trends, fam_mood, updated_at)
     VALUES (@id, @s, @f, @t, @m, @now)
     ON CONFLICT(elder_id) DO UPDATE SET fam_summaries = excluded.fam_summaries, fam_fun_facts = excluded.fam_fun_facts,
       fam_speech_trends = excluded.fam_speech_trends, fam_mood = excluded.fam_mood, updated_at = excluded.updated_at`,
  ).run({ id, s: b(body.summaries), f: b(body.funFacts), t: b(body.speechTrends), m: b(body.mood), now: nowIso() });
  return json(consentView(getConsentRow(id)));
}
