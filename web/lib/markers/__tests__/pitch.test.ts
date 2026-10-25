import { describe, expect, it } from 'vitest';
import { pitchMarkers, trackPitch } from '@/lib/markers/pitch';
import { encodeWav16, parseWav } from '@/lib/markers/wav';

const SR = 16000;

/** Tone whose frequency follows f(t); `harmonics` adds overtones (more speech-like). */
function tone(seconds: number, f: (t: number) => number, harmonics = 1, sr = SR, amp = 0.5): Float32Array {
  const n = Math.round(seconds * sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * f(i / sr)) / sr;
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(h * phase) / h;
    out[i] = amp * v;
  }
  return out;
}

function noise(seconds: number, seed = 1): Float32Array {
  let a = seed;
  const rand = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  return Float32Array.from({ length: seconds * SR }, () => 0.3 * rand());
}

const byKey = (rs: ReturnType<typeof pitchMarkers>) => Object.fromEntries(rs.map((r) => [r.marker, r]));
const voicedHz = (s: Float32Array, sr = SR) => trackPitch(s, sr).f0.filter((v): v is number => v !== null);
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

describe('YIN pitch tracking', () => {
  it('a steady 150 Hz tone: F0 ≈ 150 Hz and almost no variation', () => {
    const hz = voicedHz(tone(12, () => 150));
    expect(hz.length).toBeGreaterThan(500);
    expect(Math.abs(median(hz) - 150)).toBeLessThan(1);
    const m = byKey(pitchMarkers(tone(12, () => 150), SR, undefined, true));
    expect(m.pitch_var.value!).toBeLessThan(0.1);
    expect(m.pitch_var.confidence).toBe('high');
  });

  it('a 120 → 180 Hz glide: pitch_range ≈ 5.6 st (p90 − p10 of a linear glide)', () => {
    const secs = 12;
    const m = byKey(pitchMarkers(tone(secs, (t) => 120 + (60 * t) / secs, 3), SR, undefined, true));
    // F0 is linear in time, so p10/p90 frequencies are 126 and 174 Hz → 12·log2(174/126) ≈ 5.59 st.
    expect(m.pitch_range.value!).toBeCloseTo(12 * Math.log2(174 / 126), 0);
    expect(m.pitch_var.value!).toBeGreaterThan(1);
  });

  it('a harmonic-rich 220 Hz tone is not halved or doubled', () => {
    const hz = voicedHz(tone(5, () => 220, 8));
    expect(Math.abs(median(hz) - 220)).toBeLessThan(2);
    expect(hz.every((v) => v > 180 && v < 260)).toBe(true);
  });

  it('white noise and silence give no voiced frames', () => {
    expect(voicedHz(noise(5)).length).toBeLessThan(20);
    expect(voicedHz(new Float32Array(5 * SR)).length).toBe(0);
    const m = byKey(pitchMarkers(new Float32Array(5 * SR), SR, undefined, true));
    expect(m.pitch_var).toMatchObject({ value: null, confidence: 'low' });
  });

  it('speech spans restrict the analysis', () => {
    // 0–5 s at 120 Hz, 5–10 s at 200 Hz; analysing only the first span sees only 120 Hz.
    const s = new Float32Array(10 * SR);
    s.set(tone(5, () => 120, 3), 0);
    s.set(tone(5, () => 200, 3), 5 * SR);
    const hz = trackPitch(s, SR, [{ startMs: 0, endMs: 4500 }]).f0.filter((v): v is number => v !== null);
    expect(hz.every((v) => v < 140)).toBe(true);
  });

  it('short or inadequate calls are low confidence', () => {
    const short = byKey(pitchMarkers(tone(3, () => 150), SR, undefined, true));
    expect(short.pitch_var.confidence).toBe('low');
    expect(short.pitch_var.value).not.toBeNull();
    const inadequate = byKey(pitchMarkers(tone(12, () => 150), SR, undefined, false));
    expect(inadequate.pitch_var.confidence).toBe('low');
  });

  it('works at 48 kHz (resampled to the analysis rate)', () => {
    const hz = voicedHz(tone(3, () => 180, 3, 48000), 48000);
    expect(Math.abs(median(hz) - 180)).toBeLessThan(1.5);
  });

  it('a 10-minute call stays within the time budget', () => {
    const s = tone(600, (t) => 130 + 20 * Math.sin(t), 3);
    const t0 = performance.now();
    pitchMarkers(s, SR, undefined, true);
    expect(performance.now() - t0).toBeLessThan(4_000);
  }, 30_000);
});

describe('WAV reader', () => {
  it('round-trips 16 kHz mono PCM16', () => {
    const s = tone(0.5, () => 200);
    const w = parseWav(encodeWav16(s, SR));
    expect(w.sampleRate).toBe(SR);
    expect(w.samples.length).toBe(s.length);
    expect(Math.abs(w.samples[100] - s[100])).toBeLessThan(1e-3);
  });

  it('downmixes stereo to mono', () => {
    const inter = new Float32Array(2000);
    for (let i = 0; i < 1000; i++) {
      inter[2 * i] = 0.5;
      inter[2 * i + 1] = -0.1;
    }
    const w = parseWav(encodeWav16(inter, 48000, 2));
    expect(w.samples.length).toBe(1000);
    expect(w.samples[10]).toBeCloseTo(0.2, 3);
  });

  it('rejects non-WAV input with a clear error', () => {
    expect(() => parseWav(new TextEncoder().encode('not audio at all'))).toThrow(/RIFF/);
  });
});
