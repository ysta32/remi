# Judge evaluation page implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this task.

**Goal:** Give judges an inspectable visualization of the reviewed frozen repeat detector evaluation.
**Architecture:** Export a verified, allowlisted fictional snapshot once; render it in a static Next page with a client evidence explorer. No runtime database or model requests.
**Tech Stack:** Existing Next, React, TypeScript, Tailwind; Python standard library for export.
**Spec:** docs/superpowers/specs/2026-10-25-evaluation-view.md

## Global Constraints

Frozen settings: detector1.0.0, gpt-6.1-sol/remi-items-v1, text-embedding-3-small/1536, threshold0.85. No changes to detector, live pipeline, original checkpoint or historical report. Label synthetic evidence and scope all scores to repeat matching. Stanley performs the separate FaceTime check.

## Review Focus

Check denominators and type breakdowns; incomplete/corrupt exports; repeat identity versus unclear prompting; output privacy and reproducibility; desktop/mobile/keyboard/print behavior. Tests pin metrics, artifact integrity, correction labels and evidence export. Browser review covers controls and responsive overflow. Review must distinguish verified synthetic evidence from live/clinical/untouched holdout claims.

### Task 1: Snapshot, visualization and evidence

Files: scripts/export-repeat-evaluation.py; web/public/evaluation/repeat-review-v1.json; web/lib/evaluation/repeat-report.ts; web/components/evaluation/RepeatEvaluation.tsx; web/app/evaluation/page.tsx; page CSS; SiteNav and research link; evaluation tests; docs/evaluation reviewed report and README.

- [ ] Export allowlisted current/prior quotes and per-item decisions from local report/frozen predictions; validate hashes, one-to-one alignment, metrics and earlier incident references. Source paths are explicit CLI args, not committed machine paths.
- [ ] Write/run failing tests for60items,24/0/6/30,kind breakdowns,24correct links and10.2/10.5/11.2 corrections. Test summary rendering and clear synthetic/holdout/cue limitations.
- [ ] Build derived metrics and page, outcome filter and item selection, six-miss graphic, evidence pairs, readable methodology and print/download controls. Expected: no requests to model/database, no fabricated score, no mobile overflow.
- [ ] Verify focused tests, typecheck/lint/build, export reproducibility, browser desktop/mobile controls and print styles. Full web suite once implementation settles.
- [ ] Commit, fresh final review, address important findings with regression tests, publish and merge using existing authorization. Final task command: npm --prefix web test.

## Completion and review

Implemented all snapshot, visualization, evidence, methodology and navigation work. Full web suite330pass/1skip; typecheck/lint/build pass. Export reproduced byte-for-byte and rejected tampered counts/labels/summaries/correction hash. Public JSON HTTP200 matches artifact exactly. Browser desktop/390px mobile show no horizontal overflow; outcome filters, empty false-alarm state, keyboard selection11.2 and prior-item4.5 navigation work. CSS is globally prefixed `eval-*` because the existing Tailwind Turbopack loader does not export CSS-module names; actual browser styling verified.

Fresh review found no Critical/Important issues and independently regenerated the snapshot. Deferred minor: miss-chart selection uses smooth scrolling even with reduced-motion enabled. Print styles/action exist, but the automated dialog/download UI timed out; completed PDF pagination is unverified (JSON endpoint itself verified). No blocker to the interactive judge page.

Review boundaries: executor verified browser interaction; reviewer checked markup/CSS. Stanley owns live FaceTime testing. No clinical/generalization claim or independent second human review. Detector tuning and existing research simulation claims remain outside this static report. Existing frozen inputs remain untouched.
