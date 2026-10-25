# Demo plan

Owner: Workstream D (seed, assets, scripts), with A for the live call. Everything in this file that isn't the live call is `[SIMULATED]` and must be badged in the UI and named as simulated out loud.

## 1. Persona

**Harold "Hal" Bennett**, 81 (fictional). Retired railroad mechanic, 38 years at the Altoona shops. Army veteran (1965–67). Steelers fan, polka music, grows tomatoes. Widower (wife Dorothy). Lives alone in Hollidaysburg, PA. Language `en`, timezone `America/New_York`.

Family: **Linda** (daughter, set it up, `primary_contact_name`) · **Sam** (grandson, Penn State student).

`about` field (as Linda would write it):
> Dad worked 38 years at the Altoona railroad shops and loves talking about it. Army 1965–67. Big Steelers fan, loves polka and his tomato garden. Mom (Dorothy) passed in 2021, so go gently there. He lives alone and gets lonely in the evenings.

Photos (`fixtures/demo/photos/`; use images the team has rights to — own family with permission, license-free, or generated; all `is_simulated=1`):

| id slug | Caption | People |
|---|---|---|
| `p-shops` | Dad at the Altoona railroad shops, 1971 | Hal |
| `p-lake` | Hal and Mom at Raystown Lake, 1980 | Hal, Dorothy |
| `p-car` | Dad with his first car, 1962 | Hal |

Family questions:

| Text | Asked by | Seed status |
|---|---|---|
| What was your first job? | Linda | answered (call 2) |
| How did you meet Mom? | Linda | answered (call 5) |
| **What was your first car?** | **Sam** | **pending — used live** |

Consent: proposed all four true; elder confirmed all four on call 1 (`elder_confirmed_call_id` = call 1).

## 2. Seed specification (`web/scripts/seed.ts`, `npm run seed -- --scenario drift|stable`)

Calendar: let `W0` = Monday of the current ISO week (elder timezone). Seed the **four previous ISO weeks** (W−4 … W−1), calls on Mon / Wed / Fri at 10:00 local, 12 calls total, numbered 1–12 in order. The current week is left empty for the live call. Use a seeded PRNG (`seed=42`) for noise so runs are reproducible.

