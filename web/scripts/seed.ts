// Demo seed (echo-docs/echo-docs/docs/demo.md §2): Hal's four simulated weeks before the live call.
// `npm run seed -- --scenario drift|stable` and POST /api/dev/seed both reset the DB first, then call runSeed().
//
// - The elder id is fixed (DEMO_ELDER_ID) so the agent's ELDER_ID survives re-seeding.
// - Every seeded row has is_simulated=1; consent is fully confirmed on call 1, or no nudge fires.
// - Calls are status='done' with call_markers rows written directly (confidence 'high').
//   Baselines, z and nudges come only from recomputeElder(): the demo runs the real logic.
// - Topic embeddings stay NULL; the pipeline embeds them lazily when a live call needs them.
import fs from 'node:fs';
import path from 'node:path';
import { getSqlite } from '../db/client';
import { recomputeElder } from '../lib/analysis/pipeline';
import { markerMeta } from '../lib/markers/meta';
import { newId, nowIso } from '../lib/server/ids';
import { saveUpload, sniffImage } from '../lib/server/uploads';
import type { MarkerKey, Utterance } from '../lib/types';
import {
  callDates, calls, elder, markersFor, photos, prng, questions, storiesFor, type Scenario,
} from './demo-data';

export type { Scenario };

/** Fixed demo elder id: put this in the agent's ELDER_ID. */
export const DEMO_ELDER_ID = elder.id;

// Licensed demo photos go here (HANDOFF D-2). A missing file still gets a row, so captions show
// on call cards; the UI falls back to its photo-icon panel.
const PHOTO_DIR = path.join(process.cwd(), '..', 'fixtures', 'demo');

const callId = (n: number) => `call-${String(n).padStart(2, '0')}`;

// Never shown to family; just enough that the call isn't empty.
function placeholderUtterances(summary: string): Utterance[] {
  return [
    { speaker: 'agent', text: 'Hi Hal, it’s Remi. How are you today?', startMs: 0, endMs: 2_500 },
    { speaker: 'caller', text: 'Oh, not bad, not bad.', startMs: 3_000, endMs: 4_500 },
    { speaker: 'caller', text: summary, startMs: 5_000, endMs: 40_000 },
  ];
}

function storePhoto(file: string): { filePath: string; mime: string } {
  const abs = path.join(PHOTO_DIR, file);
  if (fs.existsSync(abs)) {
    const buf = fs.readFileSync(abs);
    const mime = sniffImage(buf);
    if (mime === 'image/jpeg' || mime === 'image/png') return { filePath: saveUpload(buf, mime), mime };
    console.warn(`[seed] ${file} is not a JPEG or PNG; seeding the photo without an image`);
  } else {
    console.warn(`[seed] fixtures/demo/${file} not found; seeding the photo without an image`);
  }
  return { filePath: `missing-${file}`, mime: 'image/jpeg' };
}

