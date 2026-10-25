import test from 'node:test';
import assert from 'node:assert/strict';
import { timeDialogue } from '../src/timing.mjs';
import { resolveConfig } from '../src/contracts.mjs';

const config = resolveConfig();
const dialogue = [
  { speaker: 'agent', text: 'Hello there. How are you today?' },
  { speaker: 'caller', text: '  Café 👩🏽‍🌾\tand naïve stories bring back many happy memories from our lovely garden.\n' },
  { speaker: 'agent', text: 'Please go on.' },
  { speaker: 'caller', text: 'I remember the summer mornings and quiet evenings with my family beside the roses.' },
];
const options = (weekIndex = 0, seed = 42) => ({ seed, callId: 'call_example', weekIndex, config });

// Omitting/repeating pauses, assigning them to agent turns, or changing the
// week center would fail these interval-based checks.
for (let week = 0; week < 4; week++) {
  test(`week ${week}: eight unique internal caller gaps have authored weekly bounds`, () => {
    const result = timeDialogue(dialogue, options(week));
    assert.equal(result.timing.isSimulated, true);
    assert.equal(result.timing.timingSource, 'synthetic_authored');
    assert.match(result.timing.notice, /synthetic|authored/i);
    assert.equal(result.timing.weekIndex, week);
    assert.equal(result.timing.pauseCenterMs, config.pauseCentersMs[week]);
    assert.equal(result.timing.pauses.length, 8);
    const keys = new Set();
    for (const pause of result.timing.pauses) {
      const turn = result.utterances[pause.turnIndex];
      assert.equal(turn.speaker, 'caller');
      assert.equal(pause.kind, 'planted');
      assert.ok(pause.afterWordIndex >= 0 && pause.afterWordIndex < turn.words.length - 1);
      const left = turn.words[pause.afterWordIndex];
      const right = turn.words[pause.afterWordIndex + 1];
      assert.equal(pause.startMs, left.endMs);
      assert.equal(pause.endMs, right.startMs);
      assert.equal(pause.durationMs, pause.endMs - pause.startMs);
      assert.ok(Math.abs(pause.durationMs - config.pauseCentersMs[week]) <= 75);
      keys.add(`${pause.turnIndex}:${pause.afterWordIndex}`);
    }
    assert.equal(keys.size, 8);
  });
}

test('preserves Unicode, whitespace and turn order without mutating input or leaking annotations', () => {
  const source = structuredClone(dialogue);
  source[1].incidentId = 'sentinel';
  const before = structuredClone(source);
  const result = timeDialogue(source, options());
  assert.deepEqual(source, before);
  result.utterances.forEach((turn, i) => {
    assert.equal(turn.text, source[i].text);
    assert.equal(turn.speaker, source[i].speaker);
    assert.equal(turn.incidentId, undefined);
    assert.equal(turn.pauses, undefined);
    if (turn.speaker === 'caller') {
      assert.deepEqual(turn.words.map(word => word.w), source[i].text.match(/\S+/gu));
    } else assert.equal(turn.words, undefined);
  });
});

test('all intervals are ordered integer bounds; duration ends at the final word without padding', () => {
  const result = timeDialogue(dialogue, options());
  assert.equal(result.timing.ordinaryGapMs, 40);
  assert.equal(result.timing.turnGapMs, 250);
  assert.match(result.timing.wordDurationRule, /420/);
  const planted = new Set(result.timing.pauses.map(p => `${p.turnIndex}:${p.afterWordIndex}`));
  let previousEnd = null;
  result.utterances.forEach((turn, turnIndex) => {
    assert.ok(Number.isInteger(turn.startMs) && Number.isInteger(turn.endMs));
    assert.ok(turn.startMs >= 0 && turn.endMs > turn.startMs);
    assert.equal(turn.startMs, previousEnd === null ? 0 : previousEnd + 250);
    previousEnd = turn.endMs;
    if (turn.speaker === 'caller') {
      assert.equal(turn.words[0].startMs, turn.startMs);
      assert.equal(turn.words.at(-1).endMs, turn.endMs);
      turn.words.forEach((word, i) => {
        assert.ok(Number.isInteger(word.startMs) && Number.isInteger(word.endMs));
        assert.ok(word.startMs >= turn.startMs && word.endMs <= turn.endMs);
        assert.equal(word.endMs - word.startMs, 420);
        if (i && !planted.has(`${turnIndex}:${i - 1}`)) {
          assert.equal(word.startMs - turn.words[i - 1].endMs, 40);
          assert.ok(word.startMs - turn.words[i - 1].endMs < 400);
        }
      });
    } else {
      const count = turn.text.match(/\S+/gu).length;
      assert.equal(turn.endMs - turn.startMs, count * 420 + (count - 1) * 40);
    }
  });
  assert.equal(result.durationMs, result.utterances.at(-1).endMs);
  assert.ok(result.durationMs < 180000, 'short input is not stretched into a full call');
});

test('same named seed stream is reproducible and different seeds/call IDs vary placement', () => {
  const first = timeDialogue(dialogue, options());
  assert.deepEqual(first, timeDialogue(dialogue, options()));
  const locations = result => result.timing.pauses.map(({ turnIndex, afterWordIndex }) => [turnIndex, afterWordIndex]);
  assert.notDeepEqual(locations(first), locations(timeDialogue(dialogue, options(0, 43))));
  assert.notDeepEqual(locations(first), locations(timeDialogue(dialogue, { ...options(), callId: 'call_other' })));
});

test('exactly eight available boundaries work and insufficient caller boundaries fail', () => {
  const exact = [{ speaker: 'caller', text: 'one two three four five six seven eight nine' }];
  assert.equal(timeDialogue(exact, options()).timing.pauses.length, 8);
  assert.throws(() => timeDialogue([{ speaker: 'caller', text: 'only eight words are not enough for pauses' }], options()));
  assert.throws(() => timeDialogue([{ speaker: 'agent', text: 'word '.repeat(100) }], options()));
});

test('rejects invalid dialogue, week, seed, identity, and timing config', () => {
  for (const bad of [null, {}, [], [null], [{ speaker: 'other', text: 'hi' }], [{ speaker: 'caller', text: '' }], [{ speaker: 'caller', text: '  ' }], [{ speaker: 'caller', text: 3 }]]) {
    assert.throws(() => timeDialogue(bad, options()));
  }
  for (const week of [-1, 4, 0.5, NaN, '0', undefined]) {
    assert.throws(() => timeDialogue(dialogue, { ...options(), weekIndex: week }));
  }
  for (const seed of [-1, 4294967296, 1.5, NaN, '42', undefined]) {
    assert.throws(() => timeDialogue(dialogue, { ...options(), seed }));
  }
  for (const callId of ['', ' ', null, 42, undefined]) {
    assert.throws(() => timeDialogue(dialogue, { ...options(), callId }));
  }
  for (const badConfig of [undefined, null, {}, { ...config, pausesPerCall: 7 }, { ...config, pauseJitterMs: 76 }, { ...config, pauseCentersMs: [600] }]) {
    assert.throws(() => timeDialogue(dialogue, { ...options(), config: badConfig }));
  }
  assert.throws(() => timeDialogue(dialogue));
});
