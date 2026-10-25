# Synthetic ElevenLabs audio verification — 2026-10-25

> Superseded historical ElevenLabs record. The current implementation follows the [OpenAI audio design](./2026-10-25-openai-audio-design.md). Historical checks below describe the earlier provider and do not establish live OpenAI generation or listening results.

Worktree: /Users/ryanwatach/.codex/worktrees/7794/remi
Branch: ws/ryan-synthetic-data; base HEAD70b39ce. All Task2 changes remain uncommitted. Main checkout unchanged at e2fe6a3. No push, merge, database import, backend/dashboard/voice-agent modification.

## Delivered
New synthetic/audio-cli.mjs; src/audio-plan.mjs, audio-pcm.mjs, audio-provider.mjs, audio-run.mjs; tests/audio-pcm.test.mjs, audio-provider.test.mjs, audio-run.test.mjs; .env.example. Updated README.md, package.json check and .gitignore. Design/implementation plan accompanies code.

Plan and PCM assembly preserve source text/spans, split at existing planted caller word boundaries, request separate voices and insert actual zero samples. WAVs include SIMULATED metadata. Outputs are full-conversation and caller-only monoPCM16/16000Hz WAVs, sample-derived timing sidecars, README and manifest. Provider PCM is verified/cached; identical cached inputs reproduce bytes. Fresh ElevenLabs synthesis is only best-effort seeded. No invented word timestamps, ground-truth input, detector accuracy or medical inference.

## Commands and observed results
Run from worktree root, Nodev24.20.0:

```sh
npm --prefix synthetic test
npm --prefix detector test
npm --prefix synthetic run check
npm --prefix detector run check
node synthetic/audio-cli.mjs --help
node synthetic/audio-cli.mjs --input synthetic/output-release
```

146/146 synthetic tests;245/245 detector tests; both syntax checks passed. Dry run: isSimulated=true,dryRun=true,callCount12,segmentCount252,characterCount30271. Existing source bundle has156turns and96plantedpauses.

Tests exercise real file/cache/output/PCM logic with mocked transport. They verify exact zero spans, preserved timeline and caller isolation, RIFF headers, original source integrity, no truth reads/request labels, cached byte-for-byte output, caps, malformed responses, redacted errors, timeout/no retries, corruption, symlinks and output preservation. Implementers recorded RED then GREEN evidence in the audio SDD ledger reports. Full-package tests used no credentials or network.

## Live status and next step
No live ElevenLabs request, voice listing, real synthesized WAV, listening check, STT or audio analysis was performed. The ignored synthetic/.env.local already exists from the template with private 0600 permissions and a blank API key. Edit that existing private file to fill ELEVENLABS_API_KEY; do not copy the template over it. Preferred voice IDs are optional initially because the assistant can select available presets after the authenticated listing. Both ELEVENLABS_CALLER_VOICE_ID and ELEVENLABS_AGENT_VOICE_ID must be selected and set in that file before running --generate. Never put secrets in chat or CLI flags.

```sh
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --list-voices
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --limit 1 --cache synthetic/audio-cache --output synthetic/audio-smoke
node --env-file=synthetic/.env.local synthetic/audio-cli.mjs --input synthetic/output-release --generate --cache synthetic/audio-cache --output synthetic/audio-all
```

The user authorized implementing voice generation; a configured account with TTS access/credits and two available voices is required for live execution. Existing output is never overwritten; use a fresh destination when repeating. Valid cache entries can be reused after failure. No automatic paid retries.

For Siyuan: use a COPY of caller WAV with its audio sample-derived utterance times; backend deletes its input WAV. Source-authored word times are not measured audio times. Actual STT/word alignment and isolated simulated import remain integration work. Natural TTS silence may extend total pauses beyond the precisely inserted silent spans, and segment boundaries may affect prosody.
