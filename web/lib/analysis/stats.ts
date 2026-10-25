// Robust per-person baseline and signed z (markers.md §7). Pure.
import { MAD_SCALE, MIN_SCALE, MIN_SPREAD_FRAC } from './config';

export interface Baseline {
  median: number;
  mad: number;
  n: number;
}

/** Median of `values`; NaN for an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation from the median (unscaled). */
export function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function buildBaseline(values: number[]): Baseline {
  return { median: median(values), mad: mad(values), n: values.length };
}

/** scale = max(1.4826 × MAD, 0.03 × |median|, 1e-6). */
export function baselineScale(b: Pick<Baseline, 'median' | 'mad'>): number {
  return Math.max(MAD_SCALE * b.mad, MIN_SPREAD_FRAC * Math.abs(b.median), MIN_SCALE);
}

/** Robust z versus the person's own baseline, signed so positive = the direction of concern. */
export function signedZ(value: number, baseline: Pick<Baseline, 'median' | 'mad'>, concern: 'up' | 'down'): number {
  const z = (value - baseline.median) / baselineScale(baseline);
  return concern === 'up' ? z : -z;
}
