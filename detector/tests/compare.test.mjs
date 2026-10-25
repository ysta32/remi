import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, findCandidates } from '../src/compare.mjs';
import { DetectorError } from '../src/errors.mjs';

const item = (overrides = {}) => ({
  id: 'current', elderId: 'elder-1', callId: 'call-current',
  startedAt: '2026-10-20T12:00:00Z', isSimulated: true,
  kind: 'story', summary: 'A childhood memory.', quote: 'childhood memory',
  sourceTurnIndex: 0, elicitation: 'unprompted', promptTurnIndex: null,
  embedding: [1, 0], embeddingModel: 'model-a', embeddingDimensions: 2,
  ...overrides,
});
const prior = (overrides = {}) => item({
  id: 'prior', callId: 'call-prior', startedAt: '2026-10-19T12:00:00Z', ...overrides,
});
const code = (expected) => (error) => error instanceof DetectorError && error.code === expected;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-14, `${actual} != ${expected}`);

for (const { name, a, b, expected } of [
  { name: 'hand-computed 3-4-5 projection', a: [3, 4], b: [1, 0], expected: 0.6 },
  { name: 'orthogonal vectors', a: [1, 0], b: [0, 1], expected: 0 },
  { name: 'opposite vectors', a: [3, 4], b: [-3, -4], expected: -1 },
  { name: 'large finite components', a: [1e308, 1e308], b: [1e308, 0], expected: Math.SQRT1_2 },
  { name: 'subnormal components', a: [Number.MIN_VALUE, Number.MIN_VALUE], b: [Number.MIN_VALUE, 0], expected: Math.SQRT1_2 },
  { name: 'independently scaled vectors', a: [3e300, 4e300], b: [3e-300, 4e-300], expected: 1 },
  { name: 'mixed signs and cancellation', a: [1e308, -1e308], b: [1e-308, 1e-308], expected: 0 },
]) {
  test(`cosineSimilarity handles ${name}`, () => near(cosineSimilarity(a, b), expected));
}

test('cosineSimilarity stays in the closed cosine range after rounding', () => {
  const vector = [1, 2, 3, 4, 5, 6, 7];
  const score = cosineSimilarity(vector, vector);
  assert.ok(Number.isFinite(score) && score <= 1 && score >= -1);
  near(score, 1);
});
for (const [name, a, b] of [
  ['unequal dimensions', [1], [1, 2]], ['empty vectors', [], []],
  ['zero vector', [0, -0], [1, 2]], ['zero second vector', [1], [0]],
  ['NaN', [NaN], [1]], ['Infinity', [1], [Infinity]],
  ['nonnumeric component', ['1'], [1]], ['null vector', null, [1]],
  ['typed array', new Float64Array([1]), [1]], ['sparse vector', Array(1), [1]],
]) {
  test(`cosineSimilarity rejects ${name}`, () => assert.throws(() => cosineSimilarity(a, b), code('INVALID_INPUT')));
}

