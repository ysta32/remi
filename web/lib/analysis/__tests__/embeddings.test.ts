import { afterEach, describe, expect, it, vi } from 'vitest';
import { cosine, embed, EmbeddingsDisabledError, setEmbeddingsTransportForTests } from '../embeddings';

afterEach(() => {
  setEmbeddingsTransportForTests(null);
  vi.unstubAllEnvs();
});

describe('cosine', () => {
  it('is 1 for parallel, 0 for orthogonal, -1 for opposite vectors', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it('matches a hand-computed value', () => {
    // (1*4 + 2*5 + 3*6) / (sqrt(14) * sqrt(77))
    expect(cosine([1, 2, 3], [4, 5, 6])).toBeCloseTo(32 / Math.sqrt(14 * 77), 10);
  });

  it('returns 0 for a zero vector and throws on length mismatch', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(() => cosine([1], [1, 2])).toThrow();
  });
});

describe('embed', () => {
  it('uses the transport and returns one vector per text', async () => {
    const t = vi.fn(async (texts: string[]) => texts.map((s) => [s.length, 1]));
    setEmbeddingsTransportForTests(t);
    expect(await embed(['ab', 'abc'])).toEqual([
      [2, 1],
      [3, 1],
    ]);
  });

  it('returns [] for no texts without calling the provider', async () => {
    const t = vi.fn(async () => [[1]]);
    setEmbeddingsTransportForTests(t);
    expect(await embed([])).toEqual([]);
    expect(t).not.toHaveBeenCalled();
  });

  it('throws EmbeddingsDisabledError when EMBEDDINGS_PROVIDER=none', async () => {
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'none');
    await expect(embed(['x'])).rejects.toBeInstanceOf(EmbeddingsDisabledError);
  });

  it('throws for the unconfigured gemini provider', async () => {
    vi.stubEnv('EMBEDDINGS_PROVIDER', 'gemini');
    await expect(embed(['x'])).rejects.toThrow('gemini provider not configured');
  });
});
