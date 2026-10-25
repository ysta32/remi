// Monte Carlo check of the nudge rules on SIMULATED personas (marker-level generative model, no
// transcripts). Compares the Drift Index persistence rule (lib/analysis/drift-index.ts) with the
// current SPEC §11 rule (lib/analysis/drift.ts) and a naive "alert on any unusual call" rule.
// Every number this prints is "on simulated data"; the noise model is derived from published
// reliability figures plus [HEURISTIC] choices, not from real FaceTime calls.
//   cd web && npx tsx scripts/sim-personas.ts [--seeds 200] [--out ../synthetic/reports]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { markerMeta } from '../lib/markers/meta';
import { ABS_SPREAD_FLOOR, BASELINE_N, MIN_SCALE, NUDGE_REFIRE_DAYS } from '../lib/analysis/config';
import { buildBaseline, signedZ, type Baseline } from '../lib/analysis/stats';
import { checkupNudge, weeklyDrift, wellbeingNudge, type DriftCall } from '../lib/analysis/drift';
import {
  buildIndexBaseline,
  DEFAULT_DRIFT_INDEX_OPTIONS,
  runDriftIndex,
  type DriftIndexOptions,
  type IndexCall,
} from '../lib/analysis/drift-index';
import type { MarkerKey } from '../lib/types';

// ---------- RNG ----------------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const normal = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function poisson(r: Rng, lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

// ---------- Persona model ------------------------------------------------------------------------
// μ, call-level σ (at 300 caller words) and the total change by week 8 for the drift persona.
// Sources: speech rate Hamrick 2023 (σ via SEM = SD·√(1−ICC)); pauses Pistono et al.; others [HEURISTIC].
const MARKERS: { key: MarkerKey; mu: number; sigma: number; drift: number }[] = [
  { key: 'speech_rate', mu: 140, sigma: 9, drift: -20 },
  { key: 'mean_pause_ms', mu: 650, sigma: 80, drift: 200 },
  { key: 'pause_rate', mu: 12, sigma: 2, drift: 5 },
  { key: 'wfp_rate', mu: 1.0, sigma: 0.5, drift: 1.5 },
  { key: 'filler_rate', mu: 4.0, sigma: 1.2, drift: 2.5 },
  { key: 'mattr', mu: 0.72, sigma: 0.02, drift: -0.04 },
  { key: 'vague_rate', mu: 1.5, sigma: 0.8, drift: 1.0 },
];
const PAUSE_KEYS: MarkerKey[] = ['pause_rate', 'mean_pause_ms', 'wfp_rate'];
const MOOD = { mu: 0.6, sigma: 0.1, lowBelow: 0.4 };
const SCHEDULE_DAYS = [0, 2, 4, 5]; // ~4 calls/week
const MISS_P = 0.15;
const OUTLIER_P = 0.05;
const WEEK_SHOCK = 0.4; // × σ
const WORDS = { mean: 500, sd: 150, min: 60, max: 1200, adequate: 100 };
const DRIFT_ONSET_DAY = 14; // drift starts in week 3
const DRIFT_FULL_DAY = 56; // full change reached by the end of week 8
const REPEATS_BASE = 0.3; // per 7 days
const REPEATS_DRIFT = 3;

type Persona = 'drift' | 'stable' | 'mood';
interface SimCall extends IndexCall { week: number; mood: number }

