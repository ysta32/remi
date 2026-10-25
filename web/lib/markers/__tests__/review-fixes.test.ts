// Regression tests for marker issues found in the review pass.
import { describe, expect, it } from 'vitest';
import { computeMarkers } from '@/lib/markers';
import { isoWeekKey } from '@/lib/analysis/weeks';
import { signedZ } from '@/lib/analysis/stats';
import { ABS_SPREAD_FLOOR } from '@/lib/analysis/config';
import type { Utterance } from '@/lib/types';

const byKey = (utts: Utterance[], lang: 'en' | 'zh' = 'en') =>
  Object.fromEntries(computeMarkers(utts, lang).map((m) => [m.marker, m]));
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

describe('STT words are the counting source when present', () => {
  it('counts fillers the live text dropped, with one U for every rate', () => {
    const m = byKey([
      {
        speaker: 'caller',
        text: 'I went to the store.',
        startMs: 0,
        endMs: 6000,
        words: [
          { w: 'I', startMs: 0, endMs: 200 },
          { w: 'um,', startMs: 1500, endMs: 1800 }, // 1300 ms gap before: WFP next to a filler
          { w: 'went', startMs: 1900, endMs: 2200 },
          { w: 'to', startMs: 2250, endMs: 2400 },
          { w: 'the', startMs: 2450, endMs: 2600 },
          { w: 'uh', startMs: 3800, endMs: 4000 }, // 1200 ms gap: WFP
          { w: 'store.', startMs: 4100, endMs: 4500 },
        ],
      },
    ]);
    // U = 7 STT words; 2 fillers; 2 pauses, both word-finding pauses.
    expect(r2(m.filler_rate.value)).toBe(28.57);
    expect(r2(m.pause_rate.value)).toBe(28.57);
    expect(r2(m.wfp_rate.value)).toBe(28.57);
  });

  it('treats "mm-hmm" next to a long pause as a filler for word-finding pauses', () => {
    const m = byKey([
      {
        speaker: 'caller',
        text: 'mm-hmm yes',
        startMs: 0,
        endMs: 2000,
        words: [
          { w: 'mm-hmm', startMs: 0, endMs: 300 },
          { w: 'yes', startMs: 1500, endMs: 1800 },
        ],
      },
    ]);
    expect(m.wfp_rate.value).toBeGreaterThan(0);
  });
});

describe('robustness', () => {
  it('clamps negative live utterance spans', () => {
    const words = Array.from({ length: 20 }, () => 'word').join(' ');
    const m = byKey([
      { speaker: 'caller', text: words, startMs: 0, endMs: 10_000 },
      { speaker: 'caller', text: words, startMs: 20_000, endMs: 15_000 }, // bad live timestamps
    ]);
    expect(r2(m.speech_rate.value)).toBe(240); // 40 words / 10 s, the bad span counts 0
  });

  it('agent speech touching the gap edge excludes the pause (closed interval)', () => {
    const m = byKey([
      { speaker: 'caller', text: 'hello there', startMs: 0, endMs: 2000, words: [{ w: 'hello', startMs: 0, endMs: 400 }, { w: 'there', startMs: 1000, endMs: 1400 }] },
      { speaker: 'agent', text: 'mm', startMs: 100, endMs: 400 },
    ]);
    expect(m.pause_rate.value).toBe(0);
  });

  it('an invalid elder timezone falls back instead of throwing', () => {
    expect(isoWeekKey('2026-10-25T14:00:00Z', 'Eastern')).toBe(isoWeekKey('2026-10-25T14:00:00Z', 'America/New_York'));
  });

  it('the absolute spread floor bounds z for markers that are usually 0', () => {
    const z = signedZ(0.4, { median: 0, mad: 0 }, 'up', ABS_SPREAD_FLOOR.wfp_rate);
    expect(z).toBeLessThan(2);
  });
});
