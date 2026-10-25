import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCandidates } from '../src/classify.mjs';
import { findCandidates } from '../src/compare.mjs';
import { DetectorError } from '../src/errors.mjs';

const item = (overrides = {}) => ({
  id: 'new', elderId: 'elder', callId: 'current', startedAt: '2026-10-20T00:00:00Z',
  isSimulated: true, kind: 'story', summary: 'A camping trip.', quote: 'camping trip',
  sourceTurnIndex: 1, elicitation: 'unprompted', promptTurnIndex: null,
  embedding: [1, 0], embeddingModel: 'model', embeddingDimensions: 2, ...overrides,
});
const previous = (overrides = {}) => item({ id: 'old', callId: 'prior', startedAt: '2026-10-19T00:00:00Z', ...overrides });
const candidate = (overrides = {}) => ({ item: item(), bestMatch: previous(), similarity: 0.85, eligibleCount: 1, ...overrides });
const invalid = (error) => error instanceof DetectorError && error.code === 'INVALID_INPUT';
const zeroCounts = { total: 0, unprompted: 0, prompted: 0, uncertain: 0, stories: 0, questions: 0 };

test('classifies exactly at provisional default threshold with the strongest prior link', () => {
  assert.deepEqual(classifyCandidates([candidate()]), {
    threshold: 0.85,
    matches: [{ itemId: 'new', kind: 'story', elicitation: 'unprompted', isRepeat: true,
      similarity: 0.85, matchedItemId: 'old', matchedCallId: 'prior',
      candidateItemId: 'old', candidateCallId: 'prior', eligibleCount: 1 }],
    counts: { total: 1, unprompted: 1, prompted: 0, uncertain: 0, stories: 1, questions: 0 },
  });
});
test('retains below-threshold candidate evidence while clearing matched links', () => {
  const result = classifyCandidates([candidate({ similarity: 0.849999 })]);
  assert.deepEqual(result.matches, [{ itemId: 'new', kind: 'story', elicitation: 'unprompted',
    isRepeat: false, similarity: 0.849999, matchedItemId: null, matchedCallId: null,
    candidateItemId: 'old', candidateCallId: 'prior', eligibleCount: 1 }]);
  assert.deepEqual(result.counts, zeroCounts);
});
test('no history is never a repeat, including threshold zero', () => {
  const result = classifyCandidates([candidate({ bestMatch: null, similarity: null, eligibleCount: 0 })], { threshold: 0 });
  assert.deepEqual(result.matches, [{ itemId: 'new', kind: 'story', elicitation: 'unprompted',
    isRepeat: false, similarity: null, matchedItemId: null, matchedCallId: null,
    candidateItemId: null, candidateCallId: null, eligibleCount: 0 }]);
  assert.deepEqual(result.counts, zeroCounts);
  assert.equal(result.threshold, 0);
});
test('accepts closed threshold endpoints and negative cosine scores', () => {
  assert.equal(classifyCandidates([candidate({ similarity: 0 })], { threshold: 0 }).matches[0].isRepeat, true);
  assert.equal(classifyCandidates([candidate({ similarity: 1 })], { threshold: 1 }).matches[0].isRepeat, true);
  assert.equal(classifyCandidates([candidate({ similarity: -1 })], { threshold: 0 }).matches[0].isRepeat, false);
});
test('empty candidates return fresh zero counts', () => {
  assert.deepEqual(classifyCandidates([]), { matches: [], counts: zeroCounts, threshold: 0.85 });
});
test('counts only repeats in elicitation buckets and separates stories from questions', () => {
  const rows = [
    ['a', 'story', 'unprompted', 0.9], ['b', 'question', 'prompted', 0.95],
    ['c', 'story', 'uncertain', 1], ['d', 'question', 'unprompted', 0.85],
    ['e', 'story', 'prompted', 0.8],
  ].map(([id, kind, elicitation, similarity]) => candidate({
    item: item({ id, kind, elicitation, promptTurnIndex: elicitation === 'prompted' ? 0 : null }),
    bestMatch: previous({ kind }), similarity,
  }));
  const result = classifyCandidates(rows);
  assert.deepEqual(result.matches.map((row) => row.itemId), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(result.counts, { total: 4, unprompted: 2, prompted: 1, uncertain: 1, stories: 2, questions: 2 });
});
test('real comparison integration counts several matching prior items only once per current item', () => {
  const candidates = findCandidates([item()], [previous(), previous({ id: 'older', startedAt: '2026-10-18T00:00:00Z' }), previous({ id: 'weak', embedding: [0, 1] })]);
  const result = classifyCandidates(candidates);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchedItemId, 'old');
  assert.equal(result.matches[0].eligibleCount, 3);
  assert.deepEqual(result.counts, { total: 1, unprompted: 1, prompted: 0, uncertain: 0, stories: 1, questions: 0 });
});
test('does not mutate frozen candidate evidence', () => {
  const row = candidate();
  Object.freeze(row.item.embedding); Object.freeze(row.item);
  Object.freeze(row.bestMatch.embedding); Object.freeze(row.bestMatch); Object.freeze(row);
  const input = Object.freeze([row]);
  const before = structuredClone(input);
  classifyCandidates(input);
  assert.deepEqual(input, before);
});
for (const threshold of [NaN, Infinity, -Infinity, -0.01, 1.01, '0.85', null, true]) {
  test(`rejects invalid threshold ${String(threshold)}`, () => assert.throws(() => classifyCandidates([], { threshold }), invalid));
}
for (const [name, rows] of [
  ['non-array candidates', null], ['sparse candidates', Array(1)], ['null candidate', [null]],
  ['duplicate current IDs', [candidate(), candidate()]],
  ['blank current ID', [candidate({ item: item({ id: ' ' }) })]],
  ['missing current item', [candidate({ item: null })]],
  ['invalid kind', [candidate({ item: item({ kind: 'other' }) })]],
  ['invalid elicitation', [candidate({ item: item({ elicitation: 'other' }) })]],
  ['invalid best ID', [candidate({ bestMatch: previous({ id: '' }) })]],
  ['missing best item', [candidate({ bestMatch: undefined })]],
  ['best with null score', [candidate({ similarity: null })]],
  ['null best with score', [candidate({ bestMatch: null })]],
  ['no best but positive eligible count', [candidate({ bestMatch: null, similarity: null })]],
  ['best but zero eligible count', [candidate({ eligibleCount: 0 })]],
  ['negative eligible count', [candidate({ eligibleCount: -1 })]],
  ['fractional eligible count', [candidate({ eligibleCount: 1.1 })]],
  ['unsafe eligible count', [candidate({ eligibleCount: Number.MAX_SAFE_INTEGER + 1 })]],
  ['foreign best elder', [candidate({ bestMatch: previous({ elderId: 'other' }) })]],
  ['best from same call', [candidate({ bestMatch: previous({ callId: 'current' }) })]],
  ['best from same item', [candidate({ bestMatch: previous({ id: 'new' }) })]],
  ['best of different kind', [candidate({ bestMatch: previous({ kind: 'question' }) })]],
  ['best at equal time', [candidate({ bestMatch: previous({ startedAt: '2026-10-20T00:00:00Z' }) })]],
  ['best from future', [candidate({ bestMatch: previous({ startedAt: '2026-10-21T00:00:00Z' }) })]],
]) {
  test(`rejects ${name}`, () => assert.throws(() => classifyCandidates(rows), invalid));
}
for (const similarity of [NaN, Infinity, -Infinity, -1.001, 1.001, '0.9', undefined, true]) {
  test(`rejects invalid similarity ${String(similarity)}`, () => assert.throws(() => classifyCandidates([candidate({ similarity })]), invalid));
}
for (const options of [null, [], 'options', 1]) {
  test(`rejects malformed options ${String(options)}`, () => assert.throws(() => classifyCandidates([], options), invalid));
}
