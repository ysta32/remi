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
- Integration checkpoint (Oct 25): resolved `ws/ryan-synthetic-data` against main `3cd740b`, preserving current recap/polling/layout, standalone repeat evidence and older-call targets, authored-timing notices, and computed-only Drift Index labels. New regression tests cover six-card pagination and recap-card anchors. Web300 + detector245 + generator150 tests passed (695 total; 1 skipped), typecheck/lint/syntax and production build passed; 78 API smoke checks passed on a disposable database. Build reports four dynamic-filesystem tracing warnings in existing backend paths. Frozen detector settings are in `docs/evaluation/`; human label review remains pending. No new audio generation or provider calls were made.
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

### C — Automatic real-call detector integration (2026-10-25)
- The post-call repetition step now invokes the evaluated standalone detector for real calls. Fixed model/prompt/embedding/dimensions/threshold match the frozen baseline. Legacy simulated seed processing remains compatible.
- Separate live cache reuses valid chronological prefixes and invalidates downstream evidence after corrections, deletions, safety exclusions and backdated calls. Sharing and inputs are checked before provider requests and atomic persistence. Safety calls and simulated history are excluded.
- Family repeatAnalysis and read-only DI now consume live results. Real repeat_stories marker uses validated seven-day unprompted story matches; absent evidence is NULL/na. Timeline reads revalidate before exposing counts/quotes. Provider failure is soft and uses a safe error code.
- Run instructions and exact human two-call smoke check: web/README.md, Automatic repeat analysis. Requires private OPENAI_API_KEY and effective summaries + speechTrends; initial historical catch-up can take longer. No audio generation or threshold tuning. Real FaceTime/provider smoke remains unperformed; HTTP-only test doubles exercise the real detector, SQLite and queued /complete path.

