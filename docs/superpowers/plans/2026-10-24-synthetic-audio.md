# Synthetic audio implementation plan

> Superseded historical ElevenLabs record. The current implementation follows the [OpenAI audio design](../specs/2026-10-25-openai-audio-design.md). Historical checks below describe the earlier provider and do not establish live OpenAI generation or listening results.

> Agentic workers: use superpowers:subagent-driven-development and test-driven-development. No commits without user approval.

Goal: generate clearly synthetic ElevenLabs speech with exact inserted silences.
Architecture: pure segment planner and PCM assembler, isolated provider/cache, then source-validated CLI.
Tech stack: Node.js24 builtins, native fetch, PCM16kHz mono WAV.

Spec: docs/superpowers/specs/2026-10-24-synthetic-audio-design.md
Global constraints: user requests ElevenLabs audio; preserve main, prior generator, teammates and all data; no commit/push/live tests from workers. Read shared spec for exact interfaces. Others are working in this repository: preserve edits and stay within ownership. Do not spawn agents. Use meaningful RED then GREEN tests and record commands/results in assigned report.

## Review focus
- Malformed source or edited manifest: reject before any provider request (Task3).
- Network failure after billing: no automatic retries; verified cache reuse (Task2/3).
- Invalid response or cache: reject odd PCM, oversized data, corrupt envelopes (Task2).
- Extra TTS silence and chunk prosody: report inserted spans honestly, not total measured silence (Task1/3).
- Filesystem collisions or links: preserve existing files and reject symlink paths (Task2/3).

### Task 1: Audio planning and PCM assembly
Own synthetic/src/audio-plan.mjs, synthetic/src/audio-pcm.mjs, synthetic/tests/audio-pcm.test.mjs. Implement shared spec interfaces1/2 and tests. Inspect existing timing contract before writing. Verify source offsets, malformed pauses, exact zero spans, WAV headers/metadata, two tracks, sample-based timings, input preservation, determinism, odd/empty PCM and bounded duration. Read spec above (not other tasks). Report .superpowers/sdd/2026-10-24-synthetic-audio/task-1-report.md.

- [ ] Write behavioral tests and capture expected RED failure.
- [ ] Implement the specified interfaces within assigned files.
- [ ] Run targeted tests and syntax checks; record GREEN evidence.
- [ ] Independent task review; no commit or push.


### Task 2: ElevenLabs and verified PCM cache
Own synthetic/src/audio-provider.mjs, synthetic/tests/audio-provider.test.mjs. Implement shared spec interface3 and tests. Read official API docs if needed; no paid/live requests or secrets. Mock transport boundary only; test real cache on temp dirs, provider request allowlist, header, fixed output format, deterministic key, response bounds, status/error redaction, no retries, pagination, symlinks/corruption. Report .superpowers/sdd/2026-10-24-synthetic-audio/task-2-report.md.

- [ ] Write behavioral tests and capture expected RED failure.
- [ ] Implement the specified interfaces within assigned files.
- [ ] Run targeted tests and syntax checks; record GREEN evidence.
- [ ] Independent task review; no commit or push.


### Task 3: End-to-end CLI and delivery
After tasks1/2 pass reviews, own synthetic/src/audio-run.mjs, synthetic/audio-cli.mjs, synthetic/tests/audio-run.test.mjs, synthetic/README.md, synthetic/package.json, synthetic/.gitignore. Implement interface4; do not modify source transcript outputs. Use current bundleFiles/generateBundle to check source canonical call/timing bytes and manifest (raw config pick schemaVersion/seed/startDate/callsPerWeek from resolved manifest). Read no truth files. New README audio section, .env.example if useful with no real keys. Explicit commands for dry run, voice listing, live --limit1 smoke and all calls, reuse cache freshoutput, secretsetup and analysislimitations. Test mock end-to-end source generator->provider->WAV, no overwrite, no leakage, exact silence, deterministic cache replay, missingcredentials/caps/malformedinputs no paidrequest. Update check script to include audio-cli. Report .superpowers/sdd/2026-10-24-synthetic-audio/task-3-report.md.

- [ ] Write behavioral tests and capture expected RED failure.
- [ ] Implement the specified interfaces within assigned files.
- [ ] Run targeted tests and syntax checks; record GREEN evidence.
- [ ] Independent task review; no commit or push.
