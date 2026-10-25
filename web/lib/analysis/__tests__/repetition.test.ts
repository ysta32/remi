import { describe, expect, it } from 'vitest';
import { findRepeats } from '../repetition';

describe('findRepeats', () => {
  const candidates = [
    { id: 'c-near', embedding: [1, 0.2, 0] }, // cos with [1,0,0] ≈ 0.981
    { id: 'c-best', embedding: [1, 0.05, 0] }, // ≈ 0.9988
    { id: 'c-far', embedding: [0, 1, 0] }, // 0
  ];

  it('picks the most similar candidate above the threshold', () => {
    expect(findRepeats([{ id: 'n1', embedding: [1, 0, 0] }], candidates, 0.85)).toEqual({ n1: 'c-best' });
  });

  it('returns null when nothing reaches the threshold', () => {
    expect(findRepeats([{ id: 'n1', embedding: [0, 0, 1] }], candidates, 0.85)).toEqual({ n1: null });
  });

  it('treats the threshold as inclusive', () => {
    const out = findRepeats([{ id: 'n1', embedding: [1, 0] }], [{ id: 'c', embedding: [1, 0] }], 1);
    expect(out).toEqual({ n1: 'c' });
  });

  it('handles several new stories and no candidates', () => {
    expect(
      findRepeats(
        [
          { id: 'a', embedding: [0, 1, 0] },
          { id: 'b', embedding: [1, 0, 0] },
        ],
        candidates,
        0.99,
      ),
    ).toEqual({ a: 'c-far', b: 'c-best' });
    expect(findRepeats([{ id: 'a', embedding: [1] }], [], 0.85)).toEqual({ a: null });
  });
});
