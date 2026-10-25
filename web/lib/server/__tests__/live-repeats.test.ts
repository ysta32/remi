import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeDb, getSqlite } from '@/db/client';
import { freshDb, insertCall, insertElder } from '@/test/helpers';
import { completeCall } from '../calls';
import { drainQueue } from '../queue';
import { buildTimeline } from '../timeline';
import { recomputeElder } from '@/lib/analysis/recompute';
import { processCall } from '@/lib/analysis/pipeline';
import { setLlmTransportForTests } from '@/lib/analysis/llm';
import { SAFETY_SUMMARY_LINE } from '@/lib/analysis/prompts';
import { analyzeLiveRepeats, liveResults } from '../live-repeats';

let elder: string;
beforeEach(() => {
  freshDb(); elder = insertElder();
  getSqlite().exec('UPDATE consents SET fam_speech_trends=1,elder_speech_trends=1,elder_summaries=1');
  vi.stubGlobal('fetch', () => { throw new Error('No real network in tests'); });
});
afterEach(() => { closeDb(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); setLlmTransportForTests(null); });
function call(day: number, extra: Record<string, unknown> = {}) {
  return insertCall(elder, { started_at: new Date(Date.UTC(2026, 9, day)).toISOString(), ended_at: new Date(Date.UTC(2026, 9, day, 0, 5)).toISOString(),
    utterances_json: JSON.stringify([
      { speaker: 'caller', text: 'I fell in the lake on my twenty fifth birthday.', startMs: 0, endMs: 2000 },
      { speaker: 'agent', text: 'Tell me about your first car.', startMs: 2100, endMs: 3000 },
      { speaker: 'caller', text: 'My first car was a blue Chevy.', startMs: 3100, endMs: 4000 },
      { speaker: 'caller', text: 'What day is it today?', startMs: 4100, endMs: 5000 },
    ]), ...extra });
}
// Only the provider boundary is mocked; the actual extraction/embedding/detector/storage run.
function transport(opts: { empty?: boolean; failAt?: number; before?: (n: number) => void; storyVector?: (request: number) => number[] } = {}) {
  let n = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    n++; opts.before?.(n);
    if (n === opts.failAt) return new Response('', { status: 400 });
    const body = JSON.parse(init!.body as string);
    if (String(url).endsWith('/responses')) {
      const { utterances } = JSON.parse(body.input[0].content);
      const items = opts.empty ? [] : [0, 2, 3].map((turn, i) => ({ kind: i === 2 ? 'question' : 'story', summary: `Evidence ${i}`, quote: utterances[turn].text, sourceTurnIndex: turn, elicitation: ['unprompted','prompted','uncertain'][i], promptTurnIndex: i === 1 ? 1 : null }));
      return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }] });
    }
    return Response.json({ model: body.model, data: body.input.map((s: string, index: number) => ({ index, embedding: Array.from({ length: body.dimensions }, (_, j) => s === 'Evidence 0' && opts.storyVector ? opts.storyVector(n)[j] ?? 0 : j === Number(s.slice(-1)) ? 1 : 0) })) });
  });
  return { fetchImpl, apiKey: 'offline-test-key', maxRetries: 0 };
}
const stored = () => getSqlite().prepare('SELECT * FROM live_detector_results ORDER BY call_id').all();
const results = () => liveResults(getSqlite(), elder).results;
const view = () => buildTimeline(elder)!.repeatAnalysis;

