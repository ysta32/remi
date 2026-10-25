import test from 'node:test';
import assert from 'node:assert/strict';
import { embedItems, prepareHistory } from '../src/embed.mjs';

const model = 'text-embedding-3-small';
const item = (id = 'one') => ({ id, elderId: 'elder', callId: 'call', startedAt: '2026-01-01T00:00:00.000Z', isSimulated: true, kind: 'story', summary: `Summary ${id}`, quote: 'Literal quote', sourceTurnIndex: 0, elicitation: 'unprompted', promptTurnIndex: null });
const vector = (dimensions = 3, first = 1) => [first, ...Array(dimensions - 1).fill(0)];
const wire = (data, responseModel = model) => Response.json({ object: 'list', model: responseModel, data, usage: { prompt_tokens: 2, total_tokens: 2 } });
const options = (fetchImpl, extra = {}) => ({ apiKey: 'test-only-key', embeddingDimensions: 3, fetchImpl, maxRetries: 0, ...extra });
const code = (expected) => (error) => error.code === expected && !error.message.includes('secret');
const cached = (id = 'old') => ({ ...item(id), embedding: [1, 0, 0], embeddingModel: model, embeddingDimensions: 3, extractionModel: 'old-extractor', promptVersion: 'old-prompt' });

// Removing validation, batching, or cache preservation breaks the corresponding real behavior below.
test('uses actual embeddings wire shape, summary only, and reorders response indices', async () => {
  const source = [item('one'), item('two')];
  const before = structuredClone(source);
  const result = await embedItems(source, options(async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/embeddings');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { model, dimensions: 3, encoding_format: 'float', input: ['Summary one', 'Summary two'] });
    return wire([{ object: 'embedding', index: 1, embedding: [0, 1, 0] }, { object: 'embedding', index: 0, embedding: [1, 0, 0] }]);
  }));
  assert.deepEqual(result, [cached('one'), cached('two')].map(({ extractionModel, promptVersion, ...entry }, index) => ({ ...entry, embedding: index ? [0, 1, 0] : [1, 0, 0] })));
  assert.deepEqual(source, before);
  assert.notEqual(result[0], source[0]);
});

test('defaults to text-embedding-3-small and 1536 dimensions', async () => {
  const result = await embedItems([item()], { apiKey: 'test-only-key', fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, model);
    assert.equal(body.dimensions, 1536);
    return wire([{ index: 0, embedding: vector(1536) }]);
  } });
  assert.equal(result[0].embeddingDimensions, 1536);
});

test('batches at most 100 items and retains order across batches', async () => {
  const source = Array.from({ length: 205 }, (_, i) => item(String(i)));
  const sizes = [];
  const result = await embedItems(source, options(async (_url, init) => {
    const input = JSON.parse(init.body).input;
    sizes.push(input.length);
    return wire(input.map((summary, index) => ({ index, embedding: [Number(summary.slice(8)) + 1, 0, 0] })).reverse());
  }));
  assert.deepEqual(sizes, [100, 100, 5]);
  assert.deepEqual(result.map((entry) => entry.embedding[0]), Array.from({ length: 205 }, (_, i) => i + 1));
});

test('empty inputs need neither key nor provider', async () => {
  assert.deepEqual(await embedItems([]), []);
  assert.deepEqual(await prepareHistory([]), []);
});

