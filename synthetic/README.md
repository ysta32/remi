# Synthetic Remi calls

The dependency-free Node.js 24+ transcript generator (`cli.mjs`) creates fictional English calls for development and later detector evaluation. The transcript CLI never calls a model, reads credentials, imports into a database, resets data, or modifies the existing detector. A separate opt-in audio CLI can call OpenAI, as described below. All identities, calls, planted annotations and timing are simulated. This corpus is not clinical evidence or a model accuracy result.

From the repository root, with no package installation:

```sh
node --version
npm --prefix synthetic test
npm --prefix synthetic run check
node synthetic/cli.mjs --help
node synthetic/cli.mjs --output synthetic/output
```

The last command requires `synthetic/output` to be absent. It creates that ignored directory with private permissions. Alternate destinations matching `synthetic/output-*` are also ignored. To generate a different corpus, put a raw config in your own JSON file, then choose a fresh output directory under an existing parent:

```sh
node synthetic/cli.mjs --config synthetic/config/default.json --output synthetic/output-42
```

The parent must already exist and every ancestor must be a real directory, not a symlink. On macOS, use the canonical path (`pwd -P` or `realpath`) when your temporary directory uses `/tmp` or `/var` aliases. Existing files, directories and symlinks are rejected. There is no force/overwrite flag. Success is silent; failures print one safe `SYNTHETIC_*` code and exit nonzero, without echoing JSON, credentials or exception traces. `SYNTHETIC_OUTPUT_INCOMPLETE` means the newly reserved directory may contain partial payloads: keep it for inspection and choose another destination. The writer never automatically removes output. A manifest is written last, after every payload has closed successfully; verify its hashes before consuming a published bundle. Hashes detect changed payloads, not a malicious replacement of both the payload and manifest.

## Configuration and artifacts

Only these four raw keys are accepted; omitted keys use the defaults shown:

```json
{ "schemaVersion": 1, "seed": 42, "startDate": "2026-09-28", "callsPerWeek": 3 }
```

`schemaVersion` must be 1. `seed` must be an integer from 0 through 4294967295. `startDate` must be a real Monday in exact `YYYY-MM-DD` form, in years 2000–2099. `callsPerWeek` must be 2, 3 or 4. Unknown keys and malformed values fail before creating output. Schedules span four weeks at 10:00 America/New_York, handling DST and year boundaries. The presets use Monday/Thursday, Monday/Wednesday/Friday, or Monday/Tuesday/Thursday/Friday respectively. Fixed generation rules cannot be changed through raw config; see [CONTRACTS.md](./CONTRACTS.md) for the resolved schema.

Identical config and generator/catalog versions produce identical bytes and opaque stable IDs, independent of the output location. The default contains twelve calls, each with five planted occurrences (three stories and two questions): 30 new, 18 unprompted repeats, 9 prompted retellings and 3 uncertain repeats. The current planner introduces material in the first two weeks and schedules repeats in the last two weeks. The label mix is therefore a corpus-level target, not a per-call mix. The catalog contains substantive same-topic negative siblings. Prior references always point to earlier same-incident occurrences; the default includes a repeat older than seven days.

| Path | Contents |
| --- | --- |
| `profile.json` | Fictional persona and simulation notice |
| `calls/<callId>.json` | Canonical chronological call, with authored caller word times |
| `detector-inputs/<callId>.json` | Allowlisted detector call only, without labels, word arrays or split IDs |
| `ground-truth/<callId>.json` | Planted incident labels, exact quote spans, prompt evidence and earlier occurrences |
| `timing/<callId>.json` | Eight authored internal caller pauses and their timing provenance |
| `ground-truth/splits.json` | Tuning and held-out call/family assignments |
| `README.txt` | Simulation and provenance notice |
| `manifest.json` | Versions, resolved config, counts, ordered call IDs and payload SHA-256 digests |

`manifest.files` maps slash-separated payload paths to lowercase SHA-256 hex; it excludes the manifest itself. Exact quote offsets are zero-based UTF-16 `[start,end)` positions in the indexed caller turn: `text.slice(start,end) === quote`.

