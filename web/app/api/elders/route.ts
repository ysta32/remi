import { getSqlite } from '@/db/client';
import { elderCreateSchema } from '@/lib/server/elders';
import { json, parseBody } from '@/lib/server/http';
import { newId, nowIso } from '@/lib/server/ids';

export const runtime = 'nodejs';

export async function GET() {
  const rows = getSqlite()
    .prepare('SELECT id, display_name, preferred_name FROM elders ORDER BY created_at')
    .all() as { id: string; display_name: string; preferred_name: string }[];
  return json(rows.map((r) => ({ id: r.id, displayName: r.display_name, preferredName: r.preferred_name })));
}

export async function POST(req: Request) {
  const body = await parseBody(req, elderCreateSchema);
  if (body instanceof Response) return body;
  const db = getSqlite();
  const id = newId();
  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO elders (id, display_name, preferred_name, language, timezone, about, primary_contact_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.displayName,
      body.preferredName,
      body.language,
      body.timezone ?? 'America/New_York',
      body.about ?? '',
      body.primaryContactName,
      now,
    );
    db.prepare('INSERT INTO consents (elder_id, updated_at) VALUES (?, ?)').run(id, now);
    const ins = db.prepare('INSERT INTO family_members (id, elder_id, name, relation) VALUES (?, ?, ?, ?)');
    for (const m of body.members ?? []) ins.run(newId(), id, m.name, m.relation);
  })();
  return json({ id }, 201);
}
