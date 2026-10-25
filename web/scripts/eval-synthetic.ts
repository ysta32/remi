// Run the speech markers, the current SPEC §11 nudge rule, and the Drift Index on Ryan's
// generated corpus (synthetic/). Everything here is SIMULATED: authored transcripts with authored
// word timing, not recordings, not people, not evidence about any real person.
//   cd web && npx tsx scripts/eval-synthetic.ts [--seed 42] [--json out.json]
import { writeFileSync } from 'node:fs';
import { computeMarkers } from '../lib/markers/index';
import { MARKER_KEYS, markerMeta } from '../lib/markers/meta';
import { ABS_SPREAD_FLOOR, BASELINE_N, MIN_SCALE } from '../lib/analysis/config';
import { buildBaseline, signedZ } from '../lib/analysis/stats';
import { checkupNudge, weeklyDrift, type DriftCall } from '../lib/analysis/drift';
import { DEFAULT_DRIFT_INDEX_OPTIONS, runDriftIndex, type IndexCall } from '../lib/analysis/drift-index';
import { isoWeekKey } from '../lib/analysis/weeks';
import type { MarkerKey, Utterance } from '../lib/types';
import { generateBundle } from '../../synthetic/src/generate.mjs';

interface SynthCall { callId: string; startedAt: string; language: 'en'; utterances: Utterance[] }
interface SynthOcc { kind: 'story' | 'question'; elicitation: string; label: string; priorOccurrences: { callId: string }[] }
interface SynthBundle {
  calls: SynthCall[];
  groundTruth: { callId: string; occurrences: SynthOcc[] }[];
  timings: { callId: string; pauseCenterMs: number }[];
}

const args = process.argv.slice(2);
const seed = Number(args[args.indexOf('--seed') + 1] ?? 42);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const bundle = generateBundle(args.includes('--seed') ? { seed } : {}) as SynthBundle;
const TZ = 'America/New_York';
const DAY = 86400000;
const t0 = Date.parse(bundle.calls[0].startedAt);

// Oracle repeat_stories (as if the repetition matcher were perfect): caller-initiated stories
// (unprompted repeat) that were also told in another call within the prior 7 days.
const startedAt = new Map(bundle.calls.map((c) => [c.callId, Date.parse(c.startedAt)]));
// The generator plants every repeat exactly 14 days after its original, so also count against
// any earlier call ("all history", what the standalone detector/ does).
function oracleRepeats(callId: string, windowDays = 7): number {
  const gt = bundle.groundTruth.find((g) => g.callId === callId)!;
  const at = startedAt.get(callId)!;
  return gt.occurrences.filter(
    (o) => o.kind === 'story' && o.label === 'Unprompted repeat' &&
      o.priorOccurrences.some((p) => at - startedAt.get(p.callId)! <= windowDays * DAY),
  ).length;
}

const Z_MARKERS = MARKER_KEYS.filter((k) => k !== 'repeat_stories');
const rows = bundle.calls.map((c, i) => {
  const res = computeMarkers(c.utterances, 'en');
  const values: Partial<Record<MarkerKey, number | null>> = {};
  const conf: Partial<Record<MarkerKey, string>> = {};
  for (const r of res) { values[r.marker] = r.value; conf[r.marker] = r.confidence; }
  const callerWords = c.utterances.filter((u) => u.speaker === 'caller').reduce((s, u) => s + (u.words?.length ?? 0), 0);
  return {
    i, callId: c.callId, startedAt: c.startedAt, isoWeek: isoWeekKey(c.startedAt, TZ),
    day: (Date.parse(c.startedAt) - t0) / DAY,
    plantedPauseCenterMs: bundle.timings[i].pauseCenterMs,
    callerWords, values, conf, repeats: oracleRepeats(c.callId), repeatsAll: oracleRepeats(c.callId, Infinity),
    adequate: conf.speech_rate === 'high',
  };
});