## Labels, timing and evaluation boundaries

Every annotation has review status `planted_unreviewed`: an author judgment pending human review. “New material” is the first occurrence of that incident in the corpus. “Unprompted repeat” is an earlier incident introduced again without a specific invitation. “Prompted retelling” has an explicit preceding agent cue. “Uncertain” has an ambiguous cue and no asserted prompt-evidence index. Elicitation and repeat identity are separate: new material may use unprompted dialogue. Prompted retelling can reflect a successful companion interaction. These labels imply neither impairment nor a diagnosis.

Each call lasts 180–300 seconds and has at least 100 caller words. The timing source is always `synthetic_authored`, with no audio file or measured timing. Exactly eight internal caller pauses are planted per call; weekly pause centers are 600, 850, 1100 and 1400 ms with ±75 ms jitter. Ordinary gaps remain below 400 ms. Fixed authored word-duration rules approximate conversational pace; they are not stretched to force a target duration. The intended weekly pause change is a controlled test pattern, not an observed human trend.

Family assignment keeps each incident and its hard-negative sibling wholly inside tuning or held-out, with both kinds and all elicitation classes in each split. Tune prompts/settings/thresholds only on tuning. Freeze them before inspecting held-out results; maintain separate histories for each split and report held-out findings separately. A combined demo run consumes held-out material and cannot also count as a clean held-out evaluation. This package creates no metric report, embedding vectors, or fabricated detector history.

## In-memory marker handoff

In the existing TypeScript application/test environment, `computeMarkers` is pure and can consume canonical utterances directly:

```ts
import { computeMarkers } from '../web/lib/markers/index'; // Adjust to your source location.
// canonicalCall is one validated bundle.calls entry loaded in memory.
const markers = computeMarkers(canonicalCall.utterances, canonicalCall.language);
```

Keep the surrounding result explicitly marked as simulated with `timingSource:'synthetic_authored'`; `computeMarkers` returns marker rows, not provenance. It does not compute `repeat_stories`. Use canonical calls for marker calculations because detector inputs intentionally omit word timing.

The agent create/complete HTTP schemas do not expose a general synthetic import contract: creating calls uses `is_simulated:0`, and completion does not accept a simulation override. Do not POST this corpus there or seed it into an existing elder. Use the separate offline fresh-database importer below for the family dashboard; the generator itself still supplies files and in-memory handoffs only.

The existing backend repetition matcher and this standalone detector are different systems. The legacy `repeat_stories` marker counts caller-initiated stories within a recent window; the standalone detector compares stories and questions against all earlier eligible calls and separates elicitation classes. Do not equate those totals, feed combined counts into the old marker, or use the planted IDs as detector-returned item IDs.

## Offline transcript dashboard demo

The separate `web` importer connects the reviewed canonical transcripts to the existing backend and family dashboard. It validates the manifest, profile, calls and authored timing without reading ground-truth labels, loading credentials or making network/model requests. It never opens an existing database for writing. Keep the generated source bundle and any separate audio artifacts unchanged.

Run from the repository root. Reuse `synthetic/output-release` if it exists; otherwise generate it with `node synthetic/cli.mjs --output synthetic/output-release`. Use absolute paths without `.` or `..` components, with real nonsymlink ancestors (use a canonical repository location on macOS).

```sh
mkdir -p web/data
npm --prefix web run import:synthetic -- --input "$PWD/synthetic/output-release" --database "$PWD/web/data/synthetic-demo.db"
```

This is a dry run: it validates and computes in memory, reporting `dryRun:true`, twelve calls, 96 marker rows and seven baselines for the default corpus, without creating a database. Only the following explicit apply command writes:

```sh
npm --prefix web run import:synthetic -- --input "$PWD/synthetic/output-release" --database "$PWD/web/data/synthetic-demo.db" --apply
```

The destination must be fresh under an existing directory. Existing databases, paths, symlinks and SQLite `-wal`, `-shm` or `-journal` sidecars are refused. A failure after reservation can leave a new incomplete database; preserve it for inspection and choose another fresh filename. Do not use the standard seed, reset endpoint or destructive smoke script to set up this demo.

