// Minimal RIFF/WAVE reader for the pitch markers. Pure: takes bytes, returns mono float samples.
// Supports PCM 8/16/24/32-bit integer and 32-bit float, any sample rate and channel count
// (channels are averaged to mono). The agent writes 16 kHz mono PCM16 (contracts §4, A6).

export interface WavAudio {
  sampleRate: number;
  samples: Float32Array; // mono, -1..1
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

export function parseWav(buf: Uint8Array): WavAudio {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (off: number) => String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
  if (buf.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');

  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let data: { offset: number; size: number } | null = null;
  // Streaming writers leave sizes as 0 or 0xFFFFFFFF. Only then is a 0-size data chunk "unknown,
  // read to the end"; otherwise 0 means genuinely empty and later chunks (LIST…) are not audio.
  const riffSize = view.getUint32(4, true);
  const streamed = riffSize === 0 || riffSize === 0xffffffff;
  for (let off = 12; off + 8 <= buf.byteLength; ) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > buf.byteLength) throw new Error('WAV fmt chunk is truncated or too short');
      let format = view.getUint16(body, true);
      if (format === FORMAT_EXTENSIBLE && size >= 26) format = view.getUint16(body + 24, true); // SubFormat GUID's first 2 bytes
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      const avail = buf.byteLength - body;
      const unknown = size === 0xffffffff || (size === 0 && streamed);
      data = { offset: body, size: unknown || size > avail ? avail : size }; // truncated files: use what we have
      if (fmt || unknown) break; // an unknown-size data chunk runs to the end of the file
    }
    off = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt) throw new Error('WAV has no fmt chunk');
  if (!data) throw new Error('WAV has no data chunk');
  const { format, channels, sampleRate, bits } = fmt;
  if (channels < 1 || sampleRate < 1) throw new Error('WAV has an invalid fmt chunk');
  if (!((format === FORMAT_PCM && [8, 16, 24, 32].includes(bits)) || (format === FORMAT_FLOAT && bits === 32))) {
    throw new Error(`unsupported WAV encoding (format ${format}, ${bits}-bit); use PCM 16-bit`);
  }

  const bytes = bits / 8;
  const frames = Math.floor(data.size / (bytes * channels));
  const out = new Float32Array(frames);
  const read = (p: number): number => {
    if (format === FORMAT_FLOAT) return view.getFloat32(p, true);
    switch (bits) {
      case 8:
        return (view.getUint8(p) - 128) / 128;
      case 16:
        return view.getInt16(p, true) / 32768;
      case 24: {
        const v = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
        return v / 8388608;
      }
      default:
        return view.getInt32(p, true) / 2147483648;
    }
  };
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const base = data.offset + i * bytes * channels;
    for (let c = 0; c < channels; c++) sum += read(base + c * bytes);
    out[i] = sum / channels;
  }
  return { sampleRate, samples: out };
}

/** Encode mono float samples as 16-bit PCM WAV (tests and scripts). */
export function encodeWav16(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const frames = Math.floor(samples.length / channels);
  const dataSize = frames * channels * 2;
  const buf = new Uint8Array(44 + dataSize);
  const view = new DataView(buf.buffer);
  const put = (off: number, s: string) => [...s].forEach((ch, i) => (buf[off + i] = ch.charCodeAt(0)));
  put(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  put(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames * channels; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return buf;
}
