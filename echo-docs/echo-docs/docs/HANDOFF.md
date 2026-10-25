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
- Status:
- Endpoints done:
- Smoke test:
- Stubs in place:
- Known issues:

## C — Analysis
- Status:
- Providers + models in use:
- Pipeline timings (per step, typical):
- Tuned thresholds (e.g., REPEAT_COSINE = ?, results on repeat-pairs):
- Known noise sources:
- Known issues:

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

## Contract changes (date time — change — affected workstreams)
-

## Decisions log (human-confirmed only)
- Sat Oct 24 ~6:14 PM — Team committed to the elder FaceTime conversation + memory + family loop project.
- Sat Oct 24 ~8:25 PM — FaceTime-first flow replaces iMessage voice notes as the primary channel.
