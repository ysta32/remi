import { getSqlite } from '@/db/client';
import { getTimings } from '@/lib/analysis/timings';
import { json, requireDevTools } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET() {
  const blocked = requireDevTools();
  if (blocked) return blocked;
  const rows = getSqlite()
    .prepare(
      `SELECT id, elder_id, started_at, status, failed_step, error, duration_s, is_simulated FROM calls
       ORDER BY started_at DESC, created_at DESC LIMIT 20`,
    )
    .all() as {
    id: string;
    elder_id: string;
    started_at: string;
    status: string;
    failed_step: string | null;
    error: string | null;
    duration_s: number | null;
    is_simulated: number;
  }[];
  return json({
    calls: rows.map((r) => ({
      id: r.id,
      elderId: r.elder_id,
      startedAt: r.started_at,
      status: r.status,
      failedStep: r.failed_step,
      error: r.error,
      durationS: r.duration_s,
      isSimulated: r.is_simulated === 1,
      timings: getTimings(r.id),
    })),
  });
}
