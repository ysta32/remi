// Agent call lifecycle: create, events (with side effects), complete (contracts §4).
import { z } from 'zod';
import { getSqlite } from '@/db/client';
import { processCall } from '@/lib/analysis/pipeline';
import type { CallEvent, ConsentKey } from '../types';
import { CONSENT_KEYS, ELDER_COLUMN } from './consent';
import { newId, nowIso } from './ids';
import { enqueue } from './queue';

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 timestamp');
const atMs = z.number().int().min(0);

export const callCreateSchema = z.object({
  elderId: z.string().min(1),
  startedAt: isoDate,
  language: z.enum(['en', 'zh']),
  bridgeIdentity: z.string().max(200).nullish(),
  themeId: z.string().max(200).nullish(),
});

export const callEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('photo_shown'), atMs, payload: z.object({ photoId: z.string().min(1) }) }),
  z.object({ type: z.literal('question_asked'), atMs, payload: z.object({ questionId: z.string().min(1) }) }),
  z.object({
    type: z.literal('consent'),
    atMs,
    payload: z.object({
      summaries: z.boolean().optional(),
      funFacts: z.boolean().optional(),
      speechTrends: z.boolean().optional(),
      mood: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('safety'),
    atMs,
    payload: z.object({ category: z.enum(['self_harm', 'medical_emergency', 'other']), note: z.string().max(2000) }),
  }),
]);

const wordSchema = z.object({ w: z.string(), startMs: z.number(), endMs: z.number() });
export const utteranceSchema = z.object({
  speaker: z.enum(['caller', 'agent']),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  words: z.array(wordSchema).optional(),
});

export const callCompleteSchema = z.object({
  endedAt: isoDate,
  endReason: z.string().max(200).nullish(),
  utterances: z.array(utteranceSchema),
  audioPath: z.string().max(1000).nullish(),
});

export type CallCreate = z.infer<typeof callCreateSchema>;
export type CallComplete = z.infer<typeof callCompleteSchema>;

/** Returns the new call id, or null if the elder is unknown. */
export function createCall(body: CallCreate): string | null {
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM elders WHERE id = ?').get(body.elderId)) return null;
  const id = newId();
  db.prepare(
    `INSERT INTO calls (id, elder_id, started_at, language, status, bridge_identity, theme_id, created_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
  ).run(id, body.elderId, body.startedAt, body.language, body.bridgeIdentity ?? null, body.themeId ?? null, nowIso());
  return id;
}

export function getCallElder(callId: string): { id: string; elder_id: string; started_at: string } | undefined {
  return getSqlite().prepare('SELECT id, elder_id, started_at FROM calls WHERE id = ?').get(callId) as
    | { id: string; elder_id: string; started_at: string }
    | undefined;
}

/** Applies one CallEvent and logs it to call_events. Returns false if the call is unknown. */
export function applyCallEvent(callId: string, ev: CallEvent): boolean {
  const db = getSqlite();
  const call = getCallElder(callId);
  if (!call) return false;
  const now = nowIso();
  db.transaction(() => {
    switch (ev.type) {
      case 'photo_shown':
        db.prepare('UPDATE photos SET last_shown_at = ? WHERE id = ? AND elder_id = ?').run(
          now,
          ev.payload.photoId,
          call.elder_id,
        );
        break;
      case 'question_asked':
        db.prepare(`UPDATE family_questions SET status = 'asked', asked_call_id = ? WHERE id = ? AND elder_id = ?`).run(
          callId,
          ev.payload.questionId,
          call.elder_id,
        );
        break;
      case 'consent': {
        const keys = CONSENT_KEYS.filter((k) => typeof ev.payload[k] === 'boolean');
        const sets = keys.map((k) => `${ELDER_COLUMN[k]} = @${k}`);
        const params: Record<string, unknown> = { elderId: call.elder_id, callId, now };
        for (const k of keys) params[k] = ev.payload[k as ConsentKey] ? 1 : 0;
        db.prepare(
          `INSERT INTO consents (elder_id, updated_at) VALUES (@elderId, @now) ON CONFLICT(elder_id) DO NOTHING`,
        ).run(params);
        db.prepare(
          `UPDATE consents SET ${[...sets, 'elder_confirmed_call_id = @callId', 'updated_at = @now'].join(', ')}
           WHERE elder_id = @elderId`,
        ).run(params);
        break;
      }
      case 'safety':
        db.prepare('INSERT INTO safety_events (id, call_id, category, note, created_at) VALUES (?, ?, ?, ?, ?)').run(
          newId(),
          callId,
          ev.payload.category,
          ev.payload.note,
          now,
        );
        console.warn(`[SAFETY] call=${callId} category=${ev.payload.category}`);
        break;
    }
    db.prepare('INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, ?, ?, ?)').run(
      newId(),
      callId,
      ev.type,
      JSON.stringify(ev.payload),
      ev.atMs,
    );
  })();
  return true;
}

/** Marks a call processing and queues the pipeline. */
export function startProcessing(callId: string): void {
  getSqlite()
    .prepare(`UPDATE calls SET status = 'processing', failed_step = NULL, error = NULL WHERE id = ?`)
    .run(callId);
  void enqueue(() => processCall(callId));
}

/** Stores the call end and kicks off the pipeline. Returns false if the call is unknown. */
export function completeCall(callId: string, body: CallComplete): boolean {
  const call = getCallElder(callId);
  if (!call) return false;
  const durationMs = Date.parse(body.endedAt) - Date.parse(call.started_at);
  const durationS = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs / 1000)) : null;
  getSqlite()
    .prepare(
      `UPDATE calls SET utterances_json = ?, ended_at = ?, end_reason = ?, audio_path = ?, duration_s = ? WHERE id = ?`,
    )
    .run(JSON.stringify(body.utterances), body.endedAt, body.endReason ?? null, body.audioPath ?? null, durationS, callId);
  startProcessing(callId);
  return true;
}
