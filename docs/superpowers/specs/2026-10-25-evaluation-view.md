# Judge-facing repeat evaluation

Build a persistent /evaluation page in the existing Remi app, linked from navigation and research. User asked to visualize the data/review/evaluation for judges; Stanley owns the FaceTime check. Proceed with existing Next/React/Tailwind design and no new dependencies.

Approach chosen by agent: an app page with an interactive evidence explorer and a downloadable, allowlisted frozen JSON snapshot. An inline-only visualization would not travel with main; a slide deck would duplicate the demo and lose drill-down. No threshold simulator or re-running models.

Use only the locally reviewed v3 evaluation and frozen saved predictions. Verify hashes, per-item ground truth and quote alignment when exporting. Publish only fictional excerpts, summaries and selected provenance, never DB credentials/vectors/full private files. All 60 items are one-to-one aligned. Derive all displayed metrics from those records: TP24 FP0 FN6 TN30; precision24/24=100%, recall24/30=80%, accuracy54/60=90%, F1=88.9%. Stories16/18, questions8/12; correct prior links24/24. All six misses had the correct best candidate below0.85.

Show a large caught-repeat result, an interactive 60-item outcome grid with text labels, confusion matrix and denominators, kind breakdown, six misses against the fixed threshold, and current/prior quote evidence. Explain workflow and provide a short pitch sentence. Use the existing blue/white palette with mint for caught and peach for missed; keyboard focus, mobile layout and print support. Accessible text accompanies every chart.

Prominent limitations: preliminary 12-call / four-week / one-fictional-person test, reviewed by one human, previously inspected corpus, not an untouched holdout or medical accuracy. No audio evaluation. Live FaceTime check is separate and assigned to Stanley, with no success claim. Items10.2,10.5,11.2 are human-confirmed retellings; prompting remains unclear. Do not equate 'uncertain' prompting with uncertainty about repeat identity or claim human-validated prompting accuracy.
