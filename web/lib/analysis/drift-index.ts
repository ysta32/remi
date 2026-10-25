// Personal Drift Index: one number per call saying how far the call sits from the person's own
// usual, in personal SDs, plus an EWMA/CUSUM "watching" layer and a multi-week persistence rule
// that is the only thing allowed to message family. Pure. [HEURISTIC] every threshold (config.ts
// DI_*), checked on simulated personas only. It notices change against his own usual; it never
// explains the change or diagnoses anything.
import { markerMeta } from '../markers/meta';
import type { MarkerKey } from '../types';
import {
  DI_BASELINE_N,
  DI_COOLDOWN_WEEKS,
  DI_CUSUM_H,
  DI_CUSUM_K,
  DI_EWMA_L,
  DI_EWMA_LAMBDA,
  DI_MIN_CALLS_PER_WEEK,
  DI_MK_ALPHA,
  DI_PERSIST_NEEDED,
  DI_PERSIST_WINDOW,
  DI_REPEATS_WEEKLY,
  DI_REPEATS_WEEKS,
  DI_SD_FLOOR,
  DI_SKIP_FIRST,
  DI_SPREAD_FLOOR,
  DI_TREND_DAYS,
  DI_WATCH_THRESHOLD,
  DI_WATCH_WEEKS,
  DI_WEEKLY_THRESHOLD,
  DI_WEIGHTS,
  DI_Z_CLIP,
  MAD_SCALE,
  MOOD_LOW_MIN,
  MOOD_WINDOW,
} from './config';
import { mad, median } from './stats';

const DAYS_PER_WEEK = 7;

export interface IndexCall {
  callId: string;
  /** Days since the person's first call (fractional allowed). Week = floor(day / 7). */
  day: number;
  /** Enough caller speech for high-confidence markers; inadequate calls are ignored. */
  adequate: boolean;
  values: Partial<Record<MarkerKey, number | null>>;
  /** repeat_stories for the call; null when not available. */
  repeats: number | null;
  /** Mood read low on this call; null when not available. */
  moodLow: boolean | null;
}

export interface DriftIndexOptions {
  skipFirst: number;
  baselineN: number;
  weights: Partial<Record<MarkerKey, number>>;
  floors: Partial<Record<MarkerKey, number>>;
  zClip: number;
  sdFloor: number;
  minCallsPerWeek: number;
  weeklyThreshold: number;
  persistWindow: number;
  persistNeeded: number;
  watchThreshold: number;
  watchWeeks: number;
  ewmaLambda: number;
  ewmaL: number;
  cusumK: number;
  cusumH: number;
  trendDays: number;
  mkAlpha: number;
  repeatsWeekly: number;
  repeatsWeeks: number;
  cooldownWeeks: number;
  moodWindow: number;
  moodLowMin: number;
}

export const DEFAULT_DRIFT_INDEX_OPTIONS: DriftIndexOptions = {
  skipFirst: DI_SKIP_FIRST,
  baselineN: DI_BASELINE_N,
  weights: DI_WEIGHTS,
  floors: DI_SPREAD_FLOOR,
  zClip: DI_Z_CLIP,
  sdFloor: DI_SD_FLOOR,
  minCallsPerWeek: DI_MIN_CALLS_PER_WEEK,
  weeklyThreshold: DI_WEEKLY_THRESHOLD,
  persistWindow: DI_PERSIST_WINDOW,
  persistNeeded: DI_PERSIST_NEEDED,
  watchThreshold: DI_WATCH_THRESHOLD,
  watchWeeks: DI_WATCH_WEEKS,
  ewmaLambda: DI_EWMA_LAMBDA,
  ewmaL: DI_EWMA_L,
  cusumK: DI_CUSUM_K,
  cusumH: DI_CUSUM_H,
  trendDays: DI_TREND_DAYS,
  mkAlpha: DI_MK_ALPHA,
  repeatsWeekly: DI_REPEATS_WEEKLY,
  repeatsWeeks: DI_REPEATS_WEEKS,
  cooldownWeeks: DI_COOLDOWN_WEEKS,
  moodWindow: MOOD_WINDOW,
  moodLowMin: MOOD_LOW_MIN,
};

export interface IndexBaseline {
  callIds: string[];
  /** Day of the last baseline call; monitoring starts after it. */
  endDay: number;
  markers: Partial<Record<MarkerKey, { median: number; scale: number }>>;
  /** Mean and SD of the composite over the baseline calls, used to re-standardize to D. */
  cMean: number;
  cSd: number;
}

export interface CallScore {
  callId: string;
  day: number;
  week: number;
  inBaseline: boolean;
  /** Direction-aligned, clipped robust z per marker (positive = more change in the concerning direction). */
  z: Partial<Record<MarkerKey, number>>;
  /** Weighted composite of z. */
  c: number;
  /** Drift Index: c re-standardized so 1.0 = one personal SD. */
  d: number;
  ewma: number;
  cusum: number;
}

