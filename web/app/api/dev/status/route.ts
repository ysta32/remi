import { getSqlite } from '@/db/client';
import { getTimings } from '@/lib/analysis/timings';
import { json, requireDevTools } from '@/lib/server/http';

export const runtime = 'nodejs';

// Operator view (DEV_TOOLS=1 only). Per safety-and-copy §6, safety events and transcripts are
// visible here and nowhere on the family side. Transcripts only with ?transcripts=1.
export async function GET(req?: Request) {
  const blocked = requireDevTools();
  if (blocked) return blocked;
  const withTranscripts = req ? new URL(req.url).searchParams.get('transcripts') === '1' : false;
  const db = getSqlite();
  const rows = db
    .prepare(
      `SELECT id, elder_id, started_at, status, failed_step, error, duration_s, is_simulated, utterances_json FROM calls
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
    utterances_json: string | null;
  }[];
  const eventsStmt = db.prepare('SELECT type, payload_json, at_ms FROM call_events WHERE call_id = ? ORDER BY at_ms');
  const safetyStmt = db.prepare('SELECT category, note, created_at FROM safety_events WHERE call_id = ? ORDER BY created_at');
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
      events: (eventsStmt.all(r.id) as { type: string; payload_json: string; at_ms: number }[]).map((e) => ({
        type: e.type,
        atMs: e.at_ms,
        payload: JSON.parse(e.payload_json) as unknown,
      })),
      safetyEvents: (safetyStmt.all(r.id) as { category: string; note: string; created_at: string }[]).map((s) => ({
        category: s.category,
        note: s.note,
        createdAt: s.created_at,
      })),
      ...(withTranscripts ? { utterances: r.utterances_json ? (JSON.parse(r.utterances_json) as unknown) : null } : {}),
    })),
  });
}
