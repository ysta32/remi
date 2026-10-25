# Transcript demo implementation plan

> Workers use subagent-driven-development and test-driven-development. No worker commits, pushes, live API calls or subagents. Others are working; preserve all edits.

Spec: docs/superpowers/specs/2026-10-25-transcript-demo-design.md
Goal: show generated transcript calls and honestly computed synthetic-timing markers in the existing live dashboard using a fresh isolated DB.
Architecture: provider-independent corpus reader; offline fresh-DB importer; small provenance/unavailable-status UI additions.
Global constraints: no resets, existing data changes, schema changes, backend pipeline redesign, ground-truth leakage, fake repeat detections or audio analysis. Parent handles run/apply/commit/push.

### Task 1: Safe corpus import and real offline markers
Own synthetic/src/read.mjs (optional small shared IO helper), synthetic/src/audio-run.mjs only source-reader extraction, synthetic/tests/read.test.mjs; web/scripts/import-synthetic.ts, web/lib/server/synthetic-import.ts, web/lib/synthetic-demo.ts, web/scripts/__tests__/synthetic-import.test.ts, web/package.json script import:synthetic. Read spec exactcontracts. Preserve existing audio exports/tests. Add shared notice/helper for Task2. Implement fresh DB only (not existing DB additions), transaction, puremarkers/baselines, unknownrepeats and excerpts. Tests use actualSQLite/migrations and current generatedbundle, mockonly network guard. Read existing testhelpers and migrationcwd behavior. Snapshot existing unrelatedDB toprovepreservation. Do not touch backend pipeline/recompute orUI.
- [x] Write and capture meaningful RED tests.
- [x] Implement assigned scope.
- [x] Run targeted tests, synthetic suite and web typecheck; record GREEN.
- [x] Independent review. Report .superpowers/sdd/2026-10-25-transcript-demo/task-1-report.md.

### Task 2: Display provenance and honest unavailable analysis
After Task1 review, own web/lib/signals.ts, web/components/SignalCard.tsx, web/components/TimelineView.tsx, web/lib/demo.ts, web/lib/__tests__/signals.test.ts, optional small provenance/demo tests, synthetic/README.md, web/README.md. Consume shared notice/helper from Task1, no edits to it unless coordinate. Read web/AGENTS.md and localNextdocs. Add targeted UI additions fromspec, no redesign. Document freshDB CLI/dryrun/apply and exactliveenv/startcommands; explain no modelsummary/detection and sourceauthoredtimings despite separateaudiofiles existing. Do not use standardseed/reset forsetup.
- [x] RED tests unavailable/latestweek/realzero/repeatthreshold; defaultdemoID stable/override safe; provenanceonly matchingimportedabout.
- [x] Implement/UI docs and targeted GREEN.
- [x] Run webtests,typecheck,lint; report .superpowers/sdd/2026-10-25-transcript-demo/task-2-report.md.
- [x] Parent realimport, API/browser validation, finalreview, commit/push authorized branch.
