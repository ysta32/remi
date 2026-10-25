import { createHash } from 'node:crypto';
import { DetectorError } from './errors.mjs';
import { parseCall, parseHistory } from './contracts.mjs';
import { extractItems } from './extract.mjs';
import { embedItems, prepareHistory } from './embed.mjs';
import { findCandidates } from './compare.mjs';
import { classifyCandidates } from './classify.mjs';

export { DetectorError } from './errors.mjs';
export { parseCall, parseHistory, makeItemId } from './contracts.mjs';
export { postOpenAI } from './openai.mjs';
export { extractItems } from './extract.mjs';
export { embedItems, prepareHistory } from './embed.mjs';
export { cosineSimilarity, findCandidates } from './compare.mjs';
export { classifyCandidates } from './classify.mjs';

/** Orchestrate analysis without retaining transcripts or writing persistence. */
export async function analyzeCall(input, options = {}) {
  let call = null;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new DetectorError('INVALID_INPUT', 'Invalid analysis input.');
    }
    if (input.processingAllowed !== true) {
      throw new DetectorError('CONSENT_REQUIRED', 'Processing permission is required.');
    }
    call = parseCall(input.call);
    const history = parseHistory(input.history);
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new DetectorError('CONFIGURATION_ERROR', 'Invalid analysis configuration.');
    }
    const { embeddingModel = 'text-embedding-3-small', embeddingDimensions = 1536, threshold = 0.85 } = options;
    if (typeof embeddingModel !== 'string' || !embeddingModel.trim()
        || !Number.isInteger(embeddingDimensions) || embeddingDimensions <= 0) {
      throw new DetectorError('CONFIGURATION_ERROR', 'Invalid embedding configuration.');
    }
    // Validate the threshold even for calls that have no extracted items.
    classifyCandidates([], { threshold });
    const extraction = await extractItems(call, options);
    const items = await embedItems(extraction.items.map((item) => ({
      ...item, extractionModel: extraction.extractionModel, promptVersion: extraction.promptVersion,
    })), options);
    const kinds = new Set(items.map((item) => item.kind));
    const eligible = history.filter((item) => item.elderId === call.elderId
      && item.callId !== call.callId && Date.parse(item.startedAt) < Date.parse(call.startedAt)
      && kinds.has(item.kind));
    const prepared = await prepareHistory(eligible, options);
    const missing = new Set(eligible.filter((item) => item.embedding == null).map((item) => item.id));
    const { matches, counts } = classifyCandidates(findCandidates(items, prepared), { threshold });
    return {
      status: 'ok',
      persistenceKey: `call_${createHash('sha256').update(JSON.stringify([call.elderId, call.callId])).digest('hex')}`,
      elderId: call.elderId, callId: call.callId, items,
      historyUpdates: prepared.filter((item) => missing.has(item.id)), matches, counts,
      provenance: {
        detectorVersion: '1.0.0', extractionModel: extraction.extractionModel,
        promptVersion: extraction.promptVersion, embeddingModel, embeddingDimensions,
        threshold, isSimulated: call.isSimulated,
      },
    };
  } catch (error) {
    const safe = error instanceof DetectorError ? error : new DetectorError('INVALID_INPUT', 'Analysis could not be completed.');
    return {
      status: 'unavailable', elderId: call?.elderId ?? null, callId: call?.callId ?? null,
      items: [], historyUpdates: [], matches: [], counts: null,
      error: { code: safe.code, message: safe.message },
    };
  }
}
