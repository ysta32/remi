import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzeCall } from '../src/index.mjs';

const options = { apiKey: 'fictional-test-key', extractionModel: 'test-extractor', embeddingModel: 'test-embedding', embeddingDimensions: 3, maxRetries: 0 };
const call = (extra = {}) => ({ elderId: 'fictional-elder', callId: 'call-2', startedAt: '2026-10-24T12:00:00Z', isSimulated: true, utterances: [
  { speaker: 'agent', text: 'Tell me about your orchard visit.' },
  { speaker: 'caller', text: 'I visited the orchard. When is lunch? I found my blue hat.' },
], ...extra });
const extracted = [
  { kind: 'story', summary: 'Visited orchard', quote: 'I visited the orchard.', sourceTurnIndex: 1, elicitation: 'prompted', promptTurnIndex: 0 },
  { kind: 'question', summary: 'Lunch time', quote: 'When is lunch?', sourceTurnIndex: 1, elicitation: 'unprompted', promptTurnIndex: null },
  { kind: 'story', summary: 'Found blue hat', quote: 'I found my blue hat.', sourceTurnIndex: 1, elicitation: 'uncertain', promptTurnIndex: null },
];
const vectors = { 'Visited orchard': [1, 0, 0], 'Lunch time': [0, 1, 0], 'Found blue hat': [0, 0, 1] };
function provider(items = extracted, failEmbeddingRequest = 0) {
  const requests = [];
  let embeddingRequests = 0;
  return { requests, fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (url.endsWith('/responses')) return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] }] });
    assert.equal(url, 'https://api.openai.com/v1/embeddings');
    embeddingRequests++;
    if (embeddingRequests === failEmbeddingRequest) return Response.json({ error: 'private provider body' }, { status: 500 });
    return Response.json({ model: body.model, data: body.input.map((summary, index) => ({ index, embedding: vectors[summary] ?? [1, 0, 0] })) });
  } };
}
async function run(history = [], extra = {}, configuration = {}, mock = provider()) {
  const input = { call: call(extra), history, processingAllowed: true };
  const result = await analyzeCall(input, { ...options, fetchImpl: mock.fetchImpl, ...configuration });
  return { result, mock, input };
}
function saved(extra = {}) {
  return { id: 'old-item', elderId: 'fictional-elder', callId: 'call-1', startedAt: '2026-01-01T00:00:00Z', isSimulated: true, ...extracted[0], extractionModel: 'original-extractor', promptVersion: 'original-prompt', ...extra };
}

test('chronological two-call replay returns all repeat buckets and source provenance', async () => {
  const first = (await run([], { callId: 'call-1', startedAt: '2026-01-01T00:00:00Z' })).result;
  assert.equal(first.status, 'ok');
  assert.deepEqual(first.counts, { total: 0, prompted: 0, unprompted: 0, uncertain: 0, stories: 0, questions: 0 });
  assert.equal(first.items.length, 3);
  const { result, mock, input } = await run(first.items);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.counts, { total: 3, prompted: 1, unprompted: 1, uncertain: 1, stories: 2, questions: 1 });
  assert.equal(mock.requests.length, 2, 'compatible historical vectors are reused');
  assert.deepEqual(result.historyUpdates, []);
  assert.ok(result.matches.every((match) => match.matchedCallId === 'call-1'));
  assert.ok(result.items.every((item) => item.embedding.length === 3 && item.extractionModel === options.extractionModel && item.promptVersion === 'remi-items-v1'));
  assert.deepEqual(result.provenance, { detectorVersion: '1.0.0', extractionModel: 'test-extractor', promptVersion: 'remi-items-v1', embeddingModel: 'test-embedding', embeddingDimensions: 3, threshold: 0.85, isSimulated: true });
  assert.equal(Object.hasOwn(result, 'call'), false);
  assert.equal(Object.hasOwn(result, 'utterances'), false);
  assert.equal(JSON.stringify(result).includes(input.call.utterances[0].text), false);
});

test('filters foreign, future, equal-time, same-call, and irrelevant kinds before history embedding', async () => {
  const history = [
    saved({ id: 'foreign', elderId: 'someone-else' }),
    saved({ id: 'future', startedAt: '2027-01-01T00:00:00Z' }),
    saved({ id: 'same-time', startedAt: call().startedAt }),
    saved({ id: 'same-call', callId: 'call-2' }),
    saved({ id: 'wrong-kind', kind: 'question' }),
    saved(),
  ];
  const mock = provider([extracted[0]]);
  const { result } = await run(history, {}, {}, mock);
  assert.equal(result.status, 'ok');
  assert.deepEqual(mock.requests.filter((r) => r.url.endsWith('/embeddings')).map((r) => r.body.input), [['Visited orchard'], ['Visited orchard']]);
  assert.deepEqual(result.historyUpdates.map((item) => item.id), ['old-item']);
  assert.equal(result.historyUpdates[0].extractionModel, 'original-extractor');
  assert.equal(result.historyUpdates[0].promptVersion, 'original-prompt');
  assert.equal(result.matches[0].eligibleCount, 1);
});

