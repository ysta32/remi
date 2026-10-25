# Synthetic repeat detection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development and test-driven-development. No worker commits/pushes/live requests/subagents. Others are working; preserve edits.

**Goal:** Show actual all-history detector matches for generated calls in the live dashboard.
**Architecture:** Separate successful result storage and chronological batch CLI; optional allowlisted timeline DTO; small existing-dashboard integration.
**Tech Stack:** Existing Node24, TypeScript, SQLite, Next/React, standalone detector.
**Spec:** docs/superpowers/specs/2026-10-25-synthetic-repeat-integration.md

## Global Constraints
Preserve legacy pipeline/topics/markers/nudges and all source/audio artifacts. No labels into detector, fake vectors, threshold gaming, medical/accuracy claims, secret output or main merge. Apply only explicit named synthetic corpus; effective consent rechecked. All provider failures retain prior results, no false zero. User authorized feature commit/push and live fictional processing; parent owns these.

## Review Focus
- Earlier call changed/deleted: no stale links or stale downstream cached history.
- Consent revoked during provider work: no persistence or quote exposure.
- Provider fails mid-batch: no partial batch mistaken for complete analysis.
- Existing fixture/legacy data: optional contract preserves old behavior.
- Actual zero repeats: visible analyzed status, distinct from unavailable.

### Task 1: Backend runner, persistence and DTO
Own web/db/migrations/0002_detector_results.sql, web/db/schema.ts, web/test/schema-parity.test.ts, web/lib/types.ts, echo-docs/echo-docs/docs/contracts.md; web/lib/server/synthetic-repeats.ts, optional focused detector-results.ts helper, web/scripts/analyze-synthetic-repeats.ts, web/package.json, web/lib/server/timeline.ts; focused new tests server/__tests__/synthetic-repeats.test.ts and detector-results tests if useful. Read spec exact interface. Include snapshot/hash/cache and transaction semantics, transport-based production detector tests (mock transport only). Keep source reader and detector unchanged. Use existing config defaults. Document DTO plus table in contract. Parent owns HANDOFF and top-level docs. No UI edits.
- [x] Write and run meaningful failing tests for acceptance conditions.
- [x] Implement minimal runner, additive storage and allowlisted timeline DTO.
- [x] Run focused/full web tests, typecheck, lint; report RED/GREEN and exact public interfaces to .superpowers/sdd/2026-10-25-synthetic-repeat-integration/task-1-report.md.
- [x] Independent spec and quality review.

### Task 2: Visible actual detections
After Task1 review, own web/components/RepeatDetections.tsx, web/components/TimelineView.tsx, web/components/HowHesDoing.tsx, web/components/SnapshotCard.tsx, web/lib/synthetic-demo.ts, focused tests and web/README.md/synthetic/README.md. Consume exact DTO from Task1. Reuse existing styles/formatters, render-to-static-markup tests without new dependencies where useful. Display real evidence/labels/scores, earlier-call anchors expand hidden history, show analyzed zero, partial and consent-redacted evidence correctly; remove contradictory legacy tile/notice only when standalone results present.
- [x] RED tests for complete/zero/partial/redacted results, legacy fallback and actual link/notice behavior.
- [x] Implement minimal component and integration, document CLI/run/limits.
- [x] GREEN web tests/typecheck/lint; report .superpowers/sdd/2026-10-25-synthetic-repeat-integration/task-2-report.md.
- [x] Independent task review, parent live apply/browser validation and final broad review.
