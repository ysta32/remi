# Siyuan integration verification — 2026-10-25

## Scope and authorship

Feature worktree: `/Users/ryanwatach/.codex/worktrees/7794/remi`, branch `ws/ryan-synthetic-data`.
Caught up to Siyuan's Drift Index/research work through `d9d568a` and merged his published audio backend through `0ce1134`. Reused his algorithms and default thresholds unchanged. No merge to main.

Added a read-only Drift Index adapter and family view, plus a separate runner that measures the already generated caller WAVs using his existing STT, word attachment, markers, WAV parser and pitch functions. No regeneration of speech and no replacement of his persona simulator or research page.

## Existing demo evidence

The twelve-call database retains 24 real standalone detector matches: 14 unprompted repeats, 8 prompted retellings, 2 uncertain; 16 stories and 8 questions. Only **7 unprompted repeated stories** enter the Drift Index repeat tie-breaker. These counts are observations, not accuracy measurements.

Production Drift Index settings use the first two adequate calls for familiarization and the next eight for baseline. This corpus therefore has two monitored calls and zero completed monitoring weeks. All four elapsed-week buckets include baseline calls; no nudge is computed. Defaults were not shortened to force an alert. The family view is computed on read and sends no notification.

The dashboard's existing text-marker charts still use **authored synthetic timing**. Audio measurements are separate artifacts; they are not silently substituted into the database. The research page remains Siyuan's saved simulation/oracle evaluation, distinct from the real detector-backed family view.

## Original-data protection

Before integration, saved SHA-256 snapshots of 90 source/audio files and all 16 database tables. Independently verified unchanged after API integration, with SQLite integrity and foreign-key checks passing. The final check after live audio measurement also passed: all 90 files and all 16 tables remain identical.

Local original artifacts:
- `synthetic/output-release/` — seeded corpus and separate planted labels.
- `synthetic/audio-openai-all/` — twelve conversation WAVs, twelve caller WAVs, sample timing and hashes.
- `web/data/synthetic-transcripts-demo.db` — imported authored markers and actual repeat results.

These generated artifacts remain ignored; code and regeneration/analysis commands are versioned. Another checkout must generate/import its own corpus or receive these local artifacts separately.

## Commands

From the feature worktree:

```sh
npm --prefix synthetic test
npm --prefix synthetic run check
npm --prefix detector test
npm --prefix detector run check
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run lint
```

Audio validation (no provider call or output write):

```sh
npm --prefix web run analyze:synthetic-audio -- --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --audio /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/audio-openai-all --output /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/audio-measured-openai-ordered
```

Live apply, from `web/`, loads configured credentials without printing them:

```sh
STT_PROVIDER=openai node --env-file=/Users/ryanwatach/Documents/Projects/PSU/remi/env.local --import tsx scripts/analyze-synthetic-audio.ts --input /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/output-release --audio /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/audio-openai-all --output /Users/ryanwatach/.codex/worktrees/7794/remi/synthetic/audio-measured-openai-ordered --apply
```

Existing local dashboard: `http://127.0.0.1:3001/elders/elder-synthetic-hal-bennett?tab=doing`.

## Verification status

Final results: **669 passed, 1 skipped**: generator150, standalone detector245, web274. Syntax, full Next type generation/TypeScript, full ESLint and git whitespace checks pass. Audio tests also pass15/15 in a clean source copy without ignored generated files. Browser verified the Drift Index card, baseline counts, timing notice and24repeat detections. Independent task reviews and broad integration review found no blocking issues; one nonblocking adapter-formatting nit remains.

Verified unchanged git blobs against Siyuan's published commits for drift-index.ts, sim-personas.ts, pitch.ts, wav.ts and stt.ts. No algorithms or default thresholds were altered.

## Integration decisions

- Continue under existing explicit implementation/feature-push authorization; main stays unchanged. A mistaken scope interpretation would require reverting feature commits, not main.
- Keep measured audio separate to preserve authored charts and repeat fingerprints. Displaying measured trends later needs an explicit provenance-aware import/view.
- Require a finite high-confidence speech rate for Drift Index call eligibility. Calls lacking usable timing remain ineligible rather than contributing an arbitrary partial marker.
- Narrow legacy demo generator types to their original text/repeat markers after Siyuan's marker enum expansion. No fabricated pitch values; voice fixtures would require their own actual audio measurement.


## Actual audio results

Complete output: `synthetic/audio-measured-openai-ordered/` (12 call JSON files, manifest and README), ignored/local. Actual provider `openai`, model `whisper-1`, pitch implementation `local_pitchMarkersAsync`. All12 calls have `measured` status,4529 retained words,59 boundary/outside-caller words discarded,0 missing caller turns. Coverage means every caller turn has STT words; it is not a transcription-accuracy claim. Output words are checked for finite, nonnegative, nonreversed, in-bounds timing and ordered without changing their values.

| Week | Mean speech rate (words/min) | Mean detected pause (ms) | Pitch variability (st) | Pitch range (st) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 171.730 | 737.775 | 3.539 | 9.623 |
| 2 | 173.933 | 761.404 | 3.335 | 9.070 |
| 3 | 167.346 | 888.403 | 3.413 | 9.033 |
| 4 | 169.505 | 864.965 | 3.515 | 9.689 |

These are weekly averages of per-call marker values. The STT-derived pause trend is not perfectly monotonic and does not equal authored pause timing: synthesized speech contains other pauses, and recognition/boundary estimates affect the measurements. Pitch was measured, not intentionally made to decline. No results were altered to make the demo pass.

First attempt completed8calls, then rejected the ninth provider response because valid timestamps appeared out of list order. A diagnostic request reproduced a120ms ordering inversion. A regression-tested adapter fix validates each word then sorts a copy, matching existing word-attachment behavior; invalid times still fail. The full retry into a fresh directory completed12/12. There were22transcription requests across the first attempt, diagnostic and final retry. The incomplete first directory `synthetic/audio-measured-openai/` has no final manifest and is superseded; no original recording was replaced.

## Remaining work

Human review of planted labels and STT transcription quality; separate incident-disjoint tuning/held-out evaluation and actual precision/recall measurement remain later work. The short12-call corpus does not provide completed monitoring weeks under Siyuan's defaults. Longer scenarios are already available on his `/research` page. Measured audio is not imported into the authored-marker DB; doing that later needs a provenance-aware view/import. Live FaceTime behavior and clinical validity were not tested or claimed.

Integration commits: `4f9552c` merges Siyuan's audio branch with text-only compatibility; `03b9e36` additive contract; `5ca8682` Drift adapter; `48cd87c` audio runner; `2d60a4a` ordering/portable tests; `c76a8f4` dashboard. Main stays at its original local commit. The existing worktree and its local generated artifacts are retained.
