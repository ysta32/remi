import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCall, parseHistory, makeItemId } from '../src/contracts.mjs';
import { DetectorError } from '../src/errors.mjs';

const call = (overrides = {}) => ({ elderId: 'elder-1', callId: 'call-1', startedAt: '2026-10-24T09:30:00-04:00', utterances: [{ speaker: 'caller', text: 'I visited the lake.' }], ...overrides });
const item = (overrides = {}) => ({ id: 'item-1', elderId: 'elder-1', callId: 'call-0', startedAt: '2026-10-23T12:00:00Z', isSimulated: false, kind: 'story', summary: 'A lake visit', quote: 'visited the lake', sourceTurnIndex: 0, elicitation: 'unprompted', promptTurnIndex: null, ...overrides });
const rejects = (fn, code) => assert.throws(fn, (error) => error instanceof DetectorError && error.code === code && !error.message.includes('PRIVATE'));

test('call normalizes timezone, defaults simulation and drops unknown labels', () => {
  assert.deepEqual(parseCall(call({ truth: 'repeat' })), { elderId: 'elder-1', callId: 'call-1', startedAt: '2026-10-24T13:30:00.000Z', isSimulated: false, utterances: [{ speaker: 'caller', text: 'I visited the lake.' }] });
});
test('call allows empty calls, blank turns, simulation and timed agent turns', () => {
  assert.deepEqual(parseCall(call({ utterances: [] })).utterances, []);
  const utterances = [{ speaker: 'caller', text: '  ' }, { speaker: 'agent', text: '', startMs: 0, endMs: 0, truth: true }];
  assert.deepEqual(parseCall(call({ isSimulated: true, utterances })).utterances, [{ speaker: 'caller', text: '  ' }, { speaker: 'agent', text: '', startMs: 0, endMs: 0 }]);
  assert.equal(parseCall(call({ isSimulated: true })).isSimulated, true);
});
test('call rejects missing, blank, nonstring and oversized IDs', () => {
  for (const key of ['elderId', 'callId']) for (const value of [undefined, null, '', '  ', 1, 'x'.repeat(201)]) rejects(() => parseCall(call({ [key]: value })), 'INVALID_INPUT');
  assert.equal(parseCall(call({ elderId: 'x'.repeat(200) })).elderId.length, 200);
});
test('call requires real ISO datetime with explicit timezone', () => {
  for (const startedAt of [undefined, 0, 'PRIVATE', '2026-10-24', '2026-10-24T12:00:00', '2026-02-30T12:00:00Z', '2026-13-01T12:00:00Z', '2026-10-24T25:00:00Z', '2026-10-24T12:00:00+25:00']) rejects(() => parseCall(call({ startedAt })), 'INVALID_INPUT');
});
test('call rejects malformed turns and simulation labels', () => {
  for (const utterances of [undefined, null, {}, [null], [{ speaker: 'user', text: 'PRIVATE' }], [{ speaker: 'caller', text: 1 }]]) rejects(() => parseCall(call({ utterances })), 'INVALID_INPUT');
  rejects(() => parseCall(call({ isSimulated: 'true' })), 'INVALID_INPUT');
  rejects(() => parseCall(null), 'INVALID_INPUT');
});
test('call enforces complete ordered finite integer offsets', () => {
  for (const offsets of [{ startMs: 0 }, { endMs: 1 }, { startMs: -1, endMs: 0 }, { startMs: 2, endMs: 1 }, { startMs: 0.5, endMs: 1 }, { startMs: 0, endMs: Infinity }, { startMs: null, endMs: 0 }]) rejects(() => parseCall(call({ utterances: [{ speaker: 'caller', text: '', ...offsets }] })), 'INVALID_INPUT');
});
test('call enforces turn count and per-turn/total character bounds without truncating', () => {
  const turn = { speaker: 'caller', text: 'x'.repeat(20000) };
  assert.equal(parseCall(call({ utterances: Array(6).fill(turn) })).utterances.length, 6);
  rejects(() => parseCall(call({ utterances: Array(7).fill(turn) })), 'INVALID_INPUT');
  rejects(() => parseCall(call({ utterances: [{ ...turn, text: 'x'.repeat(20001) }] })), 'INVALID_INPUT');
  assert.equal(parseCall(call({ utterances: Array(1000).fill({ speaker: 'agent', text: '' }) })).utterances.length, 1000);
  rejects(() => parseCall(call({ utterances: Array(1001).fill({ speaker: 'agent', text: '' }) })), 'INVALID_INPUT');
});
test('call returns independently mutable data without modifying frozen input', () => {
  const input = Object.freeze(call({ utterances: Object.freeze([Object.freeze({ speaker: 'caller', text: 'Original' })]) }));
  const output = parseCall(input);
  output.utterances[0].text = 'Changed';
  assert.equal(input.utterances[0].text, 'Original');
});
test('history validates and normalizes saved items while dropping unknown labels', () => {
  assert.deepEqual(parseHistory([item({ truth: true })]), [item({ startedAt: '2026-10-23T12:00:00.000Z' })]);
  assert.deepEqual(parseHistory([]), []);
});
test('history accepts uncached items with nullable metadata and preserves provenance', () => {
  const saved = item({ embedding: null, embeddingModel: null, embeddingDimensions: null, extractionModel: 'extract-v1', promptVersion: 'prompt-v1' });
  assert.deepEqual(parseHistory([saved]), [{ ...saved, startedAt: '2026-10-23T12:00:00.000Z' }]);
});
test('history validates prompted agent reference shape without previous transcript', () => {
  assert.equal(parseHistory([item({ sourceTurnIndex: 3, elicitation: 'prompted', promptTurnIndex: 2 })])[0].promptTurnIndex, 2);
  for (const overrides of [{ sourceTurnIndex: -1 }, { sourceTurnIndex: 1.5 }, { elicitation: 'other' }, { elicitation: 'prompted', promptTurnIndex: null }, { elicitation: 'prompted', promptTurnIndex: 0 }, { elicitation: 'unprompted', promptTurnIndex: 0 }, { elicitation: 'uncertain', promptTurnIndex: 0 }]) rejects(() => parseHistory([item(overrides)]), 'INVALID_HISTORY');
});
test('history rejects invalid IDs, dates, labels, summaries and quotes', () => {
  for (const overrides of [{ id: '' }, { elderId: '' }, { callId: '' }, { startedAt: 'PRIVATE' }, { kind: 'other' }, { isSimulated: 'false' }, { summary: '' }, { summary: 'x'.repeat(281) }, { quote: ' ' }, { quote: 'x'.repeat(1201) }, { extractionModel: 1 }, { promptVersion: '' }]) rejects(() => parseHistory([item(overrides)]), 'INVALID_HISTORY');
  assert.equal(parseHistory([item({ summary: 'x'.repeat(280), quote: 'x'.repeat(1200) })]).length, 1);
});
test('history rejects duplicates, malformed input and oversized collections', () => {
  rejects(() => parseHistory([item(), item()]), 'INVALID_HISTORY');
  for (const value of [null, {}, [null], Array(100001)]) rejects(() => parseHistory(value), 'INVALID_HISTORY');
});
test('history requires model/dimensions for vectors and rejects incompatible shape', () => {
  const cached = item({ embedding: [1, 2], embeddingModel: 'embedding-v1', embeddingDimensions: 2 });
  assert.deepEqual(parseHistory([cached])[0].embedding, [1, 2]);
  for (const overrides of [{ embeddingModel: undefined }, { embeddingModel: '' }, { embeddingDimensions: undefined }, { embeddingDimensions: 0 }, { embeddingDimensions: 1 }, { embeddingDimensions: 1.5 }, { embedding: [] }, { embedding: [0, 0] }, { embedding: [NaN, 1] }, { embedding: [1, Infinity] }, { embedding: ['1', 2] }, { embedding: {} }]) rejects(() => parseHistory([{ ...cached, ...overrides }]), 'INVALID_HISTORY');
  for (const overrides of [{ embeddingModel: 'model' }, { embeddingDimensions: 2 }]) rejects(() => parseHistory([item(overrides)]), 'INVALID_HISTORY');
});
test('history accepts very small or large nonzero vectors and copies them', () => {
  const vector = Object.freeze([Number.MIN_VALUE, Number.MAX_VALUE]);
  const input = Object.freeze([Object.freeze(item({ embedding: vector, embeddingModel: 'model', embeddingDimensions: 2 }))]);
  const output = parseHistory(input);
  output[0].embedding[0] = 1;
  assert.equal(vector[0], Number.MIN_VALUE);
});
test('item identity is stable and based only on structured source fields', () => {
  const fields = { elderId: 'e', callId: 'c', kind: 'story', sourceTurnIndex: 0, quote: 'a' };
  assert.match(makeItemId(fields), /^item_[a-f0-9]{64}$/);
  assert.equal(makeItemId(fields), makeItemId({ quote: 'a', sourceTurnIndex: 0, kind: 'story', callId: 'c', elderId: 'e', summary: 'different' }));
  for (const overrides of [{ elderId: 'x' }, { callId: 'x' }, { kind: 'question' }, { sourceTurnIndex: 1 }, { quote: 'b' }]) assert.notEqual(makeItemId(fields), makeItemId({ ...fields, ...overrides }));
  assert.notEqual(makeItemId({ ...fields, elderId: 'a:b', callId: 'c' }), makeItemId({ ...fields, elderId: 'a', callId: 'b:c' }));
});
