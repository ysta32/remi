import { describe, expect, it } from 'vitest';
import { isoWeekKey } from '@/lib/analysis/weeks';

const NY = 'America/New_York';

describe('isoWeekKey', () => {
  it('uses the local date, not the UTC date', () => {
    // 2026-10-19 02:00Z is Sunday 2026-10-18 22:00 in New York.
    expect(isoWeekKey('2026-10-19T02:00:00Z', NY)).toBe('2026-W42');
    expect(isoWeekKey('2026-10-19T02:00:00Z', 'UTC')).toBe('2026-W43');
  });

  it('handles the year boundary (2026-12-31 Thu, 2027-01-01 Fri are in 2026-W53)', () => {
    expect(isoWeekKey('2026-12-31T15:00:00Z', NY)).toBe('2026-W53');
    expect(isoWeekKey('2027-01-01T15:00:00Z', NY)).toBe('2026-W53');
    expect(isoWeekKey('2027-01-04T15:00:00Z', NY)).toBe('2027-W01');
    // 2025-12-29 (Mon) belongs to 2026-W01.
    expect(isoWeekKey('2025-12-29T15:00:00Z', NY)).toBe('2026-W01');
    // Sunday evening local time is still the old week even though UTC is already Monday.
    expect(isoWeekKey('2027-01-04T03:00:00Z', NY)).toBe('2026-W53');
  });

  it('is stable across the DST change in New York (2026-11-01)', () => {
    // Sunday 2026-11-01 before and after the 2:00 fall-back: same ISO week as the preceding Monday.
    expect(isoWeekKey('2026-10-26T14:00:00Z', NY)).toBe('2026-W44');
    expect(isoWeekKey('2026-11-01T05:30:00Z', NY)).toBe('2026-W44'); // 01:30 EDT
    expect(isoWeekKey('2026-11-02T04:30:00Z', NY)).toBe('2026-W44'); // 23:30 EST Sunday
    expect(isoWeekKey('2026-11-02T05:30:00Z', NY)).toBe('2026-W45'); // 00:30 EST Monday
  });
});
