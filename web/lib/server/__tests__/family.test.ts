import { beforeEach, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import { freshDb, insertCall } from '@/test/helpers';
import { GET as listElders, POST as createElder } from '@/app/api/elders/route';
import { GET as getElder, PATCH as patchElder } from '@/app/api/elders/[id]/route';
import { POST as uploadPhoto } from '@/app/api/elders/[id]/photos/route';
import { POST as addQuestion } from '@/app/api/elders/[id]/questions/route';
import { PUT as putConsent } from '@/app/api/elders/[id]/consent/route';
import { GET as photoFile } from '@/app/api/photos/[id]/file/route';
import { DELETE as deletePhoto } from '@/app/api/photos/[id]/route';
import { DELETE as deleteQuestion } from '@/app/api/questions/[id]/route';
import { POST as dismissNudge } from '@/app/api/nudges/[id]/dismiss/route';
import { POST as reset } from '@/app/api/dev/reset/route';
import { GET as devStatus } from '@/app/api/dev/status/route';
import { newId, nowIso } from '../ids';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonReq = (method: string, body: unknown) =>
  new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function photoForm(bytes: Uint8Array, caption = 'At the lake') {
  const fd = new FormData();
  fd.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'evil/../name.png');
  fd.set('caption', caption);
  fd.set('people', 'Hal, Linda');
  return new Request('http://x', { method: 'POST', body: fd });
}

async function makeElder() {
  const res = await createElder(
    jsonReq('POST', {
      displayName: 'Harold Bennett',
      preferredName: 'Hal',
      language: 'en',
      primaryContactName: 'Linda',
      members: [{ name: 'Sam', relation: 'grandson' }],
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

beforeEach(() => freshDb());

describe('family endpoints', () => {
  it('elder create / list / get / patch, with default consent row', async () => {
    const id = await makeElder();
    expect(await (await listElders()).json()).toEqual([{ id, displayName: 'Harold Bennett', preferredName: 'Hal' }]);
    const profile = await (await getElder(new Request('http://x'), p(id))).json();
    expect(profile.members).toEqual([expect.objectContaining({ name: 'Sam', relation: 'grandson' })]);
    expect(profile.consent.proposed).toEqual({ summaries: true, funFacts: true, speechTrends: false, mood: false });
    expect(profile.consent.elderConfirmed).toBe(false);

    const patched = await patchElder(jsonReq('PATCH', { about: 'Retired machinist.' }), p(id));
    expect(patched.status).toBe(200);
    expect((await patched.json()).about).toBe('Retired machinist.');
    expect((await patchElder(jsonReq('PATCH', { language: 'fr' }), p(id))).status).toBe(400);
    expect((await getElder(new Request('http://x'), p('nope'))).status).toBe(404);
    expect((await createElder(jsonReq('POST', { displayName: '' }))).status).toBe(400);
  });

  it('photo upload, serve, reject HEIC/garbage, delete', async () => {
    const id = await makeElder();
    const res = await uploadPhoto(photoForm(PNG_1X1), p(id));
    expect(res.status).toBe(201);
    const photo = await res.json();
    expect(photo.mime).toBe('image/png');
    expect(photo.imageUrl).toBe(`/api/photos/${photo.id}/file`);
    const row = getSqlite().prepare('SELECT file_path FROM photos WHERE id = ?').get(photo.id) as { file_path: string };
    expect(row.file_path).not.toContain('name');
    expect(row.file_path).not.toMatch(/[\\/]/);

    const file = await photoFile(new Request('http://x'), p(photo.id));
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer()).equals(PNG_1X1)).toBe(true);

    const heic = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftypheic'), 0, 0, 0, 0]);
    const heicRes = await uploadPhoto(photoForm(heic), p(id));
    expect(heicRes.status).toBe(415);
    expect((await heicRes.json()).error).toMatch(/HEIC/);
    expect((await uploadPhoto(photoForm(new Uint8Array([1, 2, 3, 4])), p(id))).status).toBe(415);
    expect((await uploadPhoto(photoForm(PNG_1X1, ''), p(id))).status).toBe(400);

    expect((await deletePhoto(new Request('http://x'), p(photo.id))).status).toBe(204);
    expect((await photoFile(new Request('http://x'), p(photo.id))).status).toBe(404);
    expect((await deletePhoto(new Request('http://x'), p(photo.id))).status).toBe(404);
  });

  it('questions, consent, nudge dismiss', async () => {
    const id = await makeElder();
    const q = await addQuestion(jsonReq('POST', { text: 'First car?', askedBy: 'Sam' }), p(id));
    expect(q.status).toBe(201);
    const question = await q.json();
    expect(question.status).toBe('pending');
    expect((await deleteQuestion(new Request('http://x'), p(question.id))).status).toBe(204);
    expect((await deleteQuestion(new Request('http://x'), p(question.id))).status).toBe(404);

    const c = await putConsent(jsonReq('PUT', { summaries: true, funFacts: false, speechTrends: true, mood: true }), p(id));
    expect(c.status).toBe(200);
    expect(await c.json()).toEqual({
      proposed: { summaries: true, funFacts: false, speechTrends: true, mood: true },
      elderConfirmed: false,
      effective: { summaries: false, funFacts: false, speechTrends: false, mood: false },
    });
    expect((await putConsent(jsonReq('PUT', { summaries: true }), p(id))).status).toBe(400);

    const nid = newId();
    getSqlite()
      .prepare(`INSERT INTO nudges (id, elder_id, type, reason_json, created_at) VALUES (?, ?, 'wellbeing', '{}', ?)`)
      .run(nid, id, nowIso());
    expect((await dismissNudge(new Request('http://x', { method: 'POST' }), p(nid))).status).toBe(204);
    expect((getSqlite().prepare('SELECT dismissed_at FROM nudges WHERE id = ?').get(nid) as { dismissed_at: string }).dismissed_at).toBeTruthy();
    expect((await dismissNudge(new Request('http://x', { method: 'POST' }), p('nope'))).status).toBe(404);
  });
});

describe('dev endpoints', () => {
  it('404 unless DEV_TOOLS=1; reset clears rows and keeps themes', async () => {
    delete process.env.DEV_TOOLS;
    expect((await reset()).status).toBe(404);
    expect((await devStatus()).status).toBe(404);

    process.env.DEV_TOOLS = '1';
    try {
      const id = await makeElder();
      insertCall(id);
      const status = await (await devStatus()).json();
      expect(status.calls).toHaveLength(1);
      expect(status.calls[0]).toHaveProperty('timings');
      expect((await reset()).status).toBe(200);
      const db = getSqlite();
      expect((db.prepare('SELECT COUNT(*) AS n FROM elders').get() as { n: number }).n).toBe(0);
      expect((db.prepare('SELECT COUNT(*) AS n FROM calls').get() as { n: number }).n).toBe(0);
      expect((db.prepare('SELECT COUNT(*) AS n FROM themes').get() as { n: number }).n).toBe(8);
    } finally {
      delete process.env.DEV_TOOLS;
    }
  });
});
