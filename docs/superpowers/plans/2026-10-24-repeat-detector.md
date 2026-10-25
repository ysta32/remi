# Repeat Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each task gets a dedicated implementer and independent review. The initial no-commit constraint was superseded by the user's request to review, commit, and push the feature branch; do not merge into main.

**Goal:** Implement the six approved detector steps as an isolated module callable by Siyuan's pipeline.
**Architecture:** Dependency-free Node ES modules, validated transcript/history records, OpenAI HTTP adapters, pure cosine matcher and classifier, orchestrator returning persistence-ready results.
**Tech Stack:** Node 24; native fetch, node:test, crypto; OpenAI Responses and embeddings.
**Spec:** docs/superpowers/specs/2026-10-24-repeat-detector-design.md

## Global Constraints
- Scope only new detector/ files and these new design/plan docs. Never alter teammates' code, main, original docs, root manifests/lockfiles, database, dashboard or agent.
- Commit and push only the reviewed feature branch, as subsequently authorized by the user. Keep main unchanged.
- All prior calls, same elder only, strictly earlier calls; stories compare to stories, questions to questions.
- Prompted/unprompted/uncertain labels and separate counts; no second LLM match verifier.
- No medical conclusions, fabricated accuracy or secrets/transcript logs. Explicit processing permission before provider requests.
- Failed/missing analysis returns unavailable, counts null; no invented zero results.
- Native fetch only fixed OpenAI endpoints. No new dependencies. Default embedding model text-embedding-3-small, dimensions 1536; extraction model configured explicitly.
- Tests first (RED/GREEN), provider I/O mocked at HTTP boundary, actual local production code tested.

## Review Focus
- Malformed/empty input, spoofed source quotes, and instructions inside transcript never become trusted caller evidence (tasks 1/2).
- Privacy gate and provider failures must not leak text/key or produce zero repeats (tasks 2/3/6).
- Other elders, same/current/future calls, mixed models and dimensions must not contaminate matches (tasks 1/4).
- Repeated processing, duplicate extraction, tied matches, and many matching history calls must not inflate counts (tasks 1/2/4/5/6).
- Fixtures and fake vectors are labeled; CLI and docs must distinguish deterministic test success from live semantic quality (task 6).