test('historyUpdates contains only newly generated eligible vectors', async () => {
  const history = [saved(), saved({ id: 'cached', embedding: [1, 0, 0], embeddingModel: options.embeddingModel, embeddingDimensions: 3 })];
  const { result } = await run(history);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.historyUpdates.map((item) => item.id), ['old-item']);
  assert.equal(history[0].embedding, undefined, 'caller-owned data is not mutated');
});

test('privacy permission gate prevents every HTTP request', async () => {
  let calls = 0;
  const result = await analyzeCall({ call: call(), history: [], processingAllowed: false }, { ...options, fetchImpl: () => { calls++; throw Error('must not run'); } });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error.code, 'CONSENT_REQUIRED');
  assert.equal(result.counts, null);
  assert.equal(calls, 0);
});

for (const value of [undefined, null, 'yes', 1]) test(`permission must be literal true: ${value}`, async () => {
  const result = await analyzeCall({ call: call(), history: [], processingAllowed: value });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error.code, 'CONSENT_REQUIRED');
});

test('empty caller text succeeds without HTTP or credentials', async () => {
  const result = await analyzeCall({ call: call({ utterances: [{ speaker: 'agent', text: 'Hello' }, { speaker: 'caller', text: '  ' }] }), history: [saved()], processingAllowed: true }, { fetchImpl: () => { throw Error('no HTTP'); } });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.historyUpdates, []);
  assert.equal(result.provenance.extractionModel, null);
  assert.equal(result.counts.total, 0);
});

test('empty extraction skips all embedding and history preparation', async () => {
  const mock = provider([]);
  const { result } = await run([saved({ embedding: [1, 0, 0], embeddingModel: 'incompatible', embeddingDimensions: 3 })], {}, {}, mock);
  assert.equal(result.status, 'ok');
  assert.equal(mock.requests.length, 1);
  assert.equal(result.counts.total, 0);
});

test('malformed input and history return safe unavailable with null counts', async () => {
  for (const input of [null, { call: call({ elderId: ' ' }), history: [], processingAllowed: true }, { call: call(), history: [saved({ summary: '' })], processingAllowed: true }]) {
    const result = await analyzeCall(input, { fetchImpl: () => { throw Error('no HTTP'); } });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.counts, null);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.historyUpdates, []);
  }
});

test('provider failure returns safe unavailable without partial persistence data', async () => {
  const { result } = await run([], {}, { fetchImpl: async () => Response.json({ error: 'private raw text' }, { status: 500 }) });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error.code, 'PROVIDER_ERROR');
  assert.equal(result.counts, null);
  assert.equal(JSON.stringify(result).includes('private raw text'), false);
  assert.deepEqual(result.items, []);
});

test('history embedding failure returns unavailable, never a partial success', async () => {
  const { result } = await run([saved()], {}, {}, provider(extracted, 2));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error.code, 'PROVIDER_ERROR');
  assert.equal(result.counts, null);
  assert.deepEqual(result.historyUpdates, []);
  assert.deepEqual(result.items, []);
});

test('eligible incompatible cache fails instead of mixing models', async () => {
  const { result } = await run([saved({ embedding: [1, 0, 0], embeddingModel: 'other-model', embeddingDimensions: 3 })]);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.error.code, 'INCOMPATIBLE_EMBEDDINGS');
  assert.equal(result.counts, null);
});

test('stable retry identities and collision-free structured pair persistence key', async () => {
  const a = (await run()).result;
  const b = (await run()).result;
  assert.equal(a.persistenceKey, b.persistenceKey);
  assert.deepEqual(a.items.map((item) => item.id), b.items.map((item) => item.id));
  assert.equal(a.persistenceKey, `call_${createHash('sha256').update(JSON.stringify(['fictional-elder', 'call-2'])).digest('hex')}`);
  const first = (await run([], { elderId: 'a:b', callId: 'c' })).result;
  const second = (await run([], { elderId: 'a', callId: 'b:c' })).result;
  assert.notEqual(first.persistenceKey, second.persistenceKey);
});

test('configured threshold determines repeat counts while retaining candidate links', async () => {
  const history = [saved({ embedding: [0.8, 0.6, 0], embeddingModel: options.embeddingModel, embeddingDimensions: 3 })];
  const { result } = await run(history, {}, { threshold: 0.9 }, provider([extracted[0]]));
  assert.equal(result.status, 'ok');
  assert.equal(result.counts.total, 0);
  assert.equal(result.matches[0].candidateItemId, 'old-item');
  assert.equal(result.matches[0].matchedItemId, null);
  assert.equal(result.provenance.threshold, 0.9);
});

test('public runtime exports correspond to the finished modules', async () => {
  const api = await import('../src/index.mjs');
  for (const name of ['analyzeCall', 'DetectorError', 'parseCall', 'parseHistory', 'makeItemId', 'postOpenAI', 'extractItems', 'embedItems', 'prepareHistory', 'cosineSimilarity', 'findCandidates', 'classifyCandidates']) assert.equal(typeof api[name], 'function', name);
});
