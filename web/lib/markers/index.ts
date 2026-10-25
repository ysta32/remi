// computeMarkers (markers.md §1–5): interpretable speech observations for one call.
// Pure, no I/O. [HEURISTIC] engineering definitions; each person is compared only with their own baseline.
import {
  ADEQUATE_UNITS,
  MATTR_WINDOW,
  MS_PER_MINUTE,
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  RATE_PER,
  WFP_MIN_MS,
} from '../analysis/config';
import type { Lang, MarkerKey, MarkerResult, Utterance, Word } from '../types';
import { ZH_FILLERS, ZH_VAGUE } from './lexicon';
import { markerMeta, MARKER_KEYS } from './meta';
import {
  classifyEn,
  countSubstrings,
  enTokens,
  enWordIsFillerOrVague,
  hanCount,
  isZhFillerToken,
  normEnWord,
  stripForZh,
  zhTokens,
  zhWordIsFillerOrVague,
} from './tokenize';

type Confidence = MarkerResult['confidence'];
type Computed = { value: number | null; confidence: Confidence };

const NA: Computed = { value: null, confidence: 'na' };

/** Moving-average type-token ratio; plain TTR (low) below one window; null/na with no tokens. */
export function mattr(tokens: string[], window: number = MATTR_WINDOW): Computed {
  const n = tokens.length;
  if (n === 0) return NA;
  if (n < window) return { value: new Set(tokens).size / n, confidence: 'low' };
  const counts = new Map<string, number>();
  for (let i = 0; i < window; i++) counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
  let sum = counts.size / window;
  for (let i = window; i < n; i++) {
    const out = tokens[i - window];
    const c = (counts.get(out) ?? 0) - 1;
    if (c === 0) counts.delete(out);
    else counts.set(out, c);
    counts.set(tokens[i], (counts.get(tokens[i]) ?? 0) + 1);
    sum += counts.size / window;
  }
  return { value: sum / (n - window + 1), confidence: 'high' };
}

interface TextStats {
  units: number;
  fillerCount: number;
  vagueCount: number;
  mattrTokens: string[];
}

function textStats(texts: string[], lang: Lang): TextStats {
  let units = 0;
  let fillerCount = 0;
  let vagueCount = 0;
  const mattrTokens: string[] = [];
  for (const text of texts) {
    if (lang === 'en') {
      const tokens = enTokens(text);
      const c = classifyEn(tokens);
      units += tokens.length;
      fillerCount += c.fillerCount;
      vagueCount += c.vagueCount;
      tokens.forEach((t, i) => {
        if (!c.fillerMask[i]) mattrTokens.push(t);
      });
    } else {
      units += hanCount(text);
      const stripped = stripForZh(text);
      fillerCount += countSubstrings(stripped, ZH_FILLERS);
      vagueCount += countSubstrings(stripped, ZH_VAGUE);
      for (const t of zhTokens(text)) if (!isZhFillerToken(t)) mattrTokens.push(t);
    }
  }
  return { units, fillerCount, vagueCount, mattrTokens };
}

interface PauseStats {
  pauses: number[];
  wfpCount: number;
}

function pauseStats(words: Word[], agent: Utterance[], lang: Lang): PauseStats {
  const sorted = [...words].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const norm = sorted.map((w) => (lang === 'en' ? normEnWord(w.w) : w.w));
  const isFV = (i: number) => (lang === 'en' ? enWordIsFillerOrVague(norm, i) : zhWordIsFillerOrVague(norm[i]));
  const pauses: number[] = [];
  let wfpCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].endMs;
    const to = sorted[i].startMs;
    const gap = to - from;
    if (gap < PAUSE_MIN_MS || gap > PAUSE_MAX_MS) continue;
    if (agent.some((a) => a.startMs < to && a.endMs > from)) continue; // the agent's turn, not a hesitation
    pauses.push(gap);
    if (gap >= WFP_MIN_MS && (isFV(i - 1) || isFV(i))) wfpCount++;
  }
  return { pauses, wfpCount };
}

/** All marker keys except repeat_stories (computed in the pipeline), in MARKER_KEYS order. */
export function computeMarkers(utterances: Utterance[], lang: Lang): MarkerResult[] {
  const caller = utterances.filter((u) => u.speaker === 'caller');
  const agent = utterances.filter((u) => u.speaker === 'agent');
  const ts = textStats(
    caller.map((u) => u.text ?? ''),
    lang,
  );
  const U = ts.units;
  const words = caller.flatMap((u) => u.words ?? []);
  const hasWords = words.length > 0;
  const rate = (count: number): Computed => (U > 0 ? { value: (count / U) * RATE_PER, confidence: 'high' } : NA);

  // Speaking time: word span per utterance when timestamps exist, else the utterance span.
  let speakingMs = 0;
  for (const u of caller) {
    if (u.words && u.words.length > 0) {
      speakingMs += Math.max(...u.words.map((w) => w.endMs)) - Math.min(...u.words.map((w) => w.startMs));
    } else {
      speakingMs += u.endMs - u.startMs;
    }
  }
  const speechRate: Computed =
    U > 0 && speakingMs > 0
      ? { value: (U / speakingMs) * MS_PER_MINUTE, confidence: hasWords ? 'high' : 'low' }
      : NA;

  let pauseRate: Computed = NA;
  let meanPause: Computed = NA;
  let wfpRate: Computed = NA;
  if (hasWords && U > 0) {
    const ps = pauseStats(words, agent, lang);
    pauseRate = rate(ps.pauses.length);
    wfpRate = rate(ps.wfpCount);
    meanPause =
      ps.pauses.length > 0
        ? { value: ps.pauses.reduce((a, b) => a + b, 0) / ps.pauses.length, confidence: 'high' }
        : { value: null, confidence: 'low' };
  }

  const computed: Record<Exclude<MarkerKey, 'repeat_stories'>, Computed> = {
    speech_rate: speechRate,
    pause_rate: pauseRate,
    mean_pause_ms: meanPause,
    wfp_rate: wfpRate,
    filler_rate: rate(ts.fillerCount),
    vague_rate: rate(ts.vagueCount),
    mattr: mattr(ts.mattrTokens),
  };

  const adequate = U >= ADEQUATE_UNITS[lang];
  return MARKER_KEYS.filter((k): k is Exclude<MarkerKey, 'repeat_stories'> => k !== 'repeat_stories').map((key) => {
    const c = computed[key];
    const confidence: Confidence = !adequate && c.confidence === 'high' ? 'low' : c.confidence;
    return { marker: key, value: c.value, unit: markerMeta(key, lang).unit, confidence };
  });
}
