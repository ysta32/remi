import { SAMPLE_RATE, SAMPLES_PER_MS, TURN_GAP_MS, TURN_GAP_SAMPLES, MAX_PCM_BYTES } from './audio-config.mjs';
const MAX_SAMPLES = SAMPLE_RATE * 30 * 60;
const MAX_BYTES = MAX_PCM_BYTES;
const NOTICE = 'SIMULATED synthesized audio. Times derive from PCM samples. Inserted planted pauses and turn gaps are exact silence; provider speech may contain additional natural silence. Caller-only audio mutes agent speech on the same timeline; it is for acoustic isolation, not a full speaker transcript. Source word timing remains synthetic authored timing in the source sidecar.';
const COMMENT = Buffer.from('SIMULATED synthetic conversation; generated speech and inserted silence.\0', 'utf8');
const integer = value => Number.isSafeInteger(value) && value >= 0;
function invalid() { throw new TypeError('Invalid simulated audio plan or PCM buffers.'); }
function validatePcm(pcm) {
  if (!Buffer.isBuffer(pcm) || pcm.length === 0 || pcm.length % 2 !== 0) invalid();
  if (pcm.length > MAX_BYTES) throw new RangeError('Audio duration exceeds the 30 minute limit.');
}

/** Wrap raw 24000 Hz mono signed little-endian PCM16 in a labelled RIFF WAV. */
export function pcmToWav(pcm) {
  validatePcm(pcm);
  const commentPadded = COMMENT.length + COMMENT.length % 2;
  const listSize = 4 + 8 + commentPadded;
  const result = Buffer.alloc(12 + 24 + 8 + listSize + 8 + pcm.length);
  result.write('RIFF', 0, 'ascii'); result.writeUInt32LE(result.length - 8, 4); result.write('WAVE', 8, 'ascii');
  result.write('fmt ', 12, 'ascii'); result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(SAMPLE_RATE, 24); result.writeUInt32LE(SAMPLE_RATE * 2, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34);
  result.write('LIST', 36, 'ascii'); result.writeUInt32LE(listSize, 40); result.write('INFO', 44, 'ascii');
  result.write('ICMT', 48, 'ascii'); result.writeUInt32LE(COMMENT.length, 52); COMMENT.copy(result, 56);
  const dataOffset = 44 + listSize;
  result.write('data', dataOffset, 'ascii'); result.writeUInt32LE(pcm.length, dataOffset + 4); pcm.copy(result, dataOffset + 8);
  return result;
}

function validatePlan(plan) {
  if (!plan || plan.isSimulated !== true || plan.sampleRate !== SAMPLE_RATE || plan.turnGapMs !== TURN_GAP_MS ||
      typeof plan.callId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(plan.callId) ||
      !Array.isArray(plan.utterances) || !plan.utterances.length || plan.utterances.length > 1000 ||
      !Array.isArray(plan.segments) || !plan.segments.length || plan.segments.length > 120000) invalid();
  let totalCharacters = 0;
  const groups = plan.utterances.map(turn => {
    if (!turn || !['caller', 'agent'].includes(turn.speaker) || typeof turn.text !== 'string' ||
        !/\S/u.test(turn.text) || turn.text.length > 20000) invalid();
    totalCharacters += turn.text.length;
    return [];
  });
  if (totalCharacters > 120000) invalid();
  let expectedTurn = 0, expectedStart = 0;
  for (const [index, segment] of plan.segments.entries()) {
    if (!segment || segment.index !== index || segment.turnIndex !== expectedTurn || !integer(segment.sourceEnd)) invalid();
    const turn = plan.utterances[expectedTurn];
    if (!turn || segment.speaker !== turn.speaker || segment.sourceStart !== expectedStart ||
        segment.sourceEnd <= expectedStart || segment.sourceEnd > turn.text.length ||
        segment.text !== turn.text.slice(expectedStart, segment.sourceEnd) || !/\S/u.test(segment.text)) invalid();
    const final = segment.sourceEnd === turn.text.length;
    if (final) {
      if (segment.afterPause !== null) invalid();
    } else {
      const pause = segment.afterPause;
      if (turn.speaker !== 'caller' || !pause || !integer(pause.afterWordIndex) ||
          !integer(pause.durationMs) || pause.durationMs === 0 || pause.durationMs > 30 * 60 * 1000) invalid();
      const token = [...turn.text.matchAll(/\S+/gu)][pause.afterWordIndex];
      if (!token || token.index + token[0].length !== segment.sourceEnd || !/\S/u.test(turn.text.slice(segment.sourceEnd))) invalid();
    }
    groups[expectedTurn].push(segment);
    expectedStart = segment.sourceEnd;
    if (final) { expectedTurn++; expectedStart = 0; }
  }
  if (expectedTurn !== plan.utterances.length || expectedStart !== 0) invalid();
  return groups;
}

/** Assemble two sample-aligned tracks without assigning synthetic word times. */
export function assembleAudioCall(plan, pcmBuffers) {
  const groups = validatePlan(plan);
  if (!Array.isArray(pcmBuffers) || pcmBuffers.length !== plan.segments.length) invalid();
  for (const pcm of pcmBuffers) validatePcm(pcm);
  let totalSamples = (groups.length - 1) * TURN_GAP_SAMPLES;
  for (const segment of plan.segments) {
    totalSamples += pcmBuffers[segment.index].length / 2 + (segment.afterPause?.durationMs ?? 0) * SAMPLES_PER_MS;
    if (totalSamples > MAX_SAMPLES) throw new RangeError('Audio duration exceeds the 30 minute limit.');
  }
  const conversation = Buffer.alloc(totalSamples * 2), caller = Buffer.alloc(totalSamples * 2);
  const utterances = [], segments = [], insertedSilences = [];
  let cursor = 0;
  for (const [turnIndex, group] of groups.entries()) {
    if (turnIndex > 0) {
      insertedSilences.push({ kind: 'turn_gap', turnIndex, startSample: cursor, endSample: cursor + TURN_GAP_SAMPLES, durationMs: TURN_GAP_MS });
      cursor += TURN_GAP_SAMPLES;
    }
    const turnStart = cursor, turn = plan.utterances[turnIndex];
    for (const segment of group) {
      const pcm = pcmBuffers[segment.index], endSample = cursor + pcm.length / 2;
      pcm.copy(conversation, cursor * 2);
      if (segment.speaker === 'caller') pcm.copy(caller, cursor * 2);
      segments.push({ index: segment.index, turnIndex, sourceStart: segment.sourceStart, sourceEnd: segment.sourceEnd, startSample: cursor, endSample });
      cursor = endSample;
      if (segment.afterPause) {
        const { afterWordIndex, durationMs } = segment.afterPause, endSample = cursor + durationMs * SAMPLES_PER_MS;
        insertedSilences.push({ kind: 'planted', turnIndex, startSample: cursor, endSample, durationMs, afterWordIndex });
        cursor = endSample;
      }
    }
    utterances.push({ speaker: turn.speaker, text: turn.text, startMs: turnStart / SAMPLES_PER_MS, endMs: cursor / SAMPLES_PER_MS });
  }
  return {
    conversationWav: pcmToWav(conversation), callerWav: pcmToWav(caller),
    timing: {
      callId: plan.callId, isSimulated: true, timingSource: 'synthetic_audio_samples', sampleRate: SAMPLE_RATE,
      totalSamples, durationMs: totalSamples / SAMPLES_PER_MS, utterances, segments, insertedSilences, notice: NOTICE,
    },
  };
}
