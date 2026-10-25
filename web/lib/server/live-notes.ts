// Live tab: short notes Remi writes during a real call ("Favorite fruit is an apple."),
// shown to family as they arrive. Never the raw transcript. Gated like the timeline:
// nothing is returned until Hal has confirmed sharing summaries.
import { z } from 'zod';
import { getSqlite } from '@/db/client';
import { consentView } from './consent';
import { getConsentRow } from './context';
import { newId, nowIso } from './ids';

export const liveNoteSchema = z.object({
  kind: z.enum(['fact', 'moment']),
  text: z.string().trim().min(1).max(300),
});
export type LiveNoteInput = z.infer<typeof liveNoteSchema>;

export interface LiveNote { id: string; callId: string; kind: 'fact' | 'moment'; text: string; createdAt: string }
export interface LiveView {
  elderName: string;
  sharing: boolean;
  call: { id: string; startedAt: string; endedAt: string | null; status: string; durationS: number | null } | null;
  thisCall: LiveNote[];
  facts: LiveNote[];
  now: string;
}

let ready = false;
function db() {
  const d = getSqlite();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS live_notes (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      elder_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('fact','moment')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS live_notes_elder ON live_notes(elder_id, created_at);`);
    ready = true;
  }
  return d;
}

type Row = { id: string; call_id: string; kind: 'fact' | 'moment'; text: string; created_at: string };
const toNote = (r: Row): LiveNote => ({ id: r.id, callId: r.call_id, kind: r.kind, text: r.text, createdAt: r.created_at });

/** Returns false if the call is unknown. */
export function addLiveNote(callId: string, note: LiveNoteInput): boolean {
  const d = db();
  const call = d.prepare('SELECT elder_id FROM calls WHERE id = ?').get(callId) as { elder_id: string } | undefined;
  if (!call) return false;
  d.prepare('INSERT INTO live_notes (id, call_id, elder_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newId(), callId, call.elder_id, note.kind, note.text, nowIso());
  return true;
}

/** Facts Hal asked Remi to remember, newest first; fed into the next call's context. */
export function rememberedFacts(elderId: string, limit = 10): string[] {
  try {
    return (db().prepare(`SELECT text FROM live_notes WHERE elder_id = ? AND kind = 'fact' ORDER BY created_at DESC LIMIT ?`)
      .all(elderId, limit) as { text: string }[]).map((r) => r.text);
  } catch {
    return [];
  }
}

export function buildLiveView(elderId: string): LiveView | null {
  const d = db();
  const elder = d.prepare('SELECT preferred_name FROM elders WHERE id = ?').get(elderId) as { preferred_name: string } | undefined;
  if (!elder) return null;
  const consent = consentView(getConsentRow(elderId));
  const sharing = consent.elderConfirmed && consent.effective.summaries;
  const row = d.prepare(`SELECT id, started_at, ended_at, status, duration_s FROM calls
    WHERE elder_id = ? AND is_simulated = 0 ORDER BY started_at DESC LIMIT 1`).get(elderId) as
    { id: string; started_at: string; ended_at: string | null; status: string; duration_s: number | null } | undefined;
  const call = row ? { id: row.id, startedAt: row.started_at, endedAt: row.ended_at, status: row.status, durationS: row.duration_s } : null;
  const thisCall = sharing && row
    ? (d.prepare('SELECT id, call_id, kind, text, created_at FROM live_notes WHERE call_id = ? ORDER BY created_at DESC').all(row.id) as Row[]).map(toNote)
    : [];
  const facts = sharing
    ? (d.prepare(`SELECT id, call_id, kind, text, created_at FROM live_notes WHERE elder_id = ? AND kind = 'fact' ORDER BY created_at DESC LIMIT 30`).all(elderId) as Row[]).map(toNote)
    : [];
  return { elderName: elder.preferred_name, sharing, call, thisCall, facts, now: nowIso() };
}
