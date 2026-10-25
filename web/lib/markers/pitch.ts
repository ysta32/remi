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
  PITCH_FIR_TAPS,
  PITCH_HOP_MS,
  PITCH_LOCAL_JUMP_ST,
  PITCH_LOCAL_WINDOW,
  PITCH_LOWPASS_HZ,
  PITCH_MAX_HZ,
  PITCH_MIN_RUN,
  PITCH_MEDIAN_FILTER,
  PITCH_MIN_FRAMES_ANY,
  PITCH_MIN_HZ,
  PITCH_MIN_VOICED_FRAMES,
  PITCH_OUTLIER_ST,
  PITCH_SPAN_PAD_MS,
  PITCH_YIELD_FRAMES,
  YIN_THRESHOLD,
} from '../analysis/config';
import type { MarkerResult } from '../types';
import { markerMeta } from './meta';

export interface Span {
  startMs: number;
  endMs: number;
}

/** Windowed-sinc low-pass FIR (Hamming), unity DC gain. */
function lowpassKernel(cutoffHz: number, sampleRate: number, taps: number): Float32Array {
  const k = new Float32Array(taps);
  const fc = cutoffHz / sampleRate;
  const mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - mid;
    const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    k[i] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    sum += k[i];
  }
  for (let i = 0; i < taps; i++) k[i] /= sum;
  return k;
}

/**
 * Resample to `rate` for pitch analysis: a centred (zero-phase) windowed-sinc low-pass at
 * PITCH_LOWPASS_HZ, evaluated only at the output positions, then linear interpolation.
 * Inputs at or below `rate` are returned unchanged (callers must then analyse at fromRate).
 */
export function downsample(samples: Float32Array, fromRate: number, rate = PITCH_ANALYSIS_RATE): Float32Array {
  if (fromRate <= rate) return samples;
  const ratio = fromRate / rate;
  const kernel = lowpassKernel(PITCH_LOWPASS_HZ, fromRate, PITCH_FIR_TAPS);
  const taps = PITCH_FIR_TAPS;
  const mid = (taps - 1) / 2;
  const len = samples.length;
  // Filtered sample at input index c. The hot path (interior) has no bounds checks.
  const filteredAt = (c: number): number => {
    const base = c - mid;
    let acc = 0;
    if (base >= 0 && base + taps <= len) {
      for (let t = 0; t < taps; t++) acc += kernel[t] * samples[base + t];
    } else {
      for (let t = 0; t < taps; t++) {
        const idx = base + t;
        if (idx >= 0 && idx < len) acc += kernel[t] * samples[idx];
      }
    }
    return acc;
  };
  const n = Math.floor(len / ratio);
  const out = new Float32Array(n);
  if (Number.isInteger(ratio)) {
    for (let i = 0; i < n; i++) out[i] = filteredAt(i * ratio); // e.g. 16 kHz → 8 kHz: no interpolation
  } else {
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      out[i] = j + 1 >= len ? filteredAt(j) : filteredAt(j) * (1 - frac) + filteredAt(j + 1) * frac;
    }
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
function* trackSteps(samples: Float32Array, sampleRate: number, spans?: Span[]): Generator<void, PitchTrack> {
  // Analyse at 8 kHz, or at the file's own rate if it is lower (the period maths must use the
  // rate the samples are actually at).
  const rate = Math.min(sampleRate, PITCH_ANALYSIS_RATE);
  const x = downsample(samples, sampleRate, rate);
  yield;
  const win = Math.round((PITCH_FRAME_MS / 1000) * rate);
  const hop = Math.round((PITCH_HOP_MS / 1000) * rate);
  const tauMin = Math.floor(rate / PITCH_MAX_HZ);
  const tauMax = Math.ceil(rate / PITCH_MIN_HZ);
  const nFrames = x.length >= win + tauMax ? Math.floor((x.length - win - tauMax) / hop) + 1 : 0;

  // Per-frame span mask built once (O(frames + spans)) instead of scanning every span per frame.
  const mask = spanMask(nFrames, (f) => ((f * hop + win / 2) / rate) * 1000, spans);
  const inSpan = (frame: number): boolean => mask === null || mask[frame] === 1;

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
    if (f % PITCH_YIELD_FRAMES === 0 && f > 0) yield; // lets the server handle requests between chunks
    if (!inSpan(f) || rms[f] < gate) continue;
    const hz = yinFrame(x, f * hop, win, tauMin, tauMax, rate, diff);
    if (hz !== null && hz >= PITCH_MIN_HZ && hz <= PITCH_MAX_HZ) raw[f] = hz;
  }

  const filtered = cleanTrack(raw);
  const voiced = filtered.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const med = percentile(voiced, 0.5);
  const f0 = filtered.map((v) => (v !== null && Math.abs(st(v, med)) <= PITCH_OUTLIER_ST ? v : null));
  return { hopMs: PITCH_HOP_MS, f0 };
}

