import { runSeed } from '@/scripts/seed';
import { resetAll } from '@/lib/server/dev';
import { error, json } from '@/lib/server/http';
import { drainQueue } from '@/lib/server/queue';

export const runtime = 'nodejs';

/** Back to the demo story: wipe calls and re-seed the "drift" scenario. */
export async function POST() {
  await drainQueue();
  resetAll();
  try {
    const { elderId } = await runSeed('drift');
    return json({ ok: true, elderId });
  } catch (err) {
    return error(500, `seed failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
