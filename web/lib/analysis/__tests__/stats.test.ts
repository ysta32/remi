import { describe, expect, it } from 'vitest';
import { baselineScale, buildBaseline, mad, median, signedZ } from '@/lib/analysis/stats';

const r2 = (v: number) => Math.round(v * 100) / 100;

describe('stats', () => {
  it('median and MAD', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });

  it('TV5: baseline and signed z', () => {
    const b = buildBaseline([130, 135, 140, 128, 138, 133]);
    expect(b).toEqual({ median: 134, mad: 4, n: 6 });
    expect(baselineScale(b)).toBeCloseTo(5.9304, 6);
    const raw = (120 - b.median) / baselineScale(b);
    expect(r2(raw)).toBe(-2.36);
    expect(r2(signedZ(120, b, 'down'))).toBe(2.36);
    expect(r2(signedZ(120, b, 'up'))).toBe(-2.36);
  });

  it('scale falls back to 3% of |median|, then 1e-6', () => {
    expect(baselineScale({ median: 100, mad: 0 })).toBeCloseTo(3, 10);
    expect(baselineScale({ median: 0, mad: 0 })).toBe(1e-6);
  });
});
