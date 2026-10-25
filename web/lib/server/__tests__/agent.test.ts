import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSqlite } from '@/db/client';
import { freshDb, insertCall, insertElder } from '@/test/helpers';
import { GET as getContext } from '@/app/api/agent/context/route';
import { POST as createCall } from '@/app/api/agent/calls/route';
import { POST as postEvent } from '@/app/api/agent/calls/[callId]/events/route';
import { POST as complete } from '@/app/api/agent/calls/[callId]/complete/route';
import { drainQueue } from '../queue';
import { newId } from '../ids';
import type { CallContext } from '@/lib/types';

// Isolate from C's real pipeline (which may need model keys): mark the call done.
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
const ctxParams = (callId: string) => ({ params: Promise.resolve({ callId }) });

function addPhoto(elderId: string, createdAt: string, lastShownAt: string | null) {
  const id = newId();
  getSqlite()
    .prepare(
      `INSERT INTO photos (id, elder_id, file_path, mime, caption, people, last_shown_at, created_at) VALUES (?, ?, 'x.jpg', 'image/jpeg', ?, '', ?, ?)`,
    )
    .run(id, elderId, `photo ${createdAt}`, lastShownAt, createdAt);
  return id;
}

function addQuestion(elderId: string, createdAt: string, status = 'pending') {
  const id = newId();
  getSqlite()
    .prepare(`INSERT INTO family_questions (id, elder_id, text, asked_by, status, created_at) VALUES (?, ?, ?, 'Sam', ?, ?)`)
    .run(id, elderId, `q ${createdAt}`, status, createdAt);
  return id;
}

async function fetchContext(elderId: string): Promise<CallContext> {
  const res = await getContext(new Request(`http://localhost:3000/api/agent/context?elderId=${elderId}`, { headers: auth }));
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  freshDb();
  process.env.AGENT_API_TOKEN = TOKEN;
});
afterEach(() => vi.restoreAllMocks());

describe('agent auth', () => {
  it('401 without or with a wrong token', async () => {
    const elderId = insertElder();
    const r1 = await getContext(new Request(`http://x/api/agent/context?elderId=${elderId}`));
    expect(r1.status).toBe(401);
    const r2 = await createCall(post('http://x/api/agent/calls', {}, { authorization: 'Bearer wrong-token' }));
    expect(r2.status).toBe(401);
  });
});

describe('context', () => {
  it('first call: first theme, isFirstCall, photos NULLS FIRST, oldest pending question', async () => {
    const elderId = insertElder();
    const shownOld = addPhoto(elderId, '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z');
    const neverA = addPhoto(elderId, '2026-10-02T00:00:00Z', null);
    const shownNew = addPhoto(elderId, '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z');
    const neverB = addPhoto(elderId, '2026-10-03T00:00:00Z', null);
    addQuestion(elderId, '2026-10-01T00:00:00Z', 'asked');
    const oldestPending = addQuestion(elderId, '2026-10-02T00:00:00Z');
    addQuestion(elderId, '2026-10-03T00:00:00Z');

    const ctx = await fetchContext(elderId);
    expect(ctx.isFirstCall).toBe(true);
    expect(ctx.lastCall).toBeNull();
    expect(ctx.theme.id).toBe('theme-first-jobs');
    expect(ctx.photos.map((p) => p.id)).toEqual([neverA, neverB, shownOld, shownNew]);
    expect(ctx.photos[0].imageUrl).toBe(`http://localhost:3000/api/agent/photos/${neverA}`);
    expect(ctx.familyQuestion?.id).toBe(oldestPending);
    expect(ctx.consent.elderConfirmed).toBe(false);
  });

  it('theme rotates after the last call and wraps; zh prompt; lastCall summary', async () => {
    const elderId = insertElder({ language: 'zh' });
    const themes = getSqlite().prepare('SELECT id, prompt_zh FROM themes ORDER BY sort').all() as {
      id: string;
      prompt_zh: string;
    }[];
    insertCall(elderId, { started_at: '2026-10-01T00:00:00Z', summary: 'older', ended_at: '2026-10-01T00:10:00Z' });
    getSqlite().prepare('UPDATE calls SET theme_id = ?').run(themes[2].id);
    let ctx = await fetchContext(elderId);
    expect(ctx.isFirstCall).toBe(false);
    expect(ctx.theme.id).toBe(themes[3].id);
    expect(ctx.theme.prompt).toBe(themes[3].prompt_zh);
    expect(ctx.lastCall?.summary).toBe('older');

    const last = insertCall(elderId, { started_at: '2026-10-05T00:00:00Z', summary: 'newer', ended_at: '2026-10-05T00:10:00Z' });
    getSqlite().prepare('UPDATE calls SET theme_id = ? WHERE id = ?').run(themes[themes.length - 1].id, last);
    ctx = await fetchContext(elderId);
    expect(ctx.theme.id).toBe(themes[0].id);
    expect(ctx.lastCall).toEqual({ id: last, endedAt: '2026-10-05T00:10:00Z', summary: 'newer' });
  });

  it('404 for an unknown elder', async () => {
    const res = await getContext(new Request('http://x/api/agent/context?elderId=nope', { headers: auth }));
    expect(res.status).toBe(404);
  });
});

