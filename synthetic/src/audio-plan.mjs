import { toDetectorCall } from './contracts.mjs';
import { AUDIO_MODEL, SAMPLE_RATE, TURN_GAP_MS, MAX_TEXT_CHARACTERS, CALLER_VOICE, AGENT_VOICE, CALLER_INSTRUCTIONS, AGENT_INSTRUCTIONS, isSupportedVoice } from './audio-config.mjs';

const MAX_MS = 30 * 60 * 1000;
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function invalid() { throw new TypeError('Invalid simulated audio source or options.'); }

/** Plan provider text only; source word times remain in the authored sidecar. */
export function planAudioCall(call, timing, options = {}) {
  const { callerVoiceId = CALLER_VOICE, agentVoiceId = AGENT_VOICE, modelId = AUDIO_MODEL } = options;
  if (!isSupportedVoice(callerVoiceId) || !isSupportedVoice(agentVoiceId) || modelId !== AUDIO_MODEL) invalid();
  if (!call || call.isSimulated !== true || !safeId(call.callId) || !safeId(call.elderId) ||
      call.timingSource !== 'synthetic_authored' || !timing || timing.isSimulated !== true ||
      timing.timingSource !== 'synthetic_authored' || timing.callId !== call.callId || !Array.isArray(timing.pauses)) invalid();
  const parsed = toDetectorCall(call);
  if (!parsed.utterances.length) invalid();
  const utterances = parsed.utterances.map(({ speaker, text }) => ({ speaker, text }));
  const tokens = utterances.map(({ text }) => [...text.matchAll(/\S+/gu)]);
  for (const [turnIndex, turn] of utterances.entries()) {
    if (!tokens[turnIndex].length) invalid();
    if (turn.speaker !== 'caller') continue;
    const words = call.utterances[turnIndex].words;
    if (!Array.isArray(words) || words.length !== tokens[turnIndex].length) invalid();
    for (const [i, word] of words.entries()) {
      if (!word || word.w !== tokens[turnIndex][i][0] || !integer(word.startMs) || !integer(word.endMs) ||
          word.endMs <= word.startMs || (i > 0 && word.startMs < words[i - 1].endMs)) invalid();
    }
  }
  const byTurn = utterances.map(() => []), seen = new Set();
  for (const pause of timing.pauses) {
    if (!pause || pause.kind !== 'planted' || !integer(pause.turnIndex) || !integer(pause.afterWordIndex) ||
        !integer(pause.durationMs) || pause.durationMs === 0 || pause.durationMs > MAX_MS ||
        !integer(pause.startMs) || !integer(pause.endMs)) invalid();
    const turn = call.utterances[pause.turnIndex], boundary = `${pause.turnIndex}:${pause.afterWordIndex}`;
    if (!turn || turn.speaker !== 'caller' || seen.has(boundary)) invalid();
    const left = turn.words[pause.afterWordIndex], right = turn.words[pause.afterWordIndex + 1];
    if (!left || !right || pause.startMs !== left.endMs || pause.endMs !== right.startMs ||
        pause.durationMs !== pause.endMs - pause.startMs) invalid();
    seen.add(boundary);
    byTurn[pause.turnIndex].push(pause);
  }
  const segments = [];
  for (const [turnIndex, turn] of utterances.entries()) {
    const pauses = [...byTurn[turnIndex]].sort((a, b) => a.afterWordIndex - b.afterWordIndex);
    let sourceStart = 0;
    for (const pause of [...pauses, null]) {
      const token = pause && tokens[turnIndex][pause.afterWordIndex];
      const sourceEnd = pause ? token.index + token[0].length : turn.text.length;
      const text = turn.text.slice(sourceStart, sourceEnd);
      if (!text.trim() || text.length > MAX_TEXT_CHARACTERS) invalid();
      segments.push({
        index: segments.length, turnIndex, speaker: turn.speaker, text, sourceStart, sourceEnd,
        afterPause: pause ? { afterWordIndex: pause.afterWordIndex, durationMs: pause.durationMs } : null,
        request: {
          voiceId: turn.speaker === 'caller' ? callerVoiceId : agentVoiceId,
          text, modelId, instructions: turn.speaker === 'caller' ? CALLER_INSTRUCTIONS : AGENT_INSTRUCTIONS,
        },
      });
      sourceStart = sourceEnd;
    }
  }
  return {
    callId: parsed.callId, elderId: parsed.elderId, startedAt: parsed.startedAt,
    isSimulated: true, sampleRate: SAMPLE_RATE, turnGapMs: TURN_GAP_MS, utterances, segments,
  };
}
