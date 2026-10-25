import { z } from 'zod';
import { json, parseBody } from '@/lib/server/http';
import { saveContact } from '@/lib/server/control';

export const runtime = 'nodejs';

const schema = z.object({
  label: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} '-]+$/u),
  phone: z.string().trim().min(7).max(20).regex(/^[+\d\s().-]+$/),
});

export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (body instanceof Response) return body;
  const r = await saveContact(body.label, body.phone);
  return json(r, r.ok ? 200 : 400);
}
