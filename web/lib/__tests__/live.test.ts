import { describe, expect, it } from 'vitest';
import { busy, freshIds, pollDelay, settled } from '../live';

describe('settled', () => {
  it('uses the new value when the request succeeded', () => {
    expect(settled({ status: 'fulfilled', value: 2 }, 1)).toBe(2);
  });

  it('keeps the previous value when only this request failed', () => {
    expect(settled({ status: 'rejected', reason: new Error('404') }, 1)).toBe(1);
  });
});

describe('pollDelay', () => {
  it('polls fast while a call is being written up, even after a failed poll', () => {
    expect(pollDelay(true)).toBe(3_000);
    expect(pollDelay(false)).toBe(15_000);
  });
});

describe('freshIds', () => {
  it('reports nothing on the first load', () => {
    expect(freshIds(null, ['c1|done', 'ff1'])).toEqual([]);
  });

  it('reports only ids that are new since the last poll, with the status suffix removed', () => {
    expect(freshIds(new Set(['c1|processing', 'ff1']), ['c1|done', 'ff1', 'ff2'])).toEqual(['c1', 'ff2']);
  });
});

describe('busy', () => {
  it('polls fast while a call is live, so a mid-call safety note shows up within seconds', () => {
    expect(busy({ processing: false, calls: [{ status: 'in_progress' }] })).toBe(true);
    expect(busy({ processing: true, calls: [] })).toBe(true);
    expect(busy({ processing: false, calls: [{ status: 'done' }] })).toBe(false);
  });
});
