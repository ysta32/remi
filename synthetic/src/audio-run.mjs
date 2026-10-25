import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { serialize } from './contracts.mjs';
import { loadCanonicalCallSource } from './read.mjs';
import { planAudioCall } from './audio-plan.mjs';
import { assembleAudioCall } from './audio-pcm.mjs';
import { cachedSynthesize, createOpenAIProvider, requestKey } from './audio-provider.mjs';

import { AUDIO_PROVIDER, AUDIO_MODEL as MODEL, SAMPLE_RATE, CALLER_VOICE, AGENT_VOICE } from './audio-config.mjs';
const NOTICE = 'SIMULATED synthesized fiction, not real recordings, clinical evidence or detector accuracy results.';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = suffix => Object.assign(new Error(`SYNTHETIC_AUDIO_${suffix}`), { code: `SYNTHETIC_AUDIO_${suffix}` });
function absoluteDirectory(value) {
  if (typeof value !== 'string' || !value || /[\0\\]/.test(value)) throw fail('PATH_UNSAFE');
  const parts = (path.isAbsolute(value) ? value.slice(path.parse(value).root.length) : value).split(path.sep);
  if (parts.some(part => !part || part === '.' || part === '..')) throw fail('PATH_UNSAFE');
  return path.resolve(value);
}
async function identity(directory) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('PATH_UNSAFE');
  return { directory, dev: stat.dev, ino: stat.ino };
}
async function check(identities) {
  for (const expected of identities) {
    const actual = await identity(expected.directory);
    if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw fail('PATH_UNSAFE');
  }
}
async function directories(directory, create = false) {
  const names = [];
  for (let current = directory; ; current = path.dirname(current)) {
    names.unshift(current); if (current === path.dirname(current)) break;
  }
  const identities = [];
  for (const name of names) {
    await check(identities);
    if (create) {
      try { await mkdir(name, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    identities.push(await identity(name));
  }
  return identities;
}
/** Keep the audio reader's public shape and safe error code. */
export async function loadAudioSource(inputDir) {
  try {
    const { manifest, calls, timings } = await loadCanonicalCallSource(inputDir);
    return { manifest, calls, timings };
  } catch { throw fail('SOURCE_INVALID'); }
}

const overlaps = (a, b) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
const README = `${NOTICE}\n\nconversation/<callId>.wav contains both speakers. caller/<callId>.wav mutes agent\nspeech on exactly the same timeline; it is for acoustic isolation, not a full speaker transcript.\nWAVs are 24000 Hz mono signed little-endian PCM16 with a SIMULATED RIFF INFO comment.\ntiming/<callId>.json contains sample-derived utterance and segment times, without invented word times.\nThe manifest references the original source call and synthetic_authored timing sidecar separately.\nPlanted silences and 250 ms turn gaps contain exact zero samples. Speech may contain natural silence;\ninsertedSilences is not total acoustic pause time. Chunked speech may have altered prosody.\n\nmanifest.json is published last and hashes every payload. Missing manifest means incomplete output.\nCached PCM and identical options yield identical payloads; fresh synthesis can differ (OpenAI provides no speech seed).\nKeep source transcript and audio timing provenance distinct. No database import or detector run occurred.\nFor later backend STT use a COPY of caller WAV (the backend deletes its input) with sample-derived\nutterance times from this timing file. Integration and measured word alignment require separate work.\n`;

/** Default to a fully validated offline plan. Injected providers are for offline tests. */
export async function runAudio({ inputDir, outputDir, cacheDir, generate = false, limit, maxCharacters = 100000,
  callerVoiceId = CALLER_VOICE, agentVoiceId = AGENT_VOICE, apiKey, provider } = {}) {
  if (typeof generate !== 'boolean' || !Number.isSafeInteger(maxCharacters) || maxCharacters < 1 ||
      (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))) throw fail('OPTIONS_INVALID');
  if (generate && (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) || !outputDir || !cacheDir ||
      (provider !== undefined && typeof provider?.synthesize !== 'function'))) throw fail('OPTIONS_INVALID');
  const source = await loadAudioSource(inputDir);
  if (limit !== undefined && limit > source.calls.length) throw fail('OPTIONS_INVALID');
  let plans;
  try {
    plans = source.calls.slice(0, limit ?? source.calls.length).map((call, index) => planAudioCall(call, source.timings[index], {
      callerVoiceId, agentVoiceId, modelId: MODEL,
    }));
    // Validate every request before any output reservation or billable operation.
    for (const plan of plans) for (const segment of plan.segments) requestKey(segment.request);
  } catch { throw fail('OPTIONS_INVALID'); }
  const segmentCount = plans.reduce((n, plan) => n + plan.segments.length, 0);
  const characterCount = plans.reduce((n, plan) => n + plan.segments.reduce((m, segment) => m + segment.text.length, 0), 0);
  if (characterCount > maxCharacters) throw fail('CHARACTER_CAP');
  const summary = { isSimulated: true, dryRun: !generate, callCount: plans.length, segmentCount, characterCount };
  if (!generate) return summary;
  let reserved = false;
  try {
    const input = absoluteDirectory(inputDir), output = absoluteDirectory(outputDir), cache = absoluteDirectory(cacheDir);
    if (overlaps(input, output) || overlaps(input, cache) || overlaps(cache, output)) throw fail('PATH_UNSAFE');
    const identities = await directories(path.dirname(output));
    await directories(cache, true);
    const service = provider ?? createOpenAIProvider({ apiKey });
    await check(identities); await mkdir(output, { mode: 0o700 }); reserved = true;
    identities.push(await identity(output));
    const folders = new Map();
    for (const folder of ['conversation', 'caller', 'timing']) {
      await check(identities); const directory = path.join(output, folder);
      await mkdir(directory, { mode: 0o700 }); folders.set(folder, await identity(directory));
    }
    const files = {};
    async function publish(relative, contents, includeHash = true) {
      const parent = folders.get(path.dirname(relative)), checks = parent ? [...identities, parent] : identities;
      await check(checks);
      const handle = await open(path.join(output, relative), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await check(checks); await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
      if (includeHash) files[relative] = hash(contents);
    }
    let cacheHits = 0; const calls = [];
    for (const plan of plans) {
      const pcms = [], keys = [];
      for (const segment of plan.segments) {
        await check([...identities, ...folders.values()]);
        const result = await cachedSynthesize(segment.request, { cacheDir: cache, provider: service });
        pcms.push(result.pcm); keys.push(result.key); if (result.cacheHit) cacheHits++;
      }
      const { conversationWav, callerWav, timing } = assembleAudioCall(plan, pcms);
      const id = plan.callId, conversationPath = `conversation/${id}.wav`, callerPath = `caller/${id}.wav`, timingPath = `timing/${id}.json`;
      await publish(conversationPath, conversationWav); await publish(callerPath, callerWav); await publish(timingPath, serialize(timing));
      calls.push({ callId: id, startedAt: plan.startedAt, sourceCallPath: `calls/${id}.json`, sourceTimingPath: `timing/${id}.json`,
        conversationPath, callerPath, timingPath, requestKeys: keys });
    }
    await publish('README.txt', README);
    const manifest = { schemaVersion: 1, isSimulated: true, notice: NOTICE, timingSource: 'synthetic_audio_samples', sourceTimingSource: 'synthetic_authored',
      sourceManifestSha256: hash(serialize(source.manifest)), config: source.manifest.config,
      provider: AUDIO_PROVIDER, sampleRate: SAMPLE_RATE, modelId: MODEL, callerVoiceId, agentVoiceId, counts: { callCount: plans.length, segmentCount, characterCount }, calls, files };
    await publish('manifest.json', serialize(manifest), false);
    return { ...summary, outputDir: output, cacheDir: cache, cacheHits, fileCount: Object.keys(files).length + 1 };
  } catch (error) {
    if (reserved) throw fail('OUTPUT_INCOMPLETE');
    if (error.code === 'EEXIST') throw fail('OUTPUT_EXISTS');
    if (error.code === 'SYNTHETIC_AUDIO_PATH_UNSAFE') throw error;
    throw fail('OUTPUT_UNSAFE');
  }
}
