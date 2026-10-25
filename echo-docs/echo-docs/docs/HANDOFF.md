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
- Status: C1–C5 done. `processCall` runs stt → extract → markers → repetition → done → recompute. stt, extract and repetition are soft steps: a failure is logged and the call still finishes.
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
- Known issues:
  - The check-up rule uses the latest 2 *evaluated* weeks (weeks with fewer than 2 adequate calls are skipped), so the demo nudge survives a single live call. It has no recency limit.
  - `hal-zh-sample.json` uses a separate fictional elder (王奶奶).
  - Nudge copy says "his" (verbatim from the spec).
  - REPEAT_COSINE 0.56 was tuned on hand-written pairs, and its margin over the closest different-story pair (0.51) is thin.

## D — Family app + demo
- Status: D0 + D2 done against fixtures on branch `ws/d-family-app` (Sat ~10 PM). Next: D1 `/setup`.
- Pages done: `/` (elder picker), `/elders/[id]` (timeline: nudge card, call cards w/ processing shimmer + "New" highlight, fun facts, waiting questions, 8 Recharts trend charts w/ baseline band + simulated/low-confidence styling, retold stories, approved disclaimers). Polls 3 s while processing, else 15 s.
- How to run: `cd web && npm install && npm run dev` → http://localhost:3000/elders/elder-hal. Fixture switcher bar on the page: `?fixture=drift|stable|unconfirmed|processing|after-call`.
- Fixtures: `npm run fixtures` regenerates `fixtures/demo/*.json` from `web/scripts/demo-data.ts` (Hal persona, demo.md §2 marker table, seeded PRNG 42). Seed (D4) will reuse `demo-data.ts`.
- Live vs fixture: all fixture. `web/lib/api.ts` is the single switch; set `NEXT_PUBLIC_USE_FIXTURES=0` once B's endpoints exist.
- Seed results (drift → nudge? stable → none?): not yet (D4).
- Screenshots: `fixtures/demo/screenshots/`
- Known issues: none known. Product name is **Remi** (`APP_NAME` in `web/lib/config.ts`).

## Requests (from → to: what, by when)
- D → B: `web/` is scaffolded (Next 16.4.3, Tailwind 4, Recharts, vitest; `web/lib/types.ts` mirrors contracts §3, `web/lib/config.ts` has `APP_NAME`). Please build `web/db`, `web/app/api` on top of this branch rather than a second scaffold.
- D → B: confirm field names for `GET /api/elders/:id` (contract §5 lists only the parts). D assumes `ElderProfile` in `web/lib/api.ts`: `{ id, displayName, preferredName, language, timezone, about, primaryContactName, members[], photos[{id,caption,people,imageUrl}], questions[{id,text,askedBy,status}], consent }`.
- D → C: fixture labels/explainers copied from markers.md §5; `markerMeta()` should return the same strings.
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
- B → humans: branch `ws/A-call-flow` has a `[contract]` commit (memory prompts, more safety categories, emergency fields) that B has not implemented.
  - The current API rejects those events with 400.
  - It needs a human decision. It also conflicts with "never quiz/test memory" and with "family alerting is roadmap".

## Contract changes (date time — change — affected workstreams)
-

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.