export async function runSeed(scenario: Scenario, now = new Date()): Promise<{ elderId: string }> {
  const db = getSqlite();
  const dates = callDates(now, elder.timezone);
  const rand = prng(42);
  const created = nowIso();
  // Family setup happens before the first call.
  const setupAt = new Date(dates[0].getTime() - 86_400_000).toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO elders (id, display_name, preferred_name, language, timezone, about, primary_contact_name, is_simulated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(elder.id, elder.displayName, elder.preferredName, elder.language, elder.timezone, elder.about, elder.primaryContactName, setupAt);
    const member = db.prepare('INSERT INTO family_members (id, elder_id, name, relation) VALUES (?, ?, ?, ?)');
    for (const m of elder.members) member.run(newId(), elder.id, m.name, m.relation);

    db.prepare(
      `INSERT INTO consents (elder_id, fam_summaries, fam_fun_facts, fam_speech_trends, fam_mood,
         elder_summaries, elder_fun_facts, elder_speech_trends, elder_mood, elder_confirmed_call_id, updated_at)
       VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?)`,
    ).run(elder.id, callId(1), dates[0].toISOString());

    const lastShown = new Map<string, string>();
    calls.forEach((c, i) => c.photoIds.forEach((p) => lastShown.set(p, dates[i].toISOString())));
    const photo = db.prepare(
      `INSERT INTO photos (id, elder_id, file_path, mime, caption, people, last_shown_at, is_simulated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    for (const p of photos) {
      const { filePath, mime } = storePhoto(p.file);
      photo.run(p.id, elder.id, filePath, mime, p.caption, p.people, lastShown.get(p.id) ?? null, setupAt);
    }

    const question = db.prepare(
      `INSERT INTO family_questions (id, elder_id, text, asked_by, status, asked_call_id, is_simulated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    questions.forEach((q, i) => {
      const asked = q.answeredOnCall ? callId(q.answeredOnCall) : null;
      // Distinct created_at keeps the API's newest-first order stable.
      const at = new Date(Date.parse(setupAt) + i * 60_000).toISOString();
      question.run(q.id, elder.id, q.text, q.askedBy, asked ? 'answered' : 'pending', asked, at);
    });

    const call = db.prepare(
      `INSERT INTO calls (id, elder_id, started_at, ended_at, duration_s, language, status, utterances_json,
         summary, mood_label, is_simulated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?, ?, 1, ?)`,
    );
    const event = db.prepare('INSERT INTO call_events (id, call_id, type, payload_json, at_ms) VALUES (?, ?, ?, ?, ?)');
    const fact = db.prepare(
      `INSERT INTO fun_facts (id, elder_id, call_id, question_id, text, quote, is_simulated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    const topic = db.prepare(
      `INSERT INTO topics (id, elder_id, call_id, kind, summary, initiated_by, embedding_json, repeat_of_topic_id, is_simulated, created_at)
       VALUES (?, ?, ?, 'story', ?, 'caller', NULL, ?, 1, ?)`,
    );
    const marker = db.prepare(
      'INSERT INTO call_markers (call_id, marker, value, unit, z, confidence) VALUES (?, ?, ?, ?, NULL, ?)',
    );

    // Last telling of each story, so a retelling links to it (demo.md §2: 10→9, 11→10, 12→11).
    const lastTelling = new Map<string, string>();
    calls.forEach((c, i) => {
      const id = callId(c.n);
      const startedAt = dates[i].toISOString();
      const durationS = 360 + Math.floor(prng(c.n)() * 300); // 6–11 min, same as the UI fixtures
      const endedAt = new Date(dates[i].getTime() + durationS * 1000).toISOString();
      call.run(id, elder.id, startedAt, endedAt, durationS, elder.language,
        JSON.stringify(placeholderUtterances(c.summary)), c.summary, c.mood, created);

      if (c.n === 1) {
        event.run(newId(), id, 'consent', JSON.stringify({ summaries: true, funFacts: true, speechTrends: true, mood: true }), 30_000);
      }
      c.photoIds.forEach((p, k) => event.run(newId(), id, 'photo_shown', JSON.stringify({ photoId: p }), 60_000 + k * 60_000));
      if (c.questionId) event.run(newId(), id, 'question_asked', JSON.stringify({ questionId: c.questionId }), 180_000);

      for (const f of c.funFacts) fact.run(newId(), elder.id, id, f.questionId, f.text, f.quote, created);

      for (const s of storiesFor(c, scenario)) {
        const topicId = newId();
        topic.run(topicId, elder.id, id, s, lastTelling.get(s) ?? null, created);
        lastTelling.set(s, topicId);
      }

      // Drawn in call order from one PRNG so every run is identical.
      for (const [k, v] of Object.entries(markersFor(c.n, scenario, rand)) as [MarkerKey, number][]) {
        marker.run(id, k, v, markerMeta(k).unit, 'high');
      }
    });
  })();

  await recomputeElder(elder.id);
  return { elderId: elder.id };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')) {
  const i = process.argv.indexOf('--scenario');
  const scenario = (i > -1 ? process.argv[i + 1] : 'drift') as Scenario;
  if (scenario !== 'drift' && scenario !== 'stable') {
    console.error('usage: npm run seed -- --scenario drift|stable');
    process.exit(2);
  }
  (async () => {
    const { loadLocalEnv } = await import('../lib/server/env');
    loadLocalEnv();
    const { resetAll } = await import('../lib/server/dev');
    resetAll();
    return runSeed(scenario);
  })()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