describe('calls + events', () => {
  async function newCall(elderId: string) {
    const res = await createCall(
      post('http://x/api/agent/calls', { elderId, startedAt: '2026-10-25T14:02:11Z', language: 'en', bridgeIdentity: 'chert-bridge-1' }),
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { callId: string }).callId;
  }

  it('creates a call in_progress; 400 on bad body; 404 on unknown elder', async () => {
    const elderId = insertElder();
    const callId = await newCall(elderId);
    const row = getSqlite().prepare('SELECT status FROM calls WHERE id = ?').get(callId) as { status: string };
    expect(row.status).toBe('in_progress');
    const bad = await createCall(post('http://x', { elderId, language: 'fr' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues.length).toBeGreaterThan(0);
    const missing = await createCall(post('http://x', { elderId: 'nope', startedAt: '2026-10-25T14:02:11Z', language: 'en' }));
    expect(missing.status).toBe(404);
  });

  it('event side effects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const elderId = insertElder();
    const callId = await newCall(elderId);
    const photoId = addPhoto(elderId, '2026-10-01T00:00:00Z', null);
    const qid = addQuestion(elderId, '2026-10-01T00:00:00Z');
    const db = getSqlite();

    expect((await postEvent(post('http://x', { type: 'photo_shown', atMs: 10, payload: { photoId } }), ctxParams(callId))).status).toBe(204);
    expect((db.prepare('SELECT last_shown_at FROM photos WHERE id = ?').get(photoId) as { last_shown_at: string }).last_shown_at).toBeTruthy();

    expect((await postEvent(post('http://x', { type: 'question_asked', atMs: 20, payload: { questionId: qid } }), ctxParams(callId))).status).toBe(204);
    expect(db.prepare('SELECT status, asked_call_id FROM family_questions WHERE id = ?').get(qid)).toEqual({
      status: 'asked',
      asked_call_id: callId,
    });

    // Partial consent write: only the provided keys change.
    expect((await postEvent(post('http://x', { type: 'consent', atMs: 30, payload: { summaries: true, mood: false } }), ctxParams(callId))).status).toBe(204);
    expect(
      db.prepare('SELECT elder_summaries, elder_fun_facts, elder_speech_trends, elder_mood, elder_confirmed_call_id FROM consents WHERE elder_id = ?').get(elderId),
    ).toEqual({ elder_summaries: 1, elder_fun_facts: null, elder_speech_trends: null, elder_mood: 0, elder_confirmed_call_id: callId });
    await postEvent(post('http://x', { type: 'consent', atMs: 31, payload: { funFacts: true, speechTrends: true } }), ctxParams(callId));
    expect(
      db.prepare('SELECT elder_summaries, elder_fun_facts, elder_speech_trends, elder_mood FROM consents WHERE elder_id = ?').get(elderId),
    ).toEqual({ elder_summaries: 1, elder_fun_facts: 1, elder_speech_trends: 1, elder_mood: 0 });

    expect((await postEvent(post('http://x', { type: 'safety', atMs: 40, payload: { category: 'other', note: 'private note' } }), ctxParams(callId))).status).toBe(204);
    expect((db.prepare('SELECT COUNT(*) AS n FROM safety_events WHERE call_id = ?').get(callId) as { n: number }).n).toBe(1);
    expect(warn).toHaveBeenCalledWith(`[SAFETY] call=${callId} category=other`);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('private note');

    expect((db.prepare('SELECT COUNT(*) AS n FROM call_events WHERE call_id = ?').get(callId) as { n: number }).n).toBe(5);

    const bad = await postEvent(post('http://x', { type: 'nope', atMs: 1, payload: {} }), ctxParams(callId));
    expect(bad.status).toBe(400);
    const unknown = await postEvent(post('http://x', { type: 'photo_shown', atMs: 1, payload: { photoId } }), ctxParams('nope'));
    expect(unknown.status).toBe(404);
  });

  it('complete → processing, then done after the queue drains; idempotent re-send', async () => {
    const elderId = insertElder();
    const callId = await newCall(elderId);
    const body = {
      endedAt: '2026-10-25T14:09:40Z',
      endReason: 'caller_hangup',
      utterances: [{ speaker: 'caller', text: 'Hello?', startMs: 1200, endMs: 1700 }],
      audioPath: null,
    };
    const res = await complete(post('http://x', body), ctxParams(callId));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'processing' });
    const db = getSqlite();
    const row = db.prepare('SELECT status, duration_s, end_reason, utterances_json FROM calls WHERE id = ?').get(callId) as {
      status: string;
      duration_s: number;
      end_reason: string;
      utterances_json: string;
    };
    expect(row.status).toBe('processing');
    expect(row.duration_s).toBe(449);
    expect(row.end_reason).toBe('caller_hangup');
    expect(JSON.parse(row.utterances_json)).toHaveLength(1);
    await drainQueue();
    expect((db.prepare('SELECT status FROM calls WHERE id = ?').get(callId) as { status: string }).status).toBe('done');

    const again = await complete(post('http://x', { ...body, utterances: [] }), ctxParams(callId));
    expect(again.status).toBe(202);
    expect((db.prepare('SELECT utterances_json FROM calls WHERE id = ?').get(callId) as { utterances_json: string }).utterances_json).toBe('[]');
    await drainQueue();

    expect((await complete(post('http://x', body), ctxParams('nope'))).status).toBe(404);
  });
});
