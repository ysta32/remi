# Synthetic Data Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [x]`) syntax for tracking. User has approved design and implementation with subagents; no further planning approval is needed. Never commit or push.

**Goal:** Generate reproducible, explicitly synthetic four-week conversations with separate planted truth and authored timing.

**Architecture:** Pure ES modules resolve config, plan incident families and chronology, render seeded authored dialogue, then synthesize timing. An allowlisted export targets the unchanged detector; an exclusive writer publishes a fully validated bundle.

**Tech Stack:** Node 24+, native ESM, node:test, Node built-ins; no runtime dependencies or provider calls.

**Spec:** docs/superpowers/specs/2026-10-24-synthetic-data-design.md (approved by user in conversation).

## Global Constraints

- Only synthetic/** and Task 2-specific docs may change. Worktree /Users/ryanwatach/.codex/worktrees/7794/remi, branch ws/ryan-synthetic-data, base 70b39ce.
- Others are working in the repository. Preserve their edits. No commits, pushes, merges, backend/database/voice changes, secrets, dependency installs, or live APIs.
- Four weeks, callsPerWeek 2–4, five planned occurrences per call; default 12 calls with counts new=30, unprompted=18, prompted=9, uncertain=3.
- caller/agent speakers; exact quotes with zero-based UTF-16 [start,end) offsets. isSimulated:true; timingSource='synthetic_authored'; no audio measured.
- Separate incident families across tuning/held-out, including hard-negative siblings. All repeat references point to earlier calls. Each split contains both kinds and all elicitation classes. Default includes six negative pairs and a repeat older than seven days.
- Every call lasts 180000–300000 ms with >=100 caller words; fixed eight planted internal pauses per call, weekly centers [600,850,1100,1400], jitter ±75 ms. Ordinary gaps <400 ms.
- No labels/incident IDs/expected matches/splits in detector input; no authored detector history or generated embedding vectors. Existing detector remains untouched.
- Write tests before implementations and record observed failing/passing commands in the task report. Work only in assigned files. Do not spawn subagents.

## Review Focus

- Invalid config including malformed calendar dates, non-Monday dates, fractional/out-of-range seeds, and unknown keys must fail without output (Task 1/5).
- Alternate seeds and call-count presets must preserve feasible introductions, exact totals, split separation, kinds and all classes (Task 4/6).
- DST/year rollover and elapsed milliseconds must agree with explicit New York 10:00 local dates (Task 4).
- Rich source objects with sentinel planted labels must never forward those labels into detector requests (Task 1/6).
- Existing/symlink outputs, path traversal, racing creation, and invalid bundles must not overwrite any data (Task 5).

## Shared contracts

Task 1 writes synthetic/CONTRACTS.md capturing these exact interfaces. Subsequent owners consume it. Any required change is coordinated through the controller.

- resolveConfig(raw={}) -> {schemaVersion:1,seed,startDate,callsPerWeek,weeks:4,timezone:'America/New_York',localHour:10,weekdays:number[],slotsPerCall:5,pauseCentersMs:[600,850,1100,1400],pauseJitterMs:75,pausesPerCall:8,minDurationMs:180000,maxDurationMs:300000}. Raw permits only schemaVersion=1, seed uint32, startDate Monday YYYY-MM-DD (years 2000–2099), callsPerWeek 2/3/4. Defaults 42,2026-09-28,3. Weekdays use Monday=0; [0,3], [0,2,4], [0,1,3,4].
- makeRng(seed,label) -> function producing [0,1); derive a uint32 from SHA-256(JSON.stringify([seed,label])), use documented mulberry32. shuffle(items,rng) -> copied Fisher-Yates array. stableId(namespace,...parts) -> namespace+'_'+first24 SHA256 hex of JSON.stringify(parts). All sorting uses explicit lexical comparisons.
- toDetectorCall(canonical) -> allowlisted {elderId,callId,startedAt,isSimulated:true,utterances:[{speaker,text,startMs,endMs}]}; deep copy, validate with actual detector parseCall, strip words and all extras. Reject non-simulated input. serialize(value) -> pretty JSON two spaces plus LF.
- CATALOG_VERSION='1.0.0'; persona is a synthetic profile. catalog array has 40 entries: 24 story,16 question in 20 two-entry families; each {id,familyId,kind,topic,anchors:string[],variants:string[>=3],specificPrompt,ambiguousPrompt,response}. Both incidents in a family are substantive negatives. IDs never occur in prose. Variants describe only that same incident/question.
- renderOccurrence(entry,{variantIndex,elicitation}) -> {utterances:[{speaker,text}],sourceTurnIndex,quote,start,end,promptTurnIndex}. elicitation in unprompted/prompted/uncertain. Source is one caller turn; prompted explicit preceding agent evidence; uncertain has ambiguous cue but promptTurnIndex:null. Unprompted has no incident-specific invitation. Return relative turn indices; generator rebases. New occurrences may use unprompted dialogue.
- timeDialogue(utterances,{seed,callId,weekIndex,config}) -> {utterances,durationMs,timing:{isSimulated:true,timingSource:'synthetic_authored',notice,weekIndex,pauseCenterMs,pauses:[{turnIndex,afterWordIndex,startMs,endMs,durationMs,kind:'planted'}],ordinaryGapMs,turnGapMs,wordDurationRule}}. Caller words contain {w,startMs,endMs}; agent turns need only start/end. Preserve text/turn order. Timing module defines fixed word-duration rules aiming ~120–140 words/minute, not stretched to target duration.
- planCalls(config,catalog) -> {calls:[{callId,weekIndex,startedAt,split,occurrences:[{occurrenceId,incidentId,familyId,kind,category,elicitation,variantIndex}]}],counts,splits}. category=new/unprompted/prompted/uncertain; isRepeat=category!='new'. Each call exactly three stories and two questions, no duplicate incident. splits={isSimulated:true,tuning:{callIds,familyIds},heldOut:{callIds,familyIds}}. Family assignment precedes schedule. Calls have stable opaque IDs independent of labels.
- generateBundle(rawConfig={}) -> {config,profile,calls,detectorCalls,groundTruth,timings,splits,manifest}. Calls/exports/truth/timings are chronological arrays, aligned by callId; manifest includes versions, notice,counts,callIds but file hashes are added by writer. GroundTruth entry {isSimulated:true,callId,reviewStatus:'planted_unreviewed',occurrences:[{occurrenceId,incidentId,familyId,kind,isRepeat,elicitation,label,sourceTurnIndex,quote,start,end,promptTurnIndex,priorOccurrences:[{callId,occurrenceId}]}],negativePairs:[{incidentIds:[a,b]}]}. New label='New material'; repeats have exact display labels. Timings get callId. No split/incident/expected fields in canonical calls/exports.
- validateBundle(bundle) -> bundle or throws. It independently validates chronology, counts, labels, spans, interval rules, repeat/prior identity, negative semantics by family/catalog metadata, splits and exported allowlist.
- bundleFiles(bundle) -> Map<relativePath,string> of serialized files; add hashes to manifest, manifest emitted last. writeBundle(bundle,outputDir) -> {outputDir,fileCount}; validate before mkdir, exclusive output, safe generated paths. Reject existing/symlink paths and unsafe path components; preserve existing content.

### Task 1: Shared config, randomness, export contracts

**Files:** synthetic/src/contracts.mjs, synthetic/src/random.mjs, synthetic/CONTRACTS.md, synthetic/tests/contracts.test.mjs, synthetic/tests/random.test.mjs.
**Interfaces:** Produce resolveConfig, toDetectorCall, serialize, makeRng, shuffle, stableId exactly above. No catalog/timing/planner implementation.

- [x] Write tests: defaults resolve to 12 calls/four weeks; 2/3/4 weekdays; reject unknown schema/keys, impossible dates, non-Monday, years out of 2000–2099, fractional/negative/>uint32 seed; source export strips sentinel ground truth/words, deep copies and round-trips actual parseCall. Pin PRNG sequence and independent stream behavior.
- [x] Run node --test synthetic/tests/contracts.test.mjs synthetic/tests/random.test.mjs and record expected missing-behavior failure.
- [x] Implement exact shared interfaces with strict config validation and deterministic serialization, no dependencies. Document artifact shapes and rendering/timing contracts in CONTRACTS.md.
- [x] Rerun targeted tests and syntax checks; write report with RED/GREEN evidence. Independent task review gates dependent tasks.

### Task 2: Fictional incident catalog and dialogue rendering

**Files:** synthetic/catalog/persona.mjs, synthetic/catalog/incidents.mjs, synthetic/src/content.mjs, synthetic/tests/content.test.mjs.
**Interfaces:** Consumes shared contracts; exports persona, catalog, CATALOG_VERSION, renderOccurrence. Preserve agreed exact shapes.

- [x] Write tests for catalog sizes/kinds/family pairs, >=3 distinct variants per entry, anchor consistency, no embedded IDs, distinct hard-negative incident descriptions, exact source spans, specific prompt evidence and ambiguous cue behavior. Test caller/agent turn order and unmangled Unicode offsets.
- [x] Run node --test synthetic/tests/content.test.mjs; record RED.
- [x] Author 20 substantive paired families (12 story families,8 question families), forty distinct incidents. At least three meaningful paraphrases each, retaining supplied facts. Story variants roughly 80–100 words; question variants roughly 30–45 words. Develop actual incident detail, not repeated padding. Avoid unsupported medical or sports-result claims; all events explicitly fictional.
- [x] Render two or three turns per occurrence, explicit prompt when prompted, ambiguous referent when uncertain, neutral/no cue when unprompted. Questions must remain one underlying query; avoid irrelevant additional stories/questions in wrappers. Return exact evidence and relative indices.
- [x] Rerun targeted tests; manually review one story and one question family across variants/labels; record RED/GREEN and content review. Independent review.

### Task 3: Synthetic timing engine

**Files:** synthetic/src/timing.mjs, synthetic/tests/timing.test.mjs.
**Interfaces:** Consumes makeRng and resolved config; exports timeDialogue as above. Runs independently of catalog using adequate test dialogue.

- [x] Write tests for eight planted internal caller gaps, centers and ±75 range for weeks 0..3, deterministic behavior, distinct seed variation, words matching whitespace tokens, preserved Unicode/text/order, nonnegative ordered bounds, no agent overlaps, ordinary gaps <400, terminal duration consistency. Reject insufficient caller boundaries and invalid week/inputs.
- [x] Run node --test synthetic/tests/timing.test.mjs; record RED.
- [x] Implement timing with seeded placement without replacement across valid within-caller-turn word boundaries, a fixed ordinary within-turn gap, separate turn gaps, documented bounded word durations. Compute duration from real assigned intervals; never add duration padding. Place metadata in timing only.
- [x] Rerun targeted tests and syntax check; report exact word-duration/spacing choices for downstream generator. Independent review.

### Task 4: Scheduling, assembly and whole-bundle validation

**Files:** synthetic/src/plan.mjs, synthetic/src/generate.mjs, synthetic/src/validate.mjs, synthetic/tests/plan.test.mjs, synthetic/tests/generate.test.mjs.
**Interfaces:** Consumes Tasks 1–3; produces planCalls, generateBundle, validateBundle. May export calendar helpers for direct test. Does not write files or call providers.

- [x] Write scheduling tests for 2/3/4 calls/week and seeds 0,1,42,4294967295; exact default counts 30/18/9/3; chronological first occurrences, no same-call duplicate, three stories/two questions, partition purity, all categories/kinds, >=six default negative pairs, >seven-day repeat. Check New York 10:00 around spring/fall DST and year rollover, no clock dependence.
- [x] Run plan tests and record RED. Implement finite deterministic allocation: divide complete families into split pools preserving 12-story/8-question capacity each; choose introductions first, then eligible repeat slots; allocate category totals with largest remainder and deterministic feasible per-split/kind assignment. Use constructive bounded planning rather than unbounded retries. At least two variants used for repeated incidents.
- [x] Write bundle tests for source span/turn offsets after render composition, exact prior occurrence sets, simulation notices, pure allowlisted exports, nonoverlap/endedAt/180–300s/100 caller words, split integrity, no incident IDs in dialogue, deterministic bundles and variation. Include deliberately corrupted bundle failures for future references, leakage, timing, IDs and labels.
- [x] Run generate tests and record RED; implement assembly with brief neutral opening/closing; calculate actual duration from timing and reject out-of-range. Build all truth separately, deriving prior references from the planner, never feeding it to export/extraction.
- [x] Implement independent validation of critical invariants rather than only asserting array lengths. Rerun all new tests; report RED/GREEN and sample corpus durations/counts. Independent review.

### Task 5: Safe CLI, artifacts and handoff docs

**Files:** synthetic/cli.mjs, synthetic/src/write.mjs, synthetic/package.json, synthetic/config/default.json, synthetic/README.md, synthetic/.gitignore, synthetic/tests/cli.test.mjs, synthetic/tests/write.test.mjs, synthetic/examples/replay.mjs.
**Interfaces:** Consumes generateBundle/validateBundle/serialize. Produces bundleFiles/writeBundle. Replay is a documented optional LIVE tool using actual analyzeCall and returned history; default generator always offline.

- [x] Write tests for deterministic file bytes/hashes in two temp directories, all output types/notices, manifest-last complete bundle, rejection of existing files/directories/symlinks (including unsafe ancestor symlinks), invalid config/bundle before creation, unknown flags, duplicate flags, missing output, --help with no credentials, safe failure and no overwrite during competing creation. No automatic deletion outside test temp roots.
- [x] Run CLI/writer tests and record RED; implement writer using exclusive directory/files, internally built safe paths, stable bytes, payload hashes and manifest-last. Validate bundle before publication. On partial failure report incomplete output; no --force.
- [x] Implement CLI --config FILE --output NEW_DIRECTORY, default config when --config omitted, strict parsing and sanitized errors. Add npm test and check scripts using native Node; ignore output/. No root package changes.
- [x] Optional replay example requires explicit --allow-live plus --input BUNDLE --split tuning|held-out|demo and a fresh --output directory; validates files/digests and selected IDs, reads only detector inputs plus split manifest, uses real OpenAI options from environment, actual returned items/historyUpdates, and no golden labels. Never run live in this task. This example is for pipeline handoff, not metric evaluation; output clearly indicates live status/results, settings and split. If this small helper would broaden scope materially, provide equivalent readable README snippet instead and record ruling; do not implement Task 3 metrics.
- [x] Document exact generation/test commands, config/schema, label semantics/limitations, synthetic timing provenance, how computeMarkers can consume canonical utterances in memory, isSimulated API gap, no database imports/resets, existing matcher mismatch, and held-out rules. Rerun targeted tests; independent review.

### Task 6: Integration acceptance and detector boundary

**Files:** synthetic/tests/integration.test.mjs, synthetic/tests/detector-boundary.test.mjs; Task 2 verification document under docs/superpowers/specs/ owned by controller.
**Interfaces:** Uses public generator/writer/detector functions without modifying them. Only HTTP transport may be intercepted for software tests.

- [x] Independently encode spec acceptance assertions, including byte identity and SHA256 checks, a bounded multi-seed sweep for all count presets, all output synthetic flags, exact totals, hard-negative and split partitions, earlier-only references, source alignment, growing pauses and no measured-audio claim.
- [x] Boundary tests use actual analyzeCall and controlled OpenAI-shaped HTTP responses grounded in generated caller quotes; inspect outgoing Responses utterances and embedding summary inputs for sentinel leakage. Persist earlier returned items as later history. Controlled test vectors stay in tests and are never generated demo outputs; tests make no semantic accuracy assertion. Reuse detector test response conventions.
- [x] Record test-first failures when a production gap exists and send a reproducer to its owning implementer. For already-satisfied acceptance tests, report them honestly as integration verification, not invented RED evidence.
- [x] Run all synthetic tests and check scripts plus npm --prefix detector test and npm --prefix detector run check. Report complete counts/failures and no live calls.
- [x] Controller generates default bundle into a new ignored output directory, inspects representative new/repeat/prompted/uncertain/negative conversations and timing artifacts, runs whole-change independent review, resolves findings with owners, reruns affected checks, and writes final verification report. Do not commit or push.

## Execution outcome

All six tasks completed with independent reviews; final whole-change and scoped documentation review approved. Final verification:117synthetic tests,245detector tests,syntaxchecks,and52releasefiles passed. See ../specs/2026-10-24-synthetic-data-verification.md for exact commands and limitations. No commits/pushes.
