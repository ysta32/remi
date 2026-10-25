import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requestKey, createOpenAIProvider, cachedSynthesize } from '../src/audio-provider.mjs';

const request = { voiceId: 'cedar', text: 'Hello there.', modelId: 'gpt-4o-mini-tts-2025-12-15', instructions: 'Read the supplied text exactly in a warm conversational tone.' };
const pcm = Buffer.from([0, 1, 2, 3]);
const hash = value => createHash('sha256').update(value).digest('hex');
async function temp(t) {
  const dir = await mkdtemp(path.join(await realpath(tmpdir()), 'remi-audio-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('request key is canonical, includes every synthesis control, and excludes metadata', () => {
  const key = requestKey(request);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(requestKey({ ...request, callId: 'private', labels: { truth: true } }), key);
  for (const [field, value] of Object.entries({ voiceId: 'marin', text: 'Other text', modelId: 'invalid', instructions: 'Read clearly.' })) {
    if (field === 'modelId') assert.throws(() => requestKey({ ...request, [field]: value }), /request/i);
    else assert.notEqual(requestKey({ ...request, [field]: value }), key);
  }
});

test('synthesis emits only allowed body fields to fixed PCM endpoint with auth and no redirects', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'test-secret', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(String(url), 'https://api.openai.com/v1/audio/speech');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), { model: 'gpt-4o-mini-tts-2025-12-15', input: 'Hello there.', voice: 'cedar', instructions: request.instructions, response_format: 'pcm' });
    return new Response(pcm, { headers: { 'content-type': 'application/octet-stream' } });
  }});
  assert.deepEqual(await provider.synthesize({ ...request, callId: 'private', sourceStart: 0, labels: ['hidden'], seed: 42, previousText: 'before', nextText: 'after' }), pcm);
  assert.equal(calls, 1);
});

test('invalid inputs fail before a request without reflecting content or credentials', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'test-secret', fetchImpl: async () => { calls++; throw Error('network'); } });
  for (const invalid of [null, { ...request, voiceId: '../secret' }, { ...request, text: '' }, { ...request, voiceId: 'custom-voice' }, { ...request, modelId: 'other-model' }, { ...request, instructions: '' }, { ...request, instructions: 'x'.repeat(4097) }, { ...request, text: 'x'.repeat(4097) }]) {
    await assert.rejects(provider.synthesize(invalid), /Invalid audio request/);
  }
  assert.equal(calls, 0);
  assert.throws(() => createOpenAIProvider({ apiKey: '' }), /configuration/i);
});

test('status and transport failures are redacted and paid POSTs never retry', async () => {
  for (const status of [401, 429, 500, 302]) {
    let calls = 0;
    const provider = createOpenAIProvider({ apiKey: 'test-secret', fetchImpl: async () => { calls++; return new Response('secret provider detail', { status }); } });
    await assert.rejects(provider.synthesize(request), error => !/test-secret|provider detail/.test(error.message) && /provider/i.test(error.message));
    assert.equal(calls, 1);
  }
  const provider = createOpenAIProvider({ apiKey: 'test-secret', fetchImpl: async () => { throw Error('test-secret payload'); } });
  await assert.rejects(provider.synthesize(request), error => !/test-secret|payload/.test(error.message));
});

test('rejects empty odd compressed or oversized PCM and bounds a chunked response', async () => {
  for (const response of [new Response(), new Response(Buffer.from([1])), new Response('ID3x', { headers: { 'content-type': 'audio/mpeg' } }), new Response(pcm, { headers: { 'content-length': '86400002' } }), new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(86400002)); controller.close(); } }))]) {
    const provider = createOpenAIProvider({ apiKey: 'fake', fetchImpl: async () => response });
    await assert.rejects(provider.synthesize(request), /provider/i);
  }
});

test('built-in voice listing is static and never calls transport', async () => {
  const provider = createOpenAIProvider({ apiKey: 'fake', fetchImpl: async () => assert.fail('voice listing network') });
  const voices = await provider.listVoices();
  assert.deepEqual(voices.map(value => value.voiceId), ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
  voices[0].voiceId = 'changed';
  assert.equal((await provider.listVoices())[0].voiceId, 'alloy');
});

test('request hashes separate OpenAI PCM from previous provider caches', () => {
  const old = hash(JSON.stringify({ provider: 'https://api.elevenlabs.io', endpoint: '/v1/text-to-speech', outputFormat: 'pcm_16000', voiceId: 'cedar', text: request.text, modelId: 'eleven_multilingual_v2', seed: 42, previousText: '', nextText: '' }));
  assert.notEqual(requestKey(request), old);
});

test('4096 character input and instructions limits are accepted before transport', async () => {
  let calls = 0;
  const provider = createOpenAIProvider({ apiKey: 'fake', fetchImpl: async () => { calls++; return new Response(pcm); } });
  assert.deepEqual(await provider.synthesize({ ...request, text: 'x'.repeat(4096), instructions: 'y'.repeat(4096) }), pcm);
  assert.equal(calls, 1);
});

test('cache uses one verified envelope and reuses bytes without invoking provider', async t => {
  const dir = path.join(await temp(t), 'new-cache'); let calls = 0;
  const provider = { synthesize: async () => { calls++; return pcm; } };
  const first = await cachedSynthesize(request, { cacheDir: dir, provider });
  assert.deepEqual(first, { pcm, cacheHit: false, key: requestKey(request) });
  const envelope = JSON.parse(await readFile(path.join(dir, `${first.key}.json`), 'utf8'));
  assert.deepEqual(envelope, { schemaVersion: 1, isSimulated: true, requestKey: first.key, sha256: hash(pcm), pcmBase64: pcm.toString('base64') });
  const second = await cachedSynthesize(request, { cacheDir: dir, provider });
  assert.deepEqual(second, { pcm, cacheHit: true, key: first.key });
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(envelope).includes(request.text));
});

