# Remi family frontend redesign — design

Workstream D · branch `ws/d-family-app` · Sat Oct 24 2026, ~10:45 PM ET
Visual reference (approved by the user): `web/.impeccable/mocks/home-snapshots.html`
Product brief: `web/PRODUCT.md` · Direction contract: `web/.impeccable/surfaces/app-elders-id-page-tsx.md`
Specs this must honor: `echo-docs/echo-docs/SPEC.md` §12–14, `docs/contracts.md` §3, `docs/safety-and-copy.md` §1–3.

## Why

The first build of the family timeline worked but looked like a generic warm dashboard: cream + serif, eight charts, everything equal weight. The user wants Remi to feel **welcoming, soft and happy** (the topic is heavy), **simple for a regular son or daughter**, with data that is **easy to read**, plus a **home page the team can have open for judges** at the demo table.

Success: a family member on a phone sees Dad's latest story within one screen, and understands "how he's doing" in plain words without reading a chart legend. A judge understands what Remi is, sees a real example of its output, and knows how to try the live call, within 30 seconds.

## Goals

1. Real home page at `/` matching the approved sketch.
2. Redesign `/elders/[id]` in the same world, stories first, health second.
3. Replace the 8-chart grid with **4 signals**.
4. The live-demo moment: a newly arrived call card **develops** into colour and keeps a NEW tag until seen.
5. Works at phone width (390) and laptop/projector width (1280–1440).

## Non-goals (this round)

