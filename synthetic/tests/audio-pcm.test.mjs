import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBundle } from '../src/generate.mjs';

import { planAudioCall } from '../src/audio-plan.mjs';
import { assembleAudioCall, pcmToWav } from '../src/audio-pcm.mjs';
const options = { callerVoiceId: 'cedar', agentVoiceId: 'marin' };
function fixture() {
  return {
    call: {
      callId: 'call_example', elderId: 'synthetic_elder', startedAt: '2026-09-28T14:00:00.000Z',
      isSimulated: true, timingSource: 'synthetic_authored', groundTruth: 'SECRET_LABEL',
      utterances: [
        { speaker: 'agent', text: 'Hello.', startMs: 0, endMs: 420 },
        { speaker: 'caller', text: '  Café 👩🏽‍🌾\tand naïve.\n', startMs: 670, endMs: 2470,
          words: [
            { w: 'Café', startMs: 670, endMs: 1090 },
            { w: '👩🏽‍🌾', startMs: 1130, endMs: 1550 },
            { w: 'and', startMs: 1590, endMs: 2010 },
            { w: 'naïve.', startMs: 2010 + 40, endMs: 2470 },
          ], label: 'SECRET_LABEL' },
        { speaker: 'caller', text: 'Again.', startMs: 2720, endMs: 3140, words: [{ w: 'Again.', startMs: 2720, endMs: 3140 }] },
      ],
    },
    timing: { callId: 'call_example', isSimulated: true, timingSource: 'synthetic_authored',
      pauses: [{ kind: 'planted', turnIndex: 1, afterWordIndex: 1, startMs: 1550, endMs: 1590, durationMs: 40 }] },
  };
}
function planFixture() { const { call, timing } = fixture(); return planAudioCall(call, timing, options); }
function pcm(...values) { const result = Buffer.alloc(values.length * 2); values.forEach((v, i) => result.writeInt16LE(v, i * 2)); return result; }
function chunks(wav) {
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  const result = {};
  for (let cursor = 12; cursor < wav.length;) {
    const id = wav.toString('ascii', cursor, cursor + 4), size = wav.readUInt32LE(cursor + 4);
    assert.ok(cursor + 8 + size <= wav.length);
    result[id] = wav.subarray(cursor + 8, cursor + 8 + size);
    cursor += 8 + size + (size % 2);
  }
  return result;
}

// Wrong splitting, Unicode indexing or request allowlists all fail here.
test('planning preserves UTF-16 spans, whitespace, safe request fields, and source objects', () => {
  assert.equal(typeof planAudioCall, 'function');
  const { call, timing } = fixture(), before = structuredClone({ call, timing });
  const plan = planAudioCall(call, timing, options);
  assert.deepEqual({ call, timing }, before);
  assert.equal(plan.isSimulated, true);
  assert.equal(plan.sampleRate, 24000);
  assert.equal(plan.turnGapMs, 250);
  assert.deepEqual(plan.utterances, call.utterances.map(({ speaker, text }) => ({ speaker, text })));
  assert.deepEqual(plan.segments.map(({ turnIndex, sourceStart, sourceEnd, text }) => ({ turnIndex, sourceStart, sourceEnd, text })), [
    { turnIndex: 0, sourceStart: 0, sourceEnd: 6, text: 'Hello.' },
    { turnIndex: 1, sourceStart: 0, sourceEnd: 14, text: '  Café 👩🏽‍🌾' },
    { turnIndex: 1, sourceStart: 14, sourceEnd: 26, text: '\tand naïve.\n' },
    { turnIndex: 2, sourceStart: 0, sourceEnd: 6, text: 'Again.' },
  ]);
  assert.deepEqual(plan.segments[1].afterPause, { afterWordIndex: 1, durationMs: 40 });
  assert.deepEqual(plan.segments[1].request, { voiceId: 'cedar', text: '  Café 👩🏽‍🌾', modelId: 'gpt-4o-mini-tts-2025-12-15', instructions: plan.segments[1].request.instructions });
  assert.match(plan.segments[1].request.instructions, /older American man/i);
  assert.match(plan.segments[0].request.instructions, /gentle.*clear/i);
  assert.equal(plan.segments[0].request.voiceId, 'marin');
  assert.notEqual(plan.segments[0].request.instructions, plan.segments[1].request.instructions);
  assert.ok(!JSON.stringify(plan).includes('SECRET_LABEL'));
  assert.deepEqual(plan, planAudioCall(call, timing, options));
});

test('real generated calls preserve every source turn and send no context or seed', () => {
  const bundle = generateBundle();
  for (const [i, call] of bundle.calls.entries()) {
    const plan = planAudioCall(call, bundle.timings[i], options);
    assert.equal(plan.segments.filter(s => s.afterPause).length, 8);
    for (const [turnIndex, turn] of call.utterances.entries()) {
      assert.equal(plan.segments.filter(s => s.turnIndex === turnIndex).map(s => s.text).join(''), turn.text);
    }
    for (const segment of plan.segments) {
      assert.equal(call.utterances[segment.turnIndex].text.slice(segment.sourceStart, segment.sourceEnd), segment.text);
      assert.deepEqual(Object.keys(segment.request).sort(), ['instructions', 'modelId', 'text', 'voiceId']);
    }
  }

});

