# Workstream C — Analysis pipeline and markers

**Human owner:** Engineer 2 (shared with B; can run as a separate Claude Code session). **You own:** `web/lib/markers/`, `web/lib/analysis/`, `fixtures/transcripts/`. **Read first:** `CLAUDE.md`, `SPEC.md` §9–11, `docs/markers.md` (all), `docs/contracts.md` §2–3 and §7, `docs/safety-and-copy.md` §5.

## Mission
Turn a finished call into family value and longitudinal signal: summary, fun facts, topics, mood, interpretable markers, repetition across calls, a personal baseline, and conservative nudges. This lane is the project's "not a wrapper" core — correctness and transparency matter more than cleverness.

## Tasks (in order; report after each ✅)

**C1 — Markers library (pure, no I/O)**
- `web/lib/markers/lexicon.ts`, `tokenize.ts`, `index.ts` (`computeMarkers`), `meta.ts` (`markerMeta`). Exactly as `docs/markers.md` §2–5.
- vitest for TV1–TV4 (and any edge cases you find: empty transcript, caller-only silence, words out of order).
- ✅ `npm test` green; no network imports anywhere under `lib/markers/`.

**C2 — Baseline, z-scores, drift, nudges (pure functions + one DB-facing wrapper)**
- `web/lib/analysis/config.ts` with every constant named in `docs/markers.md`.
- Pure: `buildBaseline(values)`, `signedZ(value, baseline, concern)`, `weeklyDrift(callsByWeek)`, `shouldNudge(...)`. vitest for TV5–TV7 plus "fewer than 2 adequate calls in a week is skipped."
- `recomputeElder(elderId)`: reads `call_markers`, `calls`, `topics`, consent; writes `baselines`, `call_markers.z`, `repeat_stories` rows (from `repeat_of_topic_id`), and nudges. **No model calls.** Idempotent.
- ✅ Running `recomputeElder` twice yields identical DB state.

**C3 — Adapters**
- `llm.ts`: `extractCall(utterances, context) → Extraction` (zod schema below) for `LLM_PROVIDER=gemini|openai`. JSON output mode; validate; one retry with the validation error appended; then fail the step.
- `embeddings.ts`: `embed(texts[]) → number[][]` for `gemini|openai`; `none` → LLM matching fallback (`docs/markers.md` §6.4).
- `stt.ts`: `transcribeWords(wavPath, lang) → Word[]` for `deepgram|openai|none`. Requirements: word-level timestamps **and** preserved disfluencies (many providers strip "um/uh" by default — find and enable the option; for OpenAI, note in HANDOFF how fillers behave). Verify every model name and option against current provider docs before use and record what you used.
- Model names come from env with sensible defaults; never hard-code keys.

```ts
const Extraction = z.object({
  summary: z.string().max(900),
  funFacts: z.array(z.object({ text: z.string().max(200), quote: z.string().max(200), questionId: z.string().nullable() })).max(4),
  topics: z.array(z.object({ kind: z.enum(['story','question']), summary: z.string().max(140), initiatedBy: z.enum(['caller','agent']) })).max(8),
  mood: z.object({ label: z.enum(['positive','neutral','low']), score: z.number().min(-1).max(1), evidence: z.array(z.string().max(160)).max(3) }),
  familyQuestionAnswers: z.array(z.object({ questionId: z.string(), answer: z.string().max(300) })),
  safetyMentioned: z.boolean(),
});
```
Prompt rules: `docs/safety-and-copy.md` §5. Pass the family question id(s) asked in this call (from `call_events`) so answers link correctly. `initiatedBy` = who brought the story up first.

**C4 — `processCall(callId)` pipeline** (`SPEC.md` §9)
- Steps: `stt` → `extract` → `markers` → `repetition` → `recompute` → `done`. Record per-step duration and write `failed_step`/`error` on failure; never throw to the caller.
- STT step only if `audio_path`; merge words into caller utterances (if STT returns one stream, store it as caller utterances with `words` and keep the live text for display). **Delete the WAV in `finally`** and null `audio_path`.
- Extraction writes `summary`, mood fields, `fun_facts`, `topics`; marks answered questions `answered` and links the fun fact.
- If extraction fails twice: write a neutral fallback summary ("{name} and {APP_NAME} chatted for N minutes.") and continue to markers so the timeline still updates.
- Repetition per `docs/markers.md` §6 (only this call's stories; lazily embed seeded candidates).
- ✅ Replaying `fixtures/transcripts/hal-live-sample.json` through `/complete` produces summary, ≥ 1 fun fact, markers, and `done` in < 30 s.

**C5 — Fixtures**
- `fixtures/transcripts/`: 3 realistic English calls for Hal (one answers "first car"), 1 Mandarin call, and `repeat-pairs.json` (10 pairs: 5 same story phrased differently, 5 different stories on the same theme). Tune `REPEAT_COSINE` on them and log the chosen value and results in HANDOFF.

## Do not
Train a classifier · invent clinical thresholds or cite them as clinical · put numbers in nudge text · let any step's failure block the timeline · keep audio after processing.

## Handoff
Update "C" in `docs/HANDOFF.md`: what's live vs stubbed, providers and models used, pipeline timings, tuned thresholds, known noise sources (e.g., 那个).
