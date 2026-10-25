import { describe, expect, it } from 'vitest';
import {
  buildIndexBaseline,
  mannKendall,
  runDriftIndex,
  theilSen,
  type IndexCall,
} from '@/lib/analysis/drift-index';

// Hand-made series: 4 calls/week on days 0,2,4,6 of each week. `shift(week)` moves pauses up and
// pace down by that many baseline spreads; a small alternating wobble keeps MAD non-zero.
function series(weeks: number, shift: (w: number) => number, moodLow: (w: number) => boolean = () => false, repeats: (w: number) => number = () => 0): IndexCall[] {
  const out: IndexCall[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const [i, off] of [0, 2, 4, 6].entries()) {
      const wobble = (i % 2 === 0 ? 1 : -1) * 0.5;
      const s = shift(w);
      out.push({
        callId: `w${w}c${i}`,
        day: w * 7 + off,
        adequate: true,
        values: {
          speech_rate: 140 - 9 * (s + wobble),
          mean_pause_ms: 650 + 80 * (s - wobble),
          pause_rate: 12 + 2 * (s + wobble),
          filler_rate: 4 + 1.2 * (s - wobble),
          mattr: 0.72 - 0.02 * (s + wobble),
        },
        repeats: i === 0 ? repeats(w) : 0,
        moodLow: moodLow(w),
      });
    }
  }
  return out;
}

describe('theilSen / mannKendall', () => {
  it('Theil-Sen is the median pairwise slope and ignores one outlier', () => {
    expect(theilSen([0, 1, 2, 3, 4], [0, 1, 2, 3, 40])).toBe(1);
    expect(theilSen([1, 1], [0, 5])).toBeNull();
  });
  it('Mann-Kendall: monotone up is significant, flat/short is not', () => {
    const up = mannKendall([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(up.s).toBe(45);
    expect(up.pUp).toBeLessThan(0.001);
    expect(mannKendall([3, 1, 4, 1, 5, 9, 2, 6]).pUp).toBeGreaterThan(0.1);
    expect(mannKendall([1, 2, 3]).pUp).toBe(1);
  });
});

describe('buildIndexBaseline', () => {
  it('skips the first 2 calls and takes the next 8; null before that', () => {
    const calls = series(3, () => 0);
    const b = buildIndexBaseline(calls)!;
    expect(b.callIds).toEqual(calls.slice(2, 10).map((c) => c.callId));
    expect(b.markers.speech_rate!.median).toBeCloseTo(140, 6);
    expect(b.markers.wfp_rate).toBeUndefined(); // not present in the data
    expect(buildIndexBaseline(calls.slice(0, 9))).toBeNull();
  });
});

describe('runDriftIndex', () => {
  it('stable series: no nudge, no watch', () => {
    const r = runDriftIndex(series(10, () => 0));
    expect(r.weeks.some((w) => w.nudge)).toBe(false);
    expect(r.weeks.some((w) => w.watch)).toBe(false);
    expect(r.weeks[0].baselineWeek).toBe(true);
  });

  it('sustained rising shift: nudges once the 3-of-4 rule and trend hold, then cools down 4 weeks', () => {
    const r = runDriftIndex(series(14, (w) => (w < 3 ? 0 : (w - 2) * 0.6)));
    const nudgeWeeks = r.weeks.filter((w) => w.nudge).map((w) => w.week);
    expect(nudgeWeeks.length).toBeGreaterThan(0);
    const first = nudgeWeeks[0];
    expect(r.weeks[first].meetsInWindow).toBeGreaterThanOrEqual(3);
    expect(r.weeks[first].slopePerWeek!).toBeGreaterThan(0);
    for (let i = 1; i < nudgeWeeks.length; i++) expect(nudgeWeeks[i] - nudgeWeeks[i - 1]).toBeGreaterThanOrEqual(4);
    // Watching comes no later than the nudge.
    expect(r.weeks.findIndex((w) => w.watch)).toBeLessThanOrEqual(first);
  });

  it('a step that stays flat meets the threshold but needs an upward trend', () => {
    // Jump to +3 spreads at week 4 and hold: trend in the last 28 days flattens after a few weeks.
    const r = runDriftIndex(series(14, (w) => (w < 4 ? 0 : 3)));
    const late = r.weeks.slice(-2);
    expect(late.every((w) => w.meets)).toBe(true);
    expect(late.every((w) => !w.nudge)).toBe(true);
  });

  it('mood flagged: the rule routes to the wellbeing card instead of a cognitive nudge', () => {
    const r = runDriftIndex(series(14, (w) => (w < 3 ? 0 : (w - 2) * 0.6), () => true));
    expect(r.weeks.some((w) => w.nudge)).toBe(false);
    expect(r.weeks.some((w) => w.routedToWellbeing)).toBe(true);
    expect(r.weeks.at(-1)!.wellbeingCard).toBe(true);
  });

  it('repeats card needs >= 3 repeats in each of 2 consecutive weeks', () => {
    const r = runDriftIndex(series(6, () => 0, () => false, (w) => (w >= 3 ? 3 : 1)));
    expect(r.weeks.map((w) => w.repeatsCard)).toEqual([false, false, false, false, true, true]);
  });

  it('weeks with fewer than 2 adequate calls have no weekly score', () => {
    const calls = series(5, () => 0).filter((c) => !(c.day >= 28 && c.day % 7 !== 0));
    const r = runDriftIndex(calls);
    expect(r.weeks[4].weeklyD).toBeNull();
  });
});
