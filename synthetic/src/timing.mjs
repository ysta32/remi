import { makeRng, shuffle } from './random.mjs';

// Authored timing model, never an estimate from audio. Every whitespace token
// receives 420 ms, independent of its spelling, seed, or target call duration.
// With 40 ms between tokens this is approximately 130.4 words/minute; turn and
// planted gaps make the complete conversation slower. There is no end padding.
const WORD_MS = 420;
const ORDINARY_GAP_MS = 40;
const TURN_GAP_MS = 250;
const CENTERS_MS = [600, 850, 1100, 1400];
const JITTER_MS = 75;
const PAUSE_COUNT = 8;

function validateOptions({ seed, callId, weekIndex, config }) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError('seed must be a uint32');
  }
  if (typeof callId !== 'string' || !callId.trim()) {
    throw new TypeError('callId must be a nonempty string');
  }
  if (!Number.isInteger(weekIndex) || weekIndex < 0 || weekIndex >= CENTERS_MS.length) {
    throw new RangeError('weekIndex must be an integer from 0 through 3');
  }
  if (!config || config.pausesPerCall !== PAUSE_COUNT || config.pauseJitterMs !== JITTER_MS ||
      !Array.isArray(config.pauseCentersMs) || config.pauseCentersMs.length !== CENTERS_MS.length ||
      !CENTERS_MS.every((center, i) => config.pauseCentersMs[i] === center)) {
    throw new TypeError('config must contain the resolved authored pause rules');
  }
}

/** Assign deterministic synthetic intervals without altering source text. */
export function timeDialogue(utterances, options = {}) {
  validateOptions(options);
  const { seed, callId, weekIndex } = options;
  if (!Array.isArray(utterances) || utterances.length === 0) {
    throw new TypeError('utterances must be a nonempty array');
  }
  const tokenized = [];
  const boundaries = [];
  for (const [turnIndex, turn] of utterances.entries()) {
    if (!turn || !['caller', 'agent'].includes(turn.speaker) || typeof turn.text !== 'string') {
      throw new TypeError('each utterance needs caller/agent speaker and text');
    }
    const tokens = turn.text.match(/\S+/gu);
    if (!tokens) throw new TypeError('utterance text must contain a word');
    tokenized.push(tokens);
    if (turn.speaker === 'caller') {
      for (let afterWordIndex = 0; afterWordIndex < tokens.length - 1; afterWordIndex++) {
        boundaries.push({ turnIndex, afterWordIndex });
      }
    }
  }
  if (boundaries.length < PAUSE_COUNT) {
    throw new RangeError('at least eight internal caller word boundaries are required');
  }

  // Independent named streams keep placement independent of jitter draw count.
  const placementRng = makeRng(seed, JSON.stringify(['timing-placement', callId]));
  const jitterRng = makeRng(seed, JSON.stringify(['timing-jitter', callId, weekIndex]));
  const selected = new Set(shuffle(boundaries, placementRng).slice(0, PAUSE_COUNT)
    .map(({ turnIndex, afterWordIndex }) => `${turnIndex}:${afterWordIndex}`));
  const pauses = [];
  const timed = [];
  const pauseCenterMs = CENTERS_MS[weekIndex];
  let cursor = 0;
  for (const [turnIndex, turn] of utterances.entries()) {
    if (turnIndex > 0) cursor += TURN_GAP_MS;
    const startMs = cursor;
    const words = [];
    const tokens = tokenized[turnIndex];
    for (const [wordIndex, w] of tokens.entries()) {
      const wordStart = cursor;
      cursor += WORD_MS;
      if (turn.speaker === 'caller') words.push({ w, startMs: wordStart, endMs: cursor });
      if (wordIndex === tokens.length - 1) continue;
      if (selected.has(`${turnIndex}:${wordIndex}`)) {
        const durationMs = pauseCenterMs + Math.floor(jitterRng() * (2 * JITTER_MS + 1)) - JITTER_MS;
        const pauseStart = cursor;
        cursor += durationMs;
        pauses.push({ turnIndex, afterWordIndex: wordIndex, startMs: pauseStart,
          endMs: cursor, durationMs, kind: 'planted' });
      } else cursor += ORDINARY_GAP_MS;
    }
    // Use an explicit output allowlist: timing provenance stays in its sidecar.
    const output = { speaker: turn.speaker, text: turn.text, startMs, endMs: cursor };
    if (turn.speaker === 'caller') output.words = words;
    timed.push(output);
  }
  return {
    utterances: timed,
    durationMs: cursor,
    timing: {
      isSimulated: true,
      timingSource: 'synthetic_authored',
      notice: 'Synthetic authored timing and planted pauses; no audio was measured.',
      weekIndex,
      pauseCenterMs,
      pauses,
      ordinaryGapMs: ORDINARY_GAP_MS,
      turnGapMs: TURN_GAP_MS,
      wordDurationRule: 'Each whitespace token has a fixed authored duration of 420 ms for both speakers; no stretching or terminal padding.',
    },
  };
}
