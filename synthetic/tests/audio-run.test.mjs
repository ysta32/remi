import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, readFile, rm, writeFile, symlink, mkdir, readdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateBundle } from '../src/generate.mjs';
import { writeBundle } from '../src/write.mjs';
import { createOpenAIProvider } from '../src/audio-provider.mjs';
const runner = await import('../src/audio-run.mjs').catch(() => null);
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  assert.equal(typeof runner?.runAudio, 'function', 'audio runner must exist');
  const root = await mkdtemp(join(await realpath(tmpdir()), 'remi-audio-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputDir = join(root, 'source'), bundle = generateBundle();
  await writeBundle(bundle, inputDir);
  return { root, inputDir, bundle };
}
function pcmData(wav) {
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.match(wav.toString('utf8'), /SIMULATED/);
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') return wav.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + size % 2;
  }
  assert.fail('missing WAV data');
}
const live = (root, inputDir, provider, output = 'audio') => ({ inputDir, outputDir: join(root, output), cacheDir: join(root, 'cache'), generate: true,
  limit: 1, callerVoiceId: 'cedar', agentVoiceId: 'marin', apiKey: 'private-test-key', provider });

test('dry run verifies canonical source without truth reads, credentials, output or network', async t => {
  const { root, inputDir, bundle } = await fixture(t);
  await rm(join(inputDir, 'ground-truth'), { recursive: true });
  await symlink(join(root, 'absent-truth'), join(inputDir, 'ground-truth'));
  const source = await runner.loadAudioSource(inputDir);
  assert.deepEqual(source.calls, bundle.calls); assert.deepEqual(source.timings, bundle.timings);
  const summary = await runner.runAudio({ inputDir, provider: { synthesize() { assert.fail('dry run network'); } } });
  assert.equal(summary.isSimulated, true); assert.equal(summary.dryRun, true);
  assert.equal(summary.callCount, 12); assert.equal(summary.segmentCount, 252); assert.equal(summary.characterCount, 30271);
  assert.deepEqual(await readdir(root), ['source']);
});

test('mock transport yields exact silence and caller muting; cache replay has identical payloads', async t => {
  const { root, inputDir, bundle } = await fixture(t); let requests = 0;
  const provider = createOpenAIProvider({ apiKey: 'private-test-key', fetchImpl: async (url, options) => {
    requests++; const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body).sort(), ['input', 'instructions', 'model', 'response_format', 'voice']);
    assert.ok(!JSON.stringify(body).includes(bundle.calls[0].callId));
    const pcm = Buffer.alloc(80); for (let i = 0; i < 40; i++) pcm.writeInt16LE(1234, i * 2);
    return new Response(pcm, { headers: { 'content-type': 'audio/pcm' } });
  } });
  const first = await runner.runAudio(live(root, inputDir, provider));
  assert.equal(first.dryRun, false); assert.equal(first.callCount, 1); assert.equal(first.cacheHits, first.segmentCount - requests); assert.ok(requests > 0);
  const output = join(root, 'audio'), manifestBytes = await readFile(join(output, 'manifest.json')), manifest = JSON.parse(manifestBytes), id = bundle.calls[0].callId;
  assert.equal(manifest.sourceManifestSha256, sha(await readFile(join(inputDir, 'manifest.json'))));
  assert.equal(manifest.isSimulated, true); assert.equal(manifest.cacheHits, undefined); assert.equal(manifest.config.seed, 42);
  assert.equal(manifest.provider, 'openai'); assert.equal(manifest.sampleRate, 24000);
  assert.equal(manifest.modelId, 'gpt-4o-mini-tts-2025-12-15');
  assert.equal(manifest.callerVoiceId, 'cedar'); assert.equal(manifest.agentVoiceId, 'marin');
  assert.equal(manifest.calls[0].callId, id); assert.equal(manifest.calls[0].requestKeys.length, first.segmentCount);
  const timing = JSON.parse(await readFile(join(output, 'timing', `${id}.json`)));
  const conversation = pcmData(await readFile(join(output, 'conversation', `${id}.wav`))), caller = pcmData(await readFile(join(output, 'caller', `${id}.wav`)));
  assert.equal(conversation.length, caller.length); assert.equal(conversation.length, timing.totalSamples * 2);
  assert.equal(timing.timingSource, 'synthetic_audio_samples');
  assert.deepEqual(timing.utterances.map(({ speaker, text }) => ({ speaker, text })), bundle.calls[0].utterances.map(({ speaker, text }) => ({ speaker, text })));
  assert.equal(timing.insertedSilences.filter(s => s.kind === 'planted').length, 8);
  for (const silence of timing.insertedSilences) {
    assert.equal(silence.endSample - silence.startSample, silence.durationMs * 24);
    assert.ok(conversation.subarray(silence.startSample * 2, silence.endSample * 2).every(byte => byte === 0));
  }
  for (const segment of timing.segments) {
    const bytes = caller.subarray(segment.startSample * 2, segment.endSample * 2);
    if (timing.utterances[segment.turnIndex].speaker === 'agent') assert.ok(bytes.every(byte => byte === 0));
    else assert.equal(bytes.readInt16LE(0), 1234);
  }
  assert.ok(!manifestBytes.includes('private-test-key'));
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(sha(await readFile(join(output, name))), hash);
  const replay = await runner.runAudio(live(root, inputDir, { synthesize() { assert.fail('cache replay network'); } }, 'replay'));
  assert.equal(replay.cacheHits, replay.segmentCount);
  for (const name of [...Object.keys(manifest.files), 'manifest.json']) assert.deepEqual(await readFile(join(root, 'replay', name)), await readFile(join(output, name)));
  assert.equal(manifest.sourceTimingSource, 'synthetic_authored');
});