function simulate(persona: Persona, seed: number, weeks: number): SimCall[] {
  const r = mulberry32(seed * 7919 + (persona === 'drift' ? 1 : persona === 'stable' ? 2 : 3));
  // Markers don't all start moving together: each gets an onset 0–7 days after the drift onset.
  const onset = new Map(MARKERS.map((m) => [m.key, DRIFT_ONSET_DAY + 7 * r()]));
  const repeatOnset = DRIFT_ONSET_DAY + 7 * r();
  // Stable persona: colds (+1σ on pauses for one week) — one per 8 weeks of simulated time.
  const coldWeeks = new Set<number>();
  if (persona === 'stable') for (let i = 0; i < Math.max(1, Math.round(weeks / 8)); i++) coldWeeks.add(2 + Math.floor(r() * (weeks - 2)));
  const ramp = (day: number, start: number) => Math.max(0, Math.min(1, (day - start) / (DRIFT_FULL_DAY - start)));
  // Mood dip: weeks 4–5 full, week 6 half (recovering).
  const moodDip = (w: number) => (persona !== 'mood' ? 0 : w === 3 || w === 4 ? 1 : w === 5 ? 0.5 : 0);

  const out: SimCall[] = [];
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    const shared = normal(r);
    const shock = new Map(MARKERS.map((m) => {
      const dir = markerMeta(m.key).concern === 'up' ? 1 : -1;
      return [m.key, WEEK_SHOCK * m.sigma * (0.6 * shared * dir + 0.8 * normal(r))];
    }));
    for (const off of SCHEDULE_DAYS) {
      if (r() < MISS_P) continue;
      const day = w * 7 + off + r() * 0.2;
      n++;
      let words = WORDS.mean + WORDS.sd * normal(r);
      if (n <= 2) words -= 0.5 * WORDS.sd; // familiarity: fewer words on the first calls
      words = Math.max(WORDS.min, Math.min(WORDS.max, words));
      const g = Math.sqrt(300 / words);
      const values: Partial<Record<MarkerKey, number>> = {};
      for (const m of MARKERS) {
        const dir = markerMeta(m.key).concern === 'up' ? 1 : -1;
        let x = m.mu + shock.get(m.key)! + m.sigma * g * normal(r);
        if (persona === 'drift') x += m.drift * ramp(day, onset.get(m.key)!);
        if (coldWeeks.has(w) && PAUSE_KEYS.includes(m.key)) x += m.sigma;
        const dip = moodDip(w);
        if (dip > 0 && (m.key === 'speech_rate' || m.key === 'pause_rate' || m.key === 'mean_pause_ms')) x += dir * 0.8 * m.sigma * dip;
        if (r() < OUTLIER_P) x += (r() < 0.5 ? -1 : 1) * 2.5 * m.sigma;
        values[m.key] = Math.max(0, x);
      }
      const lambda = REPEATS_BASE + (persona === 'drift' ? (REPEATS_DRIFT - REPEATS_BASE) * ramp(day, repeatOnset) : 0);
      const mood = MOOD.mu + MOOD.sigma * normal(r) - 3 * MOOD.sigma * moodDip(w);
      out.push({
        callId: `${persona}-${seed}-${n}`, day, week: w, adequate: words >= WORDS.adequate, values,
        repeats: poisson(r, lambda / SCHEDULE_DAYS.length), moodLow: mood < MOOD.lowBelow, mood,
      });
    }
  }
  return out;
}

// ---------- Rules --------------------------------------------------------------------------------
interface RuleRun { alertWeeks: number[]; watchWeeks?: number; monitoringWeeks?: number; wellbeingWeeks?: number[]; routedWeeks?: number[] }

function driftIndexRule(calls: SimCall[], opts: DriftIndexOptions = DEFAULT_DRIFT_INDEX_OPTIONS): RuleRun {
  const res = runDriftIndex(calls, opts);
  const mon = res.weeks.filter((w) => !w.baselineWeek);
  return {
    alertWeeks: res.weeks.filter((w) => w.nudge).map((w) => w.week),
    watchWeeks: mon.filter((w) => w.watch).length,
    monitoringWeeks: mon.length,
    wellbeingWeeks: res.weeks.filter((w) => w.wellbeingCard).map((w) => w.week),
    routedWeeks: res.weeks.filter((w) => w.routedToWellbeing).map((w) => w.week),
  };
}