it('automatically extracts real calls, links stories/questions and preserves frozen settings', async () => {
  const first = call(1), last = call(2, { status: 'processing' });
  setLlmTransportForTests(async () => JSON.stringify({ summary: 'A friendly chat.', topics: [], funFacts: [], mood: { label: 'neutral', score: 0, evidence: [] }, familyQuestionAnswers: [], safetyMentioned: false }));
  const t = transport(); vi.stubGlobal('fetch', t.fetchImpl); vi.stubEnv('OPENAI_API_KEY', 'offline-test-key');
  const completed = getSqlite().prepare('SELECT utterances_json,ended_at FROM calls WHERE id=?').get(last) as {utterances_json:string;ended_at:string};
  expect(completeCall(last, { endedAt: completed.ended_at, utterances: JSON.parse(completed.utterances_json), endReason: 'hangup' })).toBe(true);
  await drainQueue();
  expect(stored()).toHaveLength(2);
  expect(view()).toMatchObject({ status: 'complete', analyzedCallCount: 2, counts: { total: 3, stories: 2, questions: 1 }, provenance: { threshold: 0.85, extractionModel: 'gpt-6.1-sol', embeddingModel: 'text-embedding-3-small' } });
  expect(view()!.matches.every(m => m.callId === last && m.priorCallId === first && !m.isSimulated)).toBe(true);
  const marker = getSqlite().prepare("SELECT value,confidence FROM call_markers WHERE call_id=? AND marker='repeat_stories'").get(last);
  expect(marker).toEqual({ value: 1, confidence: 'low' });
  expect(buildTimeline(elder)!.calls.find(c => c.id === last)?.status).toBe('done');
});
it('reuses unchanged prefixes when appending calls and on retries', async () => {
  const first = call(1); await analyzeLiveRepeats(getSqlite(), first, transport());
  const old = stored(); const second = call(2), t = transport();
  await analyzeLiveRepeats(getSqlite(), second, t);
  expect(t.fetchImpl).toHaveBeenCalledTimes(2);
  expect(stored()).toEqual(expect.arrayContaining(old));
  await analyzeLiveRepeats(getSqlite(), second, t);
  expect(t.fetchImpl).toHaveBeenCalledTimes(2);
});
it('excludes simulated, other elders, in-progress and safety calls from history', async () => {
  call(1, { is_simulated: 1 }); call(2, { status: 'in_progress' }); call(3, { summary: SAFETY_SUMMARY_LINE }); call(4, { elder_id: insertElder() });
  const unsafe = call(5); getSqlite().prepare("INSERT INTO call_events VALUES ('safety',?,'safety','{}',0)").run(unsafe);
  const target = call(6); await analyzeLiveRepeats(getSqlite(), target, transport());
  expect(results()).toHaveLength(1); expect(view()!.counts.total).toBe(0);
});
it('all-history evidence survives beyond seven days while the marker stays within seven days', async () => {
  call(1); const last = call(15); await analyzeLiveRepeats(getSqlite(), last, transport());
  getSqlite().prepare("INSERT INTO call_markers VALUES (?,'speech_rate',100,'wpm',NULL,'high')").run(last);
  await recomputeElder(elder);
  expect(view()!.counts.total).toBe(3);
  expect(getSqlite().prepare("SELECT value FROM call_markers WHERE call_id=? AND marker='repeat_stories'").get(last)).toEqual({ value: 0 });
  expect(buildTimeline(elder)!.driftIndex!.repeatCoverage).toMatchObject({ knownCallCount: 1, unpromptedStoryCount: 1 });
});
it.each(['transcript','delete','date','safety','corrupt'])('invalidates dependent evidence after %s changes', async change => {
  const first = call(1), last = call(3); await analyzeLiveRepeats(getSqlite(), last, transport());
  const db = getSqlite();
  if (change === 'transcript') db.prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(first);
  if (change === 'delete') db.prepare('DELETE FROM calls WHERE id=?').run(first);
  if (change === 'date') db.prepare("UPDATE calls SET started_at='2026-10-02T00:00:00.000Z' WHERE id=?").run(first);
  if (change === 'safety') db.prepare('UPDATE calls SET summary=? WHERE id=?').run(SAFETY_SUMMARY_LINE, first);
  if (change === 'corrupt') db.prepare("UPDATE live_detector_results SET result_json='{}' WHERE call_id=?").run(first);
  expect(results()).toEqual([]); expect(view()).toBeUndefined();
});
it('redacts evidence on summary revocation and hides all repeats on trends revocation', async () => {
  call(1); const last = call(2); await analyzeLiveRepeats(getSqlite(), last, transport());
  getSqlite().exec('UPDATE consents SET elder_summaries=0');
  expect(view()!.matches.every(m => m.summary === null && m.quote === null && m.priorQuote === null)).toBe(true);
  expect(JSON.stringify(view())).not.toMatch(/embeddingDimensions|embedding\":|utterances/);
  getSqlite().exec('UPDATE consents SET elder_speech_trends=0'); expect(view()).toBeUndefined();
});
it.each([1, 4])('rechecks consent after request %i, with no partial writes', async at => {
  call(1); const last = call(2);
  const t = transport({ before: n => { if (n === at) getSqlite().exec('UPDATE consents SET elder_summaries=0'); } });
  await expect(analyzeLiveRepeats(getSqlite(), last, t)).rejects.toThrow('LIVE_REPEATS_');
  expect(t.fetchImpl).toHaveBeenCalledTimes(at); expect(stored()).toEqual([]);
});
it('does not call providers without consent and distinguishes empty success from failure', async () => {
  const id = call(1), t = transport(); getSqlite().exec('UPDATE consents SET elder_summaries=0');
  await analyzeLiveRepeats(getSqlite(), id, t); expect(t.fetchImpl).not.toHaveBeenCalled();
  getSqlite().exec('UPDATE consents SET elder_summaries=1');
  await expect(analyzeLiveRepeats(getSqlite(), id, transport({ failAt: 1 }))).rejects.toThrow('LIVE_REPEATS_');
  expect(stored()).toEqual([]); expect(view()).toBeUndefined();
  await analyzeLiveRepeats(getSqlite(), id, transport({ empty: true })); expect(view()).toMatchObject({ counts: { total: 0 }, status: 'complete' });
});
it('accepts no-text success without a model call and marks missing results unavailable', async () => {
  const id = call(1, { utterances_json: '[]' }), t = transport();
  await analyzeLiveRepeats(getSqlite(), id, t); expect(t.fetchImpl).not.toHaveBeenCalled(); expect(results()).toHaveLength(1);
  const pending = call(2); getSqlite().prepare("INSERT INTO call_markers VALUES (?,'speech_rate',100,'wpm',NULL,'high')").run(pending);
  await recomputeElder(elder);
  expect(getSqlite().prepare("SELECT value,confidence FROM call_markers WHERE call_id=? AND marker='repeat_stories'").get(pending)).toEqual({ value: null, confidence: 'na' });
  expect(view()).toMatchObject({ status: 'partial', analyzedCallCount: 1, totalCallCount: 2 });
});
it('rebuilds dependent calls after transcript corrections and backdated inserts', async () => {
  const first = call(1), last = call(3); await analyzeLiveRepeats(getSqlite(), last, transport());
  const middle = call(2), t = transport(); await analyzeLiveRepeats(getSqlite(), middle, t);
  expect(t.fetchImpl).toHaveBeenCalledTimes(4); expect(view()).toMatchObject({ analyzedCallCount: 3, counts: { total: 6 } });
  getSqlite().prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(first);
  await analyzeLiveRepeats(getSqlite(), first, transport());
  expect(view()).toMatchObject({ analyzedCallCount: 3, counts: { total: 3 } });
});
it.each(['transcript','safety','delete'])('aborts an in-flight batch if %s changes', async change => {
  const id = call(1), t = transport({ before: n => {
    if (n !== 1) return;
    if (change === 'transcript') getSqlite().prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(id);
    if (change === 'safety') getSqlite().prepare('UPDATE calls SET summary=? WHERE id=?').run(SAFETY_SUMMARY_LINE, id);
    if (change === 'delete') getSqlite().prepare('DELETE FROM calls WHERE id=?').run(id);
  } });
  await expect(analyzeLiveRepeats(getSqlite(), id, t)).rejects.toThrow('LIVE_REPEATS_');
  expect(t.fetchImpl).toHaveBeenCalledTimes(1); expect(stored()).toEqual([]);
});
it('keeps the pipeline done and repeat markers unavailable after a provider failure', async () => {
  const id = call(1, { status: 'processing' });
  setLlmTransportForTests(async () => JSON.stringify({ summary: 'A friendly chat.', topics: [], funFacts: [], mood: { label: 'neutral', score: 0, evidence: [] }, familyQuestionAnswers: [], safetyMentioned: false }));
  vi.stubGlobal('fetch', async () => new Response('', { status: 400 })); vi.stubEnv('OPENAI_API_KEY','offline-test-key');
  await processCall(id);
  expect(getSqlite().prepare('SELECT status FROM calls WHERE id=?').get(id)).toEqual({ status: 'done' });
  expect(view()).toBeUndefined();
  expect(getSqlite().prepare("SELECT value,confidence FROM call_markers WHERE call_id=? AND marker='repeat_stories'").get(id)).toEqual({ value: null, confidence: 'na' });
});
it('hides stale stored real-call marker values on reads before recomputation', async () => {
  const first = call(1), last = call(2); await analyzeLiveRepeats(getSqlite(), last, transport());
  getSqlite().prepare("INSERT INTO call_markers VALUES (?,'speech_rate',100,'wpm',NULL,'high')").run(last);
  await recomputeElder(elder);
  getSqlite().prepare("UPDATE calls SET utterances_json='[]' WHERE id=?").run(first);
  expect(buildTimeline(elder)!.markers.find(m => m.key === 'repeat_stories')!.points.find(p => p.callId === last)).toMatchObject({ value: null, confidence: 'na' });
});
it('does not expose old legacy topic matches as real-call repeat evidence', () => {
  const first = call(1), last = call(2);
  const insert = getSqlite().prepare("INSERT INTO topics (id,elder_id,call_id,kind,summary,initiated_by,repeat_of_topic_id,is_simulated,created_at) VALUES (?,?,?,'story','Legacy-only story','caller',?,0,'2026-10-02T00:00:00.000Z')");
  insert.run('old-first',elder,first,null); insert.run('old-last',elder,last,'old-first');
  expect(buildTimeline(elder)!.repeats).toEqual([]); expect(view()).toBeUndefined();
});

it('counts a qualifying recent story even when an older telling has a stronger match', async () => {
  const oldest = call(1); call(14); const last = call(15);
  const t = transport({ storyVector: n => n === 4 ? [0.95,0,0,Math.sqrt(1-0.95**2)] : [1] });
  await analyzeLiveRepeats(getSqlite(), last, t);
  expect(view()!.matches.find(m => m.callId === last && m.label === 'Unprompted repeat')!.priorCallId).toBe(oldest);
  getSqlite().prepare("INSERT INTO call_markers VALUES (?,'speech_rate',100,'wpm',NULL,'high')").run(last);
  await recomputeElder(elder);
  expect(getSqlite().prepare("SELECT value FROM call_markers WHERE call_id=? AND marker='repeat_stories'").get(last)).toEqual({ value: 1 });
  expect(buildTimeline(elder)!.markers.find(m => m.key === 'repeat_stories')!.points.find(p => p.callId === last)!.value).toBe(1);
});
it('never builds the real-call Drift Index baseline from simulated marker history', async () => {
  const db = getSqlite();
  for (let day = 1; day <= 10; day++) {
    const id = call(day, { is_simulated: 1 });
    db.prepare("INSERT INTO call_markers VALUES (?,'speech_rate',130,'wpm',NULL,'high')").run(id);
  }
  expect(buildTimeline(elder)!.driftIndex!.baselineProgress.ready).toBe(true);
  const real = call(15); db.prepare("INSERT INTO call_markers VALUES (?,'speech_rate',95,'wpm',NULL,'high')").run(real);
  await analyzeLiveRepeats(db, real, transport());
  const index = buildTimeline(elder)!.driftIndex!;
  expect(index.baselineProgress.ready).toBe(false);
  expect(index.eligibleCallCount).toBe(1); expect(index.provenance.isSimulated).toBe(false);
  expect(index.repeatCoverage).toEqual({ knownCallCount: 1, unknownCallCount: 0, unpromptedStoryCount: 0 });
});