Each seeded call: `status=done`, `is_simulated=1`, duration 6–11 min, a short placeholder `utterances_json` (a few lines; it's never shown to family), a `summary`, `mood_label` mostly `positive`/`neutral`, 0–2 fun facts, 1–3 topics, and **marker rows written directly** (not computed from text).

Marker generation (mean ± uniform noise):

| Marker | Weeks 1–2 (both scenarios) | Weeks 3–4 `stable` | Week 3 `drift` | Week 4 `drift` |
|---|---|---|---|---|
| `speech_rate` (wpm) | 134 ± 5 | 134 ± 5 | 121 ± 3 | 116 ± 3 |
| `pause_rate` (/100w) | 9.0 ± 1.0 | 9.0 ± 1.0 | 12.5 ± 0.5 | 13.5 ± 0.5 |
| `mean_pause_ms` | 650 ± 50 | 650 ± 50 | 800 ± 30 | 850 ± 30 |
| `wfp_rate` | 0.8 ± 0.3 | 0.8 ± 0.3 | 1.6 ± 0.2 | 2.0 ± 0.2 |
| `filler_rate` | 4.0 ± 0.5 | 4.0 ± 0.5 | 4.4 ± 0.4 | 4.6 ± 0.4 |
| `vague_rate` | 1.2 ± 0.2 | 1.2 ± 0.2 | 2.0 ± 0.2 | 2.3 ± 0.2 |
| `mattr` | 0.72 ± 0.012 | 0.72 ± 0.012 | 0.70 ± 0.01 | 0.69 ± 0.01 |

All seeded marker rows: `confidence='high'`. After inserting calls, the seed **must call C's `recomputeElder(elderId)`** to build baselines, z-scores, repetition-derived counts, and nudges — the seed never writes `baselines`, `z`, or `nudges` by hand. That way the demo exercises the real logic.

Repeated story (drift scenario only): topic summary "The 1977 blizzard when the roundhouse roof caved in under the snow", `kind=story`, `initiated_by=caller`, appears on calls 9, 10, 11, 12; the seed sets each telling's `repeat_of_topic_id` to the previous telling (10→9, 11→10, 12→11; each within 7 days → week 4 sum = 3 → repetition group drifts). In `stable`, it appears only on call 9. The live call's stories are matched against these by the real pipeline.

Expected result: `drift` → one undismissed `cognitive_checkup` nudge citing pace, pauses, words, and repetition for weeks W−2 and W−1. `stable` → no nudge. D writes a vitest that asserts both.

Seeded summaries and fun facts (write all 12 summaries in this voice; examples):
- Call 2 summary: "Hal talked about his first job sweeping floors at a bakery on 11th Avenue when he was 14. He laughed remembering the owner sneaking him day-old donuts. He said he'd like to bake bread again sometime." Fun fact (answers Linda's question): "Hal's first job was sweeping floors at a bakery at 14, for 50 cents a day." Quote: "Fifty cents a day and all the broken donuts I could eat."
- Call 5 fun fact (answers "How did you meet Mom?"): "Hal met Dorothy at a church dance in 1964 — she stepped on his foot first."
- Other fun facts: crushed eggshells in the tomato planting hole · played trumpet in the Hollidaysburg High marching band · slept two nights at the shops during the 1977 blizzard to keep the engines running.

## 3. Live judge demo (target 90 seconds)

Setup before the judge arrives: `seed --scenario drift`; timeline for Hal open on the laptop, scrolled to top; demo iPhone unlocked with the line saved as contact "Echo"; agent + `chert dev` running with `DEMO_MODE=1`; a test call made within the last 15 minutes.

| t | Who | What |
|---|---|---|
| 0:00 | Presenter | "Hal is 81 and lives alone. His daughter Linda set this up in two minutes: three photos and a few questions. Grandson Sam asked: what was Grandpa's first car?" (point at the question on screen) |
| 0:10 | Presenter | "Everything before today is simulated history so you can see four weeks of trends. This next call is live." Hand the judge the iPhone: "You're Hal. Just FaceTime Echo and say hello." |
| 0:15 | Judge | FaceTime Video call; says hello |
| 0:20 | Agent | Greets "Hal" and recalls the simulated last call (the blizzard story); shows the 1962 car photo; asks Sam's question, crediting Sam |
| 0:40 | Judge | Answers anything (e.g., "a '57 Bel Air"); one follow-up; agent wraps up |
| 1:05 | Judge | Hangs up |
| 1:10 | Presenter | Timeline updates: new call card with summary, new fun fact credited to Sam's question, a new point on the charts (hollow if short), the existing nudge from weeks 3–4 and the retold-story flag |
| 1:25 | Presenter | "Echo doesn't diagnose anything. It compares Hal with his own usual and tells Linda when it may be time for a check-up." |

If the judge prefers to watch, a teammate plays Hal. If the line fails mid-demo, switch to the recorded backup immediately ("here's the same flow from this morning") and keep narrating.

## 4. Likely judge questions — short answers

- *Isn't this just ChatGPT on FaceTime?* The value is across calls: memory, a personal baseline per marker, repetition detection across sessions, and the consented family loop. No single model call does that.
- *Can it detect Alzheimer's?* No, and we don't claim it. It notices changes against his own usual and suggests a check-up. Speech is a real research signal (e.g., a 2024 Boston University study on Framingham recordings), but we didn't train a classifier: public datasets have known artifacts, so we use transparent markers.
- *Why FaceTime?* Older adults already use it, no app to install, and seeing family photos makes the conversation personal, matching the picture prompts in I-CONECT.
- *Privacy?* Grandpa confirms what's shared on his first call. Family sees summaries and trends, never transcripts. Audio is deleted after processing.
- *What's simulated?* The four weeks of history. The call, summary, fun fact, and marker computation you just saw are live.
- *What if he's in crisis?* The agent gives 911 or 988 and logs the event; automatic family alerts need proper review first.

## 5. Operator checklist (T−15 min)

1. `node --version` is 22.23.2 or 24.x in both terminals.
2. Terminal 1: `cd agent && npm start` — registration OK.
3. Terminal 2: `chert doctor` then `chert dev --agent $AGENT_NAME` — waiting agent reported.
4. Terminal 3: `cd web && npm run dev` (or `npm start` after build) — `/api/dev/status` OK.
5. `/dev` → Seed drift. Timeline shows the nudge.
6. Test call from the demo iPhone: greeting by name, photo appears, question asked, timeline updates < 30 s.
7. Re-seed so the live question is pending again.
8. Phone charged, Wi-Fi + hotspot ready, backup video on the desktop, volume up.

## 6. Recorded backup

Record by 10 AM Sunday: screen + phone (QuickTime phone mirroring or a second camera) showing the full flow from FaceTime call to timeline update, ≤ 90 s, with captions. Store locally and in the Devpost video.

## 7. Devpost video outline (≤ 5 min, required)

1. **Who we are** (20 s): names, majors.
2. **Why** (45 s): founder story (a grandparent who lives alone), 7.4M Americans 65+ with Alzheimer's, underdiagnosis and people living alone being diagnosed less, I-CONECT inspiration (with its limits).
3. **Demo** (2 min): setup page → live FaceTime call → timeline update → trends and nudge (simulated history labeled).
4. **How** (60 s): architecture diagram from `SPEC.md`; markers vs personal baseline; why we didn't train a classifier; consent model.
5. **What's next** (30 s): real pilot with families, Mandarin and more languages, clinician review of nudge thresholds, rolling baselines, voice notes over iMessage.
