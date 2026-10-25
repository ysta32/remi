import { describe, expect, it } from 'vitest';
import driftJson from '../../../fixtures/demo/timeline.json';
import afterJson from '../../../fixtures/demo/timeline-after-call.json';
import {
  axisTicks, findCall, hasHighlight, monthCells, recapHighlights, soundRows, xPercent,
} from '../recap';
import type { Timeline } from '../types';

const drift = driftJson as Timeline;
const afterCall = afterJson as Timeline;
const call = (t: Timeline, id: string) => {
  const c = findCall(t, id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};
const row = (t: Timeline, id: string, key: string) => soundRows(t, id).find((r) => r.key === key)!;

describe('findCall', () => {
  it('finds a chat by id and returns null for an unknown id', () => {
    expect(findCall(drift, 'call-09')?.id).toBe('call-09');
    expect(findCall(drift, 'nope')).toBeNull();
  });
});

describe('hasHighlight', () => {
  it('is true for an answered family question or a fun fact that day', () => {
    expect(hasHighlight(drift, call(drift, 'call-05'))).toBe(true);
    expect(hasHighlight(drift, call(drift, 'call-09'))).toBe(true);
  });

  it('is false for a plain chat', () => {
    expect(hasHighlight(drift, call(drift, 'call-10'))).toBe(false);
  });
});

describe('recapHighlights', () => {
  it('says which telling of a retold story this chat was', () => {
    const h = recapHighlights(drift, call(drift, 'call-10'));
    expect(h.facts).toEqual([]);
    expect(h.retold).toHaveLength(1);
    expect(h.retold[0]).toMatchObject({ nth: 2, total: 4 });
    expect(h.retold[0].summary).toMatch(/1977 blizzard/);
  });

  it('returns no facts for a chat without one, so no empty card is drawn', () => {
    expect(recapHighlights(drift, call(drift, 'call-11')).facts).toEqual([]);
  });

  it('still finds the fun fact when the summary is hidden', () => {
    const hidden = { ...call(drift, 'call-05'), summary: null };
    expect(recapHighlights(drift, hidden).facts).toHaveLength(1);
  });
});

describe('soundRows', () => {
  it('reads pace below his usual as slower, whatever the sign of z', () => {
    const pace = row(drift, 'call-09', 'pace');
    expect(pace.status).toBe('less');
    expect(pace.words).toBe('Slower than usual');
    expect(pace.detail).toBe('124 words a minute (usually 134)');
  });

  it('flags more vague words and more pauses on the drift chat', () => {
    expect(row(drift, 'call-09', 'vague').status).toBe('more');
    expect(row(drift, 'call-09', 'pauses').status).toBe('more');
    expect(row(drift, 'call-09', 'pauses').detail).toBeNull();
  });

  it('marks the first chats as still learning his usual', () => {
    expect(soundRows(drift, 'call-02').map((r) => r.status)).toEqual(['learning', 'learning', 'learning']);
  });

  it('marks a short chat as a rough reading', () => {
    expect(row(afterCall, 'call-live', 'pace').rough).toBe(true);
  });

  it('leaves status empty for a chat with no reading yet', () => {
    expect(soundRows(drift, 'nope').every((r) => r.status === null)).toBe(true);
  });
});

describe('monthCells', () => {
  it('starts the month on the right weekday and marks chat days', () => {
    const cells = monthCells(drift, 2026, 10);
    expect(cells.slice(0, 4).every((c) => c.day === null)).toBe(true); // Oct 1 2026 is a Thursday
    expect(cells[4].day).toBe(1);
    expect(cells.find((c) => c.day === 9)).toMatchObject({ callId: 'call-09', highlight: true });
    expect(cells.find((c) => c.day === 10)?.callId).toBeUndefined();
  });
});

describe('axisTicks and xPercent', () => {
  it('labels the first chat, each new month and the latest chat', () => {
    expect(axisTicks(drift).map((t) => t.label)).toEqual(['Sep 21', 'Oct 2', 'Oct 16']);
  });

  it('places the first and last chats at the edges', () => {
    const first = drift.calls.at(-1)!.startedAt;
    const last = drift.calls[0].startedAt;
    expect(xPercent(drift, first)).toBe(0);
    expect(xPercent(drift, last)).toBe(100);
  });
});
