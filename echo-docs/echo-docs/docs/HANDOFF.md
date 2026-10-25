# HANDOFF — shared status board

Each agent edits **only its own section** plus appends to "Requests" and "Contract changes". Keep entries short and current; replace stale lines rather than appending forever. Times in ET.

## Project status
- Go/no-go (Chert FaceTime): _pending_ (A0, due 9:30 PM Sat)
- GitHub public repo: _link_ · Devpost project: _link_ (both due before midnight Sat)
- End-to-end runs from reset (target 10 in a row): _0/10_
- Feature freeze: 10:00 AM Sun · Stable submit: 11:30 AM Sun

## A — Call agent
- Status:
- How to run:
- Verified APIs (package@version → names used):
- Live test results (date/time, call type, two-way audio, video, hangup, second call, latency):
- Mocked / not yet real:
- Known issues:

## B — Backend
- Status: B0–B6 done on branch `ws/bc-backend` (Next 16.4.3, Drizzle + better-sqlite3, `APP_NAME='Remi'`). `cacheComponents` is off, because it forbids the `runtime='nodejs'` the contract requires.
- Endpoints done: everything in contracts §4–6. Consent filtering happens server-side in `web/lib/server/timeline.ts`.
- How to run: see `web/README.md`.
  - Copy `.env.example` to `web/.env.local` and set at least `AGENT_API_TOKEN` and `DEV_TOOLS=1` (plus `OPENAI_API_KEY` for summaries). Without it, `/api/agent/*` returns 401 and `/api/dev/*` returns 404.
  - Then `npm run db:migrate && npm run dev`; tests with `npm test`.
  - Smoke: `BASE=http://localhost:3000 AGENT_API_TOKEN=… bash ../scripts/smoke.sh` (77 checks). **It calls /api/dev/reset, so point it at a throwaway DATABASE_PATH.**
- Stubs in place:
  - `web/scripts/seed.ts`: `runSeed` throws, so /api/dev/seed returns 501 until D lands it.
  - Both seed callers reset the DB first.
  - The demo elder must use `DEMO_ELDER_ID = 'elder-hal-demo'` so the agent's `ELDER_ID` survives re-seeding.
- `/api/dev/status` (operator only) now also returns per-call `events` and `safetyEvents`; add `?transcripts=1` for utterances.
- Contract interpretations:
  - There is no answer column. A family-question answer is the `fun_facts` row with that `question_id`, and the pipeline creates one if the LLM gave an answer but no fact.
  - **Before the elder confirms sharing, call cards show only date, duration and status**, per SPEC §12. Photos shown and the family question are hidden too.
  - Timestamps must be ISO-8601 with a zone; they are stored normalized to UTC. `audioPath` must be an absolute `.wav` inside a `tmp/calls/` directory, because the pipeline deletes it.
  - Upload errors: HEIC → 415, over 8 MB → 413.
- Review fixes (Oct 25):
  - A non-ASCII bearer token now gets 401 instead of 500.
  - `isFirstCall` and theme rotation ignore the in-progress current call.
  - `knownFacts` are ordered by call date.
  - `question_asked` never moves an answered question back to asked.
  - An empty consent payload gets 400.
  - A retried `/complete` keeps the STT words.
  - Marker points are limited to the elder's language and exclude failed calls.
  - `drainQueue` times out after 10 s.
  - The elder timezone is validated.

## C — Analysis
- Status: C1–C5 done. `processCall` runs stt → acoustic (voice markers) → extract → markers → repetition → done → recompute. stt, acoustic, extract and repetition are soft steps: a failure is logged and the call still finishes.
  - If extraction fails twice, the summary falls back to "{name} and Remi chatted for N minutes."
  - The WAV is deleted in a `finally`.
- Providers + models in use (all overridable by env):
  - extraction: OpenAI Responses API with strict json_schema, `OPENAI_EXTRACT_MODEL` default `gpt-6.1-sol`. Verified live on Oct 25: valid output, warm summary, Sam's question linked to its answer.
  - embeddings: `text-embedding-3-small`.
  - STT: `whisper-1` with word timestamps. gpt-4o-transcribe returns no word timestamps. Live check on TTS audio: 35 words with ms timings in 1.5 s, and 4 of 4 fillers kept thanks to the filler-heavy prompt. Real voices may lose some. Numbers come back as digits ("57", "300").
  - gemini and deepgram are not configured.
- Pipeline timings (live, 3 calls through the dev server): context 14–72 ms; whole pipeline 12–15 s, of which extract is 11–14 s; markers/recompute under 15 ms; repetition about 0.8 s when it embeds.
- Tuned thresholds: **REPEAT_COSINE = 0.56**, down from the spec's 0.85.
  - With text-embedding-3-small, same-story pairs score 0.62–0.77 and different stories 0.39–0.51, so 0.85 matched none of the same-story pairs (5/10 overall). 0.56 is the midpoint and gets 10/10.
  - Live: a retelling of the blizzard story was linked to the earlier telling and shows in the timeline repeats.
  - Re-tune with `npm run tune:repeat`.