- `/setup`, `/elders/[id]/manage` (including Kevin's memory-moments and emergency-contact fields), `/dev`, the DB seed script. Separate plans after this one.
- Changing any contract shape, API, or backend code.
- Showing transcripts, safety events, or anything unconsented. Server-side consent filtering stays B's job; the UI just renders.

## Anti-goals (would be a failure even if it works)

- Anything overlapping anything else (user rule: cards, bubbles, tags, stickers never sit on top of the illustration, text, or each other). Decorative tilt is fine if bounding boxes don't collide.
- Large empty dead zones, **or** cramped blocks. One spacing scale, tighter within a group, larger only between sections.
- Red/alarm styling, numbers in nudge text, medical imagery, or any copy outside the claims policy.
- Unbadged simulated data.
- A gradient or blank colour field pretending to be a photo.

## Visual system (decided)

**Palette: B · Brighter Sky** (user's choice). Tokens on `:root`, used through Tailwind theme names:

| Token | Hex | Job |
|---|---|---|
| ground | `#e7f0f8` | page background |
| hero | `#a9cdee` | hero panel, closing band |
| sky-soft | `#d6e8f8` | photo placeholders, number badges, the "nudge, not a diagnosis" card, chart usual-band |
| card | `#ffffff` | every card |
| ink | `#1d2b45` | text, primary button, chart lines |
| ink-2 | `#4f5b70` | secondary text on white/ground |
| ink-on-hero | `#26344e` | secondary text on the hero panel (AA) |
| joy | `#ffd668` | **joy only**: the "stories" highlight, the sun glyph. Never a health note. |
| family | `#ffd9c7` fill / `#7a3a1f` text, strong `#ffb595` | fun facts, family-question chips, the NEW tag |
| ok | `#a8dcc1` fill / `#1d4a34` text | "in good spirits", privacy card |
| line | `#e3ebf3` | 1px card borders and dividers |

Gentle notes (the cognitive check-up nudge) render as a **white card with a small joy-coloured sun glyph**, not a coloured block, so the most joyful colour is never the health signal and the note never out-shouts the stories.

**Type:** Figtree for everything readable. Patrick Hand **only** for snapshot captions (the handwritten strip on a call card). Sizes: display 60px (40px phone), section heading 38px (30px phone), card heading 22px, body 18px, labels 16px minimum. Nothing below 16px; body never below 17px.

**Spacing scale:** 8 / 12 / 16 / 24 / 32 / 48 / 88 px. Within a card 12–16; between cards 20–24; between sections 88 (64 phone).

**Shape:** cards radius 28, hero/closing radius 40 (28 phone), pills fully round, 1px `line` border on white cards over the ground, neutral shadows only (no coloured glow).

**Illustration:** `web/public/images/hal-armchair.png` (1402×1122, transparent; user-made with ChatGPT from our prompt; record that provenance). Serve through `next/image` so a resized copy ships. It sits on a soft ellipse "floor" shadow. Nothing may overlap it: Remi's chat bubble sits beside the phone, outside the figure's bounding box. The tomato plant must not be clipped by the panel edge.

## Home page `/` (Persuade surface, judges + new families)

Order, matching the sketch:
1. **Nav:** wordmark "Remi" (left); "How it works", "Privacy" anchors and a "See Hal's chats" pill (right). Phone: wordmark + pill only.
2. **Hero panel** (two columns; phone stacks): label "Live demo · Hal's history is simulated"; headline "Grandpa calls. / Remi listens. / You get his **stories.**"; lede; primary pill "See Hal's chats" → `/elders/elder-hal`; one line "Judges: **FaceTime Remi as Hal**, then watch his page update." Right column: illustration + Remi bubble "Hi Hal! Sam was wondering… what was your first car?"
3. **"Today on Remi" row** (three cards, phone stacks), filled from the **real timeline data** via `lib/api.ts`, not hard-coded: Today's snapshot (newest call card, compact), How he's doing (one signal's mini chart + status words), Gentle notes (active nudge headline or "None right now…"). This is what makes the page update live during the demo.
4. **How it works:** three numbered cards.
5. **What Remi gently keeps an eye on:** the 4 signals as one white panel (2×2 rows, phone 1 column), then three pills: "His own usual", "Many things can cause a change", "A note, never a verdict".
6. **Promise cards:** "He's in charge of what's shared" (ok colour) and "A nudge, not a diagnosis" (sky-soft), copy as in the sketch.
7. **Closing band:** "Come meet Hal." + pill.
8. **Footer:** "Remi · built at HackPSU Fall 2026" and "Inspired by the I-CONECT research on regular video conversations with older adults."

## Hal's page `/elders/[id]` (Operate surface, the family member)

**Header:** "Hal's chats" (display), "Harold Bennett · Last chat 2 min ago", Simulated explainer line when any simulated data is shown, a pending-writeup indicator while `processing`. Two **tabs** (real links/buttons with selected state, keyboard accessible): **Chats** (default) and **How he's doing**. Tab state lives in the URL (`?tab=doing`) so it survives the 3 s / 15 s polling and can be linked.

**Chats tab** (stories first):
1. **Newest chat as a large snapshot card**: white instant-photo frame; photo area shows the first photo discussed if an image URL exists, otherwise an honest sky-soft panel with a small line icon and the photo caption (never a gradient); handwritten caption line; the summary; chips for the family question (with "asked by") and mood. While `processing`: a "developing" state (warm grey frame, shimmer lines, "Writing up today's chat…"). When it flips to done: the develop animation, NEW tag until the card has been scrolled into view.
2. **Gentle note** (if any) directly **below** the newest snapshot: white card, sun glyph, the API's `message` verbatim, the Alzheimer's Association link, "Got it, hide this". (Deviation from SPEC §13's "nudge banner first": user principle "stories before signals"; the note is still above the fold on desktop.)
3. Two columns on desktop (one on phone): **Earlier chats** as compact snapshot cards (date, caption-style first sentence, chips; first 4 + "Show all N chats") and a side column with **Questions waiting for his next chat** and **Fun facts** (quote + text + "Answer to Sam's question" chip + date + Simulated badge).
4. Footer disclaimer (approved copy, verbatim).

**How he's doing tab:**
- Intro line (approved copy): "These charts compare each call with Hal's own usual. Small ups and downs are normal."
- **Four signal cards** (2×2 desktop, 1 column phone). Each: title, one-sentence explainer **beside** the chart (not below in fine print), a status phrase, a small chart with his usual range as a soft band, simulated points muted and the live point in ink, low-confidence points hollow.
  - **Pauses & hesitation** = combined `pause_rate`, `mean_pause_ms`, `wfp_rate`, `filler_rate`: plotted as the **median of their z-scores per call** ("change from his usual"), band = −1…+1. The y-axis is unlabeled numerically; it reads "more" (up) / "less" (down) and "his usual" on the band.
  - **Speaking pace** = `speech_rate` in words per minute, band = baseline median ± 1.4826·MAD.
  - **Vague words** = `vague_rate` per 100 words, same band rule.
  - **Retold stories** = `repeat_stories` count per call as small bars, plus the retold-stories list (summary + dates) under it.
- **Status phrase** per signal, from the median z of the last three adequate calls: below 1.5 → "About his usual"; at or above 1.5 → "Different from his usual lately". (1.5 matches C's `DRIFT_Z`; no other wording, no numbers.)
- Word variety (`mattr`) is not shown (mixed evidence); the backend still sends it.
- Not-yet-confirmed and empty states: the approved "hasn't confirmed sharing yet" copy; the tab shows nothing else.

## Behavior that must keep working

`lib/api.ts` fixture switch and live API; the fixture switcher bar (dev only, `?fixture=`); polling 3 s while processing else 15 s; "New" detection on id or status change; consent-unconfirmed rendering; Simulated badges with tooltip; approved copy from `lib/copy.ts`; reduced-motion respected (develop animation becomes an instant swap).

## Verification

`npm run typecheck`, `npm run lint`, `impeccable detect` on changed files (clean or justified), screenshots at 1440 and 390 for `/`, `/elders/elder-hal?fixture=drift`, `?fixture=processing` → `after-call` (develop moment), `?fixture=unconfirmed`, and the How he's doing tab; check explicitly for overlaps (bounding boxes) and dead zones. Then Impeccable's finish review and DESIGN.md.

## Left to the builder

Component breakdown, chart details (Recharts already installed), exact develop-animation timing (~1.2 s), how the "seen" state for NEW is detected, whether the home "Today" row shares components with the timeline.

## Settled after the builder check

- **Snapshot caption (no contract field for it):** the first photo discussed's caption if `photosShown` is non-empty; otherwise the summary's first sentence is the handwritten caption and the remaining sentences are the body (never print the same text twice). Processing/empty: "Writing up today's chat…".
- **Home "Gentle notes" card:** never shortens nudge copy (safety-and-copy.md: verbatim). With an active nudge it says "There's a gentle note on Hal's page." plus a "Read it" link to `/elders/[id]`; without one, "None right now. If several things shift for a few weeks, you'll see a gentle note here." The full verbatim message appears only on Hal's page.
- **Retold stories status:** `repeat_stories` has no baseline/z, so it uses the backend's weekly rule instead: Σ `repeat_stories` over the latest ISO week ≥ 3 (`REPEAT_WEEKLY_MIN`) → "Retold a few stories this week"; else "About his usual".
- **Home snapshot label:** "Latest snapshot" with the relative date (the newest call may be days old), not "Today's snapshot".
- **Photos:** none are licensed or present. Look up `imageUrl` by id from `getElder().photos`; if it loads, show it; on missing/404, the honest sky-soft panel with a line icon and the caption. No gradients.
- **This spec overrides the older direction contract** (`web/.impeccable/surfaces/app-elders-id-page-tsx.md`: butter note overlapping the header, old hexes, caption strip). Update that contract to match this spec before the finish review so the reviewer grades against the approved design.

## Calls I made (user to check)

- Gentle note moves below the newest snapshot (stories first) instead of the top banner position in SPEC §13.
- "Pauses & hesitation" combines four markers via their z-scores; the other three signals plot raw values.
- Status phrases "About his usual" / "Different from his usual lately" at the 1.5 threshold.
- Word variety chart dropped from the family view.
- Home "Today on Remi" row reads live timeline data so it updates during the demo.

## Decided by the user

- **Branch base:** build on top of Siyuan's `ws/bc-backend`. Merge it into `ws/d-family-app` first, resolving the overlapping `web/` scaffold files (their DB/API/analysis code wins; our pages, components, `lib/api.ts`, `lib/copy.ts`, fixtures win), so a judge's live FaceTime call reaches the page. Fixtures remain available behind the existing switch for building and for a backend-down fallback.
- **Default demo state:** the **drift** story (gentle note visible, "Different from his usual lately" on the shifted signals), matching the team's demo script. (My call, not the user's: the home "How he's doing" card shows **Pauses & hesitation**, the signal the live demo is most likely to move.)
