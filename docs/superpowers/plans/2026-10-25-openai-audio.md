# OpenAI synthetic speech implementation plan

> Workers: use subagent-driven-development and test-driven-development. Parent alone commits/pushes after verification.

Goal: switch authorized synthetic voice generation to OpenAI, generate all12calls with realinsertedsilences, then pushfeature/pulllocalmain.
Spec: docs/superpowers/specs/2026-10-25-openai-audio-design.md
Architecture: retain existing validatedsource/planner/cache/PCM/runner; change tightlycoupled providerrequest and samplerate in one task.
Global constraints: preserve teammates, mainfeaturemerge prohibited, no secrets read/printed, no live calls byworker, no workercommits/pushes/subagents. Othersworking in repo; preserve their edits.
Review focus: cachedwrongproviderbytes;24kvs16kmismatch; unsupportedpayloadseed; inheritedemptyvoiceenv; billingbeforevalidation. Testsbelow mustcover each.

### Task 1: Migrate complete audio boundary to OpenAI
Own synthetic/src/audio-*.mjs (new audio-config.mjs allowed), synthetic/audio-cli.mjs, synthetic/tests/audio-*.test.mjs, synthetic/README.md, synthetic/.env.example. Also add superseded note to existing docs/superpowers/specs/2026-10-24-synthetic-audio-design.md, docs/superpowers/plans/2026-10-24-synthetic-audio.md and docs/superpowers/specs/2026-10-25-synthetic-audio-verification.md referencing newdesign; do not replacehistoricalverification with unperformedliveclaims.
Read newspec for exactinterfaces/defaults. No changes to offline transcriptgenerator or sourceoutput or backend. Keepfunctions focused and requestallowlist explicit. You may adjust tests to meaningful OpenAIsemantics, preserving existing cache/IO coverage rather than deleting togreen.
- [ ] Write focused tests expecting OpenAI request and24kHz; run RED.
- [ ] Implement provider/planner/PCM/runner/CLI and update docs/envtemplate.
- [ ] Run targeted audio tests, syntheticfullsuite and syntaxchecks once afterintegration; recordresults.
- [ ] Independent review then parentlivegeneration+finalverification+commit/push. Report .superpowers/sdd/2026-10-25-openai-audio/task-1-report.md.