// --- Current SPEC §11 rule (as recompute.ts does it) -------------------------------------------
const adequate = rows.filter((r) => r.adequate);
const baselines = new Map<MarkerKey, ReturnType<typeof buildBaseline>>();
for (const k of Z_MARKERS) {
  const vals = adequate.map((r) => r.values[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, BASELINE_N);
  if (vals.length === BASELINE_N) baselines.set(k, buildBaseline(vals));
}
const zRows = rows.map((r) => {
  const z: Partial<Record<MarkerKey, number | null>> = {};
  for (const k of Z_MARKERS) {
    const b = baselines.get(k);
    const v = r.values[k];
    z[k] = b && r.conf[k] === 'high' && typeof v === 'number' ? signedZ(v, b, markerMeta(k).concern, ABS_SPREAD_FLOOR[k] ?? MIN_SCALE) : null;
  }
  return z;
});
const driftCalls: DriftCall[] = rows.map((r, i) => ({ callId: r.callId, isoWeek: r.isoWeek, adequate: r.adequate, z: zRows[i], repeatStories: r.repeats }));
const weeks = weeklyDrift(driftCalls);
const currentNudge = checkupNudge({ weeks, adequateCallCount: adequate.length, speechTrends: true });
// Variant: same rule, repeats counted against all history instead of 7 days.
const weeksAll = weeklyDrift(driftCalls.map((c, i) => ({ ...c, repeatStories: rows[i].repeatsAll })));
const currentNudgeAll = checkupNudge({ weeks: weeksAll, adequateCallCount: adequate.length, speechTrends: true });

// --- Drift Index, compressed for a 4-week / 12-call corpus --------------------------------------
// [HEURISTIC] demo compression, stated plainly: baseline = week 1 (3 calls, no novelty skip),
// persistence = 2 of the last 3 weeks. The standard rule (8-call baseline, 3 of 4 weeks) cannot
// fire honestly on 4 weeks of data.
const compressed = { ...DEFAULT_DRIFT_INDEX_OPTIONS, skipFirst: 0, baselineN: 3, persistWindow: 3, persistNeeded: 2 };
const indexCalls: IndexCall[] = rows.map((r) => ({ callId: r.callId, day: r.day, adequate: r.adequate, values: r.values, repeats: r.repeatsAll, moodLow: null }));
const di = runDriftIndex(indexCalls, compressed);
const diStandard = runDriftIndex(indexCalls);

// --- Report -------------------------------------------------------------------------------------
const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
console.log(`SIMULATED corpus: synthetic/ generator, seed ${seed}, ${rows.length} calls\n`);
console.log('Per-call markers (authored timing):');
console.log(['#', 'week', 'planted', 'words', 'wpm', 'pause/100w', 'meanPause', 'wfp', 'filler', 'vague', 'mattr', 'rep7d', 'repAll', 'D'].join('\t'));
for (const r of rows) {
  const sc = di.calls.find((c) => c.callId === r.callId);
  console.log([r.i + 1, r.isoWeek, r.plantedPauseCenterMs, r.callerWords, f(r.values.speech_rate, 1), f(r.values.pause_rate), f(r.values.mean_pause_ms, 0),
    f(r.values.wfp_rate), f(r.values.filler_rate), f(r.values.vague_rate), f(r.values.mattr, 3), r.repeats, r.repeatsAll, f(sc?.d)].join('\t'));
}
console.log('\nCurrent SPEC §11 rule (baseline = first 6 adequate calls; weekly median z ≥ 1.5 per group; ≥2 groups × 2 weeks):');
for (const w of weeks) {
  console.log(`  ${w.isoWeek}: calls=${w.adequateCalls} repeats=${w.repeatSum} drifting=[${w.driftingGroups.join(', ')}] ` +
    Object.entries(w.weekZ).map(([k, z]) => `${k}=${f(z, 1)}`).join(' '));
}
console.log(`  → check-up nudge: ${currentNudge ? 'YES — ' + currentNudge.plainLanguage.join('; ') : 'no'}`);
console.log('  Variant with repeats counted against all history (not 7 days):');
for (const w of weeksAll) console.log(`    ${w.isoWeek}: repeats=${w.repeatSum} drifting=[${w.driftingGroups.join(', ')}]`);
console.log(`  → check-up nudge: ${currentNudgeAll ? 'YES — ' + currentNudgeAll.plainLanguage.join('; ') : 'no'}`);

console.log('\nDrift Index, compressed (baseline = week 1, 2 of last 3 weeks ≥ 1.5, Theil-Sen up, MK p<0.10):');
for (const w of di.weeks) {
  console.log(`  week ${w.week + 1}: n=${w.calls} weeklyD=${f(w.weeklyD)} ewma=${f(w.ewma)} (limit ${f(w.ewmaLimit)}) cusum=${f(w.cusum)} slope/wk=${f(w.slopePerWeek)} mkP=${f(w.mkP, 3)} ` +
    `meets=${w.meets} watch=${w.watch} repeatsCard=${w.repeatsCard} NUDGE=${w.nudge}${w.baselineWeek ? ' [baseline]' : ''}`);
}
console.log(`\nDrift Index, standard options (8-call baseline after skipping 2): baseline ${diStandard.baseline ? 'built' : 'NOT built (too few calls)'}; nudge=${diStandard.weeks.some((w) => w.nudge)}`);

// Compact copy for the /research page.
writeFileSync('lib/research/corpus-eval.json', JSON.stringify({
  isSimulated: true, seed, calls: rows.length,
  rows: rows.map((r) => ({
    call: r.i + 1, week: weeks.findIndex((w) => w.isoWeek === r.isoWeek) + 1, plantedPauseMs: r.plantedPauseCenterMs,
    meanPauseMs: r.values.mean_pause_ms ?? null, speechRate: r.values.speech_rate ?? null,
    d: di.calls.find((c) => c.callId === r.callId)?.d ?? null, repeats7d: r.repeats, repeatsAll: r.repeatsAll,
  })),
  currentRule: {
    nudge: currentNudge !== null, nudgeAllHistory: currentNudgeAll !== null,
    weeks: weeks.map((w, i) => ({ week: i + 1, drifting: w.driftingGroups, driftingAllHistory: weeksAll[i].driftingGroups, repeats7d: w.repeatSum, repeatsAll: weeksAll[i].repeatSum })),
  },
  driftIndex: di.weeks.map((w) => ({ week: w.week + 1, weeklyD: w.weeklyD, baselineWeek: w.baselineWeek, watch: w.watch, nudge: w.nudge, repeatsCard: w.repeatsCard })),
}, null, 2) + '\n');

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ isSimulated: true, seed, rows, currentRule: { weeks, nudge: currentNudge }, driftIndexCompressed: di, driftIndexStandard: diStandard }, null, 2));
}
