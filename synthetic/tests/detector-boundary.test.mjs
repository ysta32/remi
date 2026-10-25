import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCall, parseCall } from '../../detector/src/index.mjs';
import { toDetectorCall } from '../src/contracts.mjs';

let generateBundle;
try { ({ generateBundle } = await import('../src/generate.mjs')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }

// These are controlled HTTP protocol fixtures, not semantic embeddings or demo
// outputs. No truth/catalog labels inform Responses, summaries, history or vectors.
const options = {
  apiKey: 'fictional-offline-test-key', extractionModel: 'offline-test-extractor',
  embeddingModel: 'offline-test-embedding', embeddingDimensions: 3, maxRetries: 0,
};
const SENTINEL = 'PRIVATE_PLANTED_SIDECAR_SENTINEL_9f7c';
function extractionFixture(utterances) {
  const sourceTurnIndex = utterances.findIndex(turn => turn.speaker === 'caller' && turn.text.trim());
  assert.ok(sourceTurnIndex >= 0);
  const quote = utterances[sourceTurnIndex].text.slice(0, 160).trimEnd();
  return [{
    kind: 'story', summary: `Caller excerpt: ${quote.slice(0, 140)}`, quote,
    sourceTurnIndex, elicitation: 'unprompted', promptTurnIndex: null,
  }];
}
function transport(call) {
  const requests = [];
  const fixtures = extractionFixture(call.utterances);
  return { requests, fixtures, fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    assert.equal(JSON.stringify(body).includes(SENTINEL), false, 'rich planted annotations must never reach HTTP');
    if (url === 'https://api.openai.com/v1/responses') {
      assert.equal(body.store, false);
      assert.deepEqual(JSON.parse(body.input[0].content), { utterances: call.utterances });
      return Response.json({
        id: 'resp_offline', object: 'response', status: 'completed', error: null,
        incomplete_details: null, model: body.model,
        output: [{ id: 'msg_offline', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify({ items: fixtures }), annotations: [] }] }],
      });
    }
    assert.equal(url, 'https://api.openai.com/v1/embeddings', 'unexpected endpoint must fail locally');
    assert.equal(body.dimensions, 3);
    assert.deepEqual(body.input, fixtures.map(item => item.summary), 'embedding inputs contain extracted summaries only');
    return Response.json({ object: 'list', model: body.model,
      data: body.input.map((_, index) => ({ object: 'embedding', index, embedding: [1, 0, 0] })),
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
  } };
}
function addSentinels(canonical) {
  const rich = structuredClone(canonical);
  for (const field of ['label', 'incidentId', 'familyId', 'occurrenceId', 'expectedMatch', 'split']) rich[field] = SENTINEL;
  rich.groundTruth = { occurrences: [{ label: SENTINEL }] };
  rich.timing = { pauses: [{ label: SENTINEL }] };
  for (const turn of rich.utterances) {
    turn.expectedLabel = SENTINEL;
    for (const word of turn.words ?? []) word.incidentId = SENTINEL;
  }
  return rich;
}
function assertResultGrounded(result, call) {
  assert.equal(result.status, 'ok', JSON.stringify(result.error));
  assert.equal(result.provenance.isSimulated, true);
  assert.equal(JSON.stringify(result).includes(SENTINEL), false);
  for (const item of result.items) {
    assert.equal(item.isSimulated, true);
    assert.equal(item.callId, call.callId);
    assert.equal(call.utterances[item.sourceTurnIndex].speaker, 'caller');
    assert.ok(call.utterances[item.sourceTurnIndex].text.includes(item.quote));
    assert.equal(item.embeddingModel, options.embeddingModel);
    assert.equal(item.embeddingDimensions, 3);
    for (const field of ['label', 'incidentId', 'familyId', 'occurrenceId', 'split', 'expectedMatch']) assert.equal(Object.hasOwn(item, field), false);
  }
}

