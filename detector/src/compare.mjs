import { parseHistory } from './contracts.mjs';
import { DetectorError } from './errors.mjs';

const invalidVector = () => new DetectorError('INVALID_INPUT', 'Invalid comparison vectors.');

function vectorScale(vector) {
  if (!Array.isArray(vector) || vector.length === 0) throw invalidVector();
  let scale = 0;
  for (const component of vector) {
    if (typeof component !== 'number' || !Number.isFinite(component)) throw invalidVector();
    scale = Math.max(scale, Math.abs(component));
  }
  if (scale === 0) throw invalidVector();
  return scale;
}

/** Scale each vector independently before products to avoid overflow and underflow. */
export function cosineSimilarity(a, b) {
  const scaleA = vectorScale(a);
  const scaleB = vectorScale(b);
  if (a.length !== b.length) throw invalidVector();
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const x = a[index] / scaleA;
    const y = b[index] / scaleB;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const similarity = dot / Math.sqrt(normA) / Math.sqrt(normB);
  return Math.max(-1, Math.min(1, similarity));
}

function parseCurrent(current) {
  let parsed;
  try {
    parsed = parseHistory(current);
  } catch (error) {
    if (error instanceof DetectorError && error.code === 'INVALID_HISTORY') {
      throw new DetectorError('INVALID_INPUT', 'Invalid comparison items.');
    }
    throw error;
  }
  if (parsed.some((item) => item.embedding == null)) {
    throw new DetectorError('INVALID_INPUT', 'Invalid comparison items.');
  }
  return parsed;
}

/** Find the strongest eligible prior evidence; classification belongs to the caller. */
export function findCandidates(current, history) {
  const items = parseCurrent(current);
  const saved = parseHistory(history);
  return items.map((item) => {
    const itemTime = Date.parse(item.startedAt);
    let bestMatch = null;
    let similarity = null;
    let bestTime = -Infinity;
    let eligibleCount = 0;
    for (const previous of saved) {
      const previousTime = Date.parse(previous.startedAt);
      if (previous.elderId !== item.elderId || previous.kind !== item.kind
          || previous.callId === item.callId || previousTime >= itemTime) continue;
      if (previous.embedding == null) {
        throw new DetectorError('INVALID_HISTORY', 'Missing saved comparison embedding.');
      }
      if (previous.embeddingModel !== item.embeddingModel
          || previous.embeddingDimensions !== item.embeddingDimensions) {
        throw new DetectorError('INCOMPATIBLE_EMBEDDINGS', 'Incompatible comparison embeddings.');
      }
      eligibleCount++;
      const score = cosineSimilarity(item.embedding, previous.embedding);
      if (bestMatch === null || score > similarity
          || (score === similarity && (previousTime > bestTime
            || (previousTime === bestTime && previous.id < bestMatch.id)))) {
        bestMatch = previous;
        similarity = score;
        bestTime = previousTime;
      }
    }
    return { item, bestMatch, similarity, eligibleCount };
  });
}
