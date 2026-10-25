import { z } from 'zod';
import { runSeed } from '@/scripts/seed';
import { resetAll } from '@/lib/server/dev';
import { error, json, parseBody, requireDevTools } from '@/lib/server/http';
import { drainQueue } from '@/lib/server/queue';

export const runtime = 'nodejs';

const seedSchema = z.object({ scenario: z.enum(['drift', 'stable']) });

export async function POST(req: Request) {
  const blocked = requireDevTools();
  if (blocked) return blocked;
  const body = await parseBody(req, seedSchema);
  if (body instanceof Response) return body;
  await drainQueue();
  resetAll();
  try {
    const { elderId } = await runSeed(body.scenario);
    return json({ elderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not implemented/i.test(message)) return error(501, message);
    console.error('[dev/seed] failed', message);
    return error(500, `seed failed: ${message}`);
  }
}
