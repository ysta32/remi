// Post-call pipeline (SPEC §9, contracts §7): stt → extract → markers → repetition → recompute → done.
// processCall never throws: failures land on the calls row (status/failed_step/error) and in timings.
// Every step is idempotent so /complete re-sends and /api/dev/calls/:id/process can re-run it.
import fs from 'node:fs/promises';
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { getDb, getSqlite } from '@/db/client';
import { callEvents, calls, elders, familyQuestions, funFacts, topics } from '@/db/schema';
import { APP_NAME, config } from '@/lib/config';
import { computeMarkers } from '@/lib/markers';
import { newId, nowIso } from '@/lib/server/ids';
import type { Lang, Utterance, Word } from '@/lib/types';
import { REPEAT_COSINE, REPEAT_WINDOW_DAYS } from './config';
import { embed, EmbeddingsDisabledError } from './embeddings';
import { extractCall, matchStories, type Extraction } from './llm';
import { SAFETY_SUMMARY_LINE } from './prompts';
import { recomputeElder } from './recompute';
import { findRepeats } from './repetition';
import { transcribeWords } from './stt';
import { recordStep, startTimings } from './timings';

export { recomputeElder };

const DAY_MS = 86_400_000;
const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

class StepError extends Error {
  constructor(readonly step: string, cause: unknown) {
    super(errMsg(cause));
  }
}

/** Times one step. Hard steps rethrow as StepError; soft steps log and return null. */
async function step<T>(callId: string, name: string, fn: () => Promise<T> | T, soft = false): Promise<T | null> {
  const t0 = performance.now();
  try {
    const value = await fn();
    recordStep(callId, { step: name, ms: Math.round(performance.now() - t0), ok: true });
    return value;
  } catch (err) {
    recordStep(callId, { step: name, ms: Math.round(performance.now() - t0), ok: false, error: errMsg(err) });
    if (soft) {
      console.warn(`[pipeline] call=${callId} step=${name} failed (continuing): ${errMsg(err)}`);
      return null;
    }
    throw new StepError(name, err);
  }
}

export async function processCall(callId: string): Promise<void> {
  startTimings(callId);
  const db = getDb();
  try {
    const call = db.select().from(calls).where(eq(calls.id, callId)).get();
    if (!call) return;
    const elder = db.select().from(elders).where(eq(elders.id, call.elderId)).get();
    if (!elder) return;
    const lang = call.language as Lang;
    let utterances: Utterance[] = call.utterancesJson ? JSON.parse(call.utterancesJson) : [];

    // 1. STT (soft): word timestamps for pause markers. The WAV is always deleted.
    if (call.audioPath) {
      const audioPath = call.audioPath;
      const words = await step(callId, 'stt', async () => {
        try {
          return await transcribeWords(audioPath, lang);
        } finally {
          await fs.rm(audioPath, { force: true });
          db.update(calls).set({ audioPath: null }).where(eq(calls.id, callId)).run();
        }
      }, true);
      if (words && words.length) {
        utterances = attachWords(utterances, words);
        db.update(calls).set({ utterancesJson: JSON.stringify(utterances) }).where(eq(calls.id, callId)).run();
      }
    }

    // 2. Extraction (soft): on failure write a neutral fallback summary and keep going.
    const events = db.select().from(callEvents).where(eq(callEvents.callId, callId)).all();
    const askedIds = events
      .filter((e) => e.type === 'question_asked')
      .map((e) => (JSON.parse(e.payloadJson) as { questionId: string }).questionId);
    const askedQuestions = askedIds.length
      ? db.select().from(familyQuestions).where(inArray(familyQuestions.id, askedIds)).all()
      : [];
    const hadSafetyEvent = events.some((e) => e.type === 'safety');

    const extraction = await step(callId, 'extract', () =>
      extractCall(utterances, {
        preferredName: elder.preferredName,
        language: lang,
        askedQuestions: askedQuestions.map((q) => ({ id: q.id, text: q.text, askedBy: q.askedBy })),
        hadSafetyEvent,
      }), true);
    writeExtraction(callId, elder.id, call.isSimulated, extraction, {
      hadSafetyEvent,
      askedQuestionIds: new Set(askedQuestions.map((q) => q.id)),
      fallbackSummary: `${elder.preferredName} and ${APP_NAME} chatted for ${Math.max(1, Math.round((call.durationS ?? 0) / 60))} minutes.`,
    });

    // 3. Markers (hard).
    await step(callId, 'markers', () => {
      const results = computeMarkers(utterances, lang);
      const upsert = getSqlite().prepare(
        `INSERT INTO call_markers (call_id, marker, value, unit, z, confidence) VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT(call_id, marker) DO UPDATE SET value=excluded.value, unit=excluded.unit, z=NULL, confidence=excluded.confidence`,
      );
      getSqlite().transaction(() => {
        for (const r of results) upsert.run(callId, r.marker, r.value, r.unit, r.confidence);
      })();
    });

    // 4. Repetition (soft): link this call's caller-initiated stories to earlier tellings.
    await step(callId, 'repetition', () => linkRepeats(callId, elder.id, call.startedAt), true);

    // 5. Mark done first: recomputeElder only counts done calls. If it fails, the catch
    //    below flips the call to failed with failed_step='recompute'.
    db.update(calls).set({ status: 'done', failedStep: null, error: null }).where(eq(calls.id, callId)).run();
    await step(callId, 'recompute', () => recomputeElder(elder.id));
  } catch (err) {
    const failedStep = err instanceof StepError ? err.step : 'pipeline';
    console.error(`[pipeline] call=${callId} failed at ${failedStep}: ${errMsg(err)}`);
    try {
      db.update(calls).set({ status: 'failed', failedStep, error: errMsg(err) }).where(eq(calls.id, callId)).run();
    } catch {
      /* DB unavailable; nothing more we can do */
    }
  }
}

