# Task 2 delivery and verification

Implemented and independently reviewed; no blocking findings remain. This is offline software verification, not semantic accuracy or clinical evidence. No live OpenAI, audio generation, STT, database import, commit, push, or merge was performed.

## Location and ownership

- Branch: `ws/ryan-synthetic-data`, based on merged main `70b39ce13e2468cb3d2cd1c96066ee76fc878ad7`.
- Worktree: `/Users/ryanwatach/.codex/worktrees/7794/remi`.
- Deliverable: `synthetic/` (27 new files): nine focused source modules, CLI, two authored catalog/profile modules, ten tests, default config, package manifest, ignore rules, README and shared contracts.
- Task 2 documents: the approved design, implementation plan, and this verification report under `docs/superpowers/`.
- Existing detector, backend, voice scaffolding, fixtures, root manifests and original main checkout are unchanged. Original local main remains at `e2fe6a3`; it was not pulled or switched. Existing worktrees are preserved.
- All Task 2 work remains uncommitted. Explicit approval is required before committing or pushing. No main merge is authorized.

## Authoritative generated bundle

Use `synthetic/output-release/`, especially its portable `README.txt` and `manifest.json`. This ignored directory contains 52 files: 12 canonical calls, 12 detector-ready calls, 12 truth sidecars, 12 timing sidecars, one fictional profile, split assignments, README and manifest. Earlier `output/` and `output-final/` directories are preserved previews and are not the delivered release.

Default seed 42 produces four weeks of Monday/Wednesday/Friday calls at 10:00 America/New_York, September 28 through October 23, 2026. One fictional Grandpa Hal persona; 12 calls; durations 207,964–240,621 ms (about 3:28–4:01). There are 60 planted occurrences: 30 new, 18 Unprompted repeat, 9 Prompted retelling, 3 Uncertain. The corpus contains 14 distinct same-topic negative pairs. Six tuning calls and six held-out calls have disjoint incident families, including their negative siblings.

The catalog has 40 incidents/questions and 120 authored paraphrases. The planner introduces material in weeks 1–2 and repeats it in weeks 3–4; the agreed mix applies across the corpus. The uncertain cue invites an unspecified earlier item, rather than being a generic opener. All ground truth remains `planted_unreviewed` pending Task 3 human review.

Eight caller-internal pauses per call have authored weekly centers 600/850/1100/1400 ms. Observed release ranges are 530–674, 781–917, 1036–1172, and 1327–1471 ms. Word durations and gaps are synthetic rules, not measurements. No audio exists; `audioPath` is null. Repetition and pauses imply no medical condition.

## Exact commands

Run from the worktree above. Node 24+; no package installation needed.

```sh
npm --prefix synthetic test
npm --prefix synthetic run check
npm --prefix detector test
npm --prefix detector run check
node synthetic/cli.mjs --help
```

The delivered release was generated with:

```sh
node synthetic/cli.mjs --config synthetic/config/default.json --output synthetic/output-release
```

That directory now exists, so repeating the command intentionally refuses it. To generate another identical bundle, choose a new destination under an existing real directory:

```sh
node synthetic/cli.mjs --config synthetic/config/default.json --output synthetic/output-next
```

Only raw config keys `schemaVersion`, `seed`, `startDate`, and `callsPerWeek` are accepted; counts 2–4 per week are supported. The date must be a Monday. Avoid symlink ancestors; on macOS use canonical temporary paths. No force/overwrite mode exists.

## Verification evidence

