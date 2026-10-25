import { describe, expect, it } from 'vitest';
import { snapshotCaption } from '../snapshot';
import type { CallCard } from '../types';

const call = (over: Partial<CallCard>): CallCard => ({
  id: 'c1', startedAt: '2026-10-24T14:00:00Z', durationS: 420, status: 'done', summary: null,
  photosShown: [], familyQuestion: null, mood: null, isSimulated: false, ...over,
});

describe('snapshotCaption', () => {
  it('uses the photo caption and keeps the whole summary as the body', () => {
    const r = snapshotCaption(call({ photosShown: [{ id: 'p', caption: 'Dad with his first car, 1962' }], summary: 'A. B.' }));
    expect(r).toEqual({ caption: 'Dad with his first car, 1962', body: 'A. B.' });
  });

  it('splits the first sentence off as the caption when there is no photo', () => {
    expect(snapshotCaption(call({ summary: 'A. B. C.' }))).toEqual({ caption: 'A.', body: 'B. C.' });
  });

  it('never prints a one-sentence summary twice', () => {
    expect(snapshotCaption(call({ summary: 'Hal talked about tomatoes!' }))).toEqual({ caption: 'Hal talked about tomatoes!', body: null });
  });

  it('returns nothing to show for an unconsented or unfinished call', () => {
    expect(snapshotCaption(call({ summary: null, durationS: null }))).toEqual({ caption: null, body: null });
  });
});
