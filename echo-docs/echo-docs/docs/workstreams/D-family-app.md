# Workstream D — Family app, seed, and demo

**Human owner:** Engineer 3 (also pitch, video, Devpost). **You own:** `web/app/` pages (not `web/app/api/`), `web/components/`, `web/scripts/seed.ts`, `fixtures/demo/`, `README.md`. **Read first:** `CLAUDE.md`, `SPEC.md` §13–14, `docs/contracts.md` §3 and §5–6, `docs/safety-and-copy.md` §2–3, `docs/demo.md` (all).

## Mission
The adult child's side of the product and everything the judges see on screen: a two-minute setup, a timeline that feels warm (fun facts first, charts second), honest trend charts with simulated data clearly badged, and a reliable seed/reset for the demo.

## Design direction
Warm and calm, not clinical: soft neutral background, one accent color, large readable type (base ≥ 17 px), generous spacing, rounded cards. Works on a phone (the adult child will check it there) and projects well on a laptop. Fun facts and call summaries lead; trends sit lower with explainers. No red alarm styling for nudges — a gentle amber card. Every simulated item shows the "Simulated" badge; simulated chart points use a distinct style (e.g., dashed/lighter) with a legend.

## Tasks (in order; report after each ✅)

**D0 — Build against fixtures while B scaffolds**
- Until B's endpoints exist, read from `fixtures/demo/timeline.json` and `fixtures/demo/elder.json` (write them to match `Timeline` and the elder profile shape exactly). Switch to live endpoints behind one `api` helper.

**D1 — `/setup` wizard** (5 steps: basics → photos → questions → proposed sharing → done)
- Basics: display name, preferred name, language (English / 中文), short "about", your name, other family members.
- Photos: up to 5, drag-drop or picker, caption required, "who's in it" optional; jpeg/png only with a friendly HEIC message.
- Questions: up to 5, each with "asked by".
- Sharing: four toggles with plain explanations; note that Grandpa confirms on his first call.
- Done: FaceTime address (from `NEXT_PUBLIC_FACETIME_ADDRESS`) with "save this as a contact named Echo" tip.
- ✅ Completing setup creates an elder via the API and lands on the timeline.

**D2 — `/elders/[id]` timeline**
- Header: name, last call time. Nudge card (if any) with approved copy and the Alzheimer's Association link; dismiss button.
- Call cards (newest first): date, duration, summary, photo(s) discussed, family question + answer with "asked by", mood chip only if present. Processing state shows a gentle "Writing up today's chat…" shimmer.
- Fun facts wall: quote + English text + "asked by" tag.
- Trends: one small Recharts line per marker (8), baseline band (median ± 1.4826·MAD), hollow points for low confidence, distinct simulated style, label + one-line explainer from the API, standing header and footer disclaimers.
- Retold stories list (summary + dates).
- Not-yet-confirmed state per `docs/safety-and-copy.md` §2.
- Polling: every 3 s while `processing`, else 15 s.
- ✅ After a live call completes, the new card and chart point appear without a manual refresh.

**D3 — `/elders/[id]/manage`** — add/remove photos and questions; edit proposed sharing.

**D4 — Seed** (`web/scripts/seed.ts`, `npm run seed -- --scenario drift|stable`, also callable from `/api/dev/seed`)
- Implement exactly `docs/demo.md` §2: calendar, seeded PRNG, marker table, summaries and fun facts, repeated story with `repeat_of_topic_id` chain, then call C's `recomputeElder()`. Never write baselines, z, or nudges directly.
- Copy demo photos from `fixtures/demo/photos/` into `UPLOAD_DIR`.
- ✅ vitest: `drift` → exactly one `cognitive_checkup` nudge; `stable` → none. Re-running seed is idempotent (reset first).

**D5 — `/dev` page** (`DEV_TOOLS=1`): buttons for seed drift, seed stable, reset; table from `/api/dev/status`; re-run pipeline per call.

**D6 — README + submission assets**
- `README.md`: one-paragraph pitch; architecture diagram (from `SPEC.md`); setup for agent, Chert CLI, and web; env var names; how to seed; what's simulated; claims disclaimer; credit "agent scaffolded from Chert's `chert new --video` starter."
- Help the human with Devpost text (problem, how it works, challenges, what's next) using only approved claims, and the video outline in `docs/demo.md` §7.
- Remind the human: public GitHub repo and Devpost project must exist **before midnight Saturday**.

## Do not
Show transcripts · show numbers in nudges · hide unconsented data client-side as the only protection (B filters server-side; you just render) · use alarming colors or medical imagery · ship any screen with unbadged simulated data.

## Handoff
Update "D" in `docs/HANDOFF.md`: pages done, fixture vs live status, seed results, screenshots path, open requests.
