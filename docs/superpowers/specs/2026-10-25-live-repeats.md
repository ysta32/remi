# Automatic repeat analysis after real calls

User authorized connecting the evaluated detector to the real post-call pipeline. Reuse detector 1.0.0 without edits, gpt-6.1-sol/remi-items-v1, text-embedding-3-small (1536), threshold 0.85. Preserve the reviewed synthetic baseline and its explicit batch workflow.

A separate live cache stores per-call input-prefix and prior-item fingerprints. Process completed real calls plus the current processing call chronologically, across languages, using only the same elder's real prior calls. Never mix simulated evidence. Cache valid prefixes; changed, deleted, backdated, safety-filtered or unavailable earlier inputs invalidate dependents. A successful batch is committed atomically after consent/input rechecks. Provider failure stays unavailable, not zero; the rest of the pipeline still finishes. Existing queue serializes jobs.

Require effective summaries and speechTrends before model processing and recheck before every request and commit. Safety-event calls and the safety-summary sentinel are excluded. Family views require speechTrends and redact all quote/summary evidence when summaries is off. Raw items/vectors remain server-side. Count all-history story/question repeats in the existing repeatAnalysis panel and all-history unprompted stories in the read-only Drift Index. Existing repeat_stories marker retains its seven-day window, using validated live unprompted story evidence; unknown results become NULL/na. Seeded simulated calls keep the legacy matcher.

No audio generation, threshold tuning, real provider validation or new accuracy claim. First processing can backfill eligible historical real calls; retries reuse valid earlier calls. Empty transcripts are successful empty analyses only when a stored valid transcript exists.
