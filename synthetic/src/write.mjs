import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { serialize } from './contracts.mjs';
import { validateBundle } from './validate.mjs';

const notice = `SIMULATED FICTION — offline synthetic data, not real calls or clinical evidence.
Labels are planted_unreviewed author judgments, not detector results. No accuracy claim is made.

Generate from a Remi repository checkout with Node.js 24+, from its repository root:
  node synthetic/cli.mjs --help
  node synthetic/cli.mjs --output synthetic/output-fresh
  node synthetic/cli.mjs --config synthetic/config/default.json --output synthetic/output-another
Choose a fresh destination under an existing nonsymlink parent. Existing output is never overwritten;
there is no force option. Generation is offline and needs no credentials or dependency installation.
Raw JSON config permits only schemaVersion (1), seed (uint32), startDate (Monday YYYY-MM-DD,
years 2000–2099), and callsPerWeek (2, 3, or 4). Defaults are 1, 42, 2026-09-28, and 3.
manifest.json records the resolved config, versions, counts and chronological callIds.

Bundle formats (JSON, except this README.txt):
  profile.json: fictional identity and simulation notice.
  calls/<callId>.json: canonical call, transcript and authored caller word timing.
  detector-inputs/<callId>.json: allowlisted detector call; no words or planted labels.
  ground-truth/<callId>.json: incident labels, prompt evidence, exact quotes and prior occurrences.
  timing/<callId>.json: planted pauses and synthetic timing provenance.
  ground-truth/splits.json: tuning and held-out call IDs and incident family assignments.
  manifest.json: metadata plus files mapping relative payload paths to SHA-256 hex digests.
The manifest excludes its own digest and is written last. Verify payload hashes before consumption;
hashes establish payload consistency, not authenticity against replacement of the entire bundle.
A failure may leave incomplete new output; inspect it and choose a new destination rather than deleting data.

Ground-truth sourceTurnIndex selects one caller turn. Quote offsets are zero-based UTF-16 [start,end):
text.slice(start,end) equals quote. New material has no prior occurrence; repeat labels distinguish
Unprompted repeat, Prompted retelling and Uncertain. These are pending-review labels, not diagnoses.
Word timing and eight planted internal pauses per call are synthetic_authored, not measured audio.
There is no audio file. Weekly pause centers are 600/850/1100/1400 ms with +/-75 ms jitter.

Incident families, including related hard-negative siblings, stay within a single split. Keep fresh histories
for tuning and held-out runs. Choose thresholds and other settings using tuning only, freeze them, then
report held-out results separately. A combined demo consumes held-out material. Keep ground-truth labels
outside detector requests; replay chronological detector inputs with actual returned items/historyUpdates,
never planted IDs, fabricated history or generated embedding vectors. Model calls require separate live authorization.

Backend handoff: canonical utterances can feed pure computeMarkers in memory; carry simulation and timing
provenance alongside its output. Detector inputs omit word times. Do not automatically POST this bundle
to agent APIs or import/reset a database: the create/complete API lacks a general isSimulated import contract
and new agent calls default to nonsimulated status. Agree an isolated additive import API before persistence.
The legacy repeat_stories marker and standalone detector use different windows, kinds and elicitation rules;
do not substitute combined detector totals for that marker. See synthetic/README.md in the checkout for details.
`;
function failure(code, outputDir) {
  const error = new Error(code);
  error.code = code;
  if (outputDir !== undefined) error.outputDir = outputDir;
  return error;
}
function safeId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) throw failure('SYNTHETIC_BUNDLE_INVALID');
  return value;
}

/** Validate and serialize a complete, deterministic bundle without mutating it. */
export function bundleFiles(bundle) {
  validateBundle(bundle);
  const files = new Map();
  const add = (path, value) => {
    if (files.has(path)) throw failure('SYNTHETIC_BUNDLE_INVALID');
    files.set(path, serialize(value));
  };
  add('profile.json', bundle.profile);
  for (const [folder, rows] of [['calls', bundle.calls], ['detector-inputs', bundle.detectorCalls], ['ground-truth', bundle.groundTruth], ['timing', bundle.timings]]) {
    for (const row of rows) add(`${folder}/${safeId(row.callId)}.json`, row);
  }
  add('ground-truth/splits.json', bundle.splits);
  files.set('README.txt', notice);
  const hashes = Object.fromEntries([...files].map(([path, contents]) => [path, createHash('sha256').update(contents, 'utf8').digest('hex')]));
  add('manifest.json', { ...bundle.manifest, files: hashes });
  return files;
}

function outputPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')) throw failure('SYNTHETIC_OUTPUT_UNSAFE');
  const components = (isAbsolute(value) ? value.slice(parse(value).root.length) : value).split(sep);
  if (components.some(part => !part || part === '.' || part === '..')) throw failure('SYNTHETIC_OUTPUT_UNSAFE');
  return resolve(value);
}
async function directoryIdentity(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('SYNTHETIC_OUTPUT_UNSAFE');
  return { path, dev: stat.dev, ino: stat.ino };
}
async function checkIdentities(identities) {
  for (const expected of identities) {
    const actual = await directoryIdentity(expected.path);
    if (actual.dev !== expected.dev || actual.ino !== expected.ino) throw failure('SYNTHETIC_OUTPUT_UNSAFE');
  }
}
async function ancestors(path) {
  const paths = [];
  for (let current = dirname(path); ; current = dirname(current)) {
    paths.unshift(current);
    if (current === dirname(current)) break;
  }
  const identities = [];
  for (const parent of paths) identities.push(await directoryIdentity(parent));
  return identities;
}

/** Reserve a fresh directory; publish the manifest only after all exclusive payload writes. */
export async function writeBundle(bundle, outputDir) {
  const files = bundleFiles(bundle); // Validation and serialization precede any filesystem mutation.
  const destination = outputPath(outputDir);
  let reserved = false;
  try {
    const identities = await ancestors(destination);
    await checkIdentities(identities);
    await mkdir(destination, { mode: 0o700 }); // Nonrecursive and exclusive, including dangling symlinks.
    reserved = true;
    identities.push(await directoryIdentity(destination));
    const subdirectories = new Map();
    for (const [relativePath, contents] of files) {
      await checkIdentities(identities);
      const folder = dirname(relativePath);
      let folderIdentity;
      if (folder !== '.') {
        if (!subdirectories.has(folder)) {
          const path = join(destination, folder);
          await mkdir(path, { mode: 0o700 });
          subdirectories.set(folder, await directoryIdentity(path));
        }
        folderIdentity = subdirectories.get(folder);
        await checkIdentities([folderIdentity]);
      }
      const handle = await open(join(destination, relativePath), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        // Recheck after opening to reject ancestor replacements detected by identity changes.
        await checkIdentities(folderIdentity ? [...identities, folderIdentity] : identities);
        await handle.writeFile(contents, 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
    }
    return { outputDir: destination, fileCount: files.size };
  } catch (error) {
    if (reserved) throw failure('SYNTHETIC_OUTPUT_INCOMPLETE', destination);
    if (error.code === 'EEXIST') throw failure('SYNTHETIC_OUTPUT_EXISTS');
    if (error.code === 'SYNTHETIC_OUTPUT_UNSAFE') throw error;
    throw failure('SYNTHETIC_OUTPUT_FAILED');
  }
}
