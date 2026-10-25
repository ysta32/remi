// Every analysis threshold in one place (markers.md §4–8, SPEC §11). [HEURISTIC] engineering
// values, not clinical cut-offs. Pure constants only: lib/markers imports this file too.
import type { Lang, MarkerKey } from '../types';

// Pauses (markers.md §4)
export const PAUSE_MIN_MS = 400;
export const PAUSE_MAX_MS = 5000;
export const WFP_MIN_MS = 1000;

// Lexical diversity
export const MATTR_WINDOW = 50;

// A call is adequate when it has at least this many units (en words / zh Han characters).
export const ADEQUATE_UNITS: Record<Lang, number> = { en: 100, zh: 150 };

// Rates are expressed per this many units.
export const RATE_PER = 100;
export const MS_PER_MINUTE = 60000;

// Baseline and z (markers.md §7)
export const BASELINE_N = 6;
export const MIN_SPREAD_FRAC = 0.03;
export const MAD_SCALE = 1.4826;
export const MIN_SCALE = 1e-6;
// [HEURISTIC] extension of markers.md §7: a per-marker absolute floor on the z scale. Markers that
// are usually 0 (word-finding pauses, fillers) give MAD 0 and median 0, so with only the 1e-6 floor
// a single "um" scored z ≈ 400,000 and could fire a nudge on noise. Units: per-100 rates (en words
// / zh characters), ms, wpm/cpm, ratio.
export const ABS_SPREAD_FLOOR: Partial<Record<MarkerKey, number>> = {
  speech_rate: 2,
  pause_rate: 0.3,
  mean_pause_ms: 30,
  wfp_rate: 0.3,
  filler_rate: 0.3,
  vague_rate: 0.3,
  mattr: 0.005,
  pitch_var: 0.3,
  pitch_range: 0.3,
};

// Pitch / voice markers (markers.md §4b). YIN pitch tracking on the caller's call audio.
export const PITCH_ANALYSIS_RATE = 8000; // Hz; plenty for F0 <= 400 Hz, keeps YIN cheap
export const PITCH_FRAME_MS = 40;
export const PITCH_HOP_MS = 20; // 50 F0 samples/s is plenty for variability stats; halves YIN cost
export const PITCH_MIN_HZ = 60;
export const PITCH_MAX_HZ = 400;
export const YIN_THRESHOLD = 0.15;
// Voicing gate: frame RMS must reach this fraction of the loud-speech level (95th-percentile
// frame RMS) and an absolute floor (~ -60 dBFS), so silence and line hiss are skipped.
export const PITCH_GATE_REL = 0.1;
export const PITCH_GATE_ABS = 1e-3;
export const PITCH_MEDIAN_FILTER = 5; // frames
export const PITCH_OUTLIER_ST = 10; // drop frames further than this from the call median (octave errors)
export const PITCH_SPAN_PAD_MS = 100; // padding around STT word spans
export const PITCH_MIN_VOICED_FRAMES = 500; // ~10 s of voiced speech at a 20 ms hop → 'high'
export const PITCH_MIN_FRAMES_ANY = 25; // ~0.5 s; below this, no value at all

// Drift and nudges (markers.md §8)
export const DRIFT_Z = 1.5;
export const REPEAT_WEEKLY_MIN = 3;
export const DRIFT_GROUPS_MIN = 2;
export const DRIFT_WEEKS = 2;
export const MIN_ADEQUATE_CALLS_PER_WEEK = 2;
export const MIN_CALLS_FOR_NUDGE = 8;
export const MOOD_LOW_MIN = 3;
export const MOOD_WINDOW = 5;
export const NUDGE_REFIRE_DAYS = 14;

// Repetition (markers.md §6)
export const REPEAT_WINDOW_DAYS = 7;
// Tuned on fixtures/transcripts/repeat-pairs.json with text-embedding-3-small (2026-10-25):
// same-story pairs 0.62–0.77, different stories 0.39–0.51 → midpoint 0.56 (10/10). The spec's
// starting value 0.85 matched none of the same-story pairs.
export const REPEAT_COSINE = 0.56;
