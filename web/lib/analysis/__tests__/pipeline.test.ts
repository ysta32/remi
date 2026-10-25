import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import { newId, nowIso } from '@/lib/server/ids';
import type { Utterance } from '@/lib/types';
import { freshDb, insertCall, insertElder } from '@/test/helpers';
import { setEmbeddingsTransportForTests } from '../embeddings';
import { setLlmTransportForTests, type Extraction } from '../llm';
import { withSafetyLine } from '../prompts';
import { attachWords, processCall } from '../pipeline';
import { setSttTransportForTests } from '../stt';
import { getTimings } from '../timings';
import { encodeWav16 } from '@/lib/markers/wav';
import { pitchMarkersAsync } from '@/lib/markers/pitch';

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), '..', 'fixtures', 'transcripts', 'hal-first-car.json'), 'utf8'),
) as { utterances: Utterance[] };

const row = <T>(sql: string, ...args: unknown[]) => getSqlite().prepare(sql).get(...args) as T;
const rows = <T>(sql: string, ...args: unknown[]) => getSqlite().prepare(sql).all(...args) as T[];

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    summary: 'Hal talked about his first car and laughed about the snow.',
    funFacts: [{ text: "Hal's first car was a 1957 Chevy Bel Air he bought for $300.", quote: 'Three hundred dollars, cash.', questionId: null }],
    topics: [{ kind: 'story', summary: 'The 1977 blizzard when the roundhouse roof caved in', initiatedBy: 'caller' }],
    mood: { label: 'positive', score: 0.6, evidence: ['he laughed'] },
    familyQuestionAnswers: [],
    safetyMentioned: false,
    ...overrides,
  };
}

function setupCall(opts: { audioPath?: string; startedAt?: string } = {}) {
  const elderId = insertElder();
  const questionId = newId();
  getSqlite()
    .prepare("INSERT INTO family_questions (id, elder_id, text, asked_by, status, created_at) VALUES (?, ?, 'What was your first car?', 'Sam', 'asked', ?)")
    .run(questionId, elderId, nowIso());
  const callId = insertCall(elderId, {
    status: 'processing',
    started_at: opts.startedAt ?? '2026-10-25T14:00:00.000Z',
    duration_s: 300,
    utterances_json: JSON.stringify(fixture.utterances),
  });
  if (opts.audioPath) getSqlite().prepare('UPDATE calls SET audio_path = ? WHERE id = ?').run(opts.audioPath, callId);
  getSqlite()
    .prepare("INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, 'question_asked', ?, 1000)")
    .run(newId(), callId, JSON.stringify({ questionId }));
  return { elderId, questionId, callId };
}

