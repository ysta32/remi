import { z } from 'zod';
import { error, json, parseBody } from '@/lib/server/http';
import { listJobs, startCall } from '@/lib/server/control';

export const runtime = 'nodejs';

// A phone number or an Apple ID email; the agent's call script normalizes it.
const schema = z.object({ to: z.string().trim().min(3).max(120).regex(/^[+\d\s().@\w-]+$/), video: z.boolean().default(true) });

export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (body instanceof Response) return body;
  if (listJobs().some((j) => !j.endedAt)) return error(409, 'Remi is already on a call; end it first');
  const job = startCall(body.to, body.video);
  return json({ job }, 202);
}
