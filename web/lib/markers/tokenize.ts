// Tokenization and lexicon matching for markers (markers.md §2–3). Pure, no I/O.
import { EN_FILLER_PHRASES, EN_FILLER_TOKENS, EN_VAGUE_TOKENS, ZH_FILLERS, ZH_VAGUE } from './lexicon';

const enSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
const zhSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

// Built with the RegExp constructor so the TS target (ES2017) doesn't reject the `u` property escapes.
const HAN_RE = new RegExp('\\p{Script=Han}', 'gu');
const ZH_STRIP_RE = new RegExp('[\\p{P}\\p{S}\\s]', 'gu');

/** English word-like tokens, lowercased. */
export function enTokens(text: string): string[] {
  const out: string[] = [];
  for (const s of enSegmenter.segment(text)) if (s.isWordLike) out.push(s.segment.toLowerCase());
  return out;
}

/** Mandarin word-like tokens (ICU dictionary segmentation). */
export function zhTokens(text: string): string[] {
  const out: string[] = [];
  for (const s of zhSegmenter.segment(text)) if (s.isWordLike) out.push(s.segment);
  return out;
}

/** Number of Han characters (punctuation, Latin and digits excluded). */
export function hanCount(text: string): number {
  return text.match(HAN_RE)?.length ?? 0;
}

/** Caller text with punctuation, symbols and whitespace removed (zh substring matching). */
export function stripForZh(text: string): string {
  return text.replace(ZH_STRIP_RE, '');
}

/** Non-overlapping left-to-right count of any of `needles` in `text` (longest match first at each position). */
export function countSubstrings(text: string, needles: readonly string[]): number {
  const sorted = [...needles].sort((a, b) => b.length - a.length);
  let count = 0;
  let i = 0;
  while (i < text.length) {
    const hit = sorted.find((n) => n.length > 0 && text.startsWith(n, i));
    if (hit) {
      count++;
      i += hit.length;
    } else {
      i++;
    }
  }
  return count;
}

export interface EnClassified {
  fillerCount: number;
  vagueCount: number;
  /** true for every token that is part of a filler (single token or phrase). */
  fillerMask: boolean[];
}

/** Count English fillers (phrases consume their tokens, so "you know" counts once) and vague words. */
export function classifyEn(tokens: string[]): EnClassified {
  const fillerMask = tokens.map(() => false);
  let fillerCount = 0;
  let vagueCount = 0;
  let i = 0;
  while (i < tokens.length) {
    const phrase = EN_FILLER_PHRASES.find((p) => p.every((t, k) => tokens[i + k] === t));
    if (phrase) {
      fillerCount++;
      for (let k = 0; k < phrase.length; k++) fillerMask[i + k] = true;
      i += phrase.length;
      continue;
    }
    if (EN_FILLER_TOKENS.has(tokens[i])) {
      fillerCount++;
      fillerMask[i] = true;
    } else if (EN_VAGUE_TOKENS.has(tokens[i])) {
      vagueCount++;
    }
    i++;
  }
  return { fillerCount, vagueCount, fillerMask };
}

/** A timestamped English word, normalised to the same form as `enTokens`. */
export function normEnWord(w: string): string {
  return enTokens(w).join(' ');
}

/** True if a Mandarin token is made only of filler characters (excluded from MATTR). */
export function isZhFillerToken(token: string): boolean {
  let rest = token;
  for (const f of ZH_FILLERS) rest = rest.split(f).join('');
  return rest.length === 0;
}

/** True if a Mandarin word token contains a filler or vague substring (word-finding pauses). */
export function zhWordIsFillerOrVague(token: string): boolean {
  return [...ZH_FILLERS, ...ZH_VAGUE].some((s) => token.includes(s));
}

/** True if English word `i` (normalised) is a filler/vague word, or part of a filler phrase with its neighbours. */
export function enWordIsFillerOrVague(words: string[], i: number): boolean {
  const w = words[i];
  if (EN_FILLER_TOKENS.has(w) || EN_VAGUE_TOKENS.has(w)) return true;
  return EN_FILLER_PHRASES.some((p) => {
    for (let k = 0; k < p.length; k++) {
      const start = i - k;
      if (start >= 0 && p.every((t, j) => words[start + j] === t)) return true;
    }
    return false;
  });
}
