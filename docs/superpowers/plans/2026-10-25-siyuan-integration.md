# Siyuan Feature Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute tasks sequentially with independent reviews; no worker commits.

**Goal:** Connect existing Drift Index and audio analysis to the synthetic demonstration without duplicating either algorithm.
**Architecture:** Read-only timeline adapter plus reusable chart; a separate artifact-producing audio runner reuses existing backend functions.
**Tech Stack:** TypeScript, Next, SQLite, Vitest, existing OpenAI STT and pure DSP.
**Spec:** docs/superpowers/specs/2026-10-25-siyuan-integration.md

## Global Constraints
- Preserve teammates' implementations and main; no algorithm or threshold changes.
- No new dependencies, ground-truth input, secret output, destructive pipeline calls, or DB overwrites.
- Workers may not commit, push, spawn agents or call paid APIs. Others work here; preserve their edits.
- Synthetic is explicit; authored timing is not measured audio; no clinical or accuracy claim.
- Consent filtering is server-side; no external notifications are sent.

## Review Focus
- Expanded marker enum must not make importer invent pitch values (Task 1).
- Missing/invalid repeat evidence differs from confirmed zero (Task 1).
- Baseline-ending week is not a monitoring week (Tasks 1,2).
- Chart copy cannot claim a computed notification was sent (Task 2).
- Audio path/output failures must preserve original artifacts and data (Task 3).

### Task 1: Read-only Drift Index adapter and merge compatibility
**Files:** web/lib/server/drift-index-view.ts (new), its tests, web/lib/server/timeline.ts, web/lib/types.ts, web/lib/server/synthetic-import.ts and tests, docs/contracts.md and HANDOFF under echo-docs/echo-docs/docs.
**Interfaces:** Consume unchanged runDriftIndex, validatedResults/readDetectorCorpus, stored raw call_markers. Produce exported DriftIndexView in types.ts and buildDriftIndexView(db, elderId, language, {speechTrends,mood}) optional Timeline.driftIndex. DTO must include baseline progress, counts of eligible/monitored calls, completed monitoring weeks, weekly results, repeat coverage (known/unknown and unprompted story counts), simulated/timing provenance, and rule defaults. Choose clear typed property names; report them for Task 2. Do not export transcript/evidence/vectors.
- [ ] Write failing tests for importer with ten MARKER_KEYS but seven computed text markers; insufficient baseline; the exact 12-call three/week four-week schedule (2 familiarization + 8 baseline + 2 monitored calls, zero completed monitoring weeks); direct equivalence to runDriftIndex; only unprompted repeated stories count; successful zero vs missing; mixed language/nonfinite/low confidence; consent; no DB mutations.
- [ ] Run targeted Vitest and capture RED.
- [ ] Implement adapter using only same-elder done calls in current language; raw finite high-confidence text markers, adequate when high-confidence speech_rate is present. Keep unknown mood null unless consent and known. Reuse validated detector records; no fallback to planted labels. Withhold adapter without speech consent. Full baseline needs default 8 calls after first 2; monitoring call day strictly > baseline.endDay. Weeks marked baselineWeek remain excluded from monitoring counts. Fix importer by iterating TEXT_MARKER_KEYS instead of expanded keys.
- [ ] Run targeted tests, typecheck; report GREEN. Add additive contract documentation and handoff line.

### Task 2: Family dashboard Drift Index card
**Files:** new web/components/dashboard/DriftIndexCard.tsx (adapt directory to existing dashboard), relevant HowHesDoing component, web/components/research/DriftIndexChart.tsx, focused tests, web/README.md.
**Interfaces:** Consume Task 1 DriftIndexView. Reuse existing chart via backwards-compatible optional copy props or truthful wrapper; preserve research defaults.
- [ ] Inspect actual Task 1 DTO and existing UI. Read local Next docs as web/AGENTS requires.
- [ ] Write failing tests for absent DTO, consent omission, baseline progress/exact 12-call states, unknown coverage, synthetic authored timing, and computed nudge states without any "sent" claim.
- [ ] Implement compact card in How he's doing. Clearly explain initial baseline and lack of completed monitoring weeks; show actual repeat coverage, not all repeated items as Drift Index stories. Keep no-results states truthful. No diagnostic wording or algorithm changes.
- [ ] Run focused tests, lint/typecheck and report results. Document how current dashboard differs from static research/oracle evaluation.

### Task 3: Existing audio measurement runner
**Files:** new web/lib/analysis/synthetic-audio.ts, tests, web/scripts/analyze-synthetic-audio.ts, web/package.json, synthetic/README.md and .gitignore if needed.
**Interfaces:** New npm command analyze:synthetic-audio accepts explicit --audio DIR --input DIR --output FRESH_DIR and --apply; default dry run, no paid API. Reuse synthetic source validation and audio manifest validation patterns. Export a testable runner with injectable STT dependency. Output per-call JSON and manifest/README with source hashes, provider/model provenance, actual measured word times and markers, pitch values/confidence and status. No DB operations.
- [ ] Write failing tests for dryrun no network/write; invalid source/path/hash; fresh output protection; no source mutation; missing/invalid/out-of-bounds STT times; caller-only spans/no authored words; independent pitch/text confidence and clearly synthetic metadata.
- [ ] Run RED, then implement using existing parseWav, pitchMarkersAsync, transcribeWords, attachWords and computeMarkers. Use actual audio sidecar start/end spans, validate actual STT words before attaching. Provider failure must not become a successful zero. No processCall (it deletes WAVs), no TTS generation, no ground-truth read. Derive adequacy from existing marker rules rather than hardcode true.
- [ ] Run offline GREEN and typecheck; document exact dryrun/apply commands. Parent will run all twelve live STT/pitch analyses using configured key and verify original hashes before/after.

## Final verification
- Full web, detector and synthetic suites; syntax/typecheck/lint.
- Existing demo has 24 real repeat matches; DI input counts only 7 unprompted repeated stories.
- Browser verify card and prior repeat evidence links. Original DB and audio preserve content.
- Independent broad review, record actual audio outcomes and blockers; commit/push only feature, main unchanged.