test('malformed source, identities, speech controls and planted boundaries fail closed', () => {
  const mutations = [
    x => { x.call.isSimulated = false; }, x => { x.timing.isSimulated = false; },
    x => { x.call.callId = '../escape'; }, x => { x.call.elderId = ''; },
    x => { x.call.startedAt = '2026-02-30T14:00:00.000Z'; },
    x => { x.timing.callId = 'different'; }, x => { x.timing.timingSource = 'measured'; },
    x => { x.call.utterances = []; }, x => { x.call.utterances[1].speaker = 'other'; },
    x => { x.call.utterances[1].text = '  '; }, x => { x.call.utterances[1].words[1].w = 'wrong'; },
    x => { x.timing.pauses = null; }, x => { x.timing.pauses.push({ ...x.timing.pauses[0] }); },
    ...['turnIndex', 'afterWordIndex', 'durationMs', 'startMs', 'endMs'].flatMap(key => [-1, NaN, 0.5, '1', undefined].map(value => x => { x.timing.pauses[0][key] = value; })),
    x => { x.timing.pauses[0].kind = 'ordinary'; }, x => { x.timing.pauses[0].turnIndex = 0; },
    x => { x.timing.pauses[0].afterWordIndex = 3; }, x => { x.timing.pauses[0].durationMs = 0; },
    x => { x.timing.pauses[0].durationMs = 41; }, x => { x.timing.pauses[0].startMs++; },
    x => { x.timing.pauses[0].durationMs = 1800001; },
  ];
  mutations.forEach((mutate, i) => { const input = fixture(); mutate(input); assert.throws(() => planAudioCall(input.call, input.timing, options), `mutation ${i}`); });
  for (const key of ['callerVoiceId', 'agentVoiceId', 'modelId']) {
    for (const value of ['', ' ', '../escape', null]) assert.throws(() => planAudioCall(fixture().call, fixture().timing, { ...options, [key]: value }));
  }
});

test('PCM assembly inserts exact zeros and caller isolation on a shared sample timeline', () => {
  assert.equal(typeof assembleAudioCall, 'function');
  const plan = planFixture(), buffers = [pcm(101, -102), pcm(201, -202, 203), pcm(301), pcm(401, -402)];
  const before = buffers.map(b => Buffer.from(b)), planBefore = structuredClone(plan);
  const result = assembleAudioCall(plan, buffers), full = chunks(result.conversationWav).data, caller = chunks(result.callerWav).data;
  assert.deepEqual(buffers, before); assert.deepEqual(plan, planBefore);
  assert.equal(full.length, 25936); assert.equal(caller.length, full.length);
  assert.deepEqual(full.subarray(0, 4), buffers[0]); assert.deepEqual(caller.subarray(0, 4), Buffer.alloc(4));
  assert.deepEqual(full.subarray(4, 12004), Buffer.alloc(12000));
  assert.deepEqual(full.subarray(12004, 12010), buffers[1]);
  assert.deepEqual(full.subarray(12010, 13930), Buffer.alloc(1920));
  assert.deepEqual(full.subarray(13930, 13932), buffers[2]);
  assert.deepEqual(full.subarray(13932, 25932), Buffer.alloc(12000));
  assert.deepEqual(full.subarray(25932), buffers[3]);
  assert.deepEqual(caller.subarray(4), full.subarray(4));
  assert.equal(result.timing.totalSamples, 12968); assert.equal(result.timing.durationMs, 540 + 8 / 24);
  assert.deepEqual(result.timing.utterances, [
    { speaker: 'agent', text: 'Hello.', startMs: 0, endMs: 2 / 24 },
    { speaker: 'caller', text: plan.utterances[1].text, startMs: 250 + 2 / 24, endMs: 290 + 6 / 24 },
    { speaker: 'caller', text: 'Again.', startMs: 540 + 6 / 24, endMs: 540 + 8 / 24 },
  ]);
  assert.deepEqual(result.timing.segments.map(({ startSample, endSample }) => [startSample, endSample]), [[0, 2], [6002, 6005], [6965, 6966], [12966, 12968]]);
  assert.deepEqual(result.timing.insertedSilences, [
    { kind: 'turn_gap', turnIndex: 1, startSample: 2, endSample: 6002, durationMs: 250 },
    { kind: 'planted', turnIndex: 1, startSample: 6005, endSample: 6965, durationMs: 40, afterWordIndex: 1 },
    { kind: 'turn_gap', turnIndex: 2, startSample: 6966, endSample: 12966, durationMs: 250 },
  ]);
  assert.equal(result.timing.timingSource, 'synthetic_audio_samples'); assert.equal(result.timing.isSimulated, true);
  assert.ok(!JSON.stringify(result.timing).includes('words'));
  assert.match(result.timing.notice, /inserted|planted/i);
  assert.deepEqual(result, assembleAudioCall(plan, buffers));
});

