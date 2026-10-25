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

## Remaining live blocker

No OpenAI key was found in the process or project environment files. The ignored private `synthetic/.env.local` has an empty `OPENAI_API_KEY` entry; user action is required to supply it or identify its existing local path. No actual speech file, listening check, STT or detector live run has been produced. No substitute tones or fabricated speech artifacts were delivered.

Once configured, the already authorized generation commands are:

```sh
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --limit 1 --cache synthetic/audio-cache --output synthetic/audio-openai-smoke
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --cache synthetic/audio-cache --output synthetic/audio-openai-all
```

Voice overrides `OPENAI_TTS_CALLER_VOICE` and `OPENAI_TTS_AGENT_VOICE` are optional. Use fresh output directories; existing files are not overwritten. Cached PCM from a successful smoke run is reused for the full run. Source, cache and audio output remain local ignored artifacts.

For Siyuan, use a copy of caller WAV with its sample-derived utterance times. The backend deletes input WAVs. Natural generated pauses may extend the exact inserted spans; source-authored word timings are not measured audio. Isolated simulated persistence and actual acoustic/semantic evaluation remain separate work.
