import { describe, expect, it } from 'vitest';
import { cleanTrack, pitchMarkers, trackPitch } from '@/lib/markers/pitch';
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
    expect(hz.length).toBeGreaterThan(100); // not vacuous: the span really was analysed
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

  // Wall-clock budget: opt-in (PITCH_PERF=1) so a busy machine can't make the suite flaky.
  it.runIf(process.env.PITCH_PERF === '1')('a 10-minute call stays within the time budget', () => {
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

describe('review regressions', () => {
  it('analyses audio below 8 kHz at its own rate (no 8000/fromRate scaling)', () => {
    for (const sr of [6000, 7000]) {
      const hz = voicedHz(tone(4, () => 150, 3, sr), sr);
      expect(hz.length).toBeGreaterThan(50);
      expect(Math.abs(median(hz) - 150)).toBeLessThan(1.5);
    }
  });

  it('cleanTrack: true median within runs, no bleed across gaps, short blips dropped', () => {
    // A 2-frame run can't spread an octave error: runs under PITCH_MIN_RUN are dropped.
    expect(cleanTrack([150, 300])).toEqual([null, null]);
    // Even-sized windows use the mean of the middle two, not the upper value (no upward bias).
    // Frame 1 sees all four values [100,110,100,110] → 105 (frame 0 sees only three → 100).
    const out = cleanTrack([100, 110, 100, 110]);
    expect(out[1]).toBe(105);
    // A single voiced frame between runs is not replaced by its neighbours.
    const gap = cleanTrack([150, 150, 150, null, 300, null, 150, 150, 150]);
    expect(gap[4]).toBeNull();
  });

  it('removes an octave error away from the call median', () => {
    // Call median ~200 Hz; a run at 260 Hz with one halved frame (130 Hz = -7.5 st from the call
    // median, so the global ±10 st cut alone would keep it).
    const run = [...Array(10).fill(260), 130, ...Array(10).fill(260)];
    const track = [...Array(40).fill(180), null, ...run, null, ...Array(40).fill(200)];
    const out = cleanTrack(track);
    expect(out.filter((v) => v !== null && v < 150)).toEqual([]);
  });

  it('keeps quieter stretches (gate is ~30 dB below loud speech)', () => {
    const loud = tone(10, () => 140, 3, SR, 0.5);
    const quiet = tone(20, () => 140, 3, SR, 0.5 * 10 ** (-24 / 20)); // 24 dB quieter
    const s = new Float32Array(loud.length + quiet.length);
    s.set(loud, 0);
    s.set(quiet, loud.length);
    const f0 = trackPitch(s, SR).f0;
    const quietVoiced = f0.slice(Math.ceil(f0.length / 3) + 5).filter((v) => v !== null).length;
    expect(quietVoiced).toBeGreaterThan(800);
  });

  it('anti-alias filter: a strong 5 kHz component does not shift a 120 Hz voice', () => {
    const v = tone(5, () => 120, 3);
    const hiss = tone(5, () => 5000, 1, SR, 0.5);
    const s = v.map((x, i) => x + hiss[i]);
    expect(Math.abs(median(voicedHz(s)) - 120)).toBeLessThan(1);
  });

  it('WAV: a 0-size data chunk followed by LIST is empty, not LIST bytes', () => {
    const parts = [
      new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0))),
      new Uint8Array(4), // RIFF size patched below
      new Uint8Array([...'WAVEfmt '].map((c) => c.charCodeAt(0))),
    ];
    const fmt = new Uint8Array(20);
    const fv = new DataView(fmt.buffer);
    fv.setUint32(0, 16, true);
    fv.setUint16(4, 1, true);
    fv.setUint16(6, 1, true);
    fv.setUint32(8, 16000, true);
    fv.setUint32(12, 32000, true);
    fv.setUint16(16, 2, true);
    fv.setUint16(18, 16, true);
    const data = new Uint8Array([...'data'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0]));
    const list = new Uint8Array([...'LIST'].map((c) => c.charCodeAt(0)).concat([4, 0, 0, 0], [...'INFO'].map((c) => c.charCodeAt(0))));
    const all = new Uint8Array([...parts, fmt, data, list].reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of [...parts, fmt, data, list]) {
      all.set(p, o);
      o += p.length;
    }
    new DataView(all.buffer).setUint32(4, all.length - 8, true);
    expect(parseWav(all).samples.length).toBe(0);
  });

  it('WAV: a truncated fmt chunk gives a clear error', () => {
    const w = encodeWav16(new Float32Array(10), SR);
    expect(() => parseWav(w.slice(0, 26))).toThrow(/fmt chunk is truncated/);
  });

  it('WAV: 24-bit PCM is decoded with the right sign', () => {
    const w = encodeWav16(new Float32Array([0.5, -0.5]), SR);
    // Rebuild as 24-bit: header fields + samples (0.5 → 0x400000, -0.5 → 0xC00000).
    const b = new Uint8Array(44 + 6);
    b.set(w.slice(0, 44));
    const v = new DataView(b.buffer);
    v.setUint32(4, 36 + 6, true);
    v.setUint32(28, SR * 3, true);
    v.setUint16(32, 3, true);
    v.setUint16(34, 24, true);
    v.setUint32(40, 6, true);
    b.set([0x00, 0x00, 0x40, 0x00, 0x00, 0xc0], 44);
    const s = parseWav(b).samples;
    expect(s[0]).toBeCloseTo(0.5, 5);
    expect(s[1]).toBeCloseTo(-0.5, 5);
  });
});