| Check | Result |
| --- | --- |
| Final synthetic suite | 117 passed; 0 failed/skipped |
| Existing detector suite | 245 passed; 0 failed/skipped |
| Both syntax-check commands | Passed |
| Reproducibility | Tests compare two independently written directories byte-for-byte; final release also matched fresh in-memory generation for all 52 files |
| Manifest integrity | Independently recomputed and verified all 51 payload SHA-256 digests |
| Calendar/config | Supported count presets, uint32 seed boundaries, malformed configs, New York DST and year rollover covered |
| Labels/source/partitions | Exact totals, earlier-only references, negative siblings, quote/UTF-16 spans, complete authored dialogue, and disjoint families covered |
| Timing | Actual word gaps, eight pauses, weekly ranges, nonnegative intervals, no overlap/padding and endedAt consistency covered |
| Detector integration | Real parseCall and analyzeCall exercised; only OpenAI-shaped HTTP transport is controlled in software tests; history comes from earlier detector results |
| Leakage protection | Explicit export allowlist plus full authored-dialogue validation; sentinels and retimed corruption probes rejected |
| Publication | Existing files/directories/symlinks preserved; invalid inputs fail before publication; competing generators produce one exclusive winner |
| Scope | Existing tracked files unchanged; release ignored; no commits/pushes |

Six focused implementers had separate ownership; catalog/timing and later fixed-contract components ran independently. Each implementation received independent review, followed by a broad final review and a scoped final re-review. Test-first reports distinguish missing-module failures from behavioral regressions. Meaningful regressions caught shifting relative-date queries, insufficient category-kind coverage, weak prompt/quote checks, label text hidden around valid quotes, generic uncertain cues, and missing portable bundle documentation. All were corrected and reviewed.

The final whole-change reviewer approved the result. Controlled test embeddings remain confined to tests; generated demo files contain no embeddings, fabricated detector results, or accuracy number.

## Integration requirements and remaining work

`detector-inputs/*.json` contains the exact public Call shape, not the detector CLI envelope. For a separately authorized live replay, wrap each call with `history` and `processingAllowed`, using only actual earlier returned items as history. The repository README supplies a direct-import example. Golden labels, incident IDs and expected decisions must never enter extraction, embeddings, or history. No live behavior has been verified here.

Canonical calls include caller word timestamps compatible with the existing pure `computeMarkers` interface. Keep the surrounding result visibly simulated with `timingSource:'synthetic_authored'`; that marker function does not retain timing provenance. These timestamps are not an audio-analysis test.

The current agent create/complete API cannot safely mark imported calls synthetic. Do not POST this corpus into it or invoke the existing destructive demo reset/seed path. Siyuan still needs an explicit synthetic-import/storage handoff and Task 1 detector integration; the legacy backend matcher remains a separate seven-day story matcher. No backend changes are bundled here.

Task 3 must review planted labels, tune only on the tuning set, freeze settings, and evaluate held-out incidents with separate chronological history. A demonstration that consumes held-out content cannot also be claimed as untouched held-out evaluation. Template similarity and a single fictional persona limit generalization. No threshold was changed.

Publication assumes trusted local parent directories. Exclusive creation protects existing data; native Node pathname checks are not a security boundary against a hostile same-user process repeatedly replacing ancestors. Review narrowed an overstrong code comment; no privileged deployment or hostile-filesystem guarantee is claimed.

## Recorded implementation decisions

1. The user's approval covered the detailed implementation and subagent method, so no redundant planning approval was requested. A mistaken interpretation would require revising uncommitted work only.
2. Independent workers used disjoint ownership after shared contracts; pure scheduling and publication work could proceed against those contracts while dependencies finished. The tradeoff is possible integration rework, not shared-file overwrites.
3. Reviews used uncommitted snapshots because commits were prohibited. The ledger and worktree remain preserved as evidence until publication is explicitly authorized.
4. A readable optional live-replay snippet replaces a new live CLI. Live use remains a deliberate integration step; the generator stays offline.
5. The approved explicit September 28 start date was retained; an inaccurate draft phrase about weeks preceding the event was corrected. Changing that date later changes IDs and artifacts deterministically.
6. Identity and hash field names were frozen as `persona.elderId` and `manifest.files`; downstream consumers should use the documented contracts.
7. The existing local-file threat scope was retained after review of hostile same-user ancestor swapping; no native dependency or privileged filesystem claim was added.

No required generator work remains. Live provider behavior, human-reviewed semantic evaluation, backend ingestion, audio, and publishing remain separate work.
