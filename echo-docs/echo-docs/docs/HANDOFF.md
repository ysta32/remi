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
- How to run: `cd web && npm run db:migrate && DEV_TOOLS=1 AGENT_API_TOKEN=… npm run dev`. Tests: `npm test`. Smoke: `BASE=http://localhost:3000 AGENT_API_TOKEN=… bash ../scripts/smoke.sh` (77 checks). **It calls /api/dev/reset, so point it at a throwaway DATABASE_PATH.**
- Stubs in place: `web/scripts/seed.ts` (`runSeed` throws, so /api/dev/seed returns 501 until D lands it).
- Contract interpretations:
  - There is no answer column. A family-question answer is the `fun_facts` row with that `question_id`, and the pipeline creates one if the LLM gave an answer but no fact.
  - Before the elder confirms, call cards still show the question text and photo captions, since that is the family's own content.
  - Upload errors: HEIC → 415, over 8 MB → 413.
- Known issues: none open.

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
- Known issues:
  - The check-up rule uses the latest 2 *evaluated* weeks (weeks with fewer than 2 adequate calls are skipped), so the demo nudge survives a single live call.
  - `hal-zh-sample.json` uses a separate fictional elder (王奶奶).

## D — Family app + demo
- Status:
- Pages done:
- Seed results (drift → nudge? stable → none?):
- Screenshots: `fixtures/demo/screenshots/`
- Known issues:

## Requests (from → to: what, by when)
-

## Contract changes (date time — change — affected workstreams)
-

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.
