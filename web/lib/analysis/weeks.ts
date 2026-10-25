// ISO week keys in the elder's local timezone, without a date library.

const MS_PER_DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Local calendar date of an instant in `timeZone`. */
export function localDate(isoTimestamp: string, timeZone: string): { year: number; month: number; day: number } {
  const parts = formatter(timeZone).formatToParts(new Date(isoTimestamp));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** 'YYYY-Www' ISO week (Monday start; week 1 contains the year's first Thursday) of the local date. */
export function isoWeekKey(isoTimestamp: string, timeZone: string): string {
  const { year, month, day } = localDate(isoTimestamp, timeZone);
  const date = Date.UTC(year, month - 1, day);
  const dow = (new Date(date).getUTCDay() + 6) % 7; // Mon = 0
  const thursday = new Date(date + (3 - dow) * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / MS_PER_DAY / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
