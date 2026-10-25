import { describe, expect, it } from 'vitest';
import { checkupNudge, weeklyDrift, wellbeingNudge, type DriftCall } from '@/lib/analysis/drift';
import type { MarkerKey } from '@/lib/types';

type Z = Partial<Record<MarkerKey, number | null>>;

let seq = 0;
const call = (isoWeek: string, z: Z = {}, repeatStories: number | null = 0, adequate = true): DriftCall => ({
  callId: `c${seq++}`,
  isoWeek,
  adequate,
  z,
  repeatStories,
});
/** Three calls whose median weekZ equals `z` per marker. */
const week = (isoWeek: string, z: Z): DriftCall[] => [call(isoWeek, z), call(isoWeek, z), call(isoWeek, z)];

const calm: Z = { speech_rate: 0.1, pause_rate: -0.2, filler_rate: 0.3 };

function tv6(): DriftCall[] {
  return [
    ...week('2026-W40', calm),
    ...week('2026-W41', calm),
    ...week('2026-W42', { speech_rate: 2.1, pause_rate: 1.8, filler_rate: 0.4 }),
    ...week('2026-W43', { speech_rate: 2.4, vague_rate: 1.7 }),
  ];
}

describe('weeklyDrift / checkupNudge', () => {
  it('TV6: two consecutive weeks with >= 2 drifting groups fire the check-up nudge', () => {
    const weeks = weeklyDrift(tv6());
    expect(weeks.map((w) => w.isoWeek)).toEqual(['2026-W40', '2026-W41', '2026-W42', '2026-W43']);
    expect(weeks[2].driftingGroups).toEqual(['pace', 'pauses']);
    expect(weeks[3].driftingGroups).toEqual(['pace', 'words']);
    const reason = checkupNudge({ weeks, adequateCallCount: 12, speechTrends: true });
    expect(reason).not.toBeNull();
    expect(reason!.weeks.map((w) => w.isoWeek)).toEqual(['2026-W42', '2026-W43']);
    expect(reason!.weeks[0].markerZ.speech_rate).toBeCloseTo(2.1);
    expect(reason!.plainLanguage).toEqual([
      'speaking a bit more slowly than usual',
      'pausing more often or for longer',
      'using more filler or general words, or a narrower range of words',
    ]);
  });

  it('TV6: no nudge without effective speechTrends consent', () => {
    expect(checkupNudge({ weeks: weeklyDrift(tv6()), adequateCallCount: 12, speechTrends: false })).toBeNull();
  });

  it('no nudge with fewer than 8 adequate calls on record', () => {
    expect(checkupNudge({ weeks: weeklyDrift(tv6()), adequateCallCount: 7, speechTrends: true })).toBeNull();
  });

  it('only one drifting week does not fire', () => {
    const calls = tv6().filter((c) => c.isoWeek !== '2026-W43');
    calls.push(...week('2026-W43', calm));
    expect(checkupNudge({ weeks: weeklyDrift(calls), adequateCallCount: 12, speechTrends: true })).toBeNull();
  });

  it('TV7: repetition group drifts at a weekly sum of 3', () => {
    const drifts = weeklyDrift([call('2026-W43', {}, 1), call('2026-W43', {}, 1), call('2026-W43', {}, 1)]);
    expect(drifts[0].driftingGroups).toEqual(['repetition']);
    const calm3 = weeklyDrift([call('2026-W43', {}, 1), call('2026-W43', {}, 0), call('2026-W43', {}, 1)]);
    expect(calm3[0].driftingGroups).toEqual([]);
  });

  it('a week with < 2 adequate calls is skipped: no drift, no reset', () => {
    const drifting: Z = { speech_rate: 2.1, pause_rate: 1.8 };
    const calls = [
      ...week('2026-W40', calm),
      ...week('2026-W41', calm),
      ...week('2026-W42', drifting),
      // W43: one adequate (calm) call and two inadequate ones → skipped
      call('2026-W43', calm),
      call('2026-W43', calm, 0, false),
      call('2026-W43', calm, 0, false),
      ...week('2026-W44', drifting),
    ];
    const weeks = weeklyDrift(calls);
    const w43 = weeks.find((w) => w.isoWeek === '2026-W43')!;
    expect(w43.evaluated).toBe(false);
    expect(w43.adequateCalls).toBe(1);
    expect(w43.driftingGroups).toEqual([]);
    // A single strongly drifting call in a skipped week does not count as drift either.
    const lone = weeklyDrift([call('2026-W45', { speech_rate: 9, pause_rate: 9 }, 5)]);
    expect(lone[0]).toMatchObject({ evaluated: false, driftingGroups: [] });
    // W42 and W44 are consecutive evaluated weeks.
    const reason = checkupNudge({ weeks, adequateCallCount: 13, speechTrends: true });
    expect(reason?.weeks.map((w) => w.isoWeek)).toEqual(['2026-W42', '2026-W44']);
  });

  it('weekZ is the median over the week, ignoring null z', () => {
    const weeks = weeklyDrift([
      call('2026-W43', { speech_rate: 3 }),
      call('2026-W43', { speech_rate: 0 }),
      call('2026-W43', { speech_rate: null }),
      call('2026-W43', { speech_rate: 1 }),
    ]);
    expect(weeks[0].weekZ.speech_rate).toBe(1);
    expect(weeks[0].driftingGroups).toEqual([]);
  });
});

describe('wellbeingNudge', () => {
  it('fires on >= 3 low of the last 5 calls with mood consent', () => {
    const moods = ['positive', 'positive', 'low', 'neutral', 'low', 'low'];
    expect(wellbeingNudge({ moods, mood: true })).toEqual({ weeks: [], plainLanguage: [] });
    expect(wellbeingNudge({ moods, mood: false })).toBeNull();
    expect(wellbeingNudge({ moods: ['low', 'low', 'low', 'positive', 'neutral', 'positive', 'neutral', 'low'], mood: true })).toBeNull();
  });
});
