import { beforeEach, describe, expect, it } from 'vitest';
import { getSqlite } from '@/db/client';
import { buildCallContext } from '@/lib/server/context';
import { resetAll } from '@/lib/server/dev';
import { elderProfile } from '@/lib/server/elders';
import { buildTimeline } from '@/lib/server/timeline';
import type { NudgeReason } from '@/lib/types';
import { freshDb } from '@/test/helpers';
import { DEMO_ELDER_ID, runSeed } from '../seed';

// Thursday 2026-10-22 in America/New_York → W0 = 2026-W43; seeded weeks are W39–W42.
const NOW = new Date('2026-10-22T16:00:00Z');

const nudges = () =>
  getSqlite().prepare('SELECT type, reason_json, is_simulated FROM nudges WHERE elder_id = ?').all(DEMO_ELDER_ID) as {
    type: string;
    reason_json: string;
    is_simulated: number;
  }[];

describe('runSeed (demo.md §2)', () => {
  beforeEach(() => {
    freshDb();
    resetAll();
  });

  it('drift: exactly one cognitive_checkup nudge for W−2 and W−1 citing all four groups', async () => {
    const { elderId } = await runSeed('drift', NOW);
    expect(elderId).toBe('elder-hal-demo');
    const rows = nudges();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('cognitive_checkup');
    expect(rows[0].is_simulated).toBe(1);
    const reason = JSON.parse(rows[0].reason_json) as NudgeReason;
    expect(reason.weeks.map((w) => w.isoWeek)).toEqual(['2026-W41', '2026-W42']);
    expect(reason.weeks[1].driftingGroups).toEqual(expect.arrayContaining(['pace', 'pauses', 'words', 'repetition']));
  });

  it('stable: no nudge', async () => {
    await runSeed('stable', NOW);
    expect(nudges()).toHaveLength(0);
  });

  it('family timeline: 12 confirmed, simulated calls with photos, answers, facts, markers and the retold story', async () => {
    await runSeed('drift', NOW);
    const t = buildTimeline(DEMO_ELDER_ID)!;
    expect(t.consent.elderConfirmed).toBe(true);
    expect(t.calls).toHaveLength(12);
    expect(t.calls.every((c) => c.isSimulated && c.status === 'done' && c.summary)).toBe(true);
    // Newest first, all before W0 so the current week is left for the live call.
    expect(t.calls[0].id).toBe('call-12');
    expect(t.calls.every((c) => c.startedAt < '2026-10-19T04:00:00.000Z')).toBe(true);

    const call2 = t.calls.find((c) => c.id === 'call-02')!;
    expect(call2.familyQuestion).toEqual({
      text: 'What was your first job?',
      askedBy: 'Linda',
      answer: "Hal's first job was sweeping floors at a bakery at 14, for 50 cents a day.",
    });
    expect(t.calls.find((c) => c.id === 'call-01')!.photosShown.map((p) => p.id)).toEqual(['p-shops']);

    expect(t.funFacts).toHaveLength(5);
    expect(t.funFacts.find((f) => f.text.includes('bakery'))!.askedBy).toBe('Linda');

    const pace = t.markers.find((m) => m.key === 'speech_rate')!;
    expect(pace.baseline?.n).toBe(6);
    expect(pace.points).toHaveLength(12);
    const repeats = t.markers.find((m) => m.key === 'repeat_stories')!;
    expect(repeats.points.map((p) => p.value)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
    expect(t.repeats).toHaveLength(1);
    expect(t.repeats[0].dates).toHaveLength(4);
    expect(t.nudges).toHaveLength(1);
  });

  it('elder profile and agent context: Sam’s question is the one left for the live call', async () => {
    await runSeed('drift', NOW);
    const p = elderProfile(DEMO_ELDER_ID)!;
    expect(p.isSimulated).toBe(true);
    expect(p.members.map((m) => m.name)).toEqual(['Linda', 'Sam']);
    expect(p.photos.map((ph) => ph.id).sort()).toEqual(['p-car', 'p-lake', 'p-shops']);
    expect(Object.fromEntries(p.questions.map((q) => [q.id, q.status]))).toEqual({
      'q-first-job': 'answered',
      'q-met-mom': 'answered',
      'q-first-car': 'pending',
    });

    const ctx = buildCallContext(DEMO_ELDER_ID, 'http://localhost:3000')!;
    expect(ctx.isFirstCall).toBe(false);
    expect(ctx.familyQuestion?.id).toBe('q-first-car');
    expect(ctx.lastCall?.id).toBe('call-12');
    // The never-shown car photo comes first.
    expect(ctx.photos[0].id).toBe('p-car');
    expect(ctx.recentStories).toEqual(expect.arrayContaining([expect.stringContaining('1977 blizzard')]));
  });

  it('is deterministic: re-seeding gives the same marker table', async () => {
    const table = () =>
      getSqlite().prepare('SELECT call_id, marker, value, z FROM call_markers ORDER BY call_id, marker').all();
    await runSeed('drift', NOW);
    const first = table();
    resetAll();
    await runSeed('drift', NOW);
    expect(table()).toEqual(first);
  });
});
