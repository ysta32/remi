import { beforeEach, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import { freshDb, insertCall, insertElder } from '@/test/helpers';
import { GET } from '@/app/api/elders/[id]/timeline/route';
import { buildTimeline } from '../timeline';
import { newId, nowIso } from '../ids';

function setConsent(elderId: string, fam: Record<string, number>, elder: Record<string, number | null>) {
  const db = getSqlite();
  const sets = Object.entries({ ...fam, ...elder })
    .map(([k]) => `${k} = @${k}`)
    .join(', ');
  db.prepare(`UPDATE consents SET ${sets} WHERE elder_id = @elderId`).run({ elderId, ...fam, ...elder });
}

function seedRich(elderId: string) {
  const db = getSqlite();
  // Legacy topic-chain coverage uses simulated calls; real calls use validated detector results.
  const c1 = insertCall(elderId, {
    is_simulated: 1,
    started_at: '2026-10-01T14:00:00.000Z',
    duration_s: 300,
    summary: 'Talked about the shipyard.',
    mood_label: 'positive',
    utterances_json: JSON.stringify([{ speaker: 'caller', text: 'SECRET TRANSCRIPT', startMs: 0, endMs: 1 }]),
  });
  const c2 = insertCall(elderId, {
    started_at: '2026-10-08T14:00:00.000Z',
    duration_s: 420,
    summary: 'Talked about the shipyard again.',
    mood_label: 'neutral',
    is_simulated: 1,
  });
  const qid = newId();
  db.prepare(
    `INSERT INTO family_questions (id, elder_id, text, asked_by, status, asked_call_id, created_at) VALUES (?, ?, ?, ?, 'asked', ?, ?)`,
  ).run(qid, elderId, 'What was your first car?', 'Sam', c2, nowIso());
  db.prepare(`INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, 'question_asked', ?, 100)`).run(
    newId(),
    c2,
    JSON.stringify({ questionId: qid }),
  );
  db.prepare(
    `INSERT INTO fun_facts (id, elder_id, call_id, question_id, text, quote, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), elderId, c2, qid, 'His first car was a 1952 Ford.', 'a Ford, a 52', nowIso());
  const t1 = newId();
  db.prepare(
    `INSERT INTO topics (id, elder_id, call_id, kind, summary, initiated_by, created_at) VALUES (?, ?, ?, 'story', ?, 'caller', ?)`,
  ).run(t1, elderId, c1, 'The shipyard fire', nowIso());
  db.prepare(
    `INSERT INTO topics (id, elder_id, call_id, kind, summary, initiated_by, repeat_of_topic_id, created_at) VALUES (?, ?, ?, 'story', ?, 'caller', ?, ?)`,
  ).run(newId(), elderId, c2, 'Shipyard fire again', t1, nowIso());
  db.prepare(
    `INSERT INTO call_markers (call_id, marker, value, unit, z, confidence) VALUES (?, 'speech_rate', 140, 'wpm', NULL, 'high'), (?, 'speech_rate', 120, 'wpm', 1.5, 'high')`,
  ).run(c1, c2);
  db.prepare(
    `INSERT INTO baselines (elder_id, marker, language, median, mad, n, call_ids_json, computed_at) VALUES (?, 'speech_rate', 'en', 140, 5, 4, '[]', ?)`,
  ).run(elderId, nowIso());
  db.prepare(`INSERT INTO nudges (id, elder_id, type, reason_json, created_at) VALUES (?, ?, 'cognitive_checkup', ?, ?)`).run(
    newId(),
    elderId,
    JSON.stringify({ weeks: [], plainLanguage: ['speaking a bit more slowly than usual', 'pausing more often'] }),
    nowIso(),
  );
  db.prepare(`INSERT INTO nudges (id, elder_id, type, reason_json, created_at) VALUES (?, ?, 'wellbeing', ?, ?)`).run(
    newId(),
    elderId,
    JSON.stringify({ weeks: [], plainLanguage: [] }),
    nowIso(),
  );
  return { c1, c2 };
}

describe('timeline consent filtering', () => {
  beforeEach(() => freshDb());

  it('unconfirmed elder sees only dates and durations', async () => {
    const elderId = insertElder();
    setConsent(elderId, { fam_speech_trends: 1, fam_mood: 1 }, {});
    seedRich(elderId);
    const res = await GET(new Request('http://x/api'), { params: Promise.resolve({ id: elderId }) });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('SECRET TRANSCRIPT');
    expect(text).not.toContain('utterances');
    const t = JSON.parse(text);
    expect(t.consent.elderConfirmed).toBe(false);
    expect(t.calls).toHaveLength(2);
    expect(t.calls[0].startedAt).toBe('2026-10-08T14:00:00.000Z');
    expect(t.calls[0].durationS).toBe(420);
    for (const c of t.calls) {
      expect(c.summary).toBeNull();
      expect(c.mood).toBeNull();
      if (c.familyQuestion) expect(c.familyQuestion.answer).toBeNull();
    }
    expect(t.funFacts).toEqual([]);
    expect(t.markers).toEqual([]);
    expect(t.repeats).toEqual([]);
    expect(t.nudges).toEqual([]);
  });

  it('partial consent: summaries + speech trends, no fun facts, no mood', () => {
    const elderId = insertElder();
    setConsent(
      elderId,
      { fam_summaries: 1, fam_fun_facts: 1, fam_speech_trends: 1, fam_mood: 1 },
      { elder_summaries: 1, elder_fun_facts: 0, elder_speech_trends: 1, elder_mood: 0 },
    );
    seedRich(elderId);
    const t = buildTimeline(elderId)!;
    expect(t.consent.elderConfirmed).toBe(true);
    expect(t.calls[0].summary).toBe('Talked about the shipyard again.');
    expect(t.calls[0].mood).toBeNull();
    expect(t.calls[0].isSimulated).toBe(true);
    expect(t.calls[0].familyQuestion).toEqual({ text: 'What was your first car?', askedBy: 'Sam', answer: null });
    expect(t.funFacts).toEqual([]);
    expect(t.markers).toHaveLength(10); // 7 speech + repeat_stories + 2 voice
    const sr = t.markers.find((m) => m.key === 'speech_rate')!;
    expect(sr.baseline).toEqual({ median: 140, mad: 5, n: 4 });
    expect(sr.points.map((p) => p.value)).toEqual([140, 120]);
    expect(sr.points[1].isSimulated).toBe(true);
    expect(t.repeats).toHaveLength(1);
    expect(t.repeats[0].isSimulated).toBe(true);
    expect(t.repeats[0].summary).toBe('The shipyard fire');
    expect(t.repeats[0].dates).toHaveLength(2);
    expect(t.nudges).toHaveLength(1);
    expect(t.nudges[0].type).toBe('cognitive_checkup');
    expect(t.nudges[0].message).toContain('how Hal talks');
    expect(t.nudges[0].message).toContain('speaking a bit more slowly than usual and pausing more often');
    expect(t.nudges[0].message).not.toMatch(/\d/);
    expect(t.nudges[0].link).toBe('https://www.alz.org/alzheimers-dementia/10_signs');
  });

  it('full consent: fun facts with answers, mood, wellbeing nudge', () => {
    const elderId = insertElder();
    setConsent(
      elderId,
      { fam_summaries: 1, fam_fun_facts: 1, fam_speech_trends: 1, fam_mood: 1 },
      { elder_summaries: 1, elder_fun_facts: 1, elder_speech_trends: 1, elder_mood: 1 },
    );
    seedRich(elderId);
    const t = buildTimeline(elderId)!;
    expect(t.calls[0].mood).toBe('neutral');
    expect(t.calls[0].familyQuestion?.answer).toBe('His first car was a 1952 Ford.');
    expect(t.funFacts).toHaveLength(1);
    expect(t.funFacts[0].askedBy).toBe('Sam');
    expect(t.nudges.map((n) => n.type).sort()).toEqual(['cognitive_checkup', 'wellbeing']);
    expect(t.nudges.find((n) => n.type === 'wellbeing')!.link).toBeNull();
  });

  it('redacts simulated legacy story summaries when only speech trends are shared', () => {
    const elderId = insertElder();
    seedRich(elderId);
    setConsent(elderId, { fam_summaries: 1, fam_speech_trends: 1 }, { elder_summaries: 0, elder_speech_trends: 1 });
    const t = buildTimeline(elderId)!;
    expect(t.markers).toHaveLength(10);
    expect(t.repeats).toEqual([]);
  });

  it('404 for an unknown elder', async () => {
    const res = await GET(new Request('http://x/api'), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});

describe('safety moments on call cards', () => {
  beforeEach(() => freshDb());

  it('shows the most serious category per call and never the note', () => {
    const elderId = insertElder();
    const callId = insertCall(elderId, { started_at: '2026-10-25T06:32:00.000Z', duration_s: 300, summary: 'x' });
    const quiet = insertCall(elderId, { started_at: '2026-10-24T14:00:00.000Z', duration_s: 300, summary: 'y' });
    const add = (category: string, note: string, at: string) =>
      getSqlite()
        .prepare('INSERT INTO safety_events (id, call_id, category, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(newId(), callId, category, note, at);
    add('other', 'PRIVATE NOTE ONE', '2026-10-25T06:33:00.000Z');
    add('self_harm', 'PRIVATE NOTE TWO', '2026-10-25T06:34:00.000Z');
    const t = buildTimeline(elderId)!;
    const card = t.calls.find((c) => c.id === callId)!;
    expect(card.safety).toEqual({ category: 'self_harm', at: '2026-10-25T06:34:00.000Z' });
    expect(t.calls.find((c) => c.id === quiet)!.safety).toBeNull();
    expect(JSON.stringify(t)).not.toContain('PRIVATE NOTE');
  });
});
