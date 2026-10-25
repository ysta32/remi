// Turns the eight backend markers into the four signals families see (spec: "How he's doing").
// Pure: no I/O, safe in client components.
import { DRIFT_Z, MAD_SCALE, REPEAT_WEEKLY_MIN } from './analysis/config';
import { isoWeekKey } from './analysis/weeks';
import type { MarkerKey, MarkerSeries } from './types';

export type SignalKey = 'pauses' | 'pace' | 'vague' | 'retold';
export type SignalStatus = 'usual' | 'different' | 'retold' | 'learning' | 'not_analyzed';

export interface SignalPoint {
  callId: string;
  at: string;
  value: number | null;
  confidence: 'high' | 'low' | 'na';
  isSimulated: boolean;
}

export interface Signal {
  key: SignalKey;
  title: string;
  explainer: string;
  unit: 'z' | 'wpm' | 'per100w' | 'count';
  band: [number, number] | null;
  points: SignalPoint[];
  status: SignalStatus;
}

export const STATUS_TEXT: Record<SignalStatus, string> = {
  usual: 'About his usual',
  different: 'Different from his usual lately',
  retold: 'Retold a few stories this week',
  learning: 'Still learning his usual',
  not_analyzed: 'Not analyzed yet',
};

// Plain words for a combined "change from usual" reading; same threshold as the status pill.
export function zWords(z: number): string {
  if (z >= DRIFT_Z) return 'More than his usual';
  if (z <= -DRIFT_Z) return 'Less than his usual';
  return 'Near his usual';
}

const COPY: Record<SignalKey, { title: string; explainer: string }> = {
  pauses: { title: 'Pauses & hesitation', explainer: 'Stopping mid-thought, or saying "um" while he searches for a word.' },
  pace: { title: 'Speaking pace', explainer: "How quickly he talks while he's speaking." },
  vague: { title: 'Vague words', explainer: 'Words like "thing" or "stuff" in place of a specific word.' },
  retold: { title: 'Retold stories', explainer: 'Stories he brought up himself that he also told in another chat that week.' },
};

const PAUSE_KEYS: MarkerKey[] = ['pause_rate', 'mean_pause_ms', 'wfp_rate', 'filler_rate'];
const STATUS_WINDOW = 3;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Last three good calls decide; fewer than three means we can't say yet.
function statusFromZ(scored: { z: number | null; confidence: SignalPoint['confidence'] }[]): SignalStatus {
  const good = scored.filter((p) => p.confidence === 'high' && p.z !== null).slice(-STATUS_WINDOW);
  if (good.length < STATUS_WINDOW) return 'learning';
  return median(good.map((p) => p.z as number)) >= DRIFT_Z ? 'different' : 'usual';
}

const byTime = <T extends { at: string }>(a: T, b: T) => a.at.localeCompare(b.at);

function rawSignal(key: 'pace' | 'vague', series: MarkerSeries | undefined, unit: Signal['unit']): Signal {
  const src = series ? [...series.points].sort(byTime) : [];
  const b = series?.baseline;
  return {
    key, ...COPY[key], unit,
    band: b ? [b.median - MAD_SCALE * b.mad, b.median + MAD_SCALE * b.mad] : null,
    points: src.map(({ callId, at, value, confidence, isSimulated }) => ({ callId, at, value, confidence, isSimulated })),
    status: statusFromZ(src),
  };
}

function pausesSignal(series: MarkerSeries[]): Signal {
  const calls = new Map<string, SignalPoint & { zs: number[]; anyLow: boolean }>();
  for (const s of series) {
    for (const p of s.points) {
      const c = calls.get(p.callId) ?? { callId: p.callId, at: p.at, value: null, confidence: 'na', isSimulated: false, zs: [], anyLow: false };
      c.isSimulated ||= p.isSimulated;
      if (p.z !== null && p.confidence !== 'na') {
        c.zs.push(p.z);
        c.anyLow ||= p.confidence === 'low';
      }
      calls.set(p.callId, c);
    }
  }
  const points: SignalPoint[] = [...calls.values()].sort(byTime).map(({ zs, anyLow, ...p }) => ({
    ...p,
    value: zs.length ? median(zs) : null,
    confidence: zs.length === 0 ? 'na' : anyLow ? 'low' : 'high',
  }));
  return {
    key: 'pauses', ...COPY.pauses, unit: 'z', band: [-1, 1], points,
    status: statusFromZ(points.map((p) => ({ z: p.value, confidence: p.confidence }))),
  };
}

function retoldSignal(series: MarkerSeries | undefined, timeZone: string, latestAt: string | undefined): Signal {
  const src = series ? [...series.points].sort(byTime) : [];
  const points = src.map(({ callId, at, value, confidence, isSimulated }) => ({ callId, at, value, confidence, isSimulated }));
  let status: SignalStatus = 'not_analyzed';
  if (latestAt) {
    const week = isoWeekKey(latestAt, timeZone);
    const latestWeek = points.filter((p) => isoWeekKey(p.at, timeZone) === week);
    // Missing analysis is unknown, even when another call in the week has a count.
    if (latestWeek.length && latestWeek.every((p) => p.value !== null && p.confidence !== 'na')) {
      const sum = latestWeek.reduce((n, p) => n + p.value!, 0);
      status = sum >= REPEAT_WEEKLY_MIN ? 'retold' : 'usual';
    }
  }
  return { key: 'retold', ...COPY.retold, unit: 'count', band: null, points, status };
}

export function buildSignals(markers: MarkerSeries[], timeZone = 'America/New_York'): Signal[] {
  const get = (k: MarkerKey) => markers.find((m) => m.key === k);
  const latestAt = markers.flatMap((m) => m.points).sort(byTime).at(-1)?.at;
  return [
    pausesSignal(PAUSE_KEYS.flatMap((k) => get(k) ?? [])),
    rawSignal('pace', get('speech_rate'), 'wpm'),
    rawSignal('vague', get('vague_rate'), 'per100w'),
    retoldSignal(get('repeat_stories'), timeZone, latestAt),
  ];
}
