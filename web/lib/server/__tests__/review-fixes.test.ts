// Regression tests for issues found in the B/C review pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSqlite } from '@/db/client';
import { freshDb, insertCall, insertElder } from '@/test/helpers';
import { GET as getContext } from '@/app/api/agent/context/route';
import { POST as createCall } from '@/app/api/agent/calls/route';
import { POST as postEvent } from '@/app/api/agent/calls/[callId]/events/route';
import { POST as complete } from '@/app/api/agent/calls/[callId]/complete/route';
import { buildTimeline } from '../timeline';
import { drainQueue, enqueue } from '../queue';
import { newId } from '../ids';

vi.mock('@/lib/analysis/pipeline', () => ({
  processCall: async (callId: string) => {
    const { getSqlite: db } = await import('@/db/client');
    db().prepare(`UPDATE calls SET status = 'done' WHERE id = ?`).run(callId);
  },
  recomputeElder: async () => {},
}));

const TOKEN = 'test-token';
const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const post = (url: string, body: unknown, headers: Record<string, string> = auth) =>
  new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
const callParams = (callId: string) => ({ params: Promise.resolve({ callId }) });
const row = <T>(sql: string, ...args: unknown[]) => getSqlite().prepare(sql).get(...args) as T;

beforeEach(() => {
  freshDb();
  process.env.AGENT_API_TOKEN = TOKEN;
});

describe('auth', () => {
  it('401 (not 500) for a token with the same character count but different byte length', async () => {
    const res = await getContext(new Request('http://x/api/agent/context?elderId=x', { headers: { authorization: 'Bearer test-tokén' } }));
    expect(res.status).toBe(401);
  });
});

describe('timestamps', () => {
  it('normalizes offsets to UTC and rejects zone-less timestamps', async () => {
    const elderId = insertElder();
    const ok = await createCall(post('http://x/api/agent/calls', { elderId, startedAt: '2026-10-25T10:00:00-04:00', language: 'en' }));
    expect(ok.status).toBe(201);
    const { callId } = await ok.json();
    expect(row<{ started_at: string }>('SELECT started_at FROM calls WHERE id = ?', callId).started_at).toBe('2026-10-25T14:00:00.000Z');

    const bad = await createCall(post('http://x/api/agent/calls', { elderId, startedAt: 'Oct 25 2026 10:00', language: 'en' }));
    expect(bad.status).toBe(400);
  });
});

describe('complete', () => {
  it('rejects an audioPath outside a tmp/calls .wav', async () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'in_progress', started_at: '2026-10-25T14:00:00.000Z' });
    const body = { endedAt: '2026-10-25T14:05:00Z', utterances: [], audioPath: path.resolve('data/echo.db') };
    const res = await complete(post(`http://x/api/agent/calls/${callId}/complete`, body), callParams(callId));
    expect(res.status).toBe(400);
  });

  it('a retried /complete keeps STT words once the WAV is gone', async () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'done', started_at: '2026-10-25T14:00:00.000Z' });
    const withWords = [{ speaker: 'caller', text: 'hello', startMs: 0, endMs: 400, words: [{ w: 'hello', startMs: 0, endMs: 400 }] }];
    getSqlite().prepare('UPDATE calls SET utterances_json = ? WHERE id = ?').run(JSON.stringify(withWords), callId);
    const gone = path.join(os.tmpdir(), 'remi-missing', 'tmp', 'calls', `${callId}.wav`);
    const res = await complete(
      post(`http://x/api/agent/calls/${callId}/complete`, {
        endedAt: '2026-10-25T14:05:00Z',
        utterances: [{ speaker: 'caller', text: 'hello', startMs: 0, endMs: 400 }],
        audioPath: gone,
      }),
      callParams(callId),
    );
    expect(res.status).toBe(202);
    await drainQueue();
    const stored = row<{ utterances_json: string; audio_path: string | null }>('SELECT * FROM calls WHERE id = ?', callId);
    expect(JSON.parse(stored.utterances_json)[0].words).toHaveLength(1);
    expect(stored.audio_path).toBeNull();
  });

  it('accepts an existing tmp/calls .wav', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remi-')), 'tmp', 'calls');
    fs.mkdirSync(dir, { recursive: true });
    const wav = path.join(dir, 'c.wav');
    fs.writeFileSync(wav, 'RIFF');
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'in_progress', started_at: '2026-10-25T14:00:00.000Z' });
    getSqlite().prepare('UPDATE calls SET audio_path = NULL WHERE id = ?').run(callId);
    const res = await complete(
      post(`http://x/api/agent/calls/${callId}/complete`, { endedAt: '2026-10-25T14:05:00Z', utterances: [], audioPath: wav }),
      callParams(callId),
    );
    expect(res.status).toBe(202);
  });
});

