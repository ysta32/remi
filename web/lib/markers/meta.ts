// Marker labels, family-facing explainers, units, concern direction and group (markers.md §4–5).
import type { Lang, MarkerGroup, MarkerKey } from '../types';

export interface MarkerMeta {
  label: string;
  explainer: string;
  unit: string;
  concern: 'up' | 'down';
  group: MarkerGroup;
}

export const MARKER_KEYS: MarkerKey[] = [
  'speech_rate', 'pause_rate', 'mean_pause_ms', 'wfp_rate',
  'filler_rate', 'vague_rate', 'mattr', 'repeat_stories',
];

const META: Record<MarkerKey, MarkerMeta> = {
  speech_rate: { label: 'Speaking pace', explainer: 'How quickly he talks while speaking, compared with his usual.', unit: 'wpm', concern: 'down', group: 'pace' },
  pause_rate: { label: 'Pauses', explainer: 'How often he pauses mid-thought.', unit: 'per100w', concern: 'up', group: 'pauses' },
  mean_pause_ms: { label: 'Pause length', explainer: 'How long those pauses usually last.', unit: 'ms', concern: 'up', group: 'pauses' },
  wfp_rate: { label: 'Searching for words', explainer: 'Longer pauses next to words like "um" or "thing."', unit: 'per100w', concern: 'up', group: 'pauses' },
  filler_rate: { label: 'Filler words', explainer: 'Words like "um" and "uh."', unit: 'per100w', concern: 'up', group: 'words' },
  vague_rate: { label: 'General words', explainer: 'Words like "thing" or "stuff" in place of a specific word.', unit: 'per100w', concern: 'up', group: 'words' },
  mattr: { label: 'Word variety', explainer: 'How varied his vocabulary is within a stretch of talk.', unit: 'ratio', concern: 'down', group: 'words' },
  repeat_stories: { label: 'Retold stories', explainer: 'Stories he brought up himself that he also told in another call that week.', unit: 'count', concern: 'up', group: 'repetition' },
};

/** Units are per-language for rate markers (wpm/cpm, per100w/per100c); `lang` defaults to en. */
export function markerMeta(key: MarkerKey, lang: Lang = 'en'): MarkerMeta {
  const m = META[key];
  if (lang === 'zh') {
    if (m.unit === 'wpm') return { ...m, unit: 'cpm' };
    if (m.unit === 'per100w') return { ...m, unit: 'per100c' };
  }
  return m;
}

/** Family-facing phrase per drifting group (markers.md §8), used in NudgeReason.plainLanguage. */
export const GROUP_PLAIN_LANGUAGE: Record<MarkerGroup, string> = {
  pace: 'speaking a bit more slowly than usual',
  pauses: 'pausing more often or for longer',
  words: 'using more filler or general words, or a narrower range of words',
  repetition: 'retelling some of the same stories within a week',
};