test('invalid credentials, budget and limits fail before paid request or output reservation', async t => {
  const { root, inputDir } = await fixture(t), options = live(root, inputDir, { synthesize() { assert.fail('invalid options network'); } });
  for (const change of [{ apiKey: undefined }, { callerVoiceId: 'custom' }, { agentVoiceId: 'custom' }, { cacheDir: undefined }, { outputDir: undefined },
    { callerVoiceId: '../unsafe' }, { limit: 0 }, { limit: 13 }, { limit: 1.1 }, { maxCharacters: 1 }, { maxCharacters: NaN }, { generate: 'yes' }]) await assert.rejects(runner.runAudio({ ...options, ...change }));
  await assert.rejects(lstat(options.outputDir), { code: 'ENOENT' });
});

test('source tampering, symlink files/directories and manifest forgery fail before billing', async t => {
  const { root, inputDir, bundle } = await fixture(t), options = live(root, inputDir, { synthesize() { assert.fail('untrusted source network'); } });
  const filename = join(inputDir, 'calls', `${bundle.calls[0].callId}.json`), original = await readFile(filename);
  await writeFile(filename, `${original} `); await assert.rejects(runner.runAudio(options)); await writeFile(filename, original);
  const timingFile = join(inputDir, 'timing', `${bundle.calls[0].callId}.json`), timing = await readFile(timingFile);
  await rm(timingFile); await symlink(filename, timingFile); await assert.rejects(runner.runAudio(options)); await rm(timingFile); await writeFile(timingFile, timing);
  const alias = join(root, 'alias'); await symlink(inputDir, alias); await assert.rejects(runner.loadAudioSource(alias));
  const manifestPath = join(inputDir, 'manifest.json'), manifest = JSON.parse(await readFile(manifestPath));
  manifest.callIds[0] = '../escape'; await writeFile(manifestPath, JSON.stringify(manifest)); await assert.rejects(runner.runAudio(options));
});

test('fresh destination precedes synthesis; failures preserve output without completion manifest', async t => {
  const { root, inputDir } = await fixture(t), existing = join(root, 'existing'); await mkdir(existing); await writeFile(join(existing, 'sentinel'), 'keep');
  const provider = { synthesize() { assert.fail('unsafe destination network'); } };
  await assert.rejects(runner.runAudio(live(root, inputDir, provider, 'existing'))); assert.equal(await readFile(join(existing, 'sentinel'), 'utf8'), 'keep');
  const alias = join(root, 'alias'); await symlink(existing, alias);
  await assert.rejects(runner.runAudio(live(root, inputDir, provider, 'alias/new')));
  await assert.rejects(runner.runAudio({ ...live(root, inputDir, provider), cacheDir: alias }));
  let called = false;
  await assert.rejects(runner.runAudio(live(root, inputDir, { async synthesize() {
    called = true; assert.ok((await lstat(join(root, 'audio'))).isDirectory()); throw new Error('private-upstream-response');
  } })), error => !error.message.includes('private-upstream-response'));
  assert.equal(called, true); await assert.rejects(lstat(join(root, 'audio', 'manifest.json')), { code: 'ENOENT' });
});

test('CLI help/dry run stay offline and invalid arguments/credentials expose safe codes', async t => {
  const { inputDir } = await fixture(t), cli = resolve('audio-cli.mjs');
  const invoke = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  const help = invoke(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /--generate/);
  const listing = invoke(['--list-voices']); assert.equal(listing.status, 0);
  assert.ok(JSON.parse(listing.stdout).some(value => value.voiceId === 'cedar'));
  const dry = invoke(['--input', inputDir, '--limit', '1']); assert.equal(dry.status, 0); assert.equal(JSON.parse(dry.stdout).callCount, 1);
  for (const args of [['--limit', '0'], ['--input', inputDir, '--limit', '1e1'], ['--input', inputDir, '--input', inputDir], ['--help', '--generate'], ['--list-voices', '--input', inputDir]]) {
    const result = invoke(args); assert.equal(result.status, 1); assert.match(result.stderr, /^SYNTHETIC_AUDIO_[A-Z_]+\n$/); assert.equal(result.stdout, '');
  }
});

test('generation requires only an API key and defaults to cedar and marin', async t => {
  const { root, inputDir } = await fixture(t); const voices = new Set();
  await runner.runAudio({ ...live(root, inputDir, { async synthesize(request) { voices.add(request.voiceId); return Buffer.from([1, 0]); } }), callerVoiceId: undefined, agentVoiceId: undefined });
  assert.deepEqual([...voices].sort(), ['cedar', 'marin']);
  const manifest = JSON.parse(await readFile(join(root, 'audio', 'manifest.json')));
  assert.equal(manifest.callerVoiceId, 'cedar'); assert.equal(manifest.agentVoiceId, 'marin');
});