/**
 * Attach post-call STT words to the live caller utterances by time (word midpoint inside the
 * utterance, else the nearest caller utterance). Live text is kept for display.
 */
export function attachWords(utterances: Utterance[], words: Word[]): Utterance[] {
  const callerIdx = utterances.flatMap((u, i) => (u.speaker === 'caller' ? [i] : []));
  if (!callerIdx.length) {
    // No live caller text at all: keep the STT stream as one caller utterance.
    const text = words.map((w) => w.w).join(' ');
    return [...utterances, { speaker: 'caller', text, startMs: words[0].startMs, endMs: words[words.length - 1].endMs, words }];
  }
  const buckets = new Map<number, Word[]>(callerIdx.map((i) => [i, []]));
  for (const w of words) {
    const mid = (w.startMs + w.endMs) / 2;
    let best = callerIdx[0];
    let bestDist = Infinity;
    for (const i of callerIdx) {
      const u = utterances[i];
      const dist = mid < u.startMs ? u.startMs - mid : mid > u.endMs ? mid - u.endMs : 0;
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    buckets.get(best)!.push(w);
  }
  return utterances.map((u, i) => {
    const ws = buckets.get(i);
    return ws && ws.length ? { ...u, words: ws.sort((a, b) => a.startMs - b.startMs) } : u;
  });
}

function writeExtraction(
  callId: string,
  elderId: string,
  isSimulated: number,
  ex: Extraction | null,
  opts: { hadSafetyEvent: boolean; askedQuestionIds: Set<string>; fallbackSummary: string },
): void {
  const db = getDb();
  const now = nowIso();
  getSqlite().transaction(() => {
    // Idempotent re-run: this call's extracted rows are rebuilt from scratch.
    db.delete(funFacts).where(eq(funFacts.callId, callId)).run();
    db.delete(topics).where(eq(topics.callId, callId)).run();

    if (!ex) {
      db.update(calls).set({ summary: opts.fallbackSummary }).where(eq(calls.id, callId)).run();
      return;
    }
    const safety = opts.hadSafetyEvent || ex.safetyMentioned;
    db.update(calls)
      .set({
        summary: safety ? SAFETY_SUMMARY_LINE : ex.summary,
        moodLabel: ex.mood.label,
        moodScore: ex.mood.score,
        moodEvidenceJson: JSON.stringify(ex.mood.evidence),
      })
      .where(eq(calls.id, callId))
      .run();

    const validQ = (id: string | null) => (id && opts.askedQuestionIds.has(id) ? id : null);
    const factQuestionIds = new Set<string>();
    for (const f of ex.funFacts) {
      const questionId = validQ(f.questionId);
      if (questionId) factQuestionIds.add(questionId);
      db.insert(funFacts)
        .values({ id: newId(), elderId, callId, questionId, text: f.text, quote: f.quote, isSimulated, createdAt: now })
        .run();
    }
    // Family-question answers live on a fun fact linked by question_id (no answer column).
    for (const a of ex.familyQuestionAnswers) {
      const questionId = validQ(a.questionId);
      if (!questionId) continue;
      db.update(familyQuestions).set({ status: 'answered' }).where(eq(familyQuestions.id, questionId)).run();
      if (!factQuestionIds.has(questionId)) {
        db.insert(funFacts)
          .values({ id: newId(), elderId, callId, questionId, text: a.answer.slice(0, 200), quote: '', isSimulated, createdAt: now })
          .run();
        factQuestionIds.add(questionId);
      }
    }
    for (const t of ex.topics) {
      db.insert(topics)
        .values({ id: newId(), elderId, callId, kind: t.kind, summary: t.summary, initiatedBy: t.initiatedBy, isSimulated, createdAt: now })
        .run();
    }
  })();
}

async function linkRepeats(callId: string, elderId: string, startedAt: string): Promise<void> {
  const db = getDb();
  const isCallerStory = and(eq(topics.kind, 'story'), eq(topics.initiatedBy, 'caller'));
  const mine = db.select().from(topics).where(and(eq(topics.callId, callId), isCallerStory)).all();
  if (!mine.length) return;

  const windowStart = new Date(Date.parse(startedAt) - REPEAT_WINDOW_DAYS * DAY_MS).toISOString();
  const priorCallIds = db
    .select({ id: calls.id })
    .from(calls)
    .where(and(eq(calls.elderId, elderId), ne(calls.id, callId), gte(calls.startedAt, windowStart), lt(calls.startedAt, startedAt)))
    .all()
    .map((c) => c.id);
  const candidates = priorCallIds.length
    ? db.select().from(topics).where(and(inArray(topics.callId, priorCallIds), isCallerStory)).all()
    : [];

  let matches: Record<string, string | null>;
  if (!candidates.length) {
    matches = Object.fromEntries(mine.map((t) => [t.id, null]));
  } else if (config.embeddingsProvider === 'none') {
    matches = await matchStories(mine, candidates);
  } else {
    try {
      // Embed this call's stories and any candidate without a stored embedding (e.g. seeded rows).
      const missing = candidates.filter((c) => !c.embeddingJson);
      const vectors = await embed([...mine.map((t) => t.summary), ...missing.map((c) => c.summary)]);
      const vecById = new Map<string, number[]>();
      [...mine, ...missing].forEach((t, i) => vecById.set(t.id, vectors[i]));
      for (const t of [...mine, ...missing]) {
        db.update(topics).set({ embeddingJson: JSON.stringify(vecById.get(t.id)) }).where(eq(topics.id, t.id)).run();
      }
      for (const c of candidates) if (c.embeddingJson) vecById.set(c.id, JSON.parse(c.embeddingJson));
      matches = findRepeats(
        mine.map((t) => ({ id: t.id, embedding: vecById.get(t.id)! })),
        candidates.map((c) => ({ id: c.id, embedding: vecById.get(c.id)! })),
        REPEAT_COSINE,
      );
    } catch (err) {
      if (!(err instanceof EmbeddingsDisabledError)) throw err;
      matches = await matchStories(mine, candidates);
    }
  }

  getSqlite().transaction(() => {
    for (const t of mine) {
      db.update(topics).set({ repeatOfTopicId: matches[t.id] ?? null }).where(eq(topics.id, t.id)).run();
    }
  })();
}
