import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWavWriter, WAV_FORMAT } from '../lib/wav.mjs';

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
