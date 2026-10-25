# Transcript demo verification — 2026-10-25

Feature worktree: `/Users/ryanwatach/.codex/worktrees/7794/remi`, branch `ws/ryan-synthetic-data`.

## Result

A fresh, isolated `web/data/synthetic-transcripts-demo.db` contains one fictional Hal profile, 12 simulated calls, 96 marker rows and 7 baselines. Existing data was not reset. Topics, fun facts and nudges remain empty. All repeat readings are NULL/na with no z score. SQLite integrity and foreign-key checks pass.

Weekly authored mean pauses are 611.25, 853.46, 1105.67 and 1394.17 ms. These are computed from synthetic transcript timing, not measured from the separately generated audio. No model summary, repeat analysis, threshold tuning or accuracy evaluation was performed.

## Commands

From the feature worktree root:

```sh
npm test --prefix synthetic
npm run check --prefix synthetic
npm test --prefix detector
npm run check --prefix detector
```

From `web/`:

```sh
npm test
npm run typecheck
npm run lint
npm run import:synthetic -- --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release
npm run import:synthetic -- --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --database /Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db --apply
NEXT_PUBLIC_USE_FIXTURES=0 NEXT_PUBLIC_DEMO_ELDER_ID=elder-synthetic-hal-bennett DATABASE_PATH=/Users/ryanwatach/.codex/worktrees/7794/remi/web/data/synthetic-transcripts-demo.db npm run dev -- --hostname 127.0.0.1 --port 3001
```

The apply command intentionally refuses to run again against the existing database. Choose a new destination for another import. Parent directory must exist.

## Evidence

- Synthetic: 150 tests pass; detector: 245 pass; web: 170 pass across 24 files. Both Node syntax checks, web typecheck and lint pass. Task reports record failing-then-passing targeted tests.
- Live profile/timeline API: 12 simulated calls in descending chronological order, clearly labeled transcript excerpts, provenance notice, zero nudges/fun facts.
- Chrome at `http://127.0.0.1:3001/elders/elder-synthetic-hal-bennett`: simulated badges and authored-timing notice visible. The How he’s doing tab shows all 12 simulated readings and Retold stories says “Not analyzed yet”.
- Audio regression after shared-reader extraction: all 252 segments read from cache, zero network requests, 24 WAVs and 12 timing files byte-identical to the completed live generation. See `2026-10-25-openai-audio-verification.md` for live speech evidence.
- Independent task reviews approved both specification compliance and code quality. Final broad review approved the complete integration with no blocking or nonblocking findings. `git diff --check` and changed-file credential-pattern scan passed.

## Integration limits

This import uses existing pure marker/baseline functions. It does not call the model extraction pipeline or standalone detector, fabricate repeat results, or import planted labels. For actual audio analysis, use a copy of the caller-only WAV and its audio-derived timing; the existing audio pipeline may delete its input. Subjective listening, STT and detector semantic accuracy remain unverified. No medical inference is supported by these fixtures.
