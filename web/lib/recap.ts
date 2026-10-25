// Everything the chat recap page shows, worked out from the timeline (contracts §3).
// Pure: no I/O, safe in client components.
import { DRIFT_Z } from './analysis/config';
import { formatShortDate } from './format';
import { buildSignals } from './signals';
import type { CallCard, MarkerKey, Timeline } from './types';

const TZ = 'America/New_York';

// "2026-10-09" for the day the chat happened, in the elder's timezone.
export function dayKey(iso: string, tz = TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function findCall(t: Timeline, callId: string): CallCard | null {
  return t.calls.find((c) => c.id === callId) ?? null;
}

const factsFor = (t: Timeline, call: CallCard) => t.funFacts.filter((f) => dayKey(f.at) === dayKey(call.startedAt));

export function hasHighlight(t: Timeline, call: CallCard): boolean {
  return !!call.familyQuestion?.answer || factsFor(t, call).length > 0;
}

export function recapHighlights(t: Timeline, call: CallCard) {
  const day = dayKey(call.startedAt);
  const retold = t.repeats.flatMap((r) => {
    const nth = r.dates.findIndex((d) => dayKey(d) === day) + 1;
    return nth ? [{ summary: r.summary, nth, total: r.dates.length }] : [];
  });
  return { facts: factsFor(t, call), retold };
}

export type SoundStatus = 'usual' | 'more' | 'less' | 'learning';

export interface SoundRow {
  key: 'pauses' | 'pace' | 'vague';
  title: string;
  status: SoundStatus | null;
  words: string;
  detail: string | null;
  rough: boolean;
  points: { callId: string; at: string; value: number }[];
  band: [number, number] | null;
}

const ROWS = [
  { key: 'pauses', title: 'Pauses', marker: null, more: 'More pauses than usual', less: 'Fewer pauses than usual' },
  { key: 'pace', title: 'Speaking pace', marker: 'speech_rate', unit: 'words a minute', fmt: (v: number) => String(Math.round(v)), more: 'Faster than usual', less: 'Slower than usual' },
  { key: 'vague', title: 'Vague words', marker: 'vague_rate', unit: 'per 100 words', fmt: (v: number) => v.toFixed(1), more: 'More “thing” and “stuff”', less: 'Fewer vague words' },
] as const;

const WORDS = { usual: 'About his usual', learning: 'Helping Remi learn his usual' };

export function soundRows(t: Timeline, callId: string): SoundRow[] {
  const signals = Object.fromEntries(buildSignals(t.markers).map((s) => [s.key, s]));
  const byMarker = (k: MarkerKey) => t.markers.find((m) => m.key === k);
  // The first `baseline.n` chats are the ones Remi learned his usual from.
  const pace = byMarker('speech_rate');
  const learnedFrom = new Set([...(pace?.points ?? [])]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, pace?.baseline?.n ?? 0).map((p) => p.callId));

  return ROWS.map((r) => {
    const sig = signals[r.key];
    const points = sig.points.flatMap((p) => (p.value === null ? [] : [{ callId: p.callId, at: p.at, value: p.value }]));
    const mine = sig.points.find((p) => p.callId === callId && p.value !== null);
    const base = { key: r.key, title: r.title, points, band: sig.band, rough: mine?.confidence === 'low' };
    if (!mine || mine.value === null) return { ...base, status: null, words: '', detail: null };

    let status: SoundStatus;
    if (learnedFrom.has(callId)) status = 'learning';
    else if (r.marker === null) {
      // Pauses are a combined change score: positive means more pausing than usual.
      status = mine.value >= DRIFT_Z ? 'more' : mine.value <= -DRIFT_Z ? 'less' : 'usual';
    } else {
      const series = byMarker(r.marker);
      const z = series?.points.find((p) => p.callId === callId)?.z ?? null;
      const median = series?.baseline?.median ?? mine.value;
      // z is signed toward each marker's concern, so the direction comes from the value itself.
      status = z !== null && Math.abs(z) >= DRIFT_Z ? (mine.value > median ? 'more' : 'less') : 'usual';
    }
    let detail: string | null = null;
    if (r.marker !== null) {
      const median = byMarker(r.marker)?.baseline?.median;
      detail = `${r.fmt(mine.value)} ${r.unit}${median !== undefined ? ` (usually ${r.fmt(median)})` : ''}`;
    }
    const words = status === 'more' ? r.more : status === 'less' ? r.less : WORDS[status];
    return { ...base, status, words, detail };
  });
}

export interface MonthCell { day: number | null; callId?: string; highlight?: boolean; live?: boolean }

// One month, Sunday first. If he called twice in a day, the later chat wins.
export function monthCells(t: Timeline, year: number, month: number, tz = TZ): MonthCell[] {
  const byDay = new Map<string, CallCard>();
  for (const c of oldestFirst(t)) byDay.set(dayKey(c.startedAt, tz), c);
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = Array.from({ length: first }, () => ({ day: null }));
  for (let d = 1; d <= days; d++) {
    const c = byDay.get(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    cells.push(c
      ? { day: d, callId: c.id, highlight: hasHighlight(t, c), live: c.status === 'in_progress' || c.status === 'processing' }
      : { day: d });
  }
  return cells;
}

function oldestFirst(t: Timeline): CallCard[] {
  return [...t.calls].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function xPercent(t: Timeline, iso: string): number {
  const calls = oldestFirst(t);
  if (calls.length < 2) return 50;
  const t0 = Date.parse(calls[0].startedAt);
  const t1 = Date.parse(calls[calls.length - 1].startedAt);
  return t1 === t0 ? 50 : ((Date.parse(iso) - t0) / (t1 - t0)) * 100;
}

// First chat, the first chat of each new month, and the latest chat.
export function axisTicks(t: Timeline): { at: string; label: string }[] {
  const calls = oldestFirst(t);
  return calls
    .filter((c, i) => i === 0 || i === calls.length - 1 || dayKey(calls[i - 1].startedAt).slice(0, 7) !== dayKey(c.startedAt).slice(0, 7))
    .map((c) => ({ at: c.startedAt, label: formatShortDate(c.startedAt) }));
}
