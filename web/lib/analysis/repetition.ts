// Pure repetition matcher (docs/markers.md §6.3). Callers pass the threshold
// (normally REPEAT_COSINE from ./config).
import { cosine } from './embeddings';

/** For each new story, the id of the most similar candidate with cosine >= threshold, else null. */
export function findRepeats(
  newStories: { id: string; embedding: number[] }[],
  candidates: { id: string; embedding: number[] }[],
  threshold: number,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const s of newStories) {
    let best: string | null = null;
    let bestSim = -Infinity;
    for (const c of candidates) {
      if (c.id === s.id) continue;
      const sim = cosine(s.embedding, c.embedding);
      if (sim >= threshold && sim > bestSim) {
        best = c.id;
        bestSim = sim;
      }
    }
    out[s.id] = best;
  }
  return out;
}
