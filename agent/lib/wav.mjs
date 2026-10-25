// Caller-audio capture for the backend's STT step (CAPTURE_AUDIO=1). Format is fixed by
// INTEGRATION.md: 16 kHz, mono, 16-bit PCM. Written to agent/tmp/calls/<callId>.wav;
// the backend deletes it after STT.
import { open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const WAV_FORMAT = Object.freeze({ sampleRate: 16000, channels: 1, bitsPerSample: 16 });

export function wavHeader(dataBytes, { sampleRate, channels, bitsPerSample } = WAV_FORMAT) {
  const h = Buffer.alloc(44);
  const blockAlign = channels * (bitsPerSample / 8);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36); h.writeUInt32LE(dataBytes, 40);
  return h;
}

/** Streams Int16 mono frames to disk; finish() patches the header sizes. */
export async function createWavWriter(path) {
  await mkdir(dirname(path), { recursive: true });
  const fh = await open(path, 'w');
  await fh.write(wavHeader(0), 0, 44, 0);
  let bytes = 0;
  let chain = Promise.resolve();
  let done = null;
  return {
    path,
    get bytes() { return bytes; },
    write(int16) {
      if (done) return;
      const buf = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
      const at = 44 + bytes;
      bytes += buf.length;
      chain = chain.then(() => fh.write(buf, 0, buf.length, at)).catch(() => {});
    },
    finish() {
      if (!done) {
        done = chain
          .then(() => fh.write(wavHeader(bytes), 0, 44, 0))
          .then(() => fh.close())
          .then(() => ({ path, bytes, ms: Math.round((bytes / 2 / WAV_FORMAT.sampleRate) * 1000) }));
      }
      return done;
    },
  };
}
