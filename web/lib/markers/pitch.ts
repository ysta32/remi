// Voice markers (markers.md §4b): pitch variation from the caller's call audio. Pure, no I/O.
// [HEURISTIC] interpretable sound measurements, compared only with the person's own usual. They
// describe how the voice rises and falls, never mood or emotion (claims policy).
//
// Pitch (F0) per frame uses YIN: de Cheveigné & Kawahara (2002), "YIN, a fundamental frequency
// estimator for speech and music", JASA 111(4). No trained model.
import {
  PITCH_ANALYSIS_RATE,
  PITCH_FRAME_MS,
  PITCH_GATE_ABS,
  PITCH_GATE_REL,
  PITCH_HOP_MS,
  PITCH_MAX_HZ,
  PITCH_MEDIAN_FILTER,
  PITCH_MIN_FRAMES_ANY,
  PITCH_MIN_HZ,
  PITCH_MIN_VOICED_FRAMES,
  PITCH_OUTLIER_ST,
  PITCH_SPAN_PAD_MS,
  YIN_THRESHOLD,
} from '../analysis/config';
import type { MarkerResult } from '../types';
import { markerMeta } from './meta';

export interface Span {
  startMs: number;
  endMs: number;
}

/** Low-pass (moving average over one output period) and resample to `rate` by linear interpolation. */
export function downsample(samples: Float32Array, fromRate: number, rate = PITCH_ANALYSIS_RATE): Float32Array {
  if (fromRate <= rate) return samples;
  const ratio = fromRate / rate;
  const win = Math.max(1, Math.round(ratio));
  // Running-sum moving average (cheap anti-aliasing; F0 <= 400 Hz is far below the new Nyquist).
  const smooth = new Float32Array(samples.length);
  let acc = 0;
  for (let i = 0; i < samples.length; i++) {
    acc += samples[i];
    if (i >= win) acc -= samples[i - win];
    smooth[i] = acc / Math.min(i + 1, win);
  }
  const n = Math.floor(samples.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = j + 1 < smooth.length ? smooth[j] * (1 - frac) + smooth[j + 1] * frac : smooth[j];
  }
  return out;
}

const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/** YIN F0 (Hz) of one frame, or null when no period clears the threshold. */
function yinFrame(x: Float32Array, start: number, win: number, tauMin: number, tauMax: number, rate: number, diff: Float64Array): number | null {
  // d(tau) = Σ (x_j − x_{j+tau})², then cumulative-mean-normalised d'(tau).
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let j = start; j < start + win; j++) {
      const d = x[j] - x[j + tau];
      s += d * d;
    }
    diff[tau] = s;
  }
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    diff[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }
  let tau = tauMin;
  for (; tau <= tauMax; tau++) {
    if (diff[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && diff[tau + 1] < diff[tau]) tau++;
      break;
    }
  }
  if (tau > tauMax) return null;
  // Parabolic interpolation around the dip.
  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const a = diff[tau - 1];
    const b = diff[tau];
    const c = diff[tau + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) refined = tau + (a - c) / (2 * denom);
  }
  return rate / refined;
}

export interface PitchTrack {
  hopMs: number;
  f0: (number | null)[]; // Hz per frame; null = unvoiced, gated or outside spans
}

/**
 * Pitch track at PITCH_HOP_MS. Frames outside `spans` (± PITCH_SPAN_PAD_MS), below the voicing
 * gate, or without a clear YIN period are null. Octave errors are cleaned with a median filter
 * and a ± PITCH_OUTLIER_ST cut around the call median.
 */