test('corrupt or partial cache entries fail closed without synthesis', async t => {
  const dir = await temp(t); const key = requestKey(request); let calls = 0;
  const provider = { synthesize: async () => { calls++; return pcm; } };
  const valid = { schemaVersion: 1, isSimulated: true, requestKey: key, sha256: hash(pcm), pcmBase64: pcm.toString('base64') };
  for (const value of ['{', JSON.stringify({ ...valid, sha256: '0'.repeat(64) }), JSON.stringify({ ...valid, requestKey: 'other' }), JSON.stringify({ ...valid, pcmBase64: 'AA==' }), JSON.stringify({ ...valid, pcmBase64: 'AAECAw==\n' }), JSON.stringify({ ...valid, isSimulated: false })]) {
    await writeFile(path.join(dir, `${key}.json`), value);
    await assert.rejects(cachedSynthesize(request, { cacheDir: dir, provider }), /cache/i);
  }
  assert.equal(calls, 0);
});

test('rejects symlink cache directory ancestor and entry before synthesis', async t => {
  const base = await temp(t); const actual = path.join(base, 'actual'); await mkdir(actual);
  const link = path.join(base, 'link'); await symlink(actual, link); let calls = 0;
  const provider = { synthesize: async () => { calls++; return pcm; } };
  for (const cacheDir of [link, path.join(link, 'nested')]) await assert.rejects(cachedSynthesize(request, { cacheDir, provider }), /cache/i);
  const target = path.join(base, 'target'); await writeFile(target, 'private');
  await symlink(target, path.join(actual, `${requestKey(request)}.json`));
  await assert.rejects(cachedSynthesize(request, { cacheDir: actual, provider }), /cache/i);
  assert.equal(calls, 0);
  assert.equal(await readFile(target, 'utf8'), 'private');
});

test('invalid provider PCM never creates a reusable cache entry; failed synthesis can be resumed', async t => {
  const dir = await temp(t); let calls = 0;
  await assert.rejects(cachedSynthesize(request, { cacheDir: dir, provider: { synthesize: async () => Buffer.from([1]) } }), /PCM/i);
  await assert.rejects(cachedSynthesize(request, { cacheDir: dir, provider: { synthesize: async () => { throw Error('failed'); } } }), /failed/);
  const result = await cachedSynthesize(request, { cacheDir: dir, provider: { synthesize: async () => { calls++; return pcm; } } });
  assert.equal(result.cacheHit, false); assert.equal(calls, 1);
});

test('deadline aborts stalled body reads and exposes only a stable provider error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const provider = createOpenAIProvider({ apiKey: 'fake', fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ start() {} }));
  }});
  const result = provider.synthesize(request);
  const rejected = assert.rejects(result, /Audio provider request failed/);
  await Promise.resolve();
  t.mock.timers.tick(120000);
  await rejected;
  assert.equal(signal.aborted, true);
});

test('concurrent cache entry creation fails safely without overwriting the winner', async t => {
  const dir = await temp(t); const filename = path.join(dir, `${requestKey(request)}.json`);
  await assert.rejects(cachedSynthesize(request, { cacheDir: dir, provider: { synthesize: async () => {
    await writeFile(filename, 'winner', { flag: 'wx' });
    return pcm;
  } } }), /cache/i);
  assert.equal(await readFile(filename, 'utf8'), 'winner');
});

test('nonregular cache entries and cache directories fail closed', async t => {
  const base = await temp(t); const entryDir = path.join(base, `${requestKey(request)}.json`);
  await mkdir(entryDir); let calls = 0;
  const provider = { synthesize: async () => { calls++; return pcm; } };
  await assert.rejects(cachedSynthesize(request, { cacheDir: base, provider }), /cache/i);
  const file = path.join(base, 'plain-file'); await writeFile(file, 'text');
  await assert.rejects(cachedSynthesize(request, { cacheDir: file, provider }), /cache/i);
  assert.equal(calls, 0);
});