describe('processCall', () => {
  beforeEach(() => freshDb());
  afterEach(() => {
    setLlmTransportForTests(null);
    setEmbeddingsTransportForTests(null);
    setSttTransportForTests(null);
    delete process.env.STT_PROVIDER;
  });

  it('replays a fixture to done with summary, linked answer, markers and topics', async () => {
    const { callId, questionId } = setupCall();
    setLlmTransportForTests(async () =>
      JSON.stringify(extraction({ familyQuestionAnswers: [{ questionId, answer: 'A 1957 Chevy Bel Air, bought for $300.' }] })),
    );
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));

    await processCall(callId);

    const call = row<{ status: string; summary: string; mood_label: string }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.status).toBe('done');
    expect(call.summary).toContain('first car');
    expect(call.mood_label).toBe('positive');
    // The answer has no fun fact with question_id, so the pipeline adds one.
    const facts = rows<{ question_id: string | null }>('SELECT * FROM fun_facts WHERE call_id = ?', callId);
    expect(facts).toHaveLength(2);
    expect(facts.filter((f) => f.question_id === questionId)).toHaveLength(1);
    expect(row<{ status: string }>('SELECT status FROM family_questions WHERE id = ?', questionId).status).toBe('answered');
    expect(rows('SELECT * FROM call_markers WHERE call_id = ?', callId)).toHaveLength(10); // 7 speech + repeat_stories + 2 voice ('na' without audio)
    expect(row<{ confidence: string }>("SELECT confidence FROM call_markers WHERE call_id = ? AND marker = 'filler_rate'", callId).confidence).toBe('high');
  });

  it('is idempotent on re-run', async () => {
    const { callId } = setupCall();
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);
    await processCall(callId);
    expect(rows('SELECT * FROM fun_facts WHERE call_id = ?', callId)).toHaveLength(1);
    expect(rows('SELECT * FROM topics WHERE call_id = ?', callId)).toHaveLength(1);
  });

  it('falls back to a neutral summary when extraction fails, and still finishes', async () => {
    const { callId } = setupCall();
    setLlmTransportForTests(async () => 'not json');
    await processCall(callId);
    const call = row<{ status: string; summary: string }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.status).toBe('done');
    expect(call.summary).toBe('Hal and Remi chatted for 5 minutes.');
    expect(rows('SELECT * FROM call_markers WHERE call_id = ?', callId)).toHaveLength(10);
  });

  it('links a retold story to an earlier telling within 7 days', async () => {
    const { callId, elderId } = setupCall();
    const priorCall = insertCall(elderId, { started_at: '2026-10-22T14:00:00.000Z' });
    const priorTopic = newId();
    getSqlite()
      .prepare("INSERT INTO topics (id, elder_id, call_id, kind, summary, initiated_by, created_at) VALUES (?, ?, ?, 'story', 'Blizzard of 1977 at the roundhouse', 'caller', ?)")
      .run(priorTopic, elderId, priorCall, nowIso());
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));

    await processCall(callId);

    const mine = row<{ repeat_of_topic_id: string | null }>('SELECT repeat_of_topic_id FROM topics WHERE call_id = ?', callId);
    expect(mine.repeat_of_topic_id).toBe(priorTopic);
    // The seeded candidate got its embedding stored lazily.
    expect(row<{ embedding_json: string | null }>('SELECT embedding_json FROM topics WHERE id = ?', priorTopic).embedding_json).not.toBeNull();
    expect(row<{ value: number }>("SELECT value FROM call_markers WHERE call_id = ? AND marker = 'repeat_stories'", callId).value).toBe(1);
  });

  it('deletes the WAV and clears audio_path even when STT fails', async () => {
    const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-wav-')), 'call.wav');
    fs.writeFileSync(wav, 'RIFF');
    const { callId } = setupCall({ audioPath: wav });
    process.env.STT_PROVIDER = 'openai';
    setSttTransportForTests(async () => {
      throw new Error('stt down');
    });
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));

    await processCall(callId);

    expect(fs.existsSync(wav)).toBe(false);
    const call = row<{ status: string; audio_path: string | null }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.audio_path).toBeNull();
    expect(call.status).toBe('done');
  });

  it('marks the call failed with failed_step when a hard step fails', async () => {
    const { callId } = setupCall();
    getSqlite().prepare("UPDATE calls SET utterances_json = 'not json' WHERE id = ?").run(callId);
    await processCall(callId);
    const call = row<{ status: string; failed_step: string }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.status).toBe('failed');
    expect(call.failed_step).toBe('pipeline');
  });
});

describe('processCall review fixes', () => {
  beforeEach(() => freshDb());
  afterEach(() => {
    setLlmTransportForTests(null);
    setEmbeddingsTransportForTests(null);
  });

  it('deletes the WAV even when a hard step fails before STT', async () => {
    const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-wav-')), 'call.wav');
    fs.writeFileSync(wav, 'RIFF');
    const { callId } = setupCall({ audioPath: wav });
    getSqlite().prepare("UPDATE calls SET utterances_json = 'not json' WHERE id = ?").run(callId);
    await processCall(callId);
    expect(fs.existsSync(wav)).toBe(false);
    expect(row<{ status: string; audio_path: string | null }>('SELECT * FROM calls WHERE id = ?', callId)).toMatchObject({
      status: 'failed',
      audio_path: null,
    });
  });

  it('a failed re-run keeps the earlier extraction', async () => {
    const { callId } = setupCall();
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);
    setLlmTransportForTests(async () => 'not json');
    await processCall(callId);
    const call = row<{ summary: string; mood_label: string }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.summary).toContain('first car');
    expect(call.mood_label).toBe('positive');
    expect(rows('SELECT * FROM fun_facts WHERE call_id = ?', callId)).toHaveLength(1);
  });

  it('after a safety event: specific summary of the rest of the call, ending with the safety line; no mood tag', async () => {
    const { callId, questionId } = setupCall();
    getSqlite()
      .prepare("INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, 'safety', ?, 5000)")
      .run(newId(), callId, JSON.stringify({ category: 'other', note: 'x' }));
    setLlmTransportForTests(async () =>
      JSON.stringify(extraction({ familyQuestionAnswers: [{ questionId, answer: 'A Bel Air.' }] })),
    );
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);
    const call = row<{ summary: string; mood_label: string | null; mood_evidence_json: string }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(call.summary).toContain('first car');
    expect(call.summary.endsWith('Part of the call touched on a hard moment; Remi shared support resources.')).toBe(true);
    expect(call.mood_label).toBeNull();
    expect(JSON.parse(call.mood_evidence_json)).toEqual([]);
    expect(rows('SELECT * FROM fun_facts WHERE call_id = ?', callId)).not.toHaveLength(0);
    expect(row<{ status: string }>('SELECT status FROM family_questions WHERE id = ?', questionId).status).toBe('answered');
  });

  it('withSafetyLine never doubles the line and stands alone when there is no summary', () => {
    const line = 'Part of the call touched on a hard moment; Remi shared support resources.';
    expect(withSafetyLine('Hal talked about his garden.')).toBe(`Hal talked about his garden. ${line}`);
    expect(withSafetyLine(`Hal talked about his garden. ${line}`)).toBe(`Hal talked about his garden. ${line}`);
    expect(withSafetyLine('')).toBe(line);
  });

  it('re-running an earlier call re-links a later retelling instead of leaving a dangling link', async () => {
    const { elderId, callId: earlier } = setupCall({ startedAt: '2026-10-20T14:00:00.000Z' });
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(earlier);
    const later = insertCall(elderId, {
      status: 'processing',
      started_at: '2026-10-22T14:00:00.000Z',
      utterances_json: JSON.stringify(fixture.utterances),
    });
    await processCall(later);

    await processCall(earlier); // replaces the earlier call's topics with new ids
    const link = row<{ repeat_of_topic_id: string | null }>('SELECT repeat_of_topic_id FROM topics WHERE call_id = ?', later);
    const earlierTopic = row<{ id: string }>('SELECT id FROM topics WHERE call_id = ?', earlier);
    expect(link.repeat_of_topic_id).toBe(earlierTopic.id);
  });
});

