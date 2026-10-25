// Mirrors docs/contracts.md §3 exactly. Change only via the [contract] process in CLAUDE.md.

export type Lang = 'en' | 'zh';
export type ConsentKey = 'summaries' | 'funFacts' | 'speechTrends' | 'mood';
export type ConsentMap = Record<ConsentKey, boolean>;

export interface Word { w: string; startMs: number; endMs: number }

export interface Utterance {
  speaker: 'caller' | 'agent';
  text: string;
  startMs: number;
  endMs: number;
  words?: Word[];          // caller only; present after post-call STT
}

export interface CallContext {
  elder: { id: string; displayName: string; preferredName: string; language: Lang; timezone: string; about: string };
  family: { primaryContactName: string; members: { name: string; relation: string }[] };
  consent: { proposed: ConsentMap; elderConfirmed: boolean; effective: ConsentMap };
  lastCall: { id: string; endedAt: string; summary: string } | null;
  knownFacts: string[];    // <= 10 most recent fun_facts.text
  recentStories: string[]; // <= 8 caller-initiated story summaries, last 14 days (continuity only)
  photos: { id: string; caption: string; people: string; imageUrl: string }[]; // <= 5, least recently shown first
  familyQuestion: { id: string; text: string; askedBy: string } | null;       // oldest pending
  theme: { id: string; title: string; prompt: string };                       // prompt in elder's language
  isFirstCall: boolean;
  demoMode: boolean;
}

export type CallEvent =
  | { type: 'photo_shown'; atMs: number; payload: { photoId: string } }
  | { type: 'question_asked'; atMs: number; payload: { questionId: string } }
  | { type: 'consent'; atMs: number; payload: Partial<ConsentMap> }
  | { type: 'safety'; atMs: number; payload: { category: 'self_harm' | 'medical_emergency' | 'other'; note: string } };

export type MarkerKey =
  | 'speech_rate' | 'pause_rate' | 'mean_pause_ms' | 'wfp_rate'
  | 'filler_rate' | 'vague_rate' | 'mattr' | 'repeat_stories';
export type MarkerGroup = 'pace' | 'pauses' | 'words' | 'repetition';

export interface MarkerResult {
  marker: MarkerKey;
  value: number | null;
  unit: string;                       // 'wpm' | 'cpm' | 'per100w' | 'per100c' | 'ms' | 'ratio' | 'count'
  confidence: 'high' | 'low' | 'na';
}

export interface NudgeReason {
  weeks: { isoWeek: string; driftingGroups: MarkerGroup[]; markerZ: Partial<Record<MarkerKey, number>> }[];
  plainLanguage: string[];            // e.g. "speaking a bit more slowly than usual"
}

export interface CallCard {
  id: string;
  startedAt: string;
  durationS: number | null;
  status: 'in_progress' | 'processing' | 'done' | 'failed';
  summary: string | null;             // null unless summaries consented
  photosShown: { id: string; caption: string }[];
  familyQuestion: { text: string; askedBy: string; answer: string | null } | null;
  mood: 'positive' | 'neutral' | 'low' | null; // null unless mood consented
  isSimulated: boolean;
}

export interface MarkerSeries {
  key: MarkerKey;
  label: string;
  explainer: string;                  // one plain-language sentence
  unit: string;
  concern: 'up' | 'down';
  group: MarkerGroup;
  baseline: { median: number; mad: number; n: number } | null;
  points: { callId: string; at: string; value: number | null; z: number | null; confidence: 'high' | 'low' | 'na'; isSimulated: boolean }[];
}

export interface Timeline {
  elder: { id: string; displayName: string; preferredName: string; language: Lang };
  consent: { proposed: ConsentMap; elderConfirmed: boolean; effective: ConsentMap };
  calls: CallCard[];                  // newest first
  funFacts: { id: string; text: string; quote: string; askedBy: string | null; at: string; isSimulated: boolean }[]; // [] unless consented
  markers: MarkerSeries[];            // [] unless speechTrends consented
  repeats: { summary: string; dates: string[]; isSimulated: boolean }[]; // [] unless speechTrends consented
  nudges: { id: string; type: 'cognitive_checkup' | 'wellbeing'; createdAt: string; message: string; link: string | null; isSimulated: boolean }[];
  processing: boolean;
  generatedAt: string;
}
