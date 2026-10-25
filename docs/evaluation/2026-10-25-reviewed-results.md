# Reviewed repeat detector results — 25 October 2026

Open `/evaluation` in the Remi app. This is a static judge-facing report: it requires no demo database, API key, model call, or local evaluation files at runtime. The page offers interactive item selection, current/prior fictional excerpts, outcome filters, a print button, and a downloadable JSON snapshot.

## What was evaluated

One fictional persona, 12 generated calls over four weeks, 60 reviewed story/question occurrences. One human reviewed the planted labels and confirmed them in conversation; the review-notes file was not used and there was no independent second reviewer. Items 10.2, 10.5 and 11.2 were explicitly confirmed as retellings after their displayed Uncertain label caused confusion. Their prompting classification remains unclear. That correction did not alter the binary repeat metrics.

The model predictions were already saved before this score. The corpus/results were previously inspected; this is preliminary demo-corpus evidence, **not an untouched held-out evaluation**. Every extracted item aligned one-to-one with a reviewed occurrence using source turn and quote. Every flag's prior link was checked against an earlier occurrence of the same incident. The detector was not rerun and no threshold was tuned for this presentation.

| Decision | Count |
|---|---:|
| Repeat caught (TP) | 24 |
| New content falsely flagged (FP) | 0 |
| Repeat missed (FN) | 6 |
| New content correctly left unflagged (TN) | 30 |

- Precision: 24 / 24 = 100%.
- Recall: 24 / 30 = 80%.
- Overall accuracy: 54 / 60 = 90%.
- F1: 48 / 54 = 88.9%.
- Repeated stories: 16 / 18 caught; repeated questions: 8 / 12 caught.
- Correct prior links: 24 / 24 flagged repeats.

All six missed items had the correct best earlier candidate but scored below 0.85:
7.2 (0.823), 7.4 (0.832), 7.5 (0.820), 9.5 (0.792), 10.1 (0.835), 10.5 (0.786).
Rounded values are for display only; decisions use the stored full-precision value.

These numbers describe repeat matching on fictional transcripts. They do not measure medical outcomes, audio analysis, prompting-classification accuracy, or live FaceTime performance. Stanley is handling the separate FaceTime check; no outcome is asserted here. The next independent evaluation needs new incident families and realistic negatives after settings are frozen.

## Provenance and reproduction

Frozen implementation/settings: [original checkpoint](2026-10-25-detector-freeze.json). The original [baseline note](2026-10-25-repeat-baseline.md) describes the state before review and remains a historical record.

Public artifact: `web/public/evaluation/repeat-review-v1.json`. Only allowlisted fictional excerpts, summaries, per-item labels/decisions, source hashes and settings are exported; no embeddings, credentials, complete database, or machine paths. The app derives metrics from these 60 rows.

Export using the original local review packet and frozen snapshot into a **new** file:

```sh
python3 scripts/export-repeat-evaluation.py \
  --review-directory /absolute/path/to/evaluation-review \
  --snapshot /absolute/path/to/checkpoint/snapshot \
  --output /fresh/path/repeat-review-v1.json
```

The exporter verifies manifest/file/database/result hashes, review-confirmation and correction hashes, item alignment, quote grounding, threshold decisions and prior references before writing. It refuses overwrite. Unchanged inputs reproduce the committed JSON byte-for-byte. It reads no credentials and calls no provider. Original input artifacts remain local/ignored; the public export lets teammates present without those files.

## Judge walkthrough (about one minute)

1. Lead with “24 of 30 known repeats caught; no false alarms among 30 new items.”
2. Explain precision versus recall using the denominators or confusion matrix.
3. Select item 10.5: compare the seed-storage question to its earlier wording and show why 0.786 missed the 0.85 cutoff.
4. Select item 11.2: show a caught retelling, its earlier quote, and the separate unclear-prompting label.
5. Close with the limits and next independent test. Do not present zero observed false alarms as a guarantee on future calls.