export interface WeekState {
  week: number;
  calls: number;
  /** Mean D of the week's adequate calls; null when fewer than minCallsPerWeek ("not enough calls"). */
  weeklyD: number | null;
  /** Week is at or before the last baseline call (or no baseline yet): never counts toward a nudge. */
  baselineWeek: boolean;
  meets: boolean;
  ewma: number | null;
  ewmaLimit: number;
  cusum: number | null;
  cusumSignal: boolean;
  /** Theil-Sen slope of call-level D over the trend window (D per week). */
  slopePerWeek: number | null;
  mkP: number | null;
  repeatsSum: number;
  repeatsCard: boolean;
  wellbeingCard: boolean;
  /** Dashboard-only "watching" state; never messages family. */
  watch: boolean;
  /** Cognitive check-up nudge fired this week (the only family message). */
  nudge: boolean;
  /** The nudge rule held but a mood flag routed it to the wellbeing card instead. */
  routedToWellbeing: boolean;
  /** Weeks meeting the threshold within the persistence window. */
  meetsInWindow: number;
}

export interface DriftIndexResult {
  baseline: IndexBaseline | null;
  calls: CallScore[];
  weeks: WeekState[];
}

const clip = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
const weekOf = (day: number) => Math.floor(day / DAYS_PER_WEEK);

function weightedComposite(z: Partial<Record<MarkerKey, number>>, weights: Partial<Record<MarkerKey, number>>): number {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights) as [MarkerKey, number][]) {
    const v = z[k];
    if (v === undefined) continue;
    num += w * v;
    den += w;
  }
  return den > 0 ? num / den : NaN;
}

function scoreMarkers(
  values: IndexCall['values'],
  markers: IndexBaseline['markers'],
  opts: DriftIndexOptions,
): Partial<Record<MarkerKey, number>> {
  const z: Partial<Record<MarkerKey, number>> = {};
  for (const [k, b] of Object.entries(markers) as [MarkerKey, { median: number; scale: number }][]) {
    const v = values[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const sign = markerMeta(k).concern === 'up' ? 1 : -1;
    z[k] = clip((sign * (v - b.median)) / b.scale, opts.zClip);
  }
  return z;
}

/**
 * Baseline: adequate calls after skipping the first `skipFirst`, the next `baselineN`. A marker
 * enters the composite only if at least half the baseline calls have it. Null until enough calls.
 */
export function buildIndexBaseline(calls: IndexCall[], opts: DriftIndexOptions = DEFAULT_DRIFT_INDEX_OPTIONS): IndexBaseline | null {
  const adequate = [...calls].filter((c) => c.adequate).sort((a, b) => a.day - b.day);
  const picked = adequate.slice(opts.skipFirst, opts.skipFirst + opts.baselineN);
  if (picked.length < opts.baselineN) return null;
  const markers: IndexBaseline['markers'] = {};
  for (const k of Object.keys(opts.weights) as MarkerKey[]) {
    const vals = picked.map((c) => c.values[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length < Math.ceil(picked.length / 2)) continue;
    markers[k] = { median: median(vals), scale: Math.max(MAD_SCALE * mad(vals), opts.floors[k] ?? 1e-6) };
  }
  if (Object.keys(markers).length === 0) return null;
  const cs = picked.map((c) => weightedComposite(scoreMarkers(c.values, markers, opts), opts.weights)).filter(Number.isFinite);
  const cMean = cs.reduce((s, v) => s + v, 0) / cs.length;
  const cVar = cs.length > 1 ? cs.reduce((s, v) => s + (v - cMean) ** 2, 0) / (cs.length - 1) : 0;
  return {
    callIds: picked.map((c) => c.callId),
    endDay: picked[picked.length - 1].day,
    markers,
    cMean,
    cSd: Math.max(Math.sqrt(cVar), opts.sdFloor),
  };
}

/** Theil-Sen slope: median of pairwise slopes. Null with fewer than 2 distinct x. */
export function theilSen(xs: number[], ys: number[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    }
  }
  return slopes.length > 0 ? median(slopes) : null;
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * Mann-Kendall trend test on a series in time order. Returns S and the one-sided p-value for an
 * upward trend (normal approximation with continuity correction, no tie correction). p = 1 for n < 4.
 */
export function mannKendall(ys: number[]): { s: number; pUp: number } {
  const n = ys.length;
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i]);
  if (n < 4) return { s, pUp: 1 };
  const variance = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return { s, pUp: 1 - normalCdf(z) };
}