test('rich source sentinel fields are stripped before actual analyzeCall Responses and summary embedding requests', async () => {
  const rich = addSentinels({
    elderId: 'fictional-boundary-person', callId: 'fictional-boundary-call',
    startedAt: '2026-09-28T14:00:00.000Z', isSimulated: true,
    utterances: [
      { speaker: 'agent', text: 'Hello, it is good to speak with you.', startMs: 0, endMs: 2000 },
      { speaker: 'caller', text: 'I carried a basket of tomatoes to Linda on Sunday.', startMs: 2250, endMs: 6500,
        words: [{ w: 'I', startMs: 2250, endMs: 2670 }] },
    ],
  });
  const snapshot = structuredClone(rich);
  const exported = toDetectorCall(rich);
  assert.deepEqual(parseCall(exported), exported);
  assert.equal(JSON.stringify(exported).includes(SENTINEL), false);
  assert.deepEqual(Object.keys(exported).sort(), ['elderId', 'callId', 'startedAt', 'isSimulated', 'utterances'].sort());
  for (const turn of exported.utterances) assert.deepEqual(Object.keys(turn).sort(), ['speaker', 'text', 'startMs', 'endMs'].sort());
  const http = transport(exported);
  const result = await analyzeCall({ call: exported, history: [], processingAllowed: true }, { ...options, fetchImpl: http.fetchImpl });
  assertResultGrounded(result, exported);
  assert.equal(result.items.length, 1);
  assert.equal(result.counts.total, 0, 'empty history cannot produce a repeat');
  assert.equal(http.requests.filter(r => r.url.endsWith('/responses')).length, 1);
  assert.equal(http.requests.filter(r => r.url.endsWith('/embeddings')).length, 1);
  assert.deepEqual(rich, snapshot, 'export and analysis leave the rich source unchanged');
});

test('chronological generated replay persists only real earlier analyzeCall items through controlled HTTP transport', async () => {
  assert.equal(typeof generateBundle, 'function', 'generateBundle must implement the agreed public API');
  // Intentionally never inspect bundle.groundTruth, timings, splits or catalog.
  const { calls } = await generateBundle();
  const history = [];
  const savedIds = new Set();
  let previousTime = -Infinity;
  for (const canonical of calls) {
    assert.ok(Date.parse(canonical.startedAt) > previousTime);
    previousTime = Date.parse(canonical.startedAt);
    const call = toDetectorCall(addSentinels(canonical));
    const http = transport(call);
    const historyBefore = structuredClone(history);
    const result = await analyzeCall({ call, history, processingAllowed: true }, { ...options, fetchImpl: http.fetchImpl });
    assertResultGrounded(result, call);
    assert.equal(result.items.length, 1);
    assert.equal(result.matches.length, 1, 'one real comparison result accompanies the extracted fixture item');
    assert.deepEqual(history, historyBefore, 'analysis cannot mutate persisted prior items');
    assert.deepEqual(result.historyUpdates, [], 'returned compatible test vectors are reused');
    assert.equal(http.requests.length, 2, 'one extraction plus one new-summary embedding per call');
    if (history.length === 0) assert.equal(result.counts.total, 0);
    else for (const match of result.matches) {
      assert.ok(savedIds.has(match.candidateItemId), 'candidate IDs originate in earlier actual results');
      assert.equal(match.eligibleCount, history.length);
      const prior = history.find(item => item.id === match.candidateItemId);
      assert.ok(Date.parse(prior.startedAt) < Date.parse(call.startedAt));
      assert.equal(match.matchedCallId, prior.callId);
    }
    // Persist returned detector items unchanged; planted occurrence IDs never act
    // as detector history. No category/accuracy expectation uses these vectors.
    for (const item of result.items) {
      assert.equal(savedIds.has(item.id), false);
      savedIds.add(item.id);
      history.push(structuredClone(item));
    }
  }
  assert.equal(history.length, 12);
});