/** SPEC §11 as recompute.ts runs it, evaluated at each week end; family dismisses at once, refire after 14 days. */
function currentRule(calls: SimCall[], weeks: number): RuleRun {
  const keys = MARKERS.map((m) => m.key);
  const adequate = calls.filter((c) => c.adequate);
  const baselines = new Map<MarkerKey, Baseline>();
  const base = adequate.slice(0, BASELINE_N);
  if (base.length === BASELINE_N) for (const k of keys) baselines.set(k, buildBaseline(base.map((c) => c.values[k] as number)));
  const driftCalls: DriftCall[] = calls.map((c) => ({
    callId: c.callId,
    isoWeek: `W${String(c.week).padStart(3, '0')}`,
    adequate: c.adequate,
    z: Object.fromEntries(keys.map((k) => {
      const b = baselines.get(k);
      return [k, b ? signedZ(c.values[k] as number, b, markerMeta(k).concern, ABS_SPREAD_FLOOR[k] ?? MIN_SCALE) : null];
    })),
    repeatStories: c.repeats,
  }));
  const alertWeeks: number[] = [];
  const wellbeingWeeks: number[] = [];
  const refireWeeks = NUDGE_REFIRE_DAYS / 7;
  let last = -Infinity;
  let lastWb = -Infinity;
  for (let w = 0; w < weeks; w++) {
    const upTo = driftCalls.filter((_, i) => calls[i].week <= w);
    const adequateSoFar = calls.filter((c) => c.week <= w && c.adequate).length;
    // Baseline only exists once BASELINE_N adequate calls are on record.
    const baselineReady = adequate.length >= BASELINE_N && adequate[BASELINE_N - 1].week <= w;
    const reason = baselineReady ? checkupNudge({ weeks: weeklyDrift(upTo), adequateCallCount: adequateSoFar, speechTrends: true }) : null;
    if (reason && w - last >= refireWeeks) { alertWeeks.push(w); last = w; }
    const wb = wellbeingNudge({ moods: calls.filter((c) => c.week <= w).map((c) => (c.moodLow ? 'low' : 'ok')), mood: true });
    if (wb && w - lastWb >= refireWeeks) { wellbeingWeeks.push(w); lastWb = w; }
  }
  return { alertWeeks, wellbeingWeeks };
}

/** Naive: alert on any monitored call with any marker ≥ 2 robust SDs in the concerning direction. */
function naiveRule(calls: SimCall[]): RuleRun {
  const b = buildIndexBaseline(calls);
  if (!b) return { alertWeeks: [] };
  const alertWeeks: number[] = [];
  for (const c of calls) {
    if (!c.adequate || c.day <= b.endDay) continue;
    const hit = Object.entries(b.markers).some(([k, m]) => {
      const dir = markerMeta(k as MarkerKey).concern === 'up' ? 1 : -1;
      return (dir * ((c.values[k as MarkerKey] as number) - m!.median)) / m!.scale >= 2;
    });
    if (hit) alertWeeks.push(c.week);
  }
  return { alertWeeks };
}

// ---------- Evaluation ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const SEEDS = Number(args.includes('--seeds') ? args[args.indexOf('--seeds') + 1] : 200);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : join('..', 'synthetic', 'reports');
const SHORT = 8;
const LONG = 52;
const ONSET_WEEK = 2; // 0-based: drift begins in week 3

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};
const pct = (k: number, n: number) => (100 * k) / n;

type RuleName = 'driftIndex' | 'current' | 'naive';
const RULES: Record<RuleName, (c: SimCall[], weeks: number) => RuleRun> = {
  driftIndex: (c) => driftIndexRule(c),
  current: currentRule,
  naive: (c) => naiveRule(c),
};

