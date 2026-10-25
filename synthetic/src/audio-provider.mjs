import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { AUDIO_PROVIDER, AUDIO_MODEL, AUDIO_FORMAT, SAMPLE_RATE, MAX_PCM_BYTES, MAX_TEXT_CHARACTERS, isSupportedVoice, listVoices } from './audio-config.mjs';

const ORIGIN = 'https://api.openai.com';
const ENDPOINT = '/v1/audio/speech';
const MAX_CACHE_BYTES = Math.ceil(MAX_PCM_BYTES / 3) * 4 + 1024;
const TIMEOUT_MS = 120000;
const digest = value => createHash('sha256').update(value).digest('hex');
const providerError = () => new Error('Audio provider request failed');
const cacheError = () => new Error('Audio cache is unsafe or invalid');

function canonicalRequest(request) {
  if (!request || typeof request !== 'object' || !isSupportedVoice(request.voiceId) ||
      typeof request.text !== 'string' || !request.text.trim() || request.text.length > MAX_TEXT_CHARACTERS ||
      request.modelId !== AUDIO_MODEL || typeof request.instructions !== 'string' ||
      !request.instructions.trim() || request.instructions.length > MAX_TEXT_CHARACTERS) {
    throw new Error('Invalid audio request');
  }
  // This allowlist is shared by hashing and transport; metadata never crosses it.
  return { voiceId: request.voiceId, text: request.text, modelId: AUDIO_MODEL, instructions: request.instructions };
}

export function requestKey(request) {
  return digest(JSON.stringify({ provider: AUDIO_PROVIDER, origin: ORIGIN, endpoint: ENDPOINT,
    outputFormat: AUDIO_FORMAT, sampleRate: SAMPLE_RATE, ...canonicalRequest(request) }));
}

function validPcm(pcm) {
  return Buffer.isBuffer(pcm) && pcm.length > 0 && pcm.length % 2 === 0 && pcm.length <= MAX_PCM_BYTES;
}

async function readBoundedBody(response, maxBytes) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw providerError();
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw providerError();
      chunks.push(Buffer.from(value));
    }
  } finally {
    // A rejected oversized stream must stop consuming provider bytes.
    if (size > maxBytes) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function createOpenAIProvider({ apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) || typeof fetchImpl !== 'function') {
    throw new Error('Invalid audio provider configuration');
  }
  async function send(url, { method, body }, maxBytes) {
    const controller = new AbortController();
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(providerError()); }, TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([expired, (async () => {
        const response = await fetchImpl(url, { method, redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (!response.ok) throw providerError();
        const bytes = await readBoundedBody(response, maxBytes);
        return { bytes, type: (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() };
      })()]);
    } catch {
      controller.abort();
      // Do not include causes, URLs, response bodies, or upstream error messages.
      throw providerError();
    } finally { clearTimeout(timer); }
  }
  return {
    async synthesize(request) {
      const value = canonicalRequest(request);
      const { bytes, type } = await send(`${ORIGIN}${ENDPOINT}`, {
        method: 'POST', body: { model: value.modelId, input: value.text, voice: value.voiceId,
          instructions: value.instructions, response_format: AUDIO_FORMAT }
      }, MAX_PCM_BYTES);
      if (!validPcm(bytes) || (type && !['application/octet-stream', 'audio/pcm', 'audio/x-pcm'].includes(type))) throw providerError();
      return bytes;
    },
    listVoices,

  };
}

async function ensureCacheDirectory(cacheDir) {
  if (typeof cacheDir !== 'string' || !cacheDir || cacheDir.includes('\0')) throw cacheError();
  const absolute = path.resolve(cacheDir);
  let current = path.parse(absolute).root;
  // Do not realpath user input: doing so would silently accept symlink ancestors.
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stats;
    try { stats = await lstat(current); } catch (error) {
      if (error.code !== 'ENOENT') throw cacheError();
      try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw cacheError(); }
      stats = await lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw cacheError();
  }
  return absolute;
}

async function readEnvelope(filename, key) {
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw cacheError();
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_CACHE_BYTES) throw cacheError();
    // Read a bounded amount even if the file grows after stat.
    const bytes = Buffer.alloc(stats.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length !== stats.size) throw cacheError();
    const value = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (!value || Object.keys(value).sort().join(',') !== 'isSimulated,pcmBase64,requestKey,schemaVersion,sha256' ||
        value.schemaVersion !== 1 || value.isSimulated !== true || value.requestKey !== key ||
        typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.pcmBase64 !== 'string') throw cacheError();
    const pcm = Buffer.from(value.pcmBase64, 'base64');
    if (!validPcm(pcm) || pcm.toString('base64') !== value.pcmBase64 || digest(pcm) !== value.sha256) throw cacheError();
    return pcm;
  } catch { throw cacheError(); } finally { await handle.close(); }
}

export async function cachedSynthesize(request, { cacheDir, provider } = {}) {
  const key = requestKey(request);
  let directory;
  try { directory = await ensureCacheDirectory(cacheDir); } catch { throw cacheError(); }
  const filename = path.join(directory, `${key}.json`);
  const existing = await readEnvelope(filename, key);
  if (existing) return { pcm: existing, cacheHit: true, key };
  if (!provider || typeof provider.synthesize !== 'function') throw new Error('Invalid audio provider configuration');
  const pcm = await provider.synthesize(canonicalRequest(request));
  if (!validPcm(pcm)) throw new Error('Invalid provider PCM');
  const envelope = JSON.stringify({ schemaVersion: 1, isSimulated: true, requestKey: key, sha256: digest(pcm), pcmBase64: pcm.toString('base64') });
  let handle;
  try {
    await ensureCacheDirectory(directory);
    handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(envelope, 'utf8');
    await handle.sync();
  } catch { throw cacheError(); } finally { if (handle) await handle.close(); }
  return { pcm, cacheHit: false, key };
}