- Demo check: the synthetic demo.md §2 drift scenario gives exactly 1 cognitive_checkup nudge (weeks W−2 and W−1, all four groups); stable gives none (max weekly z 1.18).
- Known noise sources: 那个 (both a filler and an ordinary demonstrative); Whisper filler stripping.
- Deviations from markers.md, all `[HEURISTIC]` and in `web/lib/analysis/config.ts`:
  - `ABS_SPREAD_FLOOR` is a per-marker absolute floor on the z scale: 0.3 per 100 units for the rates, 30 ms, 2 wpm, 0.005 MATTR.
    - The spec's 1e-6 floor let a marker that is usually 0 (word-finding pauses, fillers) score z ≈ 400,000 from one "um".
    - TV5 and the demo drift/stable results are unchanged.
  - When a caller utterance has STT words, those words, not the live text, are the counting source for U, fillers, vague words and MATTR. Live transcription drops disfluencies.
- Review fixes (Oct 25):
  - `attachWords` drops words spoken during agent turns, and splits a caller-less STT stream into utterances.
  - The WAV is deleted in an outer `finally`, even on hard failures.
  - A failed re-extraction keeps the earlier results.
  - Re-processing a call re-links later calls' retold-story links.
  - Safety:
    - After a logged safety event (or a present-day safety moment the LLM flags), the summary is only the safety line.
    - Fun facts, answers, topics and mood evidence are dropped for that call.
    - Remembered past events no longer trigger it.
  - An invalid timezone falls back to America/New_York.
  - "mm-hmm" counts as a filler for word-finding pauses, and the pause agent-overlap check uses a closed interval.
  - "1 minute" is singular in the fallback summary.
- Voice markers (`pitch_var`, `pitch_range`, group `voice`):
  - Added Oct 25. Defined in markers.md §4b.
  - YIN pitch tracking in pure TS (`web/lib/markers/pitch.ts`, `wav.ts`), with no dependencies, so it behaves the same on the demo Mac and on Windows.
  - Runs as the soft pipeline step `acoustic` after STT and before the WAV is deleted, and analyses only the caller's word spans.
  - **Chart only:** they get baselines, z-scores and charts, but `NUDGE_GROUPS` in `web/lib/analysis/config.ts` leaves out `voice`. Add it there to let voice drive nudges once real calls show it's stable.
  - Adequacy is decided by transcript markers only.
  - Cost: about 2.5–3 s for 10 minutes of continuous voiced speech (worst case), run in chunks that yield to the event loop so the server keeps answering requests. Analysis covers STT word spans, else the live caller turns; with neither it is capped at `low`.
  - Checks:
    - unit tests on synthetic tones and glides;
    - `npm run pitch:check -- --file x.wav` on a synthetic 140 ± 25 Hz voice gave a median of 142 Hz and pitch_range 5.96 st (expected about 6);
    - the TTS flat-vs-expressive comparison (`npm run pitch:check`) is not yet run, because it needs `OPENAI_API_KEY` in `web/.env.local`.
  - Real values need agent capture (A6, `CAPTURE_AUDIO=1`). Without audio both markers are `na`.
- Known issues:
  - The check-up rule uses the latest 2 *evaluated* weeks (weeks with fewer than 2 adequate calls are skipped), so the demo nudge survives a single live call. It has no recency limit.
  - `hal-zh-sample.json` uses a separate fictional elder (王奶奶).
  - Nudge copy says "his" (verbatim from the spec).
  - REPEAT_COSINE 0.56 was tuned on hand-written pairs, and its margin over the closest different-story pair (0.51) is thin.

## D — Family app + demo
- Status:
- Pages done:
- Seed results (drift → nudge? stable → none?):
- Screenshots: `fixtures/demo/screenshots/`
- Known issues:

## Requests (from → to: what, by when)
- B → D:
  - Seed the demo elder with id `DEMO_ELDER_ID` from `web/scripts/seed.ts`, and set `is_simulated=1` on the elder (nudges copy it).
  - Consent needs fam_* = 1 and elder_* = 1, otherwise no nudge fires.
  - A working reference for the marker table is `seedDemo()` in `web/lib/analysis/__tests__/recompute.test.ts`.
  - Answer-only fun facts have `quote: ''`; don't render an empty quote.
- B → A:
  - Set `ELDER_ID=elder-hal-demo`.
  - Send timestamps with a zone (e.g. `…Z`).
  - Write captures to `agent/tmp/calls/<callId>.wav` and pass the absolute path.
  - Send all four keys in one `consent` event, because `elderConfirmed` needs all four.
  - Fetch photo `imageUrl`s with the Bearer token.
- C → D: the timeline now has 10 marker series. The 2 new ones are `pitch_var` and `pitch_range`, group `voice`, unit `st` (semitones). Use the same chart component, with label and explainer from the API. Keep their copy about sound only, never mood (safety-and-copy).
- C → A: the voice markers need caller audio. Use `CAPTURE_AUDIO=1` (A6) to write a 16 kHz mono PCM16 WAV to `agent/tmp/calls/<callId>.wav`, and pass its absolute path as `audioPath` in `/complete`.
- B → humans: branch `ws/A-call-flow` has a `[contract]` commit (memory prompts, more safety categories, emergency fields) that B has not implemented.
  - The current API rejects those events with 400.
  - It needs a human decision. It also conflicts with "never quiz/test memory" and with "family alerting is roadmap".

## Contract changes (date time — change — affected workstreams)
- Sun Oct 25 — `[contract]` additive: `MarkerKey` += `pitch_var`, `pitch_range`; `MarkerGroup` += `voice`; unit `st` (semitones). No DB change (`call_markers.marker` is text). Timeline now returns 10 marker series. Chart only: voice never drives nudges. Definitions in markers.md §4b. Affects C (computes), B (timeline passes through), D (render 2 more charts; group `voice`).

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.