for (const [label, payload] of [
  ['missing data', { model }], ['null data', { model, data: null }],
  ['missing index', { model, data: [{ embedding: [1, 0, 0] }] }],
  ['negative index', { model, data: [{ index: -1, embedding: [1, 0, 0] }] }],
  ['string index', { model, data: [{ index: '0', embedding: [1, 0, 0] }] }],
  ['out of range index', { model, data: [{ index: 1, embedding: [1, 0, 0] }] }],
  ['missing vector', { model, data: [{ index: 0 }] }],
  ['wrong dimensions', { model, data: [{ index: 0, embedding: [1, 0] }] }],
  ['zero vector', { model, data: [{ index: 0, embedding: [0, 0, 0] }] }],
  ['nonfinite serialized as null', { model, data: [{ index: 0, embedding: [Infinity, 0, 0] }] }],
  ['string component', { model, data: [{ index: 0, embedding: ['1', 0, 0] }] }],
  ['model mismatch', { model: 'secret-wrong-model', data: [{ index: 0, embedding: [1, 0, 0] }] }],
  ['model absent', { data: [{ index: 0, embedding: [1, 0, 0] }] }],
  ['null response', null],
]) {
  test(`rejects provider ${label}`, async () => {
    await assert.rejects(embedItems([item()], options(async () => Response.json(payload))), code('INVALID_RESPONSE'));
  });
}
for (const [label, data] of [
  ['missing indexed result', [{ index: 0, embedding: [1, 0, 0] }]],
  ['duplicate indices', [{ index: 0, embedding: [1, 0, 0] }, { index: 0, embedding: [0, 1, 0] }]],
  ['extra result', [{ index: 0, embedding: [1, 0, 0] }, { index: 1, embedding: [0, 1, 0] }, { index: 2, embedding: [0, 0, 1] }]],
]) {
  test(`rejects ${label} without inventing vectors`, async () => {
    await assert.rejects(embedItems([item('one'), item('two')], options(async () => wire(data))), code('INVALID_RESPONSE'));
  });
}

test('rejects duplicate new IDs before making any provider call', async () => {
  await assert.rejects(embedItems([item(), item()], options(async () => assert.fail('unexpected request'))), code('INVALID_INPUT'));
});

for (const value of [null, {}, [null], [{ ...item(), summary: '' }]]) {
  test(`rejects malformed new items ${JSON.stringify(value)}`, async () => {
    await assert.rejects(embedItems(value, options(async () => assert.fail('unexpected request'))), code('INVALID_INPUT'));
  });
}
for (const extra of [{ embeddingModel: '' }, { embeddingModel: 42 }, { embeddingDimensions: 0 }, { embeddingDimensions: 1.5 }, { embeddingDimensions: '3' }]) {
  test(`rejects invalid embedding options ${JSON.stringify(extra)}`, async () => {
    await assert.rejects(embedItems([item()], options(async () => assert.fail('unexpected request'), extra)), code('CONFIGURATION_ERROR'));
  });
}

test('mixed history embeds only missing summaries and preserves original provenance', async () => {
  const source = [cached(), { ...item('missing'), embedding: null, embeddingModel: null, embeddingDimensions: null, extractionModel: 'historic', promptVersion: 'historic-prompt' }];
  const before = structuredClone(source);
  const result = await prepareHistory(source, options(async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body).input, ['Summary missing']);
    return wire([{ index: 0, embedding: [0, 1, 0] }]);
  }, { extractionModel: 'current', promptVersion: 'current-prompt' }));
  assert.deepEqual(result[0], source[0]);
  assert.equal(result[1].extractionModel, 'historic');
  assert.equal(result[1].promptVersion, 'historic-prompt');
  assert.deepEqual(result[1].embedding, [0, 1, 0]);
  assert.deepEqual(source, before);
  assert.notEqual(result[0], source[0]);
  assert.notEqual(result[0].embedding, source[0].embedding);
});

test('compatible cached history needs no key or HTTP call', async () => {
  assert.deepEqual(await prepareHistory([cached()], { embeddingDimensions: 3, fetchImpl: async () => assert.fail('unexpected request') }), [cached()]);
});
for (const entry of [{ ...cached(), embeddingModel: 'different' }, { ...cached(), embedding: [1, 0], embeddingDimensions: 2 }]) {
  test(`incompatible cache ${entry.embeddingModel}/${entry.embeddingDimensions} rejects before embedding missing items`, async () => {
    await assert.rejects(prepareHistory([item('missing'), entry], options(async () => assert.fail('unexpected request'))), code('INCOMPATIBLE_EMBEDDINGS'));
  });
}
for (const entry of [{ ...cached(), embedding: [0, 0, 0] }, { ...cached(), embedding: [NaN, 0, 0] }, { ...cached(), embeddingModel: null }, { ...cached(), embedding: null }]) {
  test('rejects structurally invalid cache without provider use', async () => {
    await assert.rejects(prepareHistory([entry], options(async () => assert.fail('unexpected request'))), code('INVALID_HISTORY'));
  });
}