/** Score every call and evaluate each week in order (cooldown makes the weeks sequential). */
export function runDriftIndex(calls: IndexCall[], opts: DriftIndexOptions = DEFAULT_DRIFT_INDEX_OPTIONS): DriftIndexResult {
  const sorted = [...calls].sort((a, b) => a.day - b.day);
  const baseline = buildIndexBaseline(sorted, opts);
  const scores: CallScore[] = [];
  if (baseline) {
    const inBase = new Set(baseline.callIds);
    let e = 0;
    let s = 0;
    for (const c of sorted) {
      if (!c.adequate) continue;
      const z = scoreMarkers(c.values, baseline.markers, opts);
      const comp = weightedComposite(z, opts.weights);
      if (!Number.isFinite(comp)) continue;
      const d = (comp - baseline.cMean) / baseline.cSd;
      const monitoring = c.day > baseline.endDay;
      // EWMA and CUSUM start at 0 when monitoring starts; baseline calls hold them at 0.
      if (monitoring) {
        e = opts.ewmaLambda * d + (1 - opts.ewmaLambda) * e;
        s = Math.max(0, s + d - opts.cusumK);
      }
      scores.push({ callId: c.callId, day: c.day, week: weekOf(c.day), inBaseline: inBase.has(c.callId), z, c: comp, d, ewma: e, cusum: s });
    }
  }

  const lastDay = sorted.length > 0 ? sorted[sorted.length - 1].day : 0;
  const nWeeks = sorted.length > 0 ? weekOf(lastDay) + 1 : 0;
  const ewmaLimit = opts.ewmaL * Math.sqrt(opts.ewmaLambda / (2 - opts.ewmaLambda));
  const weeks: WeekState[] = [];
  let lastNudgeWeek = -Infinity;
  const moodSeries = sorted.filter((c) => c.moodLow !== null);

  for (let w = 0; w < nWeeks; w++) {
    const endDay = (w + 1) * DAYS_PER_WEEK;
    const wkScores = scores.filter((sc) => sc.week === w);
    // The week holding the last baseline call is still a baseline week.
    const baselineWeek = !baseline || w <= weekOf(baseline.endDay);
    const weeklyD = wkScores.length >= opts.minCallsPerWeek ? wkScores.reduce((t, sc) => t + sc.d, 0) / wkScores.length : null;
    const meets = !baselineWeek && weeklyD !== null && weeklyD >= opts.weeklyThreshold;
    const upTo = scores.filter((sc) => sc.day < endDay);
    const last = upTo.length > 0 ? upTo[upTo.length - 1] : null;
    const ewma = baseline && last ? last.ewma : null;
    const cusum = baseline && last ? last.cusum : null;

    const trend = scores.filter((sc) => sc.day < endDay && sc.day >= endDay - opts.trendDays);
    const slope = theilSen(trend.map((sc) => sc.day), trend.map((sc) => sc.d));
    const mkP = trend.length > 0 ? mannKendall(trend.map((sc) => sc.d)).pUp : null;

    const repeatsSum = sorted
      .filter((c) => c.adequate && weekOf(c.day) === w)
      .reduce((t, c) => t + (c.repeats ?? 0), 0);
    const moodUpTo = moodSeries.filter((c) => c.day < endDay).slice(-opts.moodWindow);
    const wellbeingCard = moodUpTo.filter((c) => c.moodLow).length >= opts.moodLowMin;

    const prev = weeks.slice(-(opts.persistWindow - 1));
    const meetsInWindow = prev.filter((x) => x.meets).length + (meets ? 1 : 0);
    const recentRepeats = [...weeks.slice(-(opts.repeatsWeeks - 1)).map((x) => x.repeatsSum), repeatsSum];
    const repeatsCard = recentRepeats.length >= opts.repeatsWeeks && recentRepeats.every((r) => r >= opts.repeatsWeekly);
    const watchRun = [...weeks.slice(-(opts.watchWeeks - 1)).map((x) => x.weeklyD), weeklyD];
    const watchByWeeks = !baselineWeek && watchRun.length >= opts.watchWeeks && watchRun.every((x) => x !== null && x >= opts.watchThreshold);
    const watch = watchByWeeks || (!baselineWeek && ewma !== null && ewma > ewmaLimit);
    // Mood flagged now or in the persistence window → a cognitive message is not sent.
    const moodFlag = wellbeingCard || weeks.slice(-(opts.persistWindow - 1)).some((x) => x.wellbeingCard);

    // Persistence (≥ persistNeeded of persistWindow weeks), with the repeats card as a tie-breaker
    // one week short, plus an upward trend on call-level D.
    const persistent = meetsInWindow >= opts.persistNeeded || (repeatsCard && meetsInWindow >= opts.persistNeeded - 1);
    const trending = slope !== null && slope > 0 && mkP !== null && mkP < opts.mkAlpha;
    const cooled = w - lastNudgeWeek >= opts.cooldownWeeks;
    const ruleHolds = !baselineWeek && persistent && trending && cooled;
    const nudge = ruleHolds && !moodFlag;
    if (nudge) lastNudgeWeek = w;

    weeks.push({
      week: w,
      calls: wkScores.length,
      weeklyD,
      baselineWeek,
      meets,
      ewma,
      ewmaLimit,
      cusum,
      cusumSignal: cusum !== null && cusum > opts.cusumH,
      slopePerWeek: slope === null ? null : slope * DAYS_PER_WEEK,
      mkP,
      repeatsSum,
      repeatsCard,
      wellbeingCard,
      watch,
      nudge,
      routedToWellbeing: ruleHolds && moodFlag,
      meetsInWindow,
    });
  }
  return { baseline, calls: scores, weeks };
}