export function trackPitch(samples: Float32Array, sampleRate: number, spans?: Span[]): PitchTrack {
  const it = trackSteps(samples, sampleRate, spans);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Same as trackPitch, but yields to the event loop between chunks so the server stays responsive. */
export async function trackPitchAsync(samples: Float32Array, sampleRate: number, spans?: Span[]): Promise<PitchTrack> {
  const it = trackSteps(samples, sampleRate, spans);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

const st = (hz: number, ref: number) => 12 * Math.log2(hz / ref);
const medianOf = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; // true median (even count → mean of the middle two)
};

/** 1 for frames whose centre lies inside a padded span, else 0; null = no spans (analyse all). */
function spanMask(nFrames: number, centerMs: (f: number) => number, spans?: Span[]): Uint8Array | null {
  if (!spans) return null;
  const mask = new Uint8Array(nFrames);
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  let f = 0;
  for (const s of sorted) {
    const lo = s.startMs - PITCH_SPAN_PAD_MS;
    const hi = s.endMs + PITCH_SPAN_PAD_MS;
    while (f < nFrames && centerMs(f) < lo) f++;
    for (let g = f; g < nFrames && centerMs(g) <= hi; g++) mask[g] = 1;
  }
  return mask;
}

/**
 * Clean a raw pitch track run by run (a run = consecutive voiced frames; nothing crosses a gap):
 * drop runs shorter than PITCH_MIN_RUN frames (isolated blips are mostly errors), apply a true
 * median filter, then drop frames more than PITCH_LOCAL_JUMP_ST from the median of their local
 * window — catching octave halving/doubling (12 st) that a global cut around the call median
 * misses when the voice is away from its median.
 */
export function cleanTrack(raw: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = new Array(raw.length).fill(null);
  const half = Math.floor(PITCH_MEDIAN_FILTER / 2);
  const localHalf = Math.floor(PITCH_LOCAL_WINDOW / 2);
  for (let i = 0; i < raw.length; ) {
    if (raw[i] === null) {
      i++;
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j] !== null) j++;
    const run = raw.slice(i, j) as number[];
    if (run.length >= PITCH_MIN_RUN) {
      const smooth = run.map((_, k) => medianOf(run.slice(Math.max(0, k - half), Math.min(run.length, k + half + 1))));
      smooth.forEach((v, k) => {
        const local = medianOf(smooth.slice(Math.max(0, k - localHalf), Math.min(smooth.length, k + localHalf + 1)));
        if (Math.abs(st(v, local)) <= PITCH_LOCAL_JUMP_ST) out[i + k] = v;
      });
    }
    i = j;
  }
  return out;
}

/** pitch_var and pitch_range for one call. `adequate` comes from the transcript markers (markers.md §5). */
export function pitchMarkers(samples: Float32Array, sampleRate: number, spans: Span[] | undefined, adequate: boolean): MarkerResult[] {
  return summarize(trackPitch(samples, sampleRate, spans).f0, adequate);
}

/** pitchMarkers without blocking the event loop (used by the pipeline inside the Next server). */
export async function pitchMarkersAsync(samples: Float32Array, sampleRate: number, spans: Span[] | undefined, adequate: boolean): Promise<MarkerResult[]> {
  return summarize((await trackPitchAsync(samples, sampleRate, spans)).f0, adequate);
}

function summarize(f0: (number | null)[], adequate: boolean): MarkerResult[] {
  const voiced = f0.filter((v): v is number => v !== null);
  const unit = markerMeta('pitch_var').unit;
  if (voiced.length < PITCH_MIN_FRAMES_ANY) {
    return [
      { marker: 'pitch_var', value: null, unit, confidence: 'low' },
      { marker: 'pitch_range', value: null, unit, confidence: 'low' },
    ];
  }
  const med = percentile([...voiced].sort((a, b) => a - b), 0.5);
  const semis = voiced.map((v) => st(v, med));
  const mean = semis.reduce((a, b) => a + b, 0) / semis.length;
  const sd = Math.sqrt(semis.reduce((a, b) => a + (b - mean) ** 2, 0) / semis.length);
  const sorted = [...semis].sort((a, b) => a - b);
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
