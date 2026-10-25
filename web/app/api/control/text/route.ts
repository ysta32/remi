import { z } from 'zod';
import { json, parseBody } from '@/lib/server/http';
import { sendText } from '@/lib/server/control';

export const runtime = 'nodejs';

const schema = z.object({
  to: z.string().trim().min(2).max(60).regex(/^[+\d\s().\p{L}'-]+$/u),
  body: z.string().trim().min(1).max(1000),
  asRemi: z.boolean().default(false),
});

export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (body instanceof Response) return body;
  const r = await sendText(body.to, body.body, body.asRemi);
  return json(r, r.ok ? 200 : 502);
}