export function trackPitch(samples: Float32Array, sampleRate: number, spans?: Span[]): PitchTrack {
  const rate = PITCH_ANALYSIS_RATE;
  const x = downsample(samples, sampleRate, rate);
  const win = Math.round((PITCH_FRAME_MS / 1000) * rate);
  const hop = Math.round((PITCH_HOP_MS / 1000) * rate);
  const tauMin = Math.floor(rate / PITCH_MAX_HZ);
  const tauMax = Math.ceil(rate / PITCH_MIN_HZ);
  const nFrames = x.length >= win + tauMax ? Math.floor((x.length - win - tauMax) / hop) + 1 : 0;

  const inSpan = (frame: number): boolean => {
    if (!spans) return true;
    const centerMs = ((frame * hop + win / 2) / rate) * 1000;
    return spans.some((s) => centerMs >= s.startMs - PITCH_SPAN_PAD_MS && centerMs <= s.endMs + PITCH_SPAN_PAD_MS);
  };

  // Voicing gate from frame RMS over the analysed frames.
  const rms = new Float64Array(nFrames);
  const candidates: number[] = [];
  for (let f = 0; f < nFrames; f++) {
    if (!inSpan(f)) continue;
    let s = 0;
    for (let j = f * hop; j < f * hop + win; j++) s += x[j] * x[j];
    rms[f] = Math.sqrt(s / win);
    candidates.push(rms[f]);
  }
  const loud = percentile([...candidates].sort((a, b) => a - b), 0.95);
  const gate = Math.max(PITCH_GATE_ABS, PITCH_GATE_REL * (Number.isFinite(loud) ? loud : 0));

  const diff = new Float64Array(tauMax + 1);
  const raw: (number | null)[] = new Array(nFrames).fill(null);
  for (let f = 0; f < nFrames; f++) {
    if (!inSpan(f) || rms[f] < gate) continue;
    const hz = yinFrame(x, f * hop, win, tauMin, tauMax, rate, diff);
    if (hz !== null && hz >= PITCH_MIN_HZ && hz <= PITCH_MAX_HZ) raw[f] = hz;
  }

  // Median filter within voiced runs (removes isolated octave jumps).
  const half = Math.floor(PITCH_MEDIAN_FILTER / 2);
  const filtered = raw.map((v, i) => {
    if (v === null) return null;
    const win5: number[] = [];
    for (let k = i - half; k <= i + half; k++) {
      const w = raw[k];
      if (w !== undefined && w !== null) win5.push(w);
    }
    win5.sort((a, b) => a - b);
    return win5[Math.floor(win5.length / 2)];
  });

  const voiced = filtered.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const med = percentile(voiced, 0.5);
  const f0 = filtered.map((v) => (v !== null && Math.abs(12 * Math.log2(v / med)) <= PITCH_OUTLIER_ST ? v : null));
  return { hopMs: PITCH_HOP_MS, f0 };
}

/** pitch_var and pitch_range for one call. `adequate` comes from the transcript markers (markers.md §5). */
export function pitchMarkers(samples: Float32Array, sampleRate: number, spans: Span[] | undefined, adequate: boolean): MarkerResult[] {
  const { f0 } = trackPitch(samples, sampleRate, spans);
  const voiced = f0.filter((v): v is number => v !== null);
  const unit = markerMeta('pitch_var').unit;
  if (voiced.length < PITCH_MIN_FRAMES_ANY) {
    return [
      { marker: 'pitch_var', value: null, unit, confidence: 'low' },
      { marker: 'pitch_range', value: null, unit, confidence: 'low' },
    ];
  }
  const med = percentile([...voiced].sort((a, b) => a - b), 0.5);
  const st = voiced.map((v) => 12 * Math.log2(v / med));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const sd = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length);
  const sorted = [...st].sort((a, b) => a - b);
  const range = percentile(sorted, 0.9) - percentile(sorted, 0.1);
  const confidence = voiced.length >= PITCH_MIN_VOICED_FRAMES && adequate ? 'high' : 'low';
  return [
    { marker: 'pitch_var', value: sd, unit, confidence },
    { marker: 'pitch_range', value: range, unit, confidence },
  ];
}

/** Rows to store when a call has no audio: not available. */
export function pitchNotAvailable(): MarkerResult[] {
  const unit = markerMeta('pitch_var').unit;
  return [
    { marker: 'pitch_var', value: null, unit, confidence: 'na' },
    { marker: 'pitch_range', value: null, unit, confidence: 'na' },
  ];
}
