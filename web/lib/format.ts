// Dates are shown in the elder's timezone (Hal: America/New_York), since that's when the chat happened.
const TZ = 'America/New_York';

export const formatDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));

export const formatShortDate = (iso: string | number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(iso));

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export const formatDuration = (s: number | null) => {
  if (s === null) return null;
  return s < 90 ? `${Math.max(1, Math.round(s / 60))} min` : `${Math.round(s / 60)} min`;
};

export function formatRelative(iso: string, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const days = Math.floor(mins / 1440);
  if (days < 1) return `today at ${formatTime(iso)}`;
  if (days === 1) return 'yesterday';
  if (days < 7) return formatDay(iso).split(',')[0];
  return formatShortDate(iso);
}

const UNIT_LABEL: Record<string, string> = {
  wpm: 'words/min', cpm: 'chars/min', per100w: 'per 100 words', per100c: 'per 100 chars', ms: 'ms', ratio: '', count: '',
};
export const unitLabel = (unit: string) => UNIT_LABEL[unit] ?? unit;

export function formatValue(v: number, unit: string) {
  if (unit === 'ratio') return v.toFixed(2);
  if (unit === 'ms' || unit === 'wpm' || unit === 'cpm' || unit === 'count') return Math.round(v).toString();
  return v.toFixed(1);
}
