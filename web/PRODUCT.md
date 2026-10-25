# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the adult child of an older parent** (the spec's persona: Linda, daughter of Hal, 81, who lives alone). A regular, non-technical person checking in on a parent between other parts of their day, most often on a phone. Their job: stay close to Dad's life and stories, and know gently when it may be time to check in or mention something to his doctor.
- **Secondary: hackathon judges** (HackPSU Fall 2026 expo, Sun Oct 25, 2:00–3:30 PM), viewing on a laptop at the demo table. Confirmed by the user: design for both, focus on what the family member sees, plus a home page for judges to have open during the demo.
- The elder never uses the website; he only FaceTimes Remi.

## Product Purpose

Remi is a friendly AI that an older adult FaceTimes for a warm reminiscence chat. It remembers his past calls, shows family photos, and asks questions the family sent. After each call the family's web page shows a summary and "fun facts," and Remi compares a few speech signals against **his own** usual. If several drift for weeks, it gently suggests a check-in and mentioning it at his next doctor's visit. Success: the family feels closer to Dad, and a real change is noticed earlier, without alarm.

## Positioning

The value is longitudinal and personal: memory across calls, a per-person baseline, repetition noticed across calls, and a two-key consent loop (family proposes, the elder confirms on a call). No app, wearable, or test for the elder. It is a family keepsake first and a gentle early-notice second, never a diagnostic tool.

## Operating Context

- Live demo: a judge FaceTimes the line as "Hal"; within ~30 s the family timeline updates with the new call, fun fact, and chart point. Four weeks of history are simulated and must be visibly labeled.
- Runs on one laptop (Next.js app on localhost); judges see the page in a browser on that laptop.

## Capabilities and Constraints

- Stack: Next.js 16 App Router, TypeScript, Tailwind 4, Recharts (existing `web/`).
- Data shapes are fixed by `docs/contracts.md` (`Timeline`, `CallCard`, `MarkerSeries`).
- Trends shown to families: **four research-backed signals**: pauses & hesitation, speaking pace, vague words, retold stories (user agreed after research; the backend still computes all eight markers). Mood is a separate wellbeing note only.
- Family never sees transcripts. Unconsented data is filtered server-side.
- Routes: `/` (home), `/elders/[id]` (timeline), `/setup`, `/elders/[id]/manage`, `/dev`. A judge-facing home page is requested.

## Brand Commitments

- Name: **Remi** (user-confirmed).
- User-requested feel: welcoming, soft colors, happy, because the topic is heavy; simple to navigate; data easy for a regular person to read.
- Claims policy (binding, `docs/safety-and-copy.md`): never say detect/diagnose/screen/prevent Alzheimer's or dementia, or assess mental health; use "notices changes in how he talks compared with his own usual." Nudges never contain numbers. No red alarm styling, no medical imagery. Approved disclaimer and nudge copy is used verbatim.

## Evidence on Hand

- Demo persona and simulated history: `web/scripts/demo-data.ts`, fixtures in `fixtures/demo/*.json` (all simulated, badged).
- Research citations for the pitch are in `SPEC.md` §20 (I-CONECT, Alzheimer's Association facts, BU/Framingham 2024).
- No real family photos yet (`fixtures/demo/photos/` is empty; must be images the team has rights to). No testimonials, users, or accuracy figures exist; none may be invented.

## Product Principles

1. Stories before signals: the family comes for Dad's life; trends are a quiet second layer.
2. Compared with his own usual, never with other people.
3. Gentle, never alarming: a note to check in, not a verdict.
4. Plain words a regular person reads in seconds; show less, explain it well.
5. Honest about what's simulated and what Remi can't know.

## Accessibility & Inclusion

Readers range from busy adults to older relatives: large body type (≥17px), WCAG AA contrast, phone-first layouts that also project well, reduced-motion respected.
