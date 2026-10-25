// Fixed OpenAI speech contract; the transcript generator remains provider-independent.
export const AUDIO_PROVIDER = 'openai';
export const AUDIO_MODEL = 'gpt-4o-mini-tts-2025-12-15';
export const AUDIO_FORMAT = 'pcm';
export const SAMPLE_RATE = 24000;
export const BYTES_PER_SAMPLE = 2;
export const SAMPLES_PER_MS = SAMPLE_RATE / 1000;
export const TURN_GAP_MS = 250;
export const TURN_GAP_SAMPLES = TURN_GAP_MS * SAMPLES_PER_MS;
export const MAX_PCM_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 60 * 30;
export const MAX_TEXT_CHARACTERS = 4096;
export const CALLER_VOICE = 'cedar';
export const AGENT_VOICE = 'marin';
export const CALLER_INSTRUCTIONS = 'Speak as a warm older American man in a natural conversational tone. Read the supplied text exactly, with no added words or sound effects. Do not act out any disease or impairment.';
export const AGENT_INSTRUCTIONS = 'Speak as a gentle, clear conversational companion. Read the supplied text exactly, with no added words or sound effects. Do not act out any disease or impairment.';
const VOICES = Object.freeze(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
export const isSupportedVoice = value => VOICES.includes(value);
export const listVoices = () => VOICES.map(voiceId => ({ voiceId, name: voiceId }));
