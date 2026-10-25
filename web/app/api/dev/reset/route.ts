import { resetAll } from '@/lib/server/dev';
import { json, requireDevTools } from '@/lib/server/http';
import { drainQueue } from '@/lib/server/queue';

export const runtime = 'nodejs';

export async function POST() {
  const blocked = requireDevTools();
  if (blocked) return blocked;
  await drainQueue();
  resetAll();
  return json({ ok: true });
}
