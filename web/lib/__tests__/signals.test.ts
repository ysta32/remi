import { describe, expect, it } from 'vitest';
import drift from '../../../fixtures/demo/timeline.json';
import stable from '../../../fixtures/demo/timeline-stable.json';
import { buildSignals, STATUS_TEXT, zWords } from '../signals';
import type { MarkerSeries } from '../types';

const driftMarkers = drift.markers as MarkerSeries[];
const stableMarkers = stable.markers as MarkerSeries[];
const byKey = (markers: MarkerSeries[]) => Object.fromEntries(buildSignals(markers).map((s) => [s.key, s]));

describe('buildSignals', () => {
  it('returns the four family signals in a fixed order', () => {
    expect(buildSignals(driftMarkers).map((s) => s.key)).toEqual(['pauses', 'pace', 'vague', 'retold']);
  });

  it('marks the drift scenario as different from his usual, with retold stories', () => {
    const s = byKey(driftMarkers);
    expect([s.pauses.status, s.pace.status, s.vague.status]).toEqual(['different', 'different', 'different']);
    expect(s.retold.status).toBe('retold');
  });

  it('marks the stable scenario as his usual everywhere', () => {
    expect(buildSignals(stableMarkers).map((s) => s.status)).toEqual(['usual', 'usual', 'usual', 'usual']);
  });

  it('combines the four pause markers as the median of their z-scores per call', () => {
    const point = byKey(driftMarkers).pauses.points.find((p) => p.callId === 'call-12');
    expect(point?.value).toBeCloseTo((5.34 + 6) / 2, 5); // z = 6, 5.34, 7.08, 2.29
    expect(byKey(driftMarkers).pauses.band).toEqual([-1, 1]);
  });

  it('uses median ± 1.4826·MAD as the usual band for raw-value signals', () => {
    const { median, mad } = driftMarkers.find((m) => m.key === 'speech_rate')!.baseline!;
    const band = byKey(driftMarkers).pace.band!;
    expect(band[0]).toBeCloseTo(median - 1.4826 * mad, 6);
    expect(band[1]).toBeCloseTo(median + 1.4826 * mad, 6);
    expect(byKey(driftMarkers).retold.band).toBeNull();
  });

  it('copes with an elder who has no calls yet', () => {
    const signals = buildSignals([]);
    expect(signals).toHaveLength(4);
    expect(signals.every((s) => s.status === 'learning' && s.points.length === 0)).toBe(true);
  });

  it('keeps unusable points as gaps and does not judge on fewer than three good calls', () => {
    const pace = structuredClone(driftMarkers.find((m) => m.key === 'speech_rate')!);
    pace.points = pace.points.slice(0, 2).concat(
      { callId: 'short-1', at: '2026-10-20T14:00:00Z', value: null, z: null, confidence: 'na', isSimulated: false },
      { callId: 'short-2', at: '2026-10-21T14:00:00Z', value: 110, z: 9, confidence: 'low', isSimulated: false },
    );
    const s = byKey([pace]).pace;
    expect(s.points.find((p) => p.callId === 'short-1')?.value).toBeNull();
    expect(s.status).toBe('learning');
  });
});

describe('zWords', () => {
  it('uses the same 1.5 threshold as the status pill, in plain words', () => {
    expect(zWords(1.6)).toBe('More than his usual');
    expect(zWords(1.2)).toBe('Near his usual');
    expect(zWords(-1.6)).toBe('Less than his usual');
  });
});

describe('STATUS_TEXT', () => {
  it('uses plain words, no numbers', () => {
    expect(STATUS_TEXT).toEqual({
      usual: 'About his usual',
      different: 'Different from his usual lately',
      retold: 'Retold a few stories this week',
      learning: 'Still learning his usual',
    });
  });
});
