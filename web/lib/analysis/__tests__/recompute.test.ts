import { beforeEach, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import { recomputeElder } from '@/lib/analysis/recompute';
import { markerMeta } from '@/lib/markers/meta';
import { newId, nowIso } from '@/lib/server/ids';
import type { MarkerKey, NudgeReason } from '@/lib/types';
import { freshDb, insertCall, insertElder } from '@/test/helpers';

/** mulberry32: small deterministic PRNG for reproducible noise. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Spec = Record<Exclude<MarkerKey, 'repeat_stories'>, [number, number]>;
// demo.md §2 marker table: [mean, ± uniform spread]
const BASE: Spec = {
  speech_rate: [134, 5],
  pause_rate: [9.0, 1.0],
  mean_pause_ms: [650, 50],
  wfp_rate: [0.8, 0.3],
  filler_rate: [4.0, 0.5],
  vague_rate: [1.2, 0.2],
  mattr: [0.72, 0.012],
};
const DRIFT_W3: Spec = {
  speech_rate: [121, 3],
  pause_rate: [12.5, 0.5],
  mean_pause_ms: [800, 30],
  wfp_rate: [1.6, 0.2],
  filler_rate: [4.4, 0.4],
  vague_rate: [2.0, 0.2],
  mattr: [0.7, 0.01],
};
const DRIFT_W4: Spec = {
  speech_rate: [116, 3],
  pause_rate: [13.5, 0.5],
  mean_pause_ms: [850, 30],
  wfp_rate: [2.0, 0.2],
  filler_rate: [4.6, 0.4],
  vague_rate: [2.3, 0.2],
  mattr: [0.69, 0.01],
};

const BLIZZARD = 'The 1977 blizzard when the roundhouse roof caved in under the snow';
const DAY = 86_400_000;
// W0 = Monday 2026-10-19 (America/New_York). Seed W-4 … W-1, Mon/Wed/Fri at 10:00 EDT (14:00Z).
const W_MINUS_4 = Date.UTC(2026, 8, 21, 14);

function setAllConsent(elderId: string) {
  getSqlite()
    .prepare(
      `UPDATE consents SET fam_summaries=1, fam_fun_facts=1, fam_speech_trends=1, fam_mood=1,
       elder_summaries=1, elder_fun_facts=1, elder_speech_trends=1, elder_mood=1 WHERE elder_id = ?`,
    )
    .run(elderId);
}

function insertMarkers(callId: string, values: Partial<Record<MarkerKey, number>>, confidence = 'high') {
  const stmt = getSqlite().prepare(
    'INSERT INTO call_markers (call_id, marker, value, unit, z, confidence) VALUES (?, ?, ?, ?, NULL, ?)',
  );
  for (const [k, v] of Object.entries(values)) stmt.run(callId, k, v, markerMeta(k as MarkerKey).unit, confidence);
}

function insertTopic(elderId: string, callId: string, summary: string, repeatOf: string | null, initiatedBy = 'caller') {
  const id = newId();
  getSqlite()
    .prepare(
      `INSERT INTO topics (id, elder_id, call_id, kind, summary, initiated_by, embedding_json, repeat_of_topic_id, is_simulated, created_at)
       VALUES (?, ?, ?, 'story', ?, ?, NULL, ?, 1, ?)`,
    )
    .run(id, elderId, callId, summary, initiatedBy, repeatOf, nowIso());
  return id;
}

function seedDemo(scenario: 'drift' | 'stable'): { elderId: string; callIds: string[] } {
  const rand = prng(42);
  const elderId = insertElder({ is_simulated: 1 });
  setAllConsent(elderId);
  const callIds: string[] = [];
  let blizzardPrev: string | null = null;
  for (let n = 1; n <= 12; n++) {
    const week = Math.floor((n - 1) / 3); // 0..3
    const dayOffset = [0, 2, 4][(n - 1) % 3];
    const startedAt = new Date(W_MINUS_4 + (week * 7 + dayOffset) * DAY).toISOString();
    const callId = insertCall(elderId, {
      started_at: startedAt,
      ended_at: new Date(Date.parse(startedAt) + 8 * 60_000).toISOString(),
      duration_s: 480,
      is_simulated: 1,
      mood_label: n % 4 === 0 ? 'neutral' : 'positive',
    });
    callIds.push(callId);
    const spec = week < 2 || scenario === 'stable' ? BASE : week === 2 ? DRIFT_W3 : DRIFT_W4;
    const values: Partial<Record<MarkerKey, number>> = {};
    for (const [k, [mean, spread]] of Object.entries(spec)) values[k as MarkerKey] = mean + (rand() * 2 - 1) * spread;
    insertMarkers(callId, values);
    // An agent-requested retelling never counts as a repeat.
    if (n === 5) insertTopic(elderId, callId, 'Meeting Dorothy at a church dance', 'some-topic', 'agent');
    if (n === 9 || (scenario === 'drift' && n >= 10)) {
      blizzardPrev = insertTopic(elderId, callId, BLIZZARD, n === 9 ? null : blizzardPrev);
    }
  }
  return { elderId, callIds };
}

function snapshot(elderId: string) {
  const db = getSqlite();
  return {
    markers: db
      .prepare(
        `SELECT m.call_id, m.marker, m.value, m.unit, m.z, m.confidence FROM call_markers m
         JOIN calls c ON c.id = m.call_id WHERE c.elder_id = ? ORDER BY m.call_id, m.marker`,
      )
      .all(elderId),
    baselines: db.prepare('SELECT * FROM baselines WHERE elder_id = ? ORDER BY marker, language').all(elderId),
    nudges: db
      .prepare('SELECT type, reason_json, dismissed_at, is_simulated FROM nudges WHERE elder_id = ? ORDER BY type')
      .all(elderId),
  };
}

const nudgesOf = (elderId: string) =>
  getSqlite().prepare('SELECT * FROM nudges WHERE elder_id = ? ORDER BY created_at').all(elderId) as {
    id: string;
    type: string;
    reason_json: string;
    is_simulated: number;
    dismissed_at: string | null;
  }[];

describe('recomputeElder', () => {
  beforeEach(() => freshDb());

  it('demo drift scenario: exactly one cognitive_checkup nudge citing all four groups', async () => {
    const { elderId, callIds } = seedDemo('drift');
    await recomputeElder(elderId);

    const nudges = nudgesOf(elderId);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].type).toBe('cognitive_checkup');
    expect(nudges[0].is_simulated).toBe(1);
    const reason = JSON.parse(nudges[0].reason_json) as NudgeReason;
    expect(reason.weeks.map((w) => w.isoWeek)).toEqual(['2026-W41', '2026-W42']); // W−2, W−1
    expect(reason.weeks[1].driftingGroups).toContain('repetition');
    expect(reason.plainLanguage).toHaveLength(4);

    // repeat_stories: 0 on 1–9, 1 on 10–12; high confidence.
    const rs = getSqlite()
      .prepare(`SELECT call_id, value, confidence, z FROM call_markers WHERE marker = 'repeat_stories'`)
      .all() as { call_id: string; value: number; confidence: string; z: number | null }[];
    const byCall = new Map(rs.map((r) => [r.call_id, r]));
    expect(callIds.map((id) => byCall.get(id)?.value)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
    expect(rs.every((r) => r.confidence === 'high' && r.z === null)).toBe(true);

    // Baselines from calls 1–6; every high value has a z.
    const baselines = getSqlite().prepare('SELECT * FROM baselines WHERE elder_id = ?').all(elderId) as {
      call_ids_json: string;
      n: number;
    }[];
    expect(baselines).toHaveLength(7);
    for (const b of baselines) {
      expect(b.n).toBe(6);
      expect(JSON.parse(b.call_ids_json)).toEqual(callIds.slice(0, 6));
    }
    const nullZ = getSqlite()
      .prepare(`SELECT COUNT(*) AS n FROM call_markers WHERE marker != 'repeat_stories' AND z IS NULL`)
      .get() as { n: number };
    expect(nullZ.n).toBe(0);
  });

  it('demo stable scenario: no nudge', async () => {
    const { elderId } = seedDemo('stable');
    await recomputeElder(elderId);
    expect(nudgesOf(elderId)).toHaveLength(0);
  });

  it('drift scenario without effective speechTrends consent: no nudge', async () => {
    const { elderId } = seedDemo('drift');
    getSqlite().prepare('UPDATE consents SET elder_speech_trends = NULL WHERE elder_id = ?').run(elderId);
    await recomputeElder(elderId);
    expect(nudgesOf(elderId)).toHaveLength(0);
  });

  it('is idempotent: running twice yields identical rows', async () => {
    const { elderId } = seedDemo('drift');
    await recomputeElder(elderId);
    const first = snapshot(elderId);
    await recomputeElder(elderId);
    expect(snapshot(elderId)).toEqual(first);
  });

  it('baselines stay frozen once stored', async () => {
    const { elderId, callIds } = seedDemo('drift');
    await recomputeElder(elderId);
    const before = snapshot(elderId).baselines;
    // An earlier call appears later (e.g. a backfill) — the stored baseline does not move.
    const early = insertCall(elderId, { started_at: '2026-09-01T14:00:00.000Z' });
    insertMarkers(early, { speech_rate: 200 });
    await recomputeElder(elderId);
    expect(snapshot(elderId).baselines).toEqual(before);
    expect(callIds).toHaveLength(12);
  });

  it('only done calls count; inadequate calls get low repeat_stories and no baseline contribution', async () => {
    const elderId = insertElder();
    setAllConsent(elderId);
    for (let i = 0; i < 5; i++) {
      const id = insertCall(elderId, { started_at: new Date(W_MINUS_4 + i * DAY).toISOString() });
      insertMarkers(id, { speech_rate: 130 + i });
    }
    const low = insertCall(elderId, { started_at: new Date(W_MINUS_4 + 5 * DAY).toISOString() });
    insertMarkers(low, { speech_rate: 90 }, 'low');
    const processing = insertCall(elderId, { started_at: new Date(W_MINUS_4 + 6 * DAY).toISOString(), status: 'processing' });
    insertMarkers(processing, { speech_rate: 140 });
    await recomputeElder(elderId);
    // Only 5 adequate done calls → no baseline yet, z NULL.
    expect(snapshot(elderId).baselines).toHaveLength(0);
    const rs = getSqlite()
      .prepare(`SELECT call_id, confidence FROM call_markers WHERE marker = 'repeat_stories'`)
      .all() as { call_id: string; confidence: string }[];
    expect(rs).toHaveLength(6);
    expect(rs.find((r) => r.call_id === low)?.confidence).toBe('low');
    expect(rs.find((r) => r.call_id === processing)).toBeUndefined();
  });

  it('wellbeing nudge: fires with mood consent, one active at a time, re-fires 14 days after dismissal', async () => {
    const elderId = insertElder();
    setAllConsent(elderId);
    const moods = ['positive', 'low', 'neutral', 'low', 'low'];
    moods.forEach((m, i) => insertCall(elderId, { started_at: new Date(W_MINUS_4 + i * DAY).toISOString(), mood_label: m }));
    await recomputeElder(elderId);
    await recomputeElder(elderId);
    let nudges = nudgesOf(elderId);
    expect(nudges.map((n) => n.type)).toEqual(['wellbeing']);

    // Dismissed 3 days ago → does not re-fire.
    const dismiss = (daysAgo: number) =>
      getSqlite()
        .prepare('UPDATE nudges SET dismissed_at = ? WHERE id = ?')
        .run(new Date(Date.now() - daysAgo * DAY).toISOString(), nudges[0].id);
    dismiss(3);
    await recomputeElder(elderId);
    expect(nudgesOf(elderId)).toHaveLength(1);

    // Dismissed 15 days ago → rule still holds → re-fires; the old nudge is kept.
    dismiss(15);
    await recomputeElder(elderId);
    nudges = nudgesOf(elderId);
    expect(nudges).toHaveLength(2);
    expect(nudges.filter((n) => n.dismissed_at === null)).toHaveLength(1);

    // Without mood consent: nothing new.
    const other = insertElder();
    moods.forEach((m, i) => insertCall(other, { started_at: new Date(W_MINUS_4 + i * DAY).toISOString(), mood_label: m }));
    await recomputeElder(other);
    expect(nudgesOf(other)).toHaveLength(0);
  });
});