Start the live API/dashboard against exactly that database, from the repository root:

```sh
DATABASE_PATH="$PWD/web/data/synthetic-demo.db" NEXT_PUBLIC_USE_FIXTURES=0 NEXT_PUBLIC_DEMO_ELDER_ID=elder-synthetic-hal-bennett DEV_TOOLS=0 npm --prefix web run dev -- --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/elders/elder-synthetic-hal-bennett` (or the home page's demo link); add `?tab=doing` for speech charts. The default fixture mode and `elder-hal-demo` navigation remain available when the public overrides are omitted. Set public variables before starting dev or building for production, because Next.js embeds them in browser code. See [web/README.md](../web/README.md) for the same setup in the app documentation.

Every imported call is simulated. The runtime notice appears only when the matching imported profile carries the exact provenance notice and every displayed call is simulated. The importer computes seven speech markers per call from canonical authored word times (84 speech readings); the 12 repeat readings are explicitly NULL/na. Baselines use existing helpers and the first six eligible chronological readings. Call cards show labeled, bounded first-caller-turn transcript excerpts. The importer runs no model summary, topic extraction, repeat detection, embeddings or nudge generation; no planted label becomes a detection result. Empty or unavailable latest-week repeats show **Not analyzed yet**. An actual analyzed zero still shows **About his usual**.

Audio was generated separately; see [audio verification](../docs/superpowers/specs/2026-10-25-openai-audio-verification.md). This import attaches no WAVs and runs no STT. Dashboard timing remains **source-authored**, even though separate audio files exist; it is not measured from their sound or sample-derived timing. Imported sharing choices are explicitly fictional demo choices, with summaries/speech trends enabled and fun facts/mood disabled; they do not represent spoken consent from a person.

## Persisted dashboard repeat analysis

An optional installed runner in `web/` analyzes an already imported isolated database with the existing standalone detector. See [web run commands](../web/README.md#optional-synthetic-repeat-analysis) for the offline dry run and separately authorized paid `--apply` command, credential loading and settings. The generator and importer remain offline. The runner uses canonical transcripts only, never ground truth or split assignments, and compares each call against actual extracted items from all earlier calls. Only a whole successful batch is stored; provider failure retains previous results. Unchanged complete corpus/settings results can be reused without new provider calls.

The dashboard shows actual story/question detections with the three elicitation labels, analyzed coverage, provisional threshold/model provenance and expandable current/prior quotes. A zero is distinct from unavailable analysis; partial coverage and evidence redaction are explicit. Earlier-call links reveal cards beyond the initial history limit. The legacy seven-day repeat marker stays unchanged and its tile is replaced only when standalone results are available. Original imported provenance stays stored; the displayed notice then stops saying repeat analysis has not run. Summaries remain ungenerated and timing stays authored.

Default similarity threshold is **0.85**, provisional and uncalibrated; similarity is not a probability. Running all twelve fictional calls is a demo integration, not held-out evaluation. Actual detected counts need not equal planted counts. No medical inference or accuracy claim follows from these results.

## Optional direct-import live replay

The transcript generator is always offline. The following is an opt-in integration sketch for a separately authorized model run, not an installed command or an evaluation harness. It starts from a freshly generated, independently validated in-memory bundle, so no unverified file paths or payloads enter the replay. If loading published files instead, verify the manifest and the SHA-256 of the split file and every selected detector input before analysis. Read detector inputs plus the split manifest only; keep golden labels outside model requests.

Run this code from a module at the repository root only after explicitly allowing paid provider calls and configuring the environment. It keeps results in memory and performs no persistence. The default `allowLive` value deliberately blocks execution. No live replay was run during generator implementation.

```js
import { analyzeCall } from './detector/src/index.mjs';
import { generateBundle } from './synthetic/src/generate.mjs';
import { validateBundle } from './synthetic/src/validate.mjs';
import { toDetectorCall } from './synthetic/src/contracts.mjs';

const allowLive = false; // Set true only for a separately authorized live run.
if (!allowLive) throw new Error('Explicit live authorization required');
const split = 'tuning'; // 'tuning', 'held-out', or 'demo'.
if (!['tuning', 'held-out', 'demo'].includes(split)) throw new Error('Invalid split');
const bundle = validateBundle(generateBundle());
const ids = new Set(split === 'demo' ? bundle.manifest.callIds
  : bundle.splits[split === 'held-out' ? 'heldOut' : 'tuning'].callIds);
const calls = bundle.detectorCalls.filter(call => ids.has(call.callId));
if (calls.length !== ids.size) throw new Error('Invalid selected call IDs');
const settings = {
  apiKey: process.env.OPENAI_API_KEY,
  extractionModel: process.env.OPENAI_EXTRACT_MODEL,
  embeddingModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || 1536),
  threshold: Number(process.env.REPEAT_THRESHOLD || 0.85),
};
if (!settings.apiKey || !settings.extractionModel) throw new Error('Configure live models privately');
const history = new Map();
const results = [];
let previous = -Infinity;
for (const input of calls) { // Validated bundle arrays are chronological.
  const call = toDetectorCall(input); // Explicit allowlist; no golden metadata.
  if (Date.parse(call.startedAt) <= previous) throw new Error('Chronology error');
  previous = Date.parse(call.startedAt);
  const result = await analyzeCall({ call, history: [...history.values()], processingAllowed: true }, settings);
  results.push(result);
  if (result.status !== 'ok') throw new Error('Replay unavailable; do not treat as zero');
  for (const item of result.historyUpdates) history.set(item.id, item);
  for (const item of result.items) history.set(item.id, item);
}
const run = {
  isSimulated: true, live: true, split,
  settings: { extractionModel: settings.extractionModel, embeddingModel: settings.embeddingModel,
    embeddingDimensions: settings.embeddingDimensions, threshold: settings.threshold },
  results,
};
// Inspect run privately. Never include settings.apiKey in output or logs.
```

Use a fresh history for each split/run and actual returned `items`/`historyUpdates`. Never substitute planted occurrences or prewritten vectors for model history. Any later file-writing helper must reserve a fresh output location, validate loaded payload digests and selected IDs, and preserve failed-run status. Detector provider behavior and threshold calibration require separate authorized evaluation; generator tests establish corpus mechanics only.


## Optional OpenAI audio

`audio-cli.mjs` is a separate opt-in extension. Its default dry run validates the source bundle and plans speech without credentials, network or file output. It reads only `manifest.json`, canonical `calls/` and authored `timing/`, checks their exact bytes against the deterministic generator, and leaves the source unchanged. Ground-truth files are never read. Provider requests contain only the text, built-in voice, fixed model, fixed speaking instructions and PCM response format; no call IDs, labels, pauses, word times, seed or adjacent context. Caller instructions describe a warm older American man in a natural conversational tone; agent instructions describe a gentle, clear companion. Both read the supplied text exactly without added words, sound effects or disease/impairment acting.

From the repository root, create the source bundle with the following command only if `synthetic/output-release` is absent. Reuse an existing source bundle; the transcript generator never overwrites it.

```sh
node synthetic/cli.mjs --output synthetic/output-release
```

Then run the offline audio checks:

```sh
node synthetic/audio-cli.mjs --help
node synthetic/audio-cli.mjs --input synthetic/output-release
node synthetic/audio-cli.mjs --input synthetic/output-release --limit 1 --max-characters 100000
```

The default corpus plans twelve calls, 156 utterances, 96 planted pauses and 252 speech segments totaling 30,271 text characters. `--limit N` selects the earliest N calls (1 through all). The cap applies to the complete selected text before any paid request, including segments that might already be cached; it counts JavaScript UTF-16 text units and is not a price estimate. Each speech segment and its instructions must also fit the OpenAI 4096-character limit, validated before any paid request. There is no automatic POST retry.

Copy `synthetic/.env.example` to ignored `synthetic/.env.local` and privately fill in `OPENAI_API_KEY`. Only the API key is required: caller defaults to `cedar` and agent to `marin`. Optional `OPENAI_TTS_CALLER_VOICE` and `OPENAI_TTS_AGENT_VOICE` select other supported built-in voices. Credentials come only from process environment. Node's built-in `--env-file` loads them; no dependency installation is required. Never paste keys into CLI arguments, source, logs or commits. List supported built-in voices offline without credentials (no voice cloning):

```sh
node synthetic/audio-cli.mjs --list-voices
```

A one-call paid smoke run and then all selected calls use explicit fresh destinations and a reusable cache:

```sh
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --limit 1 --max-characters 100000 --cache synthetic/audio-cache --output synthetic/audio-smoke
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --max-characters 100000 --cache synthetic/audio-cache --output synthetic/audio-all
```

Live synthesis uses OpenAI `gpt-4o-mini-tts-2025-12-15` at the fixed `/v1/audio/speech` endpoint with raw `pcm` output (24 kHz mono signed PCM16). OpenAI speech has no seed or adjacent-text controls, so fresh synthesis can differ. The local seed still reproduces the source transcripts; exact audio reproducibility requires cached PCM. For a cached replay, keep identical source, voices and options, reuse `--cache synthetic/audio-cache`, and choose a new `--output synthetic/audio-replay`. Request hashes bind OpenAI provider, endpoint, model, voice, instructions, PCM format/rate and input; ElevenLabs cache entries cannot collide. PCM digests guard cached bytes; corrupted cache fails closed. Valid entries survive partial output failures. Cached replay with identical PCM produces identical output bytes; cache-hit counts appear only in the runtime JSON summary. The cache contains fictional speech and should remain private.

Source, cache, output and their ancestors must be real directories without symlinks; use canonical paths on macOS (`pwd -P` or `realpath`). Output needs an existing parent and is reserved before synthesis. Source, cache and output trees must be separate. Existing destinations are never overwritten. Failures print only a safe `SYNTHETIC_AUDIO_*` code; `SYNTHETIC_AUDIO_OUTPUT_INCOMPLETE` means the reserved directory may have partial files. Keep it for inspection and select a fresh destination. `manifest.json` is written last and hashes all payloads. Summary counts are planning/assembly evidence, not voice-quality or accuracy measurements.

| Audio output | Meaning |
| --- | --- |
| `conversation/<callId>.wav` | Both fictional speakers, explicitly SIMULATED in RIFF INFO |
| `caller/<callId>.wav` | Same timeline, agent speech muted; for acoustic isolation |
| `timing/<callId>.json` | Sample-derived utterance and segment times, inserted-silence sample spans |
| `README.txt` | Simulation, timing and integration limitations |
| `manifest.json` | Source manifest digest, resolved config, provider, voices/model, sample rate, request keys, file hashes and source-relative call/timing references |

WAVs are mono signed 16-bit little-endian PCM at 24,000 Hz. Each planted pause inserts exactly `durationMs * 24` zero samples; turn gaps insert 250 ms (6000 samples). Provider speech may contain other natural silence, so inserted spans do not measure total acoustic pauses. Splitting at pause boundaries can change prosody. Output duration follows actual PCM samples rather than the original 180–300 second authored schedule. Audio timing supplies full authored utterance text with sample-derived start/end times, without invented word alignment. Source `synthetic_authored` word times remain separately referenced and must not be treated as measured audio times.

For later backend STT integration, use a **copy** of the caller WAV alongside its sample-derived utterance times; the backend deletes its input WAV. The caller track retains silent agent regions and is not a complete speaker transcript. This CLI performs no POST to Remi, database import, detector call or measured word alignment. Acoustic analysis and subjective voice quality require separate validation. Synthesized speech, planted patterns and tests establish no medical inference or model accuracy.

The current audio contract is [OpenAI synthetic speech migration](../docs/superpowers/specs/2026-10-25-openai-audio-design.md). Provider references: [text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) and [speech request API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create). Software tests use fake transport; actual paid generation and listening require separate verification.