const results: Record<RuleName, Record<string, number | string>> = { driftIndex: {}, current: {}, naive: {} };
const t0 = Date.now();
for (const name of Object.keys(RULES) as RuleName[]) {
  const rule = RULES[name];
  const delays: number[] = [];
  let detected = 0;
  let stableAny8 = 0;
  let stableAlerts52 = 0;
  let stableWatch = 0;
  let stableMon = 0;
  let moodCog = 0;
  let moodWb = 0;
  let moodRouted = 0;
  let stableWb52 = 0;
  for (let s = 0; s < SEEDS; s++) {
    const d = rule(simulate('drift', s, SHORT), SHORT);
    const first = d.alertWeeks.find((w) => w >= ONSET_WEEK);
    if (d.alertWeeks.length > 0) detected++;
    if (first !== undefined) delays.push(first + 1 - ONSET_WEEK); // weeks of drift seen when it fired

    if (rule(simulate('stable', s, SHORT), SHORT).alertWeeks.length > 0) stableAny8++;
    const st = rule(simulate('stable', s + 100000, LONG), LONG);
    stableAlerts52 += st.alertWeeks.length;
    stableWb52 += st.wellbeingWeeks?.length ?? 0;
    stableWatch += st.watchWeeks ?? 0;
    stableMon += st.monitoringWeeks ?? 0;

    const m = rule(simulate('mood', s, SHORT), SHORT);
    if (m.alertWeeks.length > 0) moodCog++;
    if ((m.wellbeingWeeks?.length ?? 0) > 0) moodWb++;
    if ((m.routedWeeks?.length ?? 0) > 0) moodRouted++;
  }
  results[name] = {
    driftDetectionPct: pct(detected, SEEDS),
    driftDelayMedianWeeks: quantile(delays, 0.5),
    driftDelayIqr: `${quantile(delays, 0.25)}–${quantile(delays, 0.75)}`,
    stableAnyAlert8wPct: pct(stableAny8, SEEDS),
    stableAlertsPerPersonaYear: stableAlerts52 / SEEDS,
    stableWatchWeeksPct: stableMon > 0 ? pct(stableWatch, stableMon) : NaN,
    stableWellbeingPerYear: name === 'naive' ? NaN : stableWb52 / SEEDS,
    moodCognitiveAlertPct: pct(moodCog, SEEDS),
    moodWellbeingCardPct: name === 'naive' ? NaN : pct(moodWb, SEEDS),
    moodRoutedToWellbeingPct: name === 'driftIndex' ? pct(moodRouted, SEEDS) : NaN,
  };
}

// Sensitivity sweep of the Drift Index rule: each row changes one or two [HEURISTIC] settings.
const SWEEP: { name: string; opts: Partial<DriftIndexOptions> }[] = [
  { name: 'default (8-call baseline, skip 2, ≥1.5 in 3 of 4)', opts: {} },
  { name: 'threshold 1.25', opts: { weeklyThreshold: 1.25 } },
  { name: 'threshold 2.0', opts: { weeklyThreshold: 2.0 } },
  { name: '2 of 4 weeks', opts: { persistNeeded: 2 } },
  { name: '2 of 3 weeks', opts: { persistWindow: 3, persistNeeded: 2 } },
  { name: '6-call baseline', opts: { baselineN: 6 } },
  { name: '12-call baseline', opts: { baselineN: 12 } },
  { name: 'no trend requirement', opts: { mkAlpha: 1.01 } },
  { name: '6-call baseline, 2 of 3 weeks, threshold 1.75', opts: { baselineN: 6, persistWindow: 3, persistNeeded: 2, weeklyThreshold: 1.75 } },
];
const sweep = SWEEP.map(({ name, opts }) => {
  const o = { ...DEFAULT_DRIFT_INDEX_OPTIONS, ...opts };
  const delays: number[] = [];
  let detected = 0;
  let stable52 = 0;
  let moodCog = 0;
  for (let s = 0; s < SEEDS; s++) {
    const d = driftIndexRule(simulate('drift', s, SHORT), o);
    if (d.alertWeeks.length > 0) detected++;
    const first = d.alertWeeks.find((w) => w >= ONSET_WEEK);
    if (first !== undefined) delays.push(first + 1 - ONSET_WEEK);
    stable52 += driftIndexRule(simulate('stable', s + 100000, LONG), o).alertWeeks.length;
    if (driftIndexRule(simulate('mood', s, SHORT), o).alertWeeks.length > 0) moodCog++;
  }
  return { name, detectedPct: pct(detected, SEEDS), delayMedian: quantile(delays, 0.5), stableAlertsPerYear: stable52 / SEEDS, moodCognitivePct: pct(moodCog, SEEDS) };
});

// One drift example for a chart: weekly D, EWMA and the rule state.
const example = runDriftIndex(simulate('drift', 0, SHORT));