test('WAV format is mono signed PCM16 at 24000 Hz with a SIMULATED INFO comment', () => {
  assert.equal(typeof pcmToWav, 'function');
  const input = pcm(-32768, 0, 32767), wav = pcmToWav(input), parts = chunks(wav);
  assert.equal(parts['fmt '].readUInt16LE(0), 1); assert.equal(parts['fmt '].readUInt16LE(2), 1);
  assert.equal(parts['fmt '].readUInt32LE(4), 24000); assert.equal(parts['fmt '].readUInt32LE(8), 48000);
  assert.equal(parts['fmt '].readUInt16LE(12), 2); assert.equal(parts['fmt '].readUInt16LE(14), 16);
  assert.deepEqual(parts.data, input);
  assert.equal(parts.LIST.toString('ascii', 0, 4), 'INFO');
  assert.equal(parts.LIST.toString('ascii', 4, 8), 'ICMT');
  const length = parts.LIST.readUInt32LE(8);
  assert.match(parts.LIST.toString('utf8', 12, 12 + length), /SIMULATED/);
  assert.equal(parts.LIST[12 + length - 1], 0);
  assert.deepEqual(pcmToWav(input), wav);
});

test('empty, odd, wrong-count, invalid plans and output beyond 30 minutes are rejected', () => {
  const plan = planFixture(), valid = plan.segments.map(() => pcm(1));
  for (const input of [null, [], valid.slice(1), [...valid, pcm(1)], valid.map(() => Buffer.alloc(0)), valid.map(() => Buffer.alloc(3)), valid.map(() => new Uint8Array(2))]) assert.throws(() => assembleAudioCall(plan, input));
  for (const input of [null, Buffer.alloc(0), Buffer.alloc(3), new Uint8Array(2)]) assert.throws(() => pcmToWav(input));
  for (const change of [p => { p.isSimulated = false; }, p => { p.sampleRate = 8000; }, p => { p.turnGapMs = 0; }, p => { p.segments[1].turnIndex = 20; }, p => { p.segments[1].sourceStart++; }, p => { p.segments[1].afterPause.durationMs = 1800001; }]) {
    const invalid = structuredClone(plan); change(invalid); assert.throws(() => assembleAudioCall(invalid, valid));
  }
  const oversized = Buffer.alloc(1800000 * 48 + 2);
  assert.throws(() => pcmToWav(oversized), /duration|30|large|limit/i);
  assert.throws(() => assembleAudioCall(plan, [oversized, ...valid.slice(1)]), /duration|30|large|limit/i);
  const withGaps = Buffer.alloc(1800000 * 48 - 2);
  assert.throws(() => assembleAudioCall(plan, [withGaps, ...valid.slice(1)]), /duration|30|large|limit/i);
});

// Losing one pause, imposing pause input order, or adding terminal silence fails here.
test('multiple unsorted planted boundaries use source order and no terminal gap is appended', () => {
  const { call, timing } = fixture();
  call.utterances[1].text = 'one two three four';
  call.utterances[1].words.forEach((word, i) => { word.w = ['one', 'two', 'three', 'four'][i]; });
  timing.pauses = [
    { kind: 'planted', turnIndex: 1, afterWordIndex: 2, startMs: 2010, endMs: 2050, durationMs: 40 },
    { kind: 'planted', turnIndex: 1, afterWordIndex: 0, startMs: 1090, endMs: 1130, durationMs: 40 },
  ];
  const plan = planAudioCall(call, timing, options);
  assert.deepEqual(plan.segments.filter(s => s.turnIndex === 1).map(s => s.text), ['one', ' two three', ' four']);
  assert.deepEqual(plan.segments.filter(s => s.afterPause).map(s => s.afterPause.afterWordIndex), [0, 2]);
  const result = assembleAudioCall(plan, plan.segments.map(() => pcm(123)));
  assert.equal(result.timing.totalSamples, 13925);
  assert.equal(chunks(result.conversationWav).data.readInt16LE(27848), 123);
  assert.equal(result.timing.utterances.at(-1).endMs, result.timing.durationMs);
});

test('a single unpaused turn has no padding and uses default built-in voices', () => {
  const { call, timing } = fixture();
  call.utterances = [call.utterances[0]]; timing.pauses = [];
  const plan = planAudioCall(call, timing);
  assert.equal(plan.segments.length, 1);
  assert.equal(plan.segments[0].request.voiceId, 'marin');
  assert.deepEqual(Object.keys(plan.segments[0].request).sort(), ['instructions', 'modelId', 'text', 'voiceId']);
  const result = assembleAudioCall(plan, [pcm(23)]);
  assert.equal(result.timing.totalSamples, 1);
  assert.equal(result.timing.durationMs, 1 / 24);
  assert.deepEqual(result.timing.insertedSilences, []);
  assert.deepEqual(chunks(result.conversationWav).data, pcm(23));
  assert.deepEqual(chunks(result.callerWav).data, pcm(0));
});