### Task 1: Receive and validate calls / shared contracts
**Files:** detector/package.json, detector/src/contracts.mjs, detector/src/errors.mjs, detector/src/types.d.ts, detector/tests/contracts.test.mjs.
**Interfaces:** Exact shared contract is in docs/superpowers/specs/2026-10-24-repeat-detector-contract.md (read first). Export parseCall, parseHistory, makeItemId and DetectorError. Later tasks use only these names/types.
- [x] Write and run failing tests for missing IDs/timezone, speaker roles, timestamps, blank turns, length bounds, caller data immutability, duplicate history IDs, dimension/model metadata, zero/nonfinite vectors, stable item identity.
- [x] Implement validators and types; drop unknown input properties (including synthetic ground-truth labels); keep isSimulated. No provider calls or IO here.
- [x] Provide npm test (node --test tests/*.test.mjs) and check (node --check every src/*.mjs and test file) scripts in detector/package.json only. No deps/lockfile needed.
- [x] Verify tests/check, write task report, no commit.

### Task 2: Extract story/question items
**Files:** detector/src/extract.mjs, detector/src/openai.mjs, detector/tests/extract.test.mjs, detector/tests/openai.test.mjs.
**Interfaces:** extractItems(call, options) => {items,extractionModel,promptVersion}; postOpenAI(path, body, options) shared with embeddings; see CONTRACT.
- [x] RED: realistic Responses wire fixtures; schema request; caller-only grounded quote/source; prompt labels; refusal/incomplete/malformed; empty extraction valid; duplicate items rejected; transcript injection kept out of instructions; private errors; transient retry and timeout.
- [x] Implement one Responses extraction call (bounded transport retry only), strict schema, output validation, exact quote attribution, deterministic IDs, metadata. No embedding/comparison/database code.
- [x] Verify targeted and whole existing suite, write report, no commit.

### Task 3: Embed and reuse historical vectors
**Files:** detector/src/embed.mjs, detector/tests/embed.test.mjs.
**Interfaces:** embedItems(items, options) => EmbeddedItem[]; prepareHistory(history, options) => EmbeddedItem[]; see CONTRACT.
- [x] RED: actual OpenAI embeddings wire shape, response index reorder, missing/duplicate indices, wrong dimensions, zero/nonfinite vectors, model mismatch, empty no-op, mixed cached/missing history, no input mutation, no unnecessary provider call.
- [x] Implement batched embeddings with bounded per-request batch size; use shared transport; populate missing vectors, preserve compatible cached vectors, reject incompatible cache.
- [x] Verify focused + whole suite and report, no commit.

### Task 4: Compare against earlier calls
**Files:** detector/src/compare.mjs, detector/tests/compare.test.mjs.
**Interfaces:** cosineSimilarity(a,b) => number; findCandidates(current,history) => Candidate[]; see CONTRACT.
- [x] RED: hand-computed scores, numerical extremes, zero/nonfinite, no history, same elder/same kind/strictly older exclusion, history beyond 7 days, deterministic ties, incompatible eligible metadata, one result per current ID.
- [x] Implement pure exhaustive comparison; clamp rounding to [-1,1]; return strongest candidate and eligible count, not classification.
- [x] Verify focused + whole suite and report, no commit.

### Task 5: Flag and count repeats
**Files:** detector/src/classify.mjs, detector/tests/classify.test.mjs.
**Interfaces:** classifyCandidates(candidates,{threshold=0.85}={}) => {matches,counts,threshold}; see CONTRACT.
- [x] RED: exactly-at threshold, below threshold preserved candidate, no history, label buckets, separate stories/questions, many previous matches count once, duplicate item IDs rejected, invalid threshold/score/label.
- [x] Implement pure threshold classification and counts; retain strongest prior link only on above-threshold repeat; preserve candidate evidence below threshold.
- [x] Verify focused + whole suite and report, no commit.

### Task 6: Return persistence-ready pipeline results and integration example
**Files:** detector/src/index.mjs, detector/src/index.d.mts, detector/cli.mjs, detector/tests/pipeline.test.mjs, detector/tests/cli.test.mjs, detector/README.md, detector/fixtures/example-input.json, detector/.env.example, detector/.gitignore; may update only detector/src/types.d.ts exports to reflect actual finished modules and package.json scripts/exports if needed.
**Interfaces:** analyzeCall(input, options) => Result; full CONTRACT. Run extraction -> embeds -> eligible history cache -> compare -> classify. Return item vectors, matches, counts, provenance and stable persistenceKey. No DB writes, no app integration edits. CLI: node detector/cli.mjs --input PATH --output PATH; no secrets/output text on stdout. API key from env only; extraction model env or input options; --help succeeds without key.
- [x] RED: full orchestration through realistic mock HTTP (not stubbed algorithm), 2-call history returned from first result, repeat buckets, input privacy gate no network, retry identity, provider failure unavailable/null counts, foreign/future history ignored, model incompatibility fail, zero caller text no network, partial history errors, CLI synthetic fixture labels and no-key failure/no overwrite.
- [x] Implement API exports plus private-output CLI and provider config. Stable persistence key is elderId:callId; caller transactionally replaces per-call rows. Preserve prior history original provenance. Do not claim durable idempotency module cannot enforce.
- [x] Add declarations for direct TypeScript imports and test persistence-key delimiter collisions.
- [x] Document exact setup/run commands, integration mapping to existing topics/call_markers with no schema edits, provisional threshold, caller consent responsibility, real vs fixture tests, known limits, tasks 2/3 deferred. Synthetic example must never contain planted labels passed to model.
- [x] Verify whole suite/check, record live provider status if key absent BLOCKED, no commit.