const f = (v: number | string, d = 1) => (typeof v === 'string' ? v : Number.isFinite(v) ? v.toFixed(d) : '—');
const label: Record<RuleName, string> = {
  driftIndex: 'Drift Index: weekly D ≥ 1.5 in 3 of 4 weeks + upward trend (new)',
  current: 'SPEC §11: ≥ 2 groups at weekly z ≥ 1.5, 2 weeks in a row (current)',
  naive: 'Naive: any call with a marker ≥ 2 SD (alerts counted per call)',
};
const md = [
  `# Nudge rules on simulated personas`,
  ``,
  `**SIMULATED DATA.** Marker-level generative model (web/scripts/sim-personas.ts), ${SEEDS} seeds per persona, about 4 calls a week with 15% missed.`,
  `Drift persona: changes ramp from week 3 to week 8. Stable persona: no drift, plus one "cold" week per 8 weeks. Mood-dip persona: low mood in weeks 4–5.`,
  `These are design checks of the rules, not measured performance on real people. Real decline unfolds over months.`,
  ``,
  `| Rule | Drift: detected by wk 8 | Drift: median delay (IQR), weeks from onset | Stable: any alert in 8 wk | Stable: alerts / persona-year | Stable: % weeks watching | Mood dip: cognitive alert | Mood dip: wellbeing card |`,
  `|---|---|---|---|---|---|---|---|`,
  ...(Object.keys(results) as RuleName[]).map((k) => {
    const r = results[k];
    return `| ${label[k]} | ${f(r.driftDetectionPct)}% | ${f(r.driftDelayMedianWeeks)} (${r.driftDelayIqr}) | ${f(r.stableAnyAlert8wPct)}% | ${f(r.stableAlertsPerPersonaYear, 2)} | ${f(r.stableWatchWeeksPct)}% | ${f(r.moodCognitiveAlertPct)}% | ${f(r.moodWellbeingCardPct)}% |`;
  }),
  ``,
  `Mood dip, Drift Index: the cognitive rule held but was routed to the wellbeing card in ${f(results.driftIndex.moodRoutedToWellbeingPct)}% of seeds.`,
  `Stable 52-week runs, wellbeing cards per persona-year: Drift Index ${f(results.driftIndex.stableWellbeingPerYear, 2)}, SPEC §11 ${f(results.current.stableWellbeingPerYear, 2)}.`,
  ``,
  `Targets from the research brief (heuristic): detection ≥ 90%, median delay ≤ 4 weeks after onset, stable ≤ 0.1 false nudges / persona-year, mood dip ≈ 0% cognitive and ≥ 80% wellbeing card.`,
  ``,
  `Sensitivity of the Drift Index rule (same seeds):`,
  ``,
  `| Setting | Drift detected by wk 8 | Median delay (weeks from onset) | Stable alerts / persona-year | Mood dip cognitive alert |`,
  `|---|---|---|---|---|`,
  ...sweep.map((r) => `| ${r.name} | ${f(r.detectedPct)}% | ${f(r.delayMedian)} | ${f(r.stableAlertsPerYear, 2)} | ${f(r.moodCognitivePct)}% |`),
  ``,
  `Example drift run (seed 0), weekly Drift Index:`,
  ``,
  `| Week | Calls | Weekly D | EWMA | Watching | Nudge |`,
  `|---|---|---|---|---|---|`,
  ...example.weeks.map((w) => `| ${w.week + 1}${w.baselineWeek ? ' (baseline)' : ''} | ${w.calls} | ${f(w.weeklyD ?? NaN, 2)} | ${f(w.ewma ?? NaN, 2)} | ${w.watch ? 'yes' : ''} | ${w.nudge ? 'NUDGE' : ''} |`),
  ``,
].join('\n');

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'drift-eval.json'), JSON.stringify({ isSimulated: true, seeds: SEEDS, results, sweep, example }, null, 2));
writeFileSync(join(OUT, 'drift-eval.md'), md);

// Compact copy for the /research page: the three rules, the sweep, and one seed-0 run per persona.
const weeksFor = (p: Persona) =>
  runDriftIndex(simulate(p, 0, SHORT)).weeks.map((w) => ({
    week: w.week + 1, calls: w.calls, weeklyD: w.weeklyD, ewma: w.ewma, baselineWeek: w.baselineWeek,
    watch: w.watch, nudge: w.nudge, wellbeingCard: w.wellbeingCard, routedToWellbeing: w.routedToWellbeing,
  }));
writeFileSync(
  join('lib', 'research', 'drift-eval.json'),
  JSON.stringify({
    isSimulated: true, seeds: SEEDS, weeks: SHORT, onsetWeek: ONSET_WEEK + 1, results, sweep,
    examples: { drift: weeksFor('drift'), stable: weeksFor('stable'), mood: weeksFor('mood') },
  }, null, 2) + '\n',
);
console.log(md);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
