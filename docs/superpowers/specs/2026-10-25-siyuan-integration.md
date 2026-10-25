# Reuse Siyuan's feature work

Approved scope: catch up to Siyuan without duplicating his work. Integrate published Drift Index (d9d568a) and audio analysis (0ce1134) in the synthetic-data feature worktree; leave main unchanged.

Use runDriftIndex unchanged with its production defaults, raw high-confidence stored markers, and validated standalone repeat results. Count only unprompted repeated stories for the repeat tie-breaker; missing results remain unknown. No oracle labels enter this path. Compute a consent-filtered Timeline DTO on read, without changing stored data or generating notifications. Keep mood consent separate. Twelve demo calls provide two familiarization calls and eight baseline calls; only two calls remain for monitoring and no completed monitoring week. Explain this without weakening rules.

Reuse the research chart in a family dashboard card with truthful computed-state wording, baseline progress, coverage, and timing provenance. Do not claim a notification was sent. Synthetic authored timing and real speech measurements remain distinct.

Analyze the existing generated caller WAVs using Siyuan's parseWav, pitchMarkersAsync, transcribeWords and attachWords. Use sample-derived audio sidecar utterances, not authored word times. Write measured results to a fresh ignored directory with a clearly synthetic manifest/report. Do not replace imported DB markers or detector evidence, delete audio, regenerate TTS, or mutate source files. Real STT is authorized with locally configured credentials; no secrets in logs. Validate word timing and artifact paths/hashes before output. Offline tests and actual provider measurements must be reported separately.

Preserve all teammate edits, algorithms, consent rules and labels. No medical/accuracy claim. No dependency additions. Workers cannot commit, push, call paid providers or spawn agents. Parent verifies and integrates feature only under existing push authorization.
