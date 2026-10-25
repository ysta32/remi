// Caller-audio capture for the backend's STT step (on by default; CAPTURE_AUDIO=0 turns it off). Format is fixed by
// INTEGRATION.md: 16 kHz, mono, 16-bit PCM. Written to agent/tmp/calls/<callId>.wav;
// the backend deletes it after STT.
import { open, mkdir, rename } from 'node:fs/promises';
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

/**
 * Capture from the first caller frame: opens `path` at once and buffers frames until the
 * file is open, so nothing said before the backend answers createCall is lost.
 * finish(finalPath) closes the file and renames it (e.g. to <callId>.wav).
 */
export function startCapture(path, { log = () => {} } = {}) {
  let writer = null;
  let early = [];
  const opened = createWavWriter(path).then((w) => {
    writer = w;
    for (const f of early) w.write(f);
    early = null;
    return w;
  }).catch((err) => { early = null; log(`[wav] could not open ${path}: ${err.message}`); return null; });
  return {
    write(int16) {
      if (writer) writer.write(int16);
      else if (early) early.push(int16.slice());
    },
    async finish(finalPath = path) {
      const w = await opened;
      if (!w) return null;
      const r = await w.finish();
      if (finalPath !== path) {
        try { await rename(path, finalPath); return { ...r, path: finalPath }; } catch (err) { log(`[wav] rename failed: ${err.message}`); }
      }
      return r;
    },
  };
}
