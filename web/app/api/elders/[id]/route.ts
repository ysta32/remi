import { getSqlite } from '@/db/client';
import { elderPatchSchema, elderProfile } from '@/lib/server/elders';
import { json, notFound, parseBody } from '@/lib/server/http';
import { newId } from '@/lib/server/ids';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const profile = elderProfile(id);
  return profile ? json(profile) : notFound('elder not found');
}

const COLUMNS = {
  displayName: 'display_name',
  preferredName: 'preferred_name',
  language: 'language',
  timezone: 'timezone',
  about: 'about',
  primaryContactName: 'primary_contact_name',
} as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await parseBody(req, elderPatchSchema);
  if (body instanceof Response) return body;
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM elders WHERE id = ?').get(id)) return notFound('elder not found');
  db.transaction(() => {
    const keys = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).filter((k) => body[k] !== undefined);
    if (keys.length) {
      const sets = keys.map((k) => `${COLUMNS[k]} = @${k}`).join(', ');
      const values: Record<string, unknown> = { id };
      for (const k of keys) values[k] = body[k];
      db.prepare(`UPDATE elders SET ${sets} WHERE id = @id`).run(values);
    }
    if (body.members) {
      db.prepare('DELETE FROM family_members WHERE elder_id = ?').run(id);
      const ins = db.prepare('INSERT INTO family_members (id, elder_id, name, relation) VALUES (?, ?, ?, ?)');
      for (const m of body.members) ins.run(newId(), id, m.name, m.relation);
    }
  })();
  return json(elderProfile(id));
}