describe('voice markers in the pipeline', () => {
  beforeEach(() => freshDb());
  afterEach(() => {
    setLlmTransportForTests(null);
    setEmbeddingsTransportForTests(null);
  });

  function toneWav(seconds: number, hz: (t: number) => number): string {
    const sr = 16000;
    const s = new Float32Array(seconds * sr);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      phase += (2 * Math.PI * hz(i / sr)) / sr;
      s[i] = 0.3 * (Math.sin(phase) + Math.sin(2 * phase) / 2 + Math.sin(3 * phase) / 3);
    }
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-')), 'tmp', 'calls');
    fs.mkdirSync(dir, { recursive: true });
    const wav = path.join(dir, 'call.wav');
    fs.writeFileSync(wav, encodeWav16(s, sr));
    return wav;
  }
  const pitchRow = (callId: string, marker: string) =>
    row<{ value: number | null; confidence: string; unit: string }>(
      'SELECT value, confidence, unit FROM call_markers WHERE call_id = ? AND marker = ?',
      callId,
      marker,
    );

  it('computes pitch_var and pitch_range from the WAV, then deletes it', async () => {
    const wav = toneWav(170, (t) => 120 + (60 * t) / 170); // covers the fixture's caller turns; rising 120 → 180 Hz
    const { callId } = setupCall({ audioPath: wav });
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);

    expect(fs.existsSync(wav)).toBe(false);
    expect(pitchRow(callId, 'pitch_var')).toMatchObject({ confidence: 'high', unit: 'st' });
    expect(pitchRow(callId, 'pitch_var').value!).toBeGreaterThan(1);
    expect(pitchRow(callId, 'pitch_range').value!).toBeGreaterThan(4);
    expect(getTimings(callId)?.steps.find((s) => s.step === 'acoustic')?.ok).toBe(true);
  });

  it('a re-run without audio keeps the earlier pitch values', async () => {
    const wav = toneWav(170, (t) => 120 + (60 * t) / 170);
    const { callId } = setupCall({ audioPath: wav });
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);
    const before = pitchRow(callId, 'pitch_var').value;
    await processCall(callId); // WAV is gone now
    expect(pitchRow(callId, 'pitch_var')).toMatchObject({ value: before, confidence: 'high' });
  });

  it('an unreadable WAV is a soft failure: the call still finishes', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-')), 'tmp', 'calls');
    fs.mkdirSync(dir, { recursive: true });
    const wav = path.join(dir, 'bad.wav');
    fs.writeFileSync(wav, 'not a wav');
    const { callId } = setupCall({ audioPath: wav });
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    setEmbeddingsTransportForTests(async (texts) => texts.map(() => [1, 0]));
    await processCall(callId);
    expect(row<{ status: string }>('SELECT status FROM calls WHERE id = ?', callId).status).toBe('done');
    expect(fs.existsSync(wav)).toBe(false);
    // The voice rows exist as 'na' (same as a no-audio call), not missing.
    expect(rows('SELECT * FROM call_markers WHERE call_id = ?', callId)).toHaveLength(10);
    expect(pitchRow(callId, 'pitch_var')).toMatchObject({ value: null, confidence: 'na' });
  });

  it('with no caller speech times at all, whole-file pitch is capped at low', async () => {
    const wav = toneWav(20, () => 140);
    const { callId } = setupCall({ audioPath: wav });
    getSqlite().prepare('UPDATE calls SET utterances_json = ? WHERE id = ?').run('[]', callId);
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    await processCall(callId);
    expect(pitchRow(callId, 'pitch_var').confidence).toBe('low');
  });

  it('uses STT word spans when present: speech outside the words is ignored', async () => {
    // 0–20 s at 120 Hz (caller words), 20–40 s at 220 Hz (no words, e.g. agent echo).
    const sr = 16000;
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-')), 'tmp', 'calls');
    fs.mkdirSync(dir, { recursive: true });
    const s = new Float32Array(40 * sr);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      phase += (2 * Math.PI * (i < 20 * sr ? 120 : 220)) / sr;
      s[i] = 0.3 * (Math.sin(phase) + Math.sin(2 * phase) / 2);
    }
    const wav = path.join(dir, 'spans.wav');
    fs.writeFileSync(wav, encodeWav16(s, sr));
    const { callId } = setupCall({ audioPath: wav });
    const words = Array.from({ length: 40 }, (_, k) => ({ w: 'word', startMs: k * 500, endMs: k * 500 + 450 }));
    process.env.STT_PROVIDER = 'openai';
    setSttTransportForTests(async () => words.map((w) => ({ word: w.w, start: w.startMs / 1000, end: w.endMs / 1000 })));
    setLlmTransportForTests(async () => JSON.stringify(extraction()));
    await processCall(callId);
    delete process.env.STT_PROVIDER;
    setSttTransportForTests(null);
    // Only the 120 Hz part was analysed: a steady tone → almost no rise and fall, not a 120↔220 mix.
    expect(pitchRow(callId, 'pitch_var').value!).toBeLessThan(0.5);
  });

  it('pitch tracking yields to the event loop (the server stays responsive)', async () => {
    const sr = 16000;
    const s = new Float32Array(120 * sr);
    let phase = 0;
    for (let i = 0; i < s.length; i++) {
      phase += (2 * Math.PI * 140) / sr;
      s[i] = 0.3 * Math.sin(phase);
    }
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    await pitchMarkersAsync(s, sr, undefined, true);
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
  });
});

