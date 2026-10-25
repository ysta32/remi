// Shared by the server page and the client chart, so it lives outside the 'use client' module.
export interface WeekPoint {
  week: number;
  calls?: number;
  weeklyD: number | null;
  ewma?: number | null;
  baselineWeek: boolean;
  watch: boolean;
  nudge: boolean;
  wellbeingCard?: boolean;
  routedToWellbeing?: boolean;
}

/** y-range that fits every bar and the smoothed line (never clipped), at least [-1.5, 4.5]. */
export function driftDomain(...series: WeekPoint[][]): [number, number] {
  const vals = series.flat().flatMap((w) => [w.weeklyD, w.baselineWeek ? null : w.ewma]).filter((v): v is number => v != null);
  return [Math.min(-1.5, Math.floor(Math.min(...vals) * 2) / 2 - 0.5), Math.max(4.5, Math.ceil(Math.max(...vals)) + 0.5)];
}