## D — Family app + demo
- Status (Sat ~11:20 PM): redesign **merged to `main`** (PR #2, `70c4c3a`), including `ws/bc-backend`. Tests 147/147, Ryan's detector 245/245, production build passes. Brighter Sky design; spec `docs/superpowers/specs/2026-10-24-remi-family-frontend-design.md`, plan `docs/superpowers/plans/2026-10-24-remi-family-frontend.md`.
- Pages done: `/` judge-facing home (hero, live "Today on Remi" row, how it works, signals, privacy, closing CTA); `/elders/[id]` with **Chats** (newest snapshot + develop/NEW moment, gentle note below it, earlier chats, waiting questions, fun facts) and **How he's doing** (`?tab=doing`: four signals — pauses & hesitation, speaking pace, vague words, retold stories — with plain status words).
- **New (Sun ~4:30 AM, `ws/d-family-app`): chat recap page** `/elders/[id]/chats/[callId]`. Every chat card opens it (Hal's page, home Today row). It shows the summary, family answer, fun fact, photos, a small month calendar to jump between chats, and "How he sounded": one shared-axis chart of pauses, pace, vague words and retold stories with this chat marked. Earlier chats are now roomy clickable cards running full width. **Live calls:** a call `in_progress` shows "Chatting now · m:ss" and what has happened so far (hello, photo shown, question asked) from the agent's events, and both pollers now poll every 3 s while a call is in progress (`isBusy` in `lib/live.ts`; before, only `processing` polled fast). Plan: `docs/superpowers/plans/2026-10-25-remi-chat-recap.md`. Hero: sun removed from the illustration, no highlight on "stories", judge lines removed.
- How to run: `cd web && npm install && npm run dev` → http://localhost:3000 and http://localhost:3000/elders/elder-hal-demo. Sample-data bar on Hal's page: `?fixture=drift|stable|unconfirmed|processing|after-call`.
- Fixture vs live: fixtures by default; `NEXT_PUBLIC_USE_FIXTURES=0` reads B's API (run `npm run seed -- --scenario drift` first). In live mode the sample-data bar is hidden.
- Seed results (branch `integrate/main`): `web/scripts/seed.ts` implemented from `web/scripts/demo-data.ts`; `npm run seed -- --scenario drift|stable` and `POST /api/dev/seed` both work. drift → exactly 1 `cognitive_checkup` nudge (W−2, W−1, all four groups); stable → none (`web/scripts/__tests__/seed.test.ts`). Live check with `NEXT_PUBLIC_USE_FIXTURES=0`: seeded timeline, profile and agent context are correct (Sam's question pending, car photo first), and a simulated agent call lands as the newest card with the nudge kept. Photos are seeded from `fixtures/demo/p-*.jpg` when present; until then their file URLs 404 and the UI shows the photo-icon panel.
- Screenshots: `web/.impeccable/review/` (git-ignored).
- Known issues: no licensed family photos yet (cards show an honest photo-icon panel); setup/manage pages (incl. Kevin's memory moments + emergency contact) not built yet.
- **Still to do (D), in order:**
  1. ~~Seed script~~ done (see Seed results).
  2. Three family photos (from ChatGPT, owned by Jimmy) into `fixtures/demo/` as `p-shops.jpg`, `p-lake.jpg`, `p-car.jpg` (JPEG or PNG, ≤ 8 MB); re-seed and they're served to the UI and the agent.
  3. Voice chart (pitch variation / range) on the "How he's doing" tab once Siyuan's `c5247e6` lands on `main`. Sound only, never mood.
  4. Setup/manage pages for Kevin's memory moments + emergency contact, only if humans approve that contract change (see Requests).

## Ryan — synthetic calls and audio (Task 2)
- Branch: `ws/ryan-synthetic-data`; standalone `synthetic/` package. Seeded transcript generator produces one fictional elder, 12 calls across four weeks, planted repeats/retellings and distinct same-topic incidents. Ground truth and tuning/held-out incident families stay separate from detector inputs. Additive offline importer and dashboard provenance/unavailable-analysis support are now implemented; existing analysis pipelines and call agent are unchanged.
- Run from repository root: `node synthetic/cli.mjs --output synthetic/output-release` (fresh directory only), then `node synthetic/audio-cli.mjs --input synthetic/output-release` for an offline audio plan. See `synthetic/README.md` for paid generation commands.
- Audio now uses OpenAI `gpt-4o-mini-tts-2025-12-15`, default voices cedar/marin, with `OPENAI_API_KEY` supplied privately. It writes explicitly simulated full-conversation and caller-only 24 kHz WAVs with exact inserted silence and sample-derived timing. Cached PCM reproduces assembly; fresh TTS is not deterministic. Live generation completed: `synthetic/audio-openai-all/` contains 12 conversations and 12 caller-only WAVs (about 35 minutes); all 96 inserted silences and cache-only byte-identical replay verified. Files are local/ignored. Subjective listening, STT and acoustic analysis remain unverified.
- Verified offline: 150 synthetic tests, 245 detector tests, 199 web tests, both syntax checks, web typecheck and lint. Dry run: 12 calls, 252 speech segments, 30,271 text characters and 96 planted pauses. No semantic accuracy or medical claim.
- Siyuan handoff: use a copy of caller-only WAV with its audio-derived utterance times; the pipeline deletes input audio. Authored transcript word times are not audio measurements. Imported 12 calls into fresh local `web/data/synthetic-transcripts-demo.db`: 96 marker rows, 7 baselines, no topics/facts/nudges. Legacy repeat values remain NULL/na. The separate standalone detector now has a consent-filtered timeline panel and actual persisted results: 12 calls analyzed with OpenAI, 24 matches (14 unprompted, 8 prompted, 2 uncertain; 16 stories, 8 questions) at provisional0.85. Cached rerun reuses all results. Run import, analyze:synthetic and live dashboard using `web/README.md`; no reset/seed is needed. This combined demo is not held-out accuracy evaluation. Elder ID is `elder-synthetic-hal-bennett`, distinct from the existing demo elder.

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
- C → D: the timeline now has 10 marker series. The 2 new ones are `pitch_var` and `pitch_range`, group `voice`, unit `st` (semitones). Use the same chart component, with label and explainer from the API. Keep their copy about sound only, never mood (safety-and-copy).
- C → A: the voice markers need caller audio. Use `CAPTURE_AUDIO=1` (A6) to write a 16 kHz mono PCM16 WAV to `agent/tmp/calls/<callId>.wav`, and pass its absolute path as `audioPath` in `/complete`.
- B → humans: branch `ws/A-call-flow` has a `[contract]` commit (memory prompts, more safety categories, emergency fields) that B has not implemented.
  - The current API rejects those events with 400.
  - It needs a human decision. It also conflicts with "never quiz/test memory" and with "family alerting is roadmap".
- D → B/C (Siyuan), Sat 11:30 PM: `ws/bc-backend` has `c5247e6` (voice markers `pitch_var`, `pitch_range`) that isn't on `main`. Please merge it to `main`; D will add the chart after.
- D → A (Kevin) + humans, Sat 11:30 PM: `ws/A-call-flow` (3 commits) is still not on `main`. Decide on its `[contract]` commit, then merge so the demo path runs end to end.

## Contract changes (date time — change — affected workstreams)
- 2026-10-25 — Automatic real-call detector cache `live_detector_results`, unchanged optional repeatAnalysis DTO, and validated live repeat_stories marker source. Frozen settings 0.85; simulation and real history separated. Affected B/C/D; see contracts §10.
- 2026-10-25 — Add standalone `detector_results` table and optional consent-filtered `Timeline.repeatAnalysis` (counts, three labels, same-elder earlier links, quote evidence, provenance). Legacy topics/repeat markers unchanged; affected B/C/D.
- Sun Oct 25 — `[contract]` additive: `MarkerKey` += `pitch_var`, `pitch_range`; `MarkerGroup` += `voice`; unit `st` (semitones). No DB change (`call_markers.marker` is text). Timeline now returns 10 marker series. Chart only: voice never drives nudges. Definitions in markers.md §4b. Affects C (computes), B (timeline passes through), D (render 2 more charts; group `voice`).

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.

- 2026-10-25 [contract] B/D: additive optional Timeline.driftIndex and DriftIndexView
  implemented as a consent-filtered read-only adapter using unchanged production defaults;
  full interface documented in contracts.md and web/lib/types.ts. No notification delivery.
  Synthetic importer now iterates seven TEXT_MARKER_KEYS independently of ten chart keys.
