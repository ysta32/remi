import { parseHistory } from './contracts.mjs';
import { DetectorError } from './errors.mjs';

const invalid = () => new DetectorError('INVALID_INPUT', 'Invalid classification input.');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseItems(items) {
  try {
    const parsed = parseHistory(items);
    if (parsed.some((item) => item.embedding == null)) throw invalid();
    return parsed;
  } catch (error) {
    if (error instanceof DetectorError) throw invalid();
    throw error;
  }
}

/** Classify strongest prior evidence using a provisional, uncalibrated threshold. */
export function classifyCandidates(candidates, options = {}) {
  if (!object(options)) throw invalid();
  const { threshold = 0.85 } = options;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)
      || threshold < 0 || threshold > 1 || !Array.isArray(candidates)) throw invalid();
  const items = parseItems(candidates.map((candidate) => {
    if (!object(candidate)) throw invalid();
    return candidate.item;
  }));
  const counts = { total: 0, unprompted: 0, prompted: 0, uncertain: 0, stories: 0, questions: 0 };
  const matches = [];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const item = items[index];
    const { similarity, eligibleCount } = candidate;
    if (!Number.isSafeInteger(eligibleCount) || eligibleCount < 0) throw invalid();
    let best = null;
    if (candidate.bestMatch === null) {
      if (similarity !== null || eligibleCount !== 0) throw invalid();
    } else {
      if (typeof similarity !== 'number' || !Number.isFinite(similarity)
          || similarity < -1 || similarity > 1 || eligibleCount === 0) throw invalid();
      [best] = parseItems([candidate.bestMatch]);
      if (best.id === item.id || best.elderId !== item.elderId || best.kind !== item.kind
          || best.callId === item.callId || Date.parse(best.startedAt) >= Date.parse(item.startedAt)
          || best.embeddingModel !== item.embeddingModel
          || best.embeddingDimensions !== item.embeddingDimensions) throw invalid();
    }
    const isRepeat = best !== null && similarity >= threshold;
    matches.push({
      itemId: item.id, kind: item.kind, elicitation: item.elicitation, isRepeat, similarity,
      matchedItemId: isRepeat ? best.id : null,
      matchedCallId: isRepeat ? best.callId : null,
      candidateItemId: best === null ? null : best.id,
      candidateCallId: best === null ? null : best.callId,
      eligibleCount,
    });
    if (isRepeat) {
      counts.total++;
      counts[item.elicitation]++;
      counts[item.kind === 'story' ? 'stories' : 'questions']++;
    }
  }
  return { matches, counts, threshold };
}