test('findCandidates returns no results for empty current and validates history', () => {
  assert.deepEqual(findCandidates([], []), []);
  assert.throws(() => findCandidates([], [{}]), code('INVALID_HISTORY'));
});
test('findCandidates returns exact candidate fields and null score without history', () => {
  const [candidate] = findCandidates([item()], []);
  assert.deepEqual(Object.keys(candidate).sort(), ['bestMatch', 'eligibleCount', 'item', 'similarity']);
  assert.equal(candidate.item.id, 'current');
  assert.equal(candidate.bestMatch, null);
  assert.equal(candidate.similarity, null);
  assert.equal(candidate.eligibleCount, 0);
});
test('findCandidates chooses highest score, counts all eligible, and makes no threshold decision', () => {
  const results = findCandidates([item()], [
    prior({ id: 'low', embedding: [0, 1] }),
    prior({ id: 'best', embedding: [3, 4] }),
    prior({ id: 'negative', embedding: [-1, 0] }),
  ]);
  assert.equal(results[0].bestMatch.id, 'best');
  near(results[0].similarity, 0.6);
  assert.equal(results[0].eligibleCount, 3);
});
test('findCandidates preserves negative best scores', () => {
  const [candidate] = findCandidates([item()], [prior({ embedding: [-1, 0] })]);
  assert.equal(candidate.similarity, -1);
  assert.equal(candidate.bestMatch.id, 'prior');
});
test('findCandidates excludes other elders, other kinds, same call, equal time and future calls', () => {
  const excluded = [
    prior({ id: 'foreign', elderId: 'elder-2' }),
    prior({ id: 'question', kind: 'question' }),
    prior({ id: 'same-call', callId: 'call-current' }),
    prior({ id: 'equal', startedAt: '2026-10-20T08:00:00-04:00' }),
    prior({ id: 'future', startedAt: '2026-10-21T00:00:00Z' }),
  ];
  const [candidate] = findCandidates([item()], excluded);
  assert.equal(candidate.eligibleCount, 0);
  assert.equal(candidate.bestMatch, null);
});
test('findCandidates includes history older than seven days and compares instants across zones', () => {
  const [candidate] = findCandidates([item()], [
    prior({ id: 'ancient', startedAt: '2020-01-01T00:00:00Z', embedding: [0, 1] }),
    prior({ id: 'older-zone', startedAt: '2026-10-20T13:00:00+02:00' }),
  ]);
  assert.equal(candidate.eligibleCount, 2);
  assert.equal(candidate.bestMatch.id, 'older-zone');
});
test('findCandidates breaks score ties by latest time, then lexical id ascending regardless of order', () => {
  const history = [
    prior({ id: 'A', startedAt: '2026-10-17T00:00:00Z' }),
    prior({ id: 'z', startedAt: '2026-10-18T00:00:00Z' }),
    prior({ id: 'a', startedAt: '2026-10-18T00:00:00Z' }),
    prior({ id: 'B', startedAt: '2026-10-18T00:00:00Z' }),
  ];
  for (const rows of [history, [...history].reverse()]) {
    const [candidate] = findCandidates([item()], rows);
    assert.equal(candidate.bestMatch.id, 'B');
    assert.equal(candidate.eligibleCount, 4);
  }
});
test('findCandidates uses score ahead of recency', () => {
  const [candidate] = findCandidates([item()], [
    prior({ id: 'old-best', startedAt: '2020-01-01T00:00:00Z' }),
    prior({ id: 'new-worse', embedding: [3, 4] }),
  ]);
  assert.equal(candidate.bestMatch.id, 'old-best');
});
test('findCandidates returns one per unique current id in input order without comparing current items', () => {
  const result = findCandidates([
    item({ id: 'first' }), item({ id: 'second', callId: 'other-current', startedAt: '2026-10-21T00:00:00Z' }),
  ], []);
  assert.deepEqual(result.map((row) => [row.item.id, row.eligibleCount]), [['first', 0], ['second', 0]]);
});
for (const [name, changes] of [
  ['model', { embeddingModel: 'model-b' }],
  ['dimensions', { embeddingDimensions: 3, embedding: [1, 0, 0] }],
]) {
  test(`findCandidates rejects incompatible eligible ${name}`, () => {
    assert.throws(() => findCandidates([item()], [prior(changes)]), code('INCOMPATIBLE_EMBEDDINGS'));
  });
  test(`findCandidates ignores incompatible ${name} only when ineligible`, () => {
    const [candidate] = findCandidates([item()], [prior({ ...changes, elderId: 'other' })]);
    assert.equal(candidate.eligibleCount, 0);
  });
}
test('findCandidates rejects missing eligible vectors but permits absent vectors on ineligible history', () => {
  const missing = prior({ embedding: null, embeddingModel: null, embeddingDimensions: null });
  assert.throws(() => findCandidates([item()], [missing]), code('INVALID_HISTORY'));
  assert.equal(findCandidates([item()], [{ ...missing, kind: 'question' }])[0].eligibleCount, 0);
});
for (const [name, current, history, expected] of [
  ['duplicate current ids', [item(), item()], [], 'INVALID_INPUT'],
  ['duplicate history ids', [item()], [prior(), prior()], 'INVALID_HISTORY'],
  ['missing current vector', [item({ embedding: null, embeddingModel: null, embeddingDimensions: null })], [], 'INVALID_INPUT'],
  ['invalid current date', [item({ startedAt: 'invalid' })], [], 'INVALID_INPUT'],
  ['invalid excluded history', [item()], [prior({ elderId: 'other', embedding: [NaN, 0] })], 'INVALID_HISTORY'],
  ['invalid current kind', [item({ kind: 'other' })], [], 'INVALID_INPUT'],
  ['non-array current', null, [], 'INVALID_INPUT'],
  ['non-array history', [item()], null, 'INVALID_HISTORY'],
]) {
  test(`findCandidates rejects ${name}`, () => assert.throws(() => findCandidates(current, history), code(expected)));
}
test('findCandidates keeps comparison eligibility separate for each elder and kind', () => {
  const results = findCandidates([item(), item({ id: 'question', kind: 'question' }), item({ id: 'elder-2', elderId: 'elder-2' })], [
    prior(), prior({ id: 'q', kind: 'question' }), prior({ id: 'other', elderId: 'elder-2' }),
  ]);
  assert.deepEqual(results.map((row) => [row.bestMatch.id, row.eligibleCount]), [['prior', 1], ['q', 1], ['other', 1]]);
});
test('findCandidates does not mutate input evidence or vectors', () => {
  const current = [item()];
  const history = [prior()];
  const before = structuredClone({ current, history });
  const result = findCandidates(current, history);
  assert.deepEqual({ current, history }, before);
  assert.equal(result[0].bestMatch.quote, 'childhood memory');
});
