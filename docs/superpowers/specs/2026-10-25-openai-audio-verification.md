# OpenAI synthetic audio verification — 2026-10-25

The user requested OpenAI in place of ElevenLabs, live generation of the corpus, and Git push/pull. Code is on `ws/ryan-synthetic-data`, based on current `origin/main` at `d26f0ff`. Local main was pulled with `git pull --ff-only origin main`; Task 2 has not been merged into main.

## Delivered

The standalone `synthetic/` package includes the seeded four-week transcript corpus generator and optional OpenAI audio CLI. The audio implementation now uses a fixed `gpt-4o-mini-tts-2025-12-15` model, cedar for Grandpa and marin for Remi. It preserves the separate ground-truth files and original transcript artifacts. No backend, dashboard or voice-agent code changed.

New shared audio settings replace ElevenLabs-specific requests and 16 kHz assumptions. Speech requests contain only model, input, voice, instructions and PCM format. The output is mono signed PCM16 at 24 kHz, with 24 zero samples per millisecond of planted silence. Full-conversation and caller-only WAVs contain SIMULATED metadata; timing sidecars derive from sample counts without invented word alignment. Verified caches bind provider, model, voice, instructions, text and audio format. Fresh speech has no seed guarantee; cached assembly is reproducible.

## Verification

Executed from `/Users/ryanwatach/.codex/worktrees/7794/remi` using Node24:

```sh
npm --prefix synthetic test
npm --prefix detector test
npm --prefix synthetic run check
npm --prefix detector run check
node synthetic/audio-cli.mjs --list-voices
node synthetic/audio-cli.mjs --input synthetic/output-release
```

Results: 147/147 synthetic tests; 245/245 detector tests; both syntax checks passed. Static voice listing works without credentials or network. Dry run: 12 calls, 252 segments, 30,271 text characters. Corpus has 96 planted pauses. RED/GREEN evidence and independent review are recorded in the plan ledger. Tests use mocked provider transport but real cache, PCM assembly and filesystem operations; they do not claim live provider or perceptual quality verification.

## Live generation completed

The user configured a private OpenAI key and explicitly requested generation. A one-call smoke run succeeded, followed by all twelve calls. The key was loaded with Node's `--env-file` option; no values were printed or copied. The user's root `env.local` was protected with owner-only permissions and a local Git exclusion.

Actual commands from the worktree root:

```sh
node --env-file=/Users/ryanwatach/Documents/Projects/PSU/remi/env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --limit 1 --cache synthetic/audio-cache --output synthetic/audio-openai-smoke
node --env-file=/Users/ryanwatach/Documents/Projects/PSU/remi/env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --cache synthetic/audio-cache --output synthetic/audio-openai-all
```

Both exited successfully. Full run: 12 calls, 252 planned speech segments, 30,271 source characters, 74 cache hits and 38 output files. The outputs contain 24 WAVs (conversation and caller-only), 12 timing JSON files, README and manifest. Model: `gpt-4o-mini-tts-2025-12-15`; caller voice cedar, agent voice marin; mono signed PCM16 at 24 kHz.

Independent verification parsed the WAVs, checked all 37 payload hashes, verified all 96 planted zero-sample spans against source schedules, and confirmed caller isolation. Every speech segment contains nonzero samples. Call durations range from 163,844 to 191,561 ms; total conversation duration is 2,083,599 ms (34 minutes 43.599 seconds). WAV payloads including headers total 200,028,816 bytes across both tracks.

A cache-only replay reassembled all 12 calls with a provider that throws on cache misses: 252 cache hits, zero network requests, 24 byte-identical WAVs and 12 byte-identical timing files. No additional API billing was needed for this replay.

Audio lives in ignored `synthetic/audio-openai-all/`; the verified one-call preview remains in `synthetic/audio-openai-smoke/`, and verified PCM cache in `synthetic/audio-cache/`. These are local artifacts, not Git source files. Use a fresh output directory to repeat generation; existing data is never overwritten.

This verifies authenticated provider generation and file/sample correctness. Subjective listening, speech-to-text alignment, acoustic analysis, semantic detector accuracy and clinical interpretation were not performed. Natural generated pauses may extend the exact inserted spans; source-authored word timings are not measured audio. For Siyuan, use a copy of caller WAV with its sample-derived utterance times, since the backend deletes input WAVs.
