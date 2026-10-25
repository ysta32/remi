import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { generateBundle } from './generate.mjs';
import { bundleFiles } from './write.mjs';
const fail = suffix => Object.assign(new Error(`SYNTHETIC_${suffix}`), { code: `SYNTHETIC_${suffix}` });
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
async function directories(directory) {
  const names = [];
  for (let current = directory; ; current = path.dirname(current)) {
    names.unshift(current); if (current === path.dirname(current)) break;
  }
  const identities = [];
  for (const name of names) {
    await check(identities);
    identities.push(await identity(name));
  }
  return identities;
}
async function readSource(filename, identities) {
  await check(identities);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    await check(identities);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 5 * 1024 * 1024) throw fail('SOURCE_INVALID');
    const bytes = Buffer.alloc(stat.size + 1); let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break; size += bytesRead;
    }
    if (size !== stat.size) throw fail('SOURCE_INVALID');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}


/** Allowlisted source files only. Rebuild exact expected bytes without opening truth or detector files. */
async function readCanonicalSource(inputDir, includeProfile) {
  try {
    const directory = absoluteDirectory(inputDir), identities = await directories(directory);
    const manifestBytes = await readSource(path.join(directory, 'manifest.json'), identities);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const raw = Object.fromEntries(['schemaVersion', 'seed', 'startDate', 'callsPerWeek'].map(key => [key, manifest.config?.[key]]));
    const bundle = generateBundle(raw), expected = bundleFiles(bundle);
    if (!manifestBytes.equals(Buffer.from(expected.get('manifest.json')))) throw fail('SOURCE_INVALID');
    if (includeProfile) {
      const profileBytes = await readSource(path.join(directory, 'profile.json'), identities);
      if (!profileBytes.equals(Buffer.from(expected.get('profile.json')))) throw fail('SOURCE_INVALID');
    }
    for (const folder of ['calls', 'timing']) {
      const folderIdentities = [...identities, await identity(path.join(directory, folder))];
      for (const callId of bundle.manifest.callIds) {
        const relative = `${folder}/${callId}.json`;
        const actual = await readSource(path.join(directory, relative), folderIdentities);
        if (!actual.equals(Buffer.from(expected.get(relative)))) throw fail('SOURCE_INVALID');
      }
    }
    await check(identities);
    return { manifest, profile: bundle.profile, calls: bundle.calls, timings: bundle.timings };
  } catch { throw fail('SOURCE_INVALID'); }
}

/** Transcript imports additionally require the exact fictional profile. */
export const loadTranscriptSource = inputDir => readCanonicalSource(inputDir, true);

/** Existing audio consumption reads only the manifest, calls and timing files. */
export async function loadCanonicalCallSource(inputDir) {
  const { manifest, calls, timings } = await readCanonicalSource(inputDir, false);
  return { manifest, calls, timings };
}
