import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, symlink, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateBundle } from '../src/generate.mjs';
import { writeBundle } from '../src/write.mjs';
const reader = await import('../src/read.mjs').catch(() => null);
async function fixture(t) {
  assert.equal(typeof reader?.loadTranscriptSource, 'function', 'provider independent transcript reader exists');
  const root = await mkdtemp(join(await realpath(tmpdir()), 'remi-transcript-read-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'source'), bundle = generateBundle();
  await writeBundle(bundle, input);
  return { root, input, bundle };
}
test('reads exact profile, calls and timing without opening truth or detector files', async t => {
  const { root, input, bundle } = await fixture(t);
  for (const name of ['ground-truth', 'detector-inputs']) {
    await rm(join(input, name), { recursive: true });
    await symlink(join(root, 'missing'), join(input, name));
  }
  await rm(join(input, 'README.txt'));
  const before = await readdir(root);
  const result = await reader.loadTranscriptSource(input);
  assert.deepEqual(result.profile, bundle.profile);
  assert.deepEqual(result.calls, bundle.calls);
  assert.deepEqual(result.timings, bundle.timings);
  assert.equal(result.manifest.callIds.length, 12);
  assert.deepEqual(await readdir(root), before);
});
test('rejects changed profile/calls/timing/manifest, symlinks and malformed paths', async t => {
  const { root, input, bundle } = await fixture(t);
  for (const name of ['profile.json', 'manifest.json', `calls/${bundle.calls[0].callId}.json`, `timing/${bundle.calls[0].callId}.json`]) {
    const file = join(input, name), bytes = await readFile(file);
    await writeFile(file, Buffer.concat([bytes, Buffer.from(' ')]));
    await assert.rejects(reader.loadTranscriptSource(input));
    await rm(file); await symlink(join(root, 'missing'), file);
    await assert.rejects(reader.loadTranscriptSource(input));
    await rm(file); await writeFile(file, bytes);
  }
  await symlink(input, join(root, 'alias'));
  for (const value of [join(root, 'alias'), `${input}/`, `${root}/./source`, `${root}/x/../source`, `${input}\\bad`, '']) await assert.rejects(reader.loadTranscriptSource(value));
});

test('audio source compatibility does not add a profile-file requirement', async t => {
  const { input, bundle } = await fixture(t);
  const { loadAudioSource } = await import('../src/audio-run.mjs');
  await rm(join(input, 'profile.json'));
  assert.deepEqual((await loadAudioSource(input)).calls, bundle.calls);
  await assert.rejects(reader.loadTranscriptSource(input));
});
