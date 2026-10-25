import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWavWriter, startCapture, WAV_FORMAT } from '../lib/wav.mjs';
import { existsSync } from 'node:fs';
import { readConfig } from '../lib/config.mjs';

test('wav writer: 16 kHz mono 16-bit, header sizes patched on finish', async () => {
  const path = join(tmpdir(), `remi-wav-${process.pid}.wav`);
  const w = await createWavWriter(path);
  const sine = new Int16Array(16000);
  for (let i = 0; i < sine.length; i++) sine[i] = Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 16000));
  for (let i = 0; i < sine.length; i += 320) w.write(sine.subarray(i, i + 320));
  w.write(new Int16Array(1600)); // 100 ms silence
  const r = await w.finish();
  const buf = await readFile(path);
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.readUInt32LE(24), WAV_FORMAT.sampleRate);
  assert.equal(buf.readUInt16LE(22), 1);
  assert.equal(buf.readUInt16LE(34), 16);
  assert.equal(buf.readUInt32LE(40), (16000 + 1600) * 2);
  assert.equal(buf.length, 44 + (16000 + 1600) * 2);
  assert.equal(buf.readInt16LE(44 + 2 * 4), sine[4]);
  assert.equal(r.ms, 1100);
  await rm(path);
});

test('startCapture keeps frames from before the file opens, then renames to the call id', async () => {
  const dir = join(tmpdir(), `remi-cap-${process.pid}`);
  const local = join(dir, 'local-abc.wav');
  const final = join(dir, 'call-123.wav');
  const cap = startCapture(local);
  const frame = new Int16Array(320).fill(1000); // 20 ms
  cap.write(frame); cap.write(frame);           // before open resolves
  await new Promise((r) => setTimeout(r, 20));
  cap.write(frame);
  const r = await cap.finish(final);
  assert.equal(r.path, final);
  assert.equal(r.bytes, 3 * 640);
  assert.equal(r.ms, 60);
  assert.ok(!existsSync(local));
  const buf = await readFile(final);
  assert.equal(buf.readUInt32LE(40), 3 * 640);
  await rm(dir, { recursive: true, force: true });
});

test('capture is on by default; CAPTURE_AUDIO=0 turns it off', () => {
  assert.equal(readConfig({}).captureAudio, true);
  assert.equal(readConfig({ CAPTURE_AUDIO: '0' }).captureAudio, false);
});
