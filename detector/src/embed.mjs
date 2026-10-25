import { parseHistory } from './contracts.mjs';
import { DetectorError } from './errors.mjs';
import { postOpenAI } from './openai.mjs';

const invalidResponse = () => new DetectorError('INVALID_RESPONSE', 'Invalid OpenAI embedding response.');

function embeddingConfiguration(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new DetectorError('CONFIGURATION_ERROR', 'Invalid embedding configuration.');
  }
  const { embeddingModel = 'text-embedding-3-small', embeddingDimensions = 1536 } = options;
  if (typeof embeddingModel !== 'string' || !embeddingModel.trim()
      || !Number.isInteger(embeddingDimensions) || embeddingDimensions <= 0) {
    throw new DetectorError('CONFIGURATION_ERROR', 'Invalid embedding configuration.');
  }
  return { embeddingModel, embeddingDimensions };
}

function parseNewItems(items) {
  try {
    return parseHistory(items);
  } catch (error) {
    if (error instanceof DetectorError && error.code === 'INVALID_HISTORY') {
      throw new DetectorError('INVALID_INPUT', 'Invalid embedding items.');
    }
    throw error;
  }
}

function responseVectors(response, count, model, dimensions) {
  if (!response || response.model !== model || !Array.isArray(response.data) || response.data.length !== count) {
    throw invalidResponse();
  }
  const vectors = new Array(count);
  for (const entry of response.data) {
    if (!entry || !Number.isInteger(entry.index) || entry.index < 0 || entry.index >= count
        || vectors[entry.index] !== undefined || !Array.isArray(entry.embedding)
        || entry.embedding.length !== dimensions) throw invalidResponse();
    let nonzero = false;
    const vector = [];
    for (const component of entry.embedding) {
      if (typeof component !== 'number' || !Number.isFinite(component)) throw invalidResponse();
      if (component !== 0) nonzero = true;
      vector.push(component);
    }
    if (!nonzero) throw invalidResponse();
    vectors[entry.index] = vector;
  }
  // Unique in-range indices and exact count ensure that every input has one vector.
  return vectors;
}

async function embedParsedItems(items, options, configuration) {
  const { embeddingModel, embeddingDimensions } = configuration;
  const result = [];
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    const response = await postOpenAI('/embeddings', {
      model: embeddingModel,
      dimensions: embeddingDimensions,
      encoding_format: 'float',
      input: batch.map((item) => item.summary),
    }, options);
    const vectors = responseVectors(response, batch.length, embeddingModel, embeddingDimensions);
    result.push(...batch.map((item, index) => ({
      ...item,
      embedding: vectors[index],
      embeddingModel,
      embeddingDimensions,
    })));
  }
  return result;
}

/** Embed summaries in bounded batches; never include raw quotes or transcripts. */
export async function embedItems(items, options = {}) {
  const parsed = parseNewItems(items);
  if (parsed.length === 0) return [];
  return embedParsedItems(parsed, options, embeddingConfiguration(options));
}

/** Reuse compatible vectors, embedding only missing history while keeping provenance. */
export async function prepareHistory(history, options = {}) {
  const parsed = parseHistory(history);
  if (parsed.length === 0) return [];
  const configuration = embeddingConfiguration(options);
  const missing = [];
  for (const item of parsed) {
    if (item.embedding == null) {
      missing.push(item);
    } else if (item.embeddingModel !== configuration.embeddingModel
        || item.embeddingDimensions !== configuration.embeddingDimensions) {
      throw new DetectorError('INCOMPATIBLE_EMBEDDINGS', 'Incompatible saved embeddings.');
    }
  }
  if (missing.length === 0) return parsed;
  const generated = await embedParsedItems(missing, options, configuration);
  const byId = new Map(generated.map((item) => [item.id, item]));
  return parsed.map((item) => byId.get(item.id) ?? item);
}