describe('attachWords', () => {
  it('drops words spoken during an agent turn and splits a caller-less stream at agent turns', () => {
    const utts: Utterance[] = [{ speaker: 'agent', text: 'Tell me more', startMs: 1100, endMs: 20_000 }];
    const out = attachWords(utts, [
      { w: 'so', startMs: 0, endMs: 300 },
      { w: 'yes', startMs: 500, endMs: 900 },
      { w: 'mm-hmm', startMs: 9000, endMs: 9300 }, // during the agent turn: dropped
      { w: 'well', startMs: 21_000, endMs: 21_300 },
    ]);
    const caller = out.filter((u) => u.speaker === 'caller');
    expect(caller.map((u) => u.words?.map((w) => w.w))).toEqual([['so', 'yes'], ['well']]);
  });

  it('assigns STT words to the nearest caller utterance and keeps live text', () => {
    const utts: Utterance[] = [
      { speaker: 'caller', text: 'Hello there', startMs: 0, endMs: 1000 },
      { speaker: 'agent', text: 'Hi Hal!', startMs: 1200, endMs: 2000 },
      { speaker: 'caller', text: 'I forgot', startMs: 2500, endMs: 3500 },
    ];
    const out = attachWords(utts, [
      { w: 'hello', startMs: 0, endMs: 400 },
      { w: 'there', startMs: 450, endMs: 800 },
      { w: 'i', startMs: 2600, endMs: 2700 },
      { w: 'forgot', startMs: 3000, endMs: 3600 },
    ]);
    expect(out[0].words?.map((w) => w.w)).toEqual(['hello', 'there']);
    expect(out[1].words).toBeUndefined();
    expect(out[2].words?.map((w) => w.w)).toEqual(['i', 'forgot']);
    expect(out[2].text).toBe('I forgot');
  });
});
