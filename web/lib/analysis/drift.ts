// Weekly drift and nudge rules (markers.md §8, SPEC §11). Pure. [HEURISTIC] thresholds from config.ts;
// a nudge only suggests a conversation with family or a doctor, never a conclusion.
import { GROUP_PLAIN_LANGUAGE, markerMeta, MARKER_KEYS } from '../markers/meta';
import type { MarkerGroup, MarkerKey, NudgeReason } from '../types';
import {
  DRIFT_GROUPS_MIN,
  DRIFT_WEEKS,
  DRIFT_Z,
  MIN_ADEQUATE_CALLS_PER_WEEK,
  MIN_CALLS_FOR_NUDGE,
  MOOD_LOW_MIN,
  MOOD_WINDOW,
  REPEAT_WEEKLY_MIN,
} from './config';
import { median } from './stats';

export const GROUP_ORDER: MarkerGroup[] = ['pace', 'pauses', 'words', 'repetition'];
const Z_MARKERS: MarkerKey[] = MARKER_KEYS.filter((k) => k !== 'repeat_stories');

export interface DriftCall {
  callId: string;
  isoWeek: string;
  /** Adequate = enough caller speech for high-confidence markers. Inadequate calls are ignored. */
  adequate: boolean;
  /** Stored signed z per marker (positive = concerning); null/absent when not available. */
  z: Partial<Record<MarkerKey, number | null>>;
  /** repeat_stories value for the call (null when not available). */
  repeatStories: number | null;
}

export interface WeekEval {
  isoWeek: string;
  adequateCalls: number;
  /** false when the week has fewer than MIN_ADEQUATE_CALLS_PER_WEEK adequate calls (skipped: no drift, no reset). */
  evaluated: boolean;
  weekZ: Partial<Record<MarkerKey, number>>;
  repeatSum: number;
  driftingGroups: MarkerGroup[];
}

/** Per ISO week (ascending): median z per marker over adequate calls, and which groups drift. */
export function weeklyDrift(calls: DriftCall[]): WeekEval[] {
  const byWeek = new Map<string, DriftCall[]>();
  for (const c of calls) {
    if (!c.adequate) continue;
    const list = byWeek.get(c.isoWeek) ?? [];
    list.push(c);
    byWeek.set(c.isoWeek, list);
  }
  return [...byWeek.keys()].sort().map((isoWeek) => {
    const wk = byWeek.get(isoWeek)!;
    const evaluated = wk.length >= MIN_ADEQUATE_CALLS_PER_WEEK;
    const weekZ: Partial<Record<MarkerKey, number>> = {};
    for (const k of Z_MARKERS) {
      const zs = wk.map((c) => c.z[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (zs.length > 0) weekZ[k] = median(zs);
    }
    const repeatSum = wk.reduce((s, c) => s + (c.repeatStories ?? 0), 0);
    const drifting = new Set<MarkerGroup>();
    if (evaluated) {
      for (const k of Z_MARKERS) {
        const z = weekZ[k];
        if (z !== undefined && z >= DRIFT_Z) drifting.add(markerMeta(k).group);
      }
      if (repeatSum >= REPEAT_WEEKLY_MIN) drifting.add('repetition');
    }
    return {
      isoWeek,
      adequateCalls: wk.length,
      evaluated,
      weekZ,
      repeatSum,
      driftingGroups: GROUP_ORDER.filter((g) => drifting.has(g)),
    };
  });
}

/**
 * Check-up rule: the most recent DRIFT_WEEKS evaluated weeks (skipped weeks are transparent) each have
 * ≥ DRIFT_GROUPS_MIN drifting groups, ≥ MIN_CALLS_FOR_NUDGE adequate calls on record, and speechTrends consent.
 * Returns the NudgeReason when the rule holds, else null.
 */
export function checkupNudge(input: {
  weeks: WeekEval[];
  adequateCallCount: number;
  speechTrends: boolean;
}): NudgeReason | null {
  if (!input.speechTrends || input.adequateCallCount < MIN_CALLS_FOR_NUDGE) return null;
  const recent = input.weeks.filter((w) => w.evaluated).slice(-DRIFT_WEEKS);
  if (recent.length < DRIFT_WEEKS) return null;
  if (!recent.every((w) => w.driftingGroups.length >= DRIFT_GROUPS_MIN)) return null;
  const union = new Set(recent.flatMap((w) => w.driftingGroups));
  return {
    weeks: recent.map((w) => ({ isoWeek: w.isoWeek, driftingGroups: [...w.driftingGroups], markerZ: { ...w.weekZ } })),
    plainLanguage: GROUP_ORDER.filter((g) => union.has(g)).map((g) => GROUP_PLAIN_LANGUAGE[g]),
  };
}

/** Wellbeing rule: mood 'low' on ≥ MOOD_LOW_MIN of the last MOOD_WINDOW calls (chronological input), with mood consent. */
export function wellbeingNudge(input: { moods: (string | null)[]; mood: boolean }): NudgeReason | null {
  if (!input.mood) return null;
  const low = input.moods.slice(-MOOD_WINDOW).filter((m) => m === 'low').length;
  return low >= MOOD_LOW_MIN ? { weeks: [], plainLanguage: [] } : null;
}
