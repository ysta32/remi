# Frozen repeat-detector baseline — 2026-10-25

This records the existing standalone detector and saved synthetic replay before human label review. It is a preliminary demo-corpus evaluation, not untouched held-out evidence. Audio generation and audio analysis are outside this evaluation.

## Frozen implementation and settings

See `2026-10-25-detector-freeze.json` for exact commits, code hashes, corpus hashes, saved-result hashes and provenance read from all twelve stored results.

- Code checkpoint: `13aa90883254c2c53d8d87f7ae36138c8db34cc1` on `ws/ryan-synthetic-data`.
- Detector implementation commit: `8e6d13cac772961454e2b2e46b85539a94897868`.
- Extraction: `gpt-6.1-sol`; prompt `remi-items-v1`.
- Embeddings: `text-embedding-3-small`, 1536 dimensions.
- Similarity threshold: **0.85**, provisional and uncalibrated; inclusive comparison.
- Target: `detector/src/index.mjs`, invoked by `web/lib/server/synthetic-repeats.ts`. It compares stories and questions with eligible same-kind items from all strictly earlier calls for the same elder.
- This is distinct from the legacy automatic post-call repetition pipeline and its `repeat_stories` marker.
- Saved baseline: 12 successful calls, 60 extracted items, 24 flagged matches (14 unprompted, 8 prompted, 2 uncertain; 16 stories, 8 questions). These counts are not accuracy measurements.

Use the frozen saved predictions for the first score. Model aliases may change upstream and rerunning a model can change outputs. Any changed setting, prompt, code, corpus or reviewed labels requires a new named evaluation version; keep the original checkpoint unchanged.

## Backup

The local checkpoint is under the original checkout at:

`data/checkpoints/repeat-evaluation-20261025T140728Z/`

It contains `snapshot.tar.gz`, an archive SHA-256 file, and an unpacked snapshot with the full fictional corpus, a consistent SQLite backup, settings and per-file hashes. All corpus manifest hashes, archive payload hashes, SQLite integrity and foreign keys were verified. Git ignores these artifacts. No credentials or audio are included. This is a separate local copy, not an off-device backup; copy the archive and checksum to private external storage for protection against loss of the computer. Restore only into fresh paths.

## Human review and scoring procedure

1. Review the copied `corpus/calls/` transcripts chronologically, with their `corpus/ground-truth/` annotations. Keep model predictions hidden during review. For each occurrence, confirm story/question kind, same-incident identity, earlier source and elicitation (unprompted, prompted or uncertain). Use full turns to resolve context. Add any genuine omitted items. Preserve original planted labels and save reviewed labels separately with reviewer/date and reasons for changes.
2. Match extracted items to reviewed occurrences using caller source turn and quote spans, allowing summary paraphrases. Use one-to-one assignments; extra duplicate predictions do not earn extra true positives. An unextracted repeated occurrence counts as a false negative. Audit unmatched extracted items rather than silently dropping them.
3. For binary repeat detection, a true positive is an occurrence correctly recognized as repeated, a false positive is new material flagged as repeated, and a false negative is a repeated occurrence not flagged. Prompted retellings still count as repeated content. An uncertain elicitation cue is separate from uncertainty about whether an incident repeated. If repeat identity is genuinely ambiguous, report and exclude it under a declared rule rather than guessing.
4. Compute precision = TP/(TP+FP), recall = TP/(TP+FN), and F1 = 2TP/(2TP+FP+FN). Report counts and denominators; undefined denominators are N/A. Report story/question breakdowns, elicitation classification and earlier-link correctness separately. A correct repeat flag with a wrong prior link fails the link metric even if it passes binary detection.
5. Publish a short error list and label the report “Preliminary evaluation on 12 synthetic calls.” Do not divide 24 detections by 30 planted repeats and call it recall. For a stricter evidence metric, additionally require each true positive to link to an earlier occurrence of the same incident, and declare that scoring convention explicitly.
6. For an untouched final test, tune only on development material, freeze the selected settings, then evaluate new incident families and hard negatives with separate chronological history. A new seed using the same catalog is not an independent test of new story content. Do not use the current combined demo as untouched held-out evidence.

No evaluation score has been computed by this checkpoint. Human review is still pending. This does not test clinical validity or live FaceTime integration.

## Open the local review packet

On Ryan's Mac, open `/Users/ryanwatach/Documents/Projects/PSU/remi/data/evaluation-review/review.html` in a browser. It contains all 12 conversations and 60 planted items with links to earlier passages; predictions are hidden. Open `review-notes.txt` from the same folder in TextEdit or VS Code, record checked/corrected/unresolved for each item, and save. The browser document is read-only and does not save decisions. `START-HERE.txt` gives step-by-step instructions. These local files are ignored by Git and are not included in this pull request. The original corpus and frozen checkpoint remain unchanged.

## Subsequent review status

The historical checkpoint above is preserved. Human review and scoring subsequently completed;
see [reviewed results](2026-10-25-reviewed-results.md) and the app's `/evaluation` page.