describe('events', () => {
  it('rejects an empty consent payload', async () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'in_progress' });
    const res = await postEvent(post(`http://x/api/agent/calls/${callId}/events`, { type: 'consent', atMs: 1, payload: {} }), callParams(callId));
    expect(res.status).toBe(400);
  });

  it('question_asked never moves an answered question back', async () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'in_progress' });
    const qid = newId();
    getSqlite()
      .prepare(`INSERT INTO family_questions (id, elder_id, text, asked_by, status, created_at) VALUES (?, ?, 'q', 'Sam', 'answered', ?)`)
      .run(qid, elderId, '2026-10-01T00:00:00Z');
    const res = await postEvent(
      post(`http://x/api/agent/calls/${callId}/events`, { type: 'question_asked', atMs: 1, payload: { questionId: qid } }),
      callParams(callId),
    );
    expect(res.status).toBe(204);
    expect(row<{ status: string }>('SELECT status FROM family_questions WHERE id = ?', qid).status).toBe('answered');
  });
});

describe('context', () => {
  it('ignores the in-progress current call for isFirstCall and theme rotation', async () => {
    const elderId = insertElder();
    const first = await (await getContext(new Request(`http://x/api/agent/context?elderId=${elderId}`, { headers: auth }))).json();
    insertCall(elderId, { status: 'in_progress' });
    getSqlite().prepare('UPDATE calls SET theme_id = ? WHERE elder_id = ?').run(first.theme.id, elderId);
    const again = await (await getContext(new Request(`http://x/api/agent/context?elderId=${elderId}`, { headers: auth }))).json();
    expect(again.isFirstCall).toBe(true);
    expect(again.theme.id).toBe(first.theme.id);
  });
});

describe('timeline', () => {
  it('hides photos shown and the family question until the elder confirms', () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { status: 'done' });
    const photoId = newId();
    getSqlite()
      .prepare(`INSERT INTO photos (id, elder_id, file_path, mime, caption, created_at) VALUES (?, ?, 'x.jpg', 'image/jpeg', 'Dad 1971', ?)`)
      .run(photoId, elderId, '2026-10-01T00:00:00Z');
    getSqlite()
      .prepare(`INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, 'photo_shown', ?, 1)`)
      .run(newId(), callId, JSON.stringify({ photoId }));
    const before = buildTimeline(elderId)!;
    expect(before.calls[0].photosShown).toEqual([]);

    getSqlite()
      .prepare('UPDATE consents SET elder_summaries=1, elder_fun_facts=1, elder_speech_trends=1, elder_mood=1 WHERE elder_id = ?')
      .run(elderId);
    const after = buildTimeline(elderId)!;
    expect(after.calls[0].photosShown).toEqual([{ id: photoId, caption: 'Dad 1971' }]);
  });
});

describe('queue', () => {
  it('drainQueue times out instead of hanging on a stuck job', async () => {
    void enqueue(() => new Promise<void>(() => {}));
    const t0 = Date.now();
    await drainQueue(50);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
