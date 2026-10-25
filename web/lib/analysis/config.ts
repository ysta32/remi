// Every analysis threshold in one place (markers.md §4–8, SPEC §11). [HEURISTIC] engineering
// values, not clinical cut-offs. Pure constants only: lib/markers imports this file too.
import type { Lang, MarkerGroup, MarkerKey } from '../types';

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
// Anti-alias low-pass before resampling to PITCH_ANALYSIS_RATE (windowed-sinc FIR).
export const PITCH_LOWPASS_HZ = 3400;
export const PITCH_FIR_TAPS = 63;
// Voicing gate: frame RMS must reach this fraction of the loud-speech level (95th-percentile
// frame RMS, i.e. within ~30 dB of it) and an absolute floor (~ -60 dBFS). Quieter speech still
// counts; YIN's periodicity test rejects hiss and noise that pass the gate.
export const PITCH_GATE_REL = 0.03;
export const PITCH_GATE_ABS = 1e-3;
export const PITCH_MEDIAN_FILTER = 5; // frames, applied within each voiced run
export const PITCH_MIN_RUN = 3; // voiced runs shorter than this are dropped (isolated blips)
export const PITCH_LOCAL_WINDOW = 21; // frames (~0.4 s) for the local octave-jump check
export const PITCH_LOCAL_JUMP_ST = 6; // drop frames this far from their local median (octave errors are 12)
export const PITCH_OUTLIER_ST = 10; // backstop: drop frames further than this from the call median
export const PITCH_SPAN_PAD_MS = 100; // padding around STT word spans
export const PITCH_MIN_VOICED_FRAMES = 500; // ~10 s of voiced speech at a 20 ms hop → 'high'
export const PITCH_MIN_FRAMES_ANY = 25; // ~0.5 s; below this, no value at all
export const PITCH_MAX_SECONDS = 30 * 60; // analyse at most the first 30 minutes of a recording
export const PITCH_YIELD_FRAMES = 250; // async tracking yields to the event loop every N frames (~100 ms of work)

// Groups that can drift toward a nudge, in display order. 'voice' (pitch) is deliberately left
// out: phone microphones, the FaceTime codec, a cold or room noise all shift pitch, so it is
// chart only until real calls show it is stable (markers.md §4b). Add 'voice' here to enable.
export const NUDGE_GROUPS: MarkerGroup[] = ['pace', 'pauses', 'words', 'repetition'];

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
