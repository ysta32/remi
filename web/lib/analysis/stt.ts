// Post-call STT adapter: word-level timestamps for caller audio.
// STT_PROVIDER=none -> null; openai -> /audio/transcriptions with verbose_json + word timestamps;
// deepgram is not configured. This module never deletes the WAV (the pipeline does, after the acoustic step).
import fs from 'node:fs';
import { config } from '@/lib/config';
import type { Lang, Word } from '@/lib/types';
import { getOpenAI } from './llm';

/** Raw provider word: seconds, as returned by OpenAI TranscriptionWord. */
export interface RawWord { word: string; start: number; end: number }
export type SttTransport = (req: { wavPath: string; lang: Lang; prompt: string }) => Promise<RawWord[]>;

// whisper-1 is the model documented to return word timestamps (verbose_json +
// timestamp_granularities). The gpt-4o(-mini)-transcribe models only return `json`.
export const DEFAULT_STT_MODEL = 'whisper-1';
const sttModel = () => process.env.OPENAI_STT_MODEL || DEFAULT_STT_MODEL;

// Whisper tends to drop disfluencies unless the prompt contains them; a filler-rich prompt
// in the audio's language nudges it to keep "um/uh" and 嗯/呃/那个.
export const FILLER_PROMPTS: Record<Lang, string> = {
  en: 'Um, uh, so, you know, I mean, er... hmm, well, uh, the thing is, um, I was, uh, thinking.',
  zh: '嗯，呃，那个，就是说，嗯……那个东西，呃，我想想，嗯。',
};

const openaiTransport: SttTransport = async ({ wavPath, lang, prompt }) => {
  const res = await getOpenAI().audio.transcriptions.create({
    file: fs.createReadStream(wavPath),
    model: sttModel(),
    language: lang,
    prompt,
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
    temperature: 0,
  });
  return res.words ?? [];
};

const defaultTransport: SttTransport = (req) => {
  const provider = config.sttProvider;
  if (provider === 'openai') return openaiTransport(req);
  throw new Error(`${provider} provider not configured`);
};

let transport: SttTransport | null = null;
/** Test hook: replace the provider call (also bypasses STT_PROVIDER). Pass null to restore. */
export function setSttTransportForTests(fn: SttTransport | null): void {
  transport = fn;
}

export function toWords(raw: RawWord[]): Word[] {
  return raw
    .map((r) => ({ w: r.word.trim(), startMs: Math.round(r.start * 1000), endMs: Math.round(r.end * 1000) }))
    .filter((w) => w.w.length > 0)
    .map((w) => (w.endMs < w.startMs ? { ...w, endMs: w.startMs } : w));
}

export async function transcribeWords(wavPath: string, lang: Lang): Promise<Word[] | null> {
  if (!transport && config.sttProvider === 'none') return null;
  const raw = await (transport ?? defaultTransport)({ wavPath, lang, prompt: FILLER_PROMPTS[lang] });
  return toWords(raw);
}
