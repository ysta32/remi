# Synthetic repeat integration verification — 2026-10-25

Branch `ws/ryan-synthetic-data`, implementation base5318641. User requested actual repeat detections after reviewing the transcript-only demo. No merge into main.

## Delivered and live evidence

Explicit synthetic analysis CLI uses the actual standalone detector with `gpt-6.1-sol`, `text-embedding-3-small` (1536 dimensions), provisional threshold0.85. Extraction model follows the existing backend default; official [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol) confirms structured-output support. No second AI verification step and no artificial production vectors. Source calls are allowlisted; planted labels and identifiers are never provider inputs.

All12calls completed. Actual detected counts:24total,14unprompted,8prompted,2uncertain;16stories,8questions. Twelve successful result rows persist in local ignored `web/data/synthetic-transcripts-demo.db`; all previous tables except migration bookkeeping compare exactly with the before-analysis backup. Foreign keys/integrity checks pass. Every exposed evidence quote is grounded in the actual caller turn, and every link points to a strictly earlier call from this elder. API exposes counts/evidence/provenance, never embeddings or full transcript/result JSON.

A second apply without loading credentials returned `reused:true` for all12calls, with no provider calls. Existing source/audio artifacts and legacy topics/markers/nudges were preserved.

Chrome verification: both tabs show24detections and12/12analyzed with the three exact labels. Expanding the Oct12 birthday-cake match shows current/prior source quotes and similarity0.878. Clicking its earlier-call link expands the history and scrolls to the Sep28card. The unavailable legacy repeat tile is suppressed for the new analysis, and the authored-timing notice no longer says repeats have not run. Stored provenance recognition stays backward-compatible.

## Exact commands

From feature worktree `web/`:
```sh
npm run analyze:synthetic -- --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --database /Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db
node --env-file=/Users/ryanwatach/Documents/Projects/PSU/remi/env.local --import tsx scripts/analyze-synthetic-repeats.ts --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --database /Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db --apply
npm run analyze:synthetic -- --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --database /Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db --apply
npm test
npm run typecheck
npm run lint
```
The first command is offline dry-run. The second was the authorized paid generation of detector results; the third reused its cache. Keys were never printed or stored in Git/results. Parent verified API/SQLite against an exact local pre-run backup.

From root:
```sh
npm test --prefix synthetic
npm run check --prefix synthetic
npm test --prefix detector
npm run check --prefix detector
NEXT_PUBLIC_USE_FIXTURES=0 NEXT_PUBLIC_DEMO_ELDER_ID=elder-synthetic-hal-bennett DATABASE_PATH=/Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db npm --prefix web run dev -- --hostname 127.0.0.1 --port 3001
```

## Verification and limits

150synthetic +245detector +199web tests passed (594total), syntax checks/typecheck/lint pass. Backend and frontend task reviews approve specification and quality after correcting CLI env aliases. Final broad review approved with no blocking or material findings. Changed-file credential-pattern scan and diff checks passed. Targeted tests observed RED before implementation and GREEN afterward. Coverage includes source/settings/history invalidation, consent revocation, atomic batch failure, no-label input, grounded earlier links, DTO redaction, zero/partial states, legacy fallback and unique anchors.

These24matches are actual model outputs, not a measured accuracy result or a medical assessment. The combined demo includes both planned splits, so it cannot serve as untouched held-out evaluation. Task3 still needs human label review and independent tuning/evaluation. This is an explicit synthetic-corpus replay; automatic processing of future real FaceTime calls remains the existing separate pipeline. Audio analysis/playback integration, full AI call summaries and raw pause-chart improvements are outside this change.
