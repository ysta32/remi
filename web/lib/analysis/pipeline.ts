// Post-call pipeline (SPEC §9, contracts §7): stt → acoustic → extract → markers → repetition → done → recompute.
// processCall never throws: failures land on the calls row (status/failed_step/error) and in timings.
// Every step is idempotent so /complete re-sends and /api/dev/calls/:id/process can re-run it.
import fs from 'node:fs/promises';
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { getDb, getSqlite } from '@/db/client';
import { callEvents, calls, elders, familyQuestions, funFacts, topics } from '@/db/schema';
import { APP_NAME, config } from '@/lib/config';
import { computeMarkers } from '@/lib/markers';
import { pitchMarkersAsync, pitchNotAvailable } from '@/lib/markers/pitch';
import { parseWav } from '@/lib/markers/wav';
import { newId, nowIso } from '@/lib/server/ids';
import { analyzeLiveRepeats } from '@/lib/server/live-repeats';
import type { Lang, MarkerResult, Utterance, Word } from '@/lib/types';
import { PAUSE_MAX_MS, PITCH_MAX_SECONDS, REPEAT_COSINE, REPEAT_WINDOW_DAYS } from './config';
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
  let audioPath: string | null = null;
  try {
    const call = db.select().from(calls).where(eq(calls.id, callId)).get();
    if (!call) return;
    audioPath = call.audioPath;
    const elder = db.select().from(elders).where(eq(elders.id, call.elderId)).get();
    if (!elder) throw new StepError('pipeline', new Error('elder not found'));
    const lang = call.language as Lang;
    let utterances: Utterance[] = call.utterancesJson ? JSON.parse(call.utterancesJson) : [];

    // 1. STT (soft): word timestamps for pause markers.
    // 1b. Acoustic (soft): pitch markers, limited to the caller's speech.
    // The WAV is read into memory and deleted right after STT, BEFORE the words are stored: a
    // retried /complete then always finds the WAV gone and keeps the stored words (see
    // completeCall). The outer finally deletes it too if anything here throws.
    if (audioPath) {
      const wav = audioPath;
      const words = await step(callId, 'stt', () => transcribeWords(wav, lang), true);
      const bytes = await step(callId, 'read_audio', () => fs.readFile(wav), true);
      await deleteAudio(callId, wav);
      audioPath = null;
      if (words && words.length) {
        utterances = attachWords(utterances, words);
        db.update(calls).set({ utterancesJson: JSON.stringify(utterances) }).where(eq(calls.id, callId)).run();
      }
      if (bytes) {
        const final = utterances;
        await step(callId, 'acoustic', async () => upsertMarkers(callId, await voiceMarkers(bytes, final, lang), true), true);
      }
    }
    // No audio this run, or the acoustic step failed (e.g. an unreadable WAV): mark the voice
    // markers not available, but never overwrite real values from an earlier run.
    await step(callId, 'voice_na', () => upsertMarkers(callId, pitchNotAvailable(), false), true);

    // 2. Extraction (soft): on failure keep any earlier extraction, else a neutral fallback summary.
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
    const minutes = Math.max(1, Math.round((call.durationS ?? 0) / 60));
    const relinkCallIds = await step(callId, 'extract_write', () =>
      writeExtraction(callId, elder.id, call.isSimulated, extraction, {
        hadSafetyEvent,
        hadSummary: call.summary !== null,
        askedQuestionIds: new Set(askedQuestions.map((q) => q.id)),
        fallbackSummary: `${elder.preferredName} and ${APP_NAME} chatted for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
      }), true);

    // 3. Markers (hard).
    await step(callId, 'markers', () => upsertMarkers(callId, computeMarkers(utterances, lang), true));

    // 4. Repetition (soft): link this call's caller-initiated stories to earlier tellings, then
    //    re-link later calls whose links pointed at this call's (now replaced) topics.
    await step(callId, 'repetition', async () => {
      if (call.isSimulated !== 1) {
        await analyzeLiveRepeats(getSqlite(), callId, { apiKey: process.env.OPENAI_API_KEY });
        return;
      }
      await linkRepeats(callId, elder.id, call.startedAt);
      for (const other of relinkCallIds ?? []) {
        const o = db.select({ startedAt: calls.startedAt }).from(calls).where(eq(calls.id, other)).get();
        if (o) await linkRepeats(other, elder.id, o.startedAt);
      }
    }, true);

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
  } finally {
    // Raw audio never outlives processing, whatever happened above (SPEC §12).
    if (audioPath) await deleteAudio(callId, audioPath);
  }
}

/** Pitch markers (markers.md §4b) for one call's WAV. Adequacy comes from the transcript markers. */
async function voiceMarkers(wavBytes: Uint8Array, utterances: Utterance[], lang: Lang): Promise<MarkerResult[]> {
  const parsed = parseWav(wavBytes);
  // Bound the work (and memory) for very long recordings.
  const maxSamples = Math.floor(PITCH_MAX_SECONDS * parsed.sampleRate);
  const samples = parsed.samples.length > maxSamples ? parsed.samples.subarray(0, maxSamples) : parsed.samples;
  const sampleRate = parsed.sampleRate;
  const caller = utterances.filter((u) => u.speaker === 'caller');
  // Analyse only the caller's speech: STT word spans when present, else the live caller turns
  // (approximate times, but they keep agent turns, echo and room noise out). With neither, the
  // whole file is analysed and the result is capped at 'low' so it never enters a baseline.
  const wordSpans = caller.flatMap((u) => (u.words ?? []).map((w) => ({ startMs: w.startMs, endMs: w.endMs })));
  const turnSpans = caller.map((u) => ({ startMs: u.startMs, endMs: u.endMs })).filter((s) => s.endMs > s.startMs);
  const spans = wordSpans.length ? wordSpans : turnSpans.length ? turnSpans : undefined;
  const adequate = computeMarkers(utterances, lang).some((m) => m.confidence === 'high');
  const results = await pitchMarkersAsync(samples, sampleRate, spans, adequate);
  return spans ? results : results.map((r) => (r.confidence === 'high' ? { ...r, confidence: 'low' as const } : r));
}

/** Upsert marker rows (z reset to NULL; recomputeElder fills it). `overwrite=false` keeps existing rows. */
function upsertMarkers(callId: string, results: MarkerResult[], overwrite: boolean): void {
  const sqlite = getSqlite();
  const stmt = sqlite.prepare(
    `INSERT INTO call_markers (call_id, marker, value, unit, z, confidence) VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT(call_id, marker) DO ${overwrite ? 'UPDATE SET value=excluded.value, unit=excluded.unit, z=NULL, confidence=excluded.confidence' : 'NOTHING'}`,
  );
  sqlite.transaction(() => {
    for (const r of results) stmt.run(callId, r.marker, r.value, r.unit, r.confidence);
  })();
}

async function deleteAudio(callId: string, wav: string): Promise<void> {
  try {
    await fs.rm(wav, { force: true });
  } catch (err) {
    console.error(`[pipeline] call=${callId} could not delete audio: ${errMsg(err)}`);
  }
  try {
    // Only clear the path we just deleted: a retry may have stored a different file meanwhile.
    getDb()
      .update(calls)
      .set({ audioPath: null })
      .where(and(eq(calls.id, callId), eq(calls.audioPath, wav)))
      .run();
  } catch {
    /* best effort */
  }
}

const overlapsAgent = (agent: Utterance[], ms: number) => agent.some((a) => ms >= a.startMs && ms <= a.endMs);

/**
 * Attach post-call STT words to the live caller utterances by time. Live text is kept for display.
 * Words spoken during an agent turn (backchannels like "mm-hmm") are dropped so they can't stretch
 * a caller utterance's speaking span; other words go to the caller utterance they fall in, else
 * the nearest one. With no live caller text, the stream is split into utterances at agent turns
 * and at gaps longer than PAUSE_MAX_MS (markers.md §4 speaking time is per utterance).
 */
export function attachWords(utterances: Utterance[], words: Word[]): Utterance[] {
  const agent = utterances.filter((u) => u.speaker === 'agent');
  const kept = [...words]
    .sort((a, b) => a.startMs - b.startMs)
    .filter((w) => !overlapsAgent(agent, (w.startMs + w.endMs) / 2));
  if (!kept.length) return utterances;

  const callerIdx = utterances.flatMap((u, i) => (u.speaker === 'caller' ? [i] : []));
  if (!callerIdx.length) {
    const groups: Word[][] = [];
    for (const w of kept) {
      const cur = groups[groups.length - 1];
      const prev = cur?.[cur.length - 1];
      const split =
        !prev || w.startMs - prev.endMs > PAUSE_MAX_MS || agent.some((a) => a.startMs >= prev.endMs && a.startMs <= w.startMs);
      if (split) groups.push([w]);
      else cur.push(w);
    }
    const sep = /\p{Script=Han}/u.test(kept[0].w) ? '' : ' ';
    const added: Utterance[] = groups.map((g) => ({
      speaker: 'caller',
      text: g.map((w) => w.w).join(sep),
      startMs: g[0].startMs,
      endMs: g[g.length - 1].endMs,
      words: g,
    }));
    return [...utterances, ...added].sort((a, b) => a.startMs - b.startMs);
  }

  const buckets = new Map<number, Word[]>(callerIdx.map((i) => [i, []]));
  for (const w of kept) {
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
    return ws && ws.length ? { ...u, words: ws } : u;
  });
}

/**
 * Writes the extraction for one call. Returns ids of OTHER calls whose repeat links pointed at
 * this call's previous topics (they must be re-linked after the topics are replaced).
 */
function writeExtraction(
  callId: string,
  elderId: string,
  isSimulated: number,
  ex: Extraction | null,
  opts: { hadSafetyEvent: boolean; hadSummary: boolean; askedQuestionIds: Set<string>; fallbackSummary: string },
): string[] {
  const db = getDb();
  const sqlite = getSqlite();
  const now = nowIso();
  let relink: string[] = [];
  sqlite.transaction(() => {
    if (!ex) {
      // Extraction failed: keep whatever an earlier run wrote. Only a call with no summary yet
      // gets the neutral fallback (or the safety line if a safety event was logged).
      if (!opts.hadSummary) {
        const summary = opts.hadSafetyEvent ? SAFETY_SUMMARY_LINE : opts.fallbackSummary;
        db.update(calls).set({ summary }).where(eq(calls.id, callId)).run();
      }
      return;
    }

    // Idempotent re-run: this call's extracted rows are rebuilt. Detach links from other calls'
    // topics to the rows being replaced, and remember those calls for re-linking.
    relink = (
      sqlite
        .prepare(
          `SELECT DISTINCT t.call_id FROM topics t JOIN topics old ON old.id = t.repeat_of_topic_id
           WHERE old.call_id = ? AND t.call_id != ?`,
        )
        .all(callId, callId) as { call_id: string }[]
    ).map((r) => r.call_id);
    sqlite
      .prepare('UPDATE topics SET repeat_of_topic_id = NULL WHERE repeat_of_topic_id IN (SELECT id FROM topics WHERE call_id = ?)')
      .run(callId);
    db.delete(funFacts).where(eq(funFacts.callId, callId)).run();
    db.delete(topics).where(eq(topics.callId, callId)).run();

    // safety-and-copy §5: after a safety moment the summary is only the safety line, and its
    // details stay out of fun facts, answers, topics and mood evidence.
    const safety = opts.hadSafetyEvent || ex.safetyMentioned;
    if (ex.safetyMentioned && !opts.hadSafetyEvent) {
      console.warn(`[SAFETY] call=${callId} extraction flagged a safety moment with no safety event logged`);
    }
    db.update(calls)
      .set({
        summary: safety ? SAFETY_SUMMARY_LINE : ex.summary,
        moodLabel: ex.mood.label,
        moodScore: ex.mood.score,
        moodEvidenceJson: JSON.stringify(safety ? [] : ex.mood.evidence),
      })
      .where(eq(calls.id, callId))
      .run();
    if (safety) return;

    const validQ = (id: string | null) => (id && opts.askedQuestionIds.has(id) ? id : null);
    const markAnswered = (questionId: string) =>
      db.update(familyQuestions).set({ status: 'answered' }).where(eq(familyQuestions.id, questionId)).run();
    const factQuestionIds = new Set<string>();
    for (const f of ex.funFacts) {
      const questionId = validQ(f.questionId);
      if (questionId) {
        factQuestionIds.add(questionId);
        markAnswered(questionId);
      }
      db.insert(funFacts)
        .values({ id: newId(), elderId, callId, questionId, text: f.text, quote: f.quote, isSimulated, createdAt: now })
        .run();
    }
    // Family-question answers live on a fun fact linked by question_id (no answer column).
    for (const a of ex.familyQuestionAnswers) {
      const questionId = validQ(a.questionId);
      if (!questionId) continue;
      markAnswered(questionId);
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
  return relink;
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
    .where(and(eq(calls.elderId, elderId), eq(calls.isSimulated, 1), ne(calls.id, callId), gte(calls.startedAt, windowStart), lt(calls.startedAt, startedAt)))
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
      const mineVecs = await embed(mine.map((t) => t.summary));
      const dim = mineVecs[0]?.length ?? 0;
      const vecById = new Map<string, number[]>();
      mine.forEach((t, i) => vecById.set(t.id, mineVecs[i]));
      // Embed candidates lazily (seeded rows have none) or again if stored with another model's dimension.
      const stale: typeof candidates = [];
      for (const c of candidates) {
        const v = c.embeddingJson ? (JSON.parse(c.embeddingJson) as number[]) : null;
        if (v && v.length === dim) vecById.set(c.id, v);
        else stale.push(c);
      }
      if (stale.length) {
        const vs = await embed(stale.map((c) => c.summary));
        stale.forEach((c, i) => vecById.set(c.id, vs[i]));
      }
      getSqlite().transaction(() => {
        for (const t of [...mine, ...stale]) {
          db.update(topics).set({ embeddingJson: JSON.stringify(vecById.get(t.id)) }).where(eq(topics.id, t.id)).run();
        }
      })();
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
