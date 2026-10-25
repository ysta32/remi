# Remi Family Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge B's backend into the D branch, then rebuild `/` (judge-facing home) and `/elders/[id]` (family timeline, two tabs, 4 signals) in the approved Brighter Sky design.

**Architecture:** One Next.js 16 app in `web/`. B's API/DB/analysis code is merged in unchanged; D's UI reads everything through `web/lib/api.ts` (fixtures or live API). New pure logic (`lib/signals.ts`, `lib/snapshot.ts`) turns contract data into what the UI shows and is unit-tested; components stay presentational.

**Tech Stack:** Next.js 16.4.3 App Router, React 19, TypeScript strict, Tailwind 4, Recharts 3, vitest 5, npm, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-24-remi-family-frontend-design.md` (read it first; this plan only adds the decisions the spec leaves to the builder).
**Visual reference:** `web/.impeccable/mocks/home-snapshots.html` (open in a browser). **Copy rules:** `echo-docs/echo-docs/docs/safety-and-copy.md`.

## Global Constraints

- Next.js here has breaking changes vs training data: read `web/node_modules/next/dist/docs/` for any API you use (`web/AGENTS.md`).
- No contract changes: `web/lib/types.ts` and every API shape stay as-is.
- Palette tokens exactly as the spec table (ground `#e7f0f8`, hero `#a9cdee`, sky-soft `#d6e8f8`, card `#ffffff`, ink `#1d2b45`, ink-2 `#4f5b70`, ink-on-hero `#26344e`, joy `#ffd668`, family `#ffd9c7`/`#7a3a1f`/strong `#ffb595`, ok `#a8dcc1`/`#1d4a34`, line `#e3ebf3`). Joy is never used on a health note.
- Fonts: Figtree everywhere; Patrick Hand only for snapshot captions. Sizes 60/40 display, 38/30 section, 22 card heading, 18 body, 16 minimum anywhere.
- Spacing scale 8/12/16/24/32/48/88 (64 between sections on phone). Phone layout below 820px.
- **No overlaps** (no element's box on top of another's, illustration included) and no dead zones; not cramped.
- Claims policy: approved copy from `web/lib/copy.ts` and the API's nudge `message` verbatim; no numbers in nudge text; no red.
- Simulated items always show `SimulatedBadge`.
- Reduced motion: every animation off under `prefers-reduced-motion: reduce`.
- Before every task: `git fetch --all --prune` and report new teammate commits (user's standing rule).

## Review Focus

1. **A brand-new elder with zero calls / no baseline** → both tabs render friendly empty states; `buildSignals([])` returns four signals with status `learning` and no crash. (Task 2 tests.)
2. **Unconsented or still-processing calls** (`summary: null`, `durationS: null`, empty `photosShown`) → `snapshotCaption` returns `{ caption: null, body: null }`; the card shows date/length only. (Task 2 tests.)
3. **Marker points with `value: null` or `confidence: 'na'`** (short call, no word timestamps) → plotted as gaps, excluded from status medians. (Task 2 tests.)
4. **Fewer than 3 adequate calls** → status `learning` ("Still learning his usual"), never "different". (Task 2 tests.)
5. **Polling while the API fails, or right after a nudge is dismissed** → keep showing the last good data; a dismissed nudge stays hidden across polls. (Task 4 manual check; existing behavior preserved.)

---

### Task 0: Merge B's backend and reconcile the app setup

**Files:**
- Merge: `origin/ws/bc-backend` into `ws/d-family-app`
- Resolve: `web/package.json`, `web/package-lock.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/lib/config.ts`, `web/lib/types.ts`, `web/app/layout.tsx`, `web/app/globals.css`, `web/app/page.tsx`, `web/.gitignore`, `web/AGENTS.md`, `web/README.md`, `web/eslint.config.mjs`, `web/public/*.svg`

**Interfaces:**
- Produces: a branch where `npm run typecheck`, `npm run lint`, `npm test` (B's suite) pass, `npm run fixtures` works, and both `/elders/elder-hal` (fixtures) and `GET /api/elders` respond.

- [ ] **Step 1:** `git fetch --all --prune && git merge origin/ws/bc-backend` (merge, never rebase or force-push: their history is shared).
- [ ] **Step 2: Resolve conflicts.** B wins: `db/`, `app/api/`, `lib/server/`, `lib/analysis/`, `lib/markers/`, `scripts/seed.ts` (stub), `test/`, `vitest.config.mts`, `eslint.config.mjs`, `lib/types.ts` (identical apart from the header comment). D wins: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/elders/`, `components/`, `lib/api.ts`, `lib/copy.ts`, `lib/format.ts`, `scripts/demo-data.ts`, `scripts/make-fixtures.ts`, `public/images/`. Delete the scaffold `public/*.svg`. `.gitignore`: union of both.
- [ ] **Step 3: `web/package.json`** = B's file plus `"recharts": "^3.10.1"` in dependencies and `"fixtures": "tsx scripts/make-fixtures.ts"` in scripts. **No `"type": "module"`** (B's `next.config.ts` uses `__dirname`). Regenerate the lock with `npm install`.
- [ ] **Step 4: `web/next.config.ts`** = B's file, but `turbopack.root: path.join(__dirname, "..")` (import `path` from `node:path`) so `lib/api.ts` can import `../../fixtures/demo/*.json`; keep `serverExternalPackages` and Cache Components **off**.
- [ ] **Step 5: `web/tsconfig.json`** = B's file plus `"allowImportingTsExtensions": true`. **`web/lib/config.ts`** = B's file plus D's `USE_FIXTURES` export (unchanged semantics: fixtures unless `NEXT_PUBLIC_USE_FIXTURES=0`).
- [ ] **Step 6: Verify.** In `web/`: `npm run typecheck && npm run lint && npm test && npm run fixtures` → all pass. `npm run dev`, then `curl -s -o /dev/null -w '%{http_code}' localhost:3000/elders/elder-hal` → `200` and `curl -s localhost:3000/api/elders` → a JSON array.
- [ ] **Step 7: Commit** `[D] Merge ws/bc-backend; reconcile web/ setup (recharts, fixtures root)`.

### Task 1: Brighter Sky tokens, fonts and page shell

**Files:**
- Modify: `web/app/globals.css`, `web/app/layout.tsx`, `web/components/SimulatedBadge.tsx` (restyle only)
- Create: `web/components/SiteNav.tsx`

**Interfaces:**
- Produces: Tailwind color names `ground hero sky-soft card ink ink-2 ink-on-hero joy family family-ink family-strong ok ok-ink line`; font utilities `font-sans` (Figtree) and `font-caption` (Patrick Hand); animation classes `animate-develop`, `animate-arrive`, `shimmer`.
- Produces: `SiteNav({ variant }: { variant: 'home' | 'app' })`: home = wordmark + "How it works"/"Privacy" anchors + "See Hal's chats" pill (anchors hidden on phone); app = wordmark linking to `/` + the pill.

- [ ] **Step 1:** `globals.css`: replace the old tokens with the palette, `html { font-size: 18px }`, body background `ground`; keyframes `develop` (from `filter: grayscale(1) brightness(1.08); opacity: .6` to none, 1.2s ease-out), keep `arrive` and `shimmer` (shimmer in sky-soft tones); all disabled under reduced motion.
- [ ] **Step 2:** `layout.tsx`: `Figtree` (variable `--font-sans`) and `Patrick_Hand` (weight 400, variable `--font-caption`) via `next/font/google`; drop Fraunces and the old header (pages render `SiteNav`).
- [ ] **Step 3:** Implement `SiteNav`; restyle `SimulatedBadge` (dashed `ink-2` border, 16px; keep tooltip and sr-only text).
- [ ] **Step 4: Verify** `npm run typecheck && npm run lint`; `/elders/elder-hal` renders without errors.
- [ ] **Step 5: Commit** `[D] Brighter Sky tokens, fonts, SiteNav`.

### Task 2: Pure display logic: signals and snapshot captions

**Files:**
- Create: `web/lib/signals.ts`, `web/lib/snapshot.ts`
- Test: `web/lib/__tests__/signals.test.ts`, `web/lib/__tests__/snapshot.test.ts`

**Interfaces:**
- Consumes: `MarkerSeries`, `CallCard` (`lib/types.ts`); `isoWeekKey` (`lib/analysis/weeks.ts`); `DRIFT_Z`, `REPEAT_WEEKLY_MIN`, `MAD_SCALE` (`lib/analysis/config.ts`).
- Produces:
```ts
export type SignalKey = 'pauses' | 'pace' | 'vague' | 'retold';
export type SignalStatus = 'usual' | 'different' | 'retold' | 'learning';
export interface SignalPoint { callId: string; at: string; value: number | null; confidence: 'high' | 'low' | 'na'; isSimulated: boolean }
export interface Signal { key: SignalKey; title: string; explainer: string; unit: 'z' | 'wpm' | 'per100w' | 'count';
  band: [number, number] | null; points: SignalPoint[]; status: SignalStatus }
export const STATUS_TEXT: Record<SignalStatus, string>;
export function buildSignals(markers: MarkerSeries[], timeZone?: string): Signal[]; // always 4, in order pauses, pace, vague, retold; tz default 'America/New_York'
export function snapshotCaption(call: CallCard): { caption: string | null; body: string | null };
```
- Exact copy. Titles: `Pauses & hesitation`, `Speaking pace`, `Vague words`, `Retold stories`. Explainers: `Stopping mid-thought, or saying "um" while he searches for a word.` · `How quickly he talks while he's speaking.` · `Words like "thing" or "stuff" in place of a specific word.` · `Stories he brought up himself that he also told in another chat that week.` `STATUS_TEXT`: usual `About his usual`, different `Different from his usual lately`, retold `Retold a few stories this week`, learning `Still learning his usual`.

- [ ] **Step 1: Write failing tests** in `signals.test.ts` using `fixtures/demo/timeline.json` (drift) and `timeline-stable.json`:
  - `buildSignals(drift.markers).map(s => s.key)` equals `['pauses','pace','vague','retold']`; pauses/pace/vague status `different`; retold status `retold`.
  - `buildSignals(stable.markers)`: all four `usual`.
  - pauses point for `call-12` equals the median of that call's non-null `z` across `pause_rate, mean_pause_ms, wfp_rate, filler_rate`; pauses `band` is `[-1, 1]`.
  - pace `band` equals `[median - 1.4826*mad, median + 1.4826*mad]` from the `speech_rate` baseline; retold `band` is `null`.
  - `buildSignals([])`: 4 signals, all `learning`, all `points` empty.
  - A series whose newest points are `value: null` / `confidence: 'na'` keeps them as points with `value: null`, excludes them from the status median, and with fewer than 3 `high` points left returns `learning`.
- [ ] **Step 2: Write failing tests** in `snapshot.test.ts`: photo present → caption = `photosShown[0].caption`, body = full summary; no photo and summary `"A. B. C."` → `{ caption: "A.", body: "B. C." }`; one-sentence summary → `{ caption: it, body: null }`; `summary: null` → both `null`.
- [ ] **Step 3: Run** `npx vitest run lib/__tests__` → FAIL (modules missing).
- [ ] **Step 4: Implement.** z-based status: last 3 points with `confidence === 'high'` and non-null value (pace/vague use each point's `z` from the source series, pauses the combined value); fewer than 3 → `learning`; median ≥ `DRIFT_Z` → `different`, else `usual`. Retold: no points → `learning`; sum of `value` over points whose `isoWeekKey(at, tz)` equals the latest point's week ≥ `REPEAT_WEEKLY_MIN` → `retold`, else `usual`. Pauses point confidence: `na` if no contributing z, `low` if any contributor is `low`, else `high`. Sentence split: `/^(.+?[.!?])(\s+|$)/s`.
- [ ] **Step 5: Run** `npx vitest run lib/__tests__` → PASS; `npm run typecheck`.
- [ ] **Step 6: Commit** `[D] Signals + snapshot caption logic with tests`.

### Task 3: Snapshot card, develop moment and photo window

**Files:**
- Create: `web/components/SnapshotCard.tsx`, `web/components/PhotoWindow.tsx`, `web/components/useSeen.ts`

**Interfaces:**
- Consumes: `snapshotCaption` (Task 2), `CallCard`, `ElderProfile` (`lib/api.ts`), `SimulatedBadge`.
- Produces:
  - `SnapshotCard({ call, variant, isNew, confirmed, photos }: { call: CallCard; variant: 'feature' | 'compact'; isNew: boolean; confirmed: boolean; photos: ElderProfile['photos'] })`
  - `PhotoWindow({ photoId, caption, photos, size }: { photoId: string | null; caption: string | null; photos: ElderProfile['photos']; size: 'feature' | 'compact' })`: renders `photos.find(p => p.id === photoId)?.imageUrl` in an `<img>`; on no match or `onError`, a sky-soft panel with an inline line-icon SVG (≤ 64px) and the caption. Never a gradient.
  - `useSeen<T extends Element>(): [ref: RefObject<T | null>, seen: boolean]`: IntersectionObserver; `seen` becomes true once ≥ 60% of the element has been visible.
- Behavior: `feature` = white instant-photo frame (10px radius, 1px `line` border, neutral shadow, `rotate(-1deg)`), photo window 220px (160 on phone), caption `font-caption` 26px, body 18px, chips (`{askedBy}'s question` with the answer line; mood `In good spirits` / `Steady` / `Seemed a bit low`), time and length. `compact` = same frame, 96px window, caption + body clamped to 2 lines + chips. `processing` → warm grey frame, shimmer lines, "Writing up today's chat…"; `in_progress` → "Hal is chatting with Remi right now…". When `isNew` and status is `done`: `animate-develop`, and a NEW tag (family-strong) placed **inside** the frame's top-right padding (not overhanging) until `useSeen` reports seen. Unconfirmed: date/length + "Details appear after Hal confirms sharing."

- [ ] **Step 1:** Implement the three files.
- [ ] **Step 2: Verify** `npm run typecheck && npm run lint`.
- [ ] **Step 3: Commit** `[D] SnapshotCard with develop moment and honest photo window`.

### Task 4: Hal's page, Chats tab

**Files:**
- Modify: `web/components/TimelineView.tsx` (header, tabs, Chats layout; keep the polling, new-detection and fixture-bar logic)
- Create: `web/components/TimelineTabs.tsx`, `web/components/GentleNote.tsx`
- Modify: `web/components/FunFacts.tsx`, `web/components/QuestionsWaiting.tsx` (restyle)
- Delete: `web/components/NudgeCard.tsx`, `web/components/CallCardView.tsx`

**Interfaces:**
- Consumes: `SnapshotCard`, `SiteNav`, `getTimeline` / `getElder` / `dismissNudge`.
- Produces: `TimelineTabs({ elderId, tab, fixture }: { elderId: string; tab: 'chats' | 'doing'; fixture?: string })`: two links preserving `?fixture=`, `aria-current="page"` on the active one. `GentleNote({ nudge, onDismiss }: { nudge: Timeline['nudges'][number]; onDismiss: () => void })`: white card, joy sun glyph, `nudge.message` verbatim, `copy.nudgeLinkLabel` link when `nudge.link`, "Got it, hide this". Tab comes from `searchParams.tab` (`'doing'` → How he's doing, otherwise Chats).

- [ ] **Step 1:** Header: `SiteNav variant="app"`, "{name}'s chats", "{displayName} · Last chat {relative}", processing indicator, simulated explainer, `TimelineTabs`.
- [ ] **Step 2:** Chats tab per spec: newest call as `SnapshotCard variant="feature"`; `GentleNote`s directly below; then two columns (`lg:grid-cols-[1.4fr_1fr]`, one column on phone): Earlier chats (`compact`, first 4 + "Show all N chats") | Questions waiting + Fun facts; footer disclaimer. Unconfirmed: the approved banner above the newest card.
- [ ] **Step 3: Verify** at 1440 and 390: `?fixture=drift`, `unconfirmed`, `processing` → click `after-call` (newest card develops; NEW shows until scrolled into view). `document.documentElement.scrollWidth === innerWidth`.
- [ ] **Step 4:** `npm run typecheck && npm run lint`. **Commit** `[D] Timeline Chats tab: snapshot-first layout, tabs, gentle note`.

### Task 5: Hal's page, How he's doing tab

**Files:**
- Create: `web/components/SignalCard.tsx`, `web/components/SignalChart.tsx`, `web/components/HowHesDoing.tsx`
- Modify: `web/components/TimelineView.tsx` (render `HowHesDoing` for tab `doing`), `web/components/Repeats.tsx` (restyle)
- Delete: `web/components/Trends.tsx`, `web/components/MarkerChart.tsx`

**Interfaces:**
- Consumes: `buildSignals`, `STATUS_TEXT`, `Signal` (Task 2); `Timeline['repeats']`.
- Produces: `HowHesDoing({ timeline }: { timeline: Timeline })`; `SignalCard({ signal, compact }: { signal: Signal; compact?: boolean })` (reused on the home page); `SignalChart({ signal, height }: { signal: Signal; height: number })`.
- Behavior: intro `copy.trendsHeader(name)`; 2×2 grid (1 column on phone). Each card: title + status pill (`usual` → ok colors; `different` / `retold` → sky-soft with ink text, never joy or red; `learning` → plain), explainer **beside** the chart on desktop (chart ~60% / text ~40%), stacked on phone. Chart: Recharts line; band as a sky-soft `ReferenceArea`; simulated points small ink-2, live points ink, low/na hollow; the pauses y-axis shows no numbers, only "more" / "less" and "his usual" on the band; retold uses small bars with `Repeats` under it. Empty: the approved not-confirmed copy, or "Remi will start comparing after a few more chats."

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify:** drift shows three "Different from his usual lately" and "Retold a few stories this week"; stable shows four "About his usual"; screenshots at 1440 and 390 with no overlap.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run lib/__tests__`. **Commit** `[D] How he's doing tab with four signals`.

### Task 6: Home page `/`

**Files:**
- Modify: `web/app/page.tsx`
- Create: `web/components/home/Hero.tsx`, `web/components/home/TodayRow.tsx`, `web/components/home/HomeSections.tsx`, `web/public/images/hal-armchair.provenance.md` (one line: user-made with ChatGPT image generation from the Remi illustration prompt, Oct 24 2026)
- Delete: `web/components/ElderPicker.tsx`

**Interfaces:**
- Consumes: `SiteNav`, `SnapshotCard` (`compact`), `SignalCard` (`compact`), `buildSignals`, `getTimeline`, `getElder`, `copy`.
- Produces: `TodayRow({ elderId }: { elderId: string })`: client component polling `getTimeline` (3 s while `processing`, else 15 s); three equal-height cards: "Latest snapshot" (newest call, relative date), "How he's doing" (the `pauses` signal, compact), "Gentle notes" (active nudge → "There's a gentle note on Hal's page." + "Read it" link to `/elders/elder-hal`; none → the spec's copy). Demo elder id `'elder-hal'`.
- Hero per spec and mock: `next/image` of `/images/hal-armchair.png` (`sizes` up to 680px, `priority`), floor ellipse, Remi bubble **beside** the phone with no box overlap with the figure; whole figure incl. tomato plant inside the panel. Phone: stacked, CTA within the first 844px.
- Sections per the spec's Home list: How it works, signals panel + three framing pills, promise cards, closing band, footer; copy exactly as the spec.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify** at 1440 and 390: no horizontal scroll; phone CTA top < 844; in the browser console, check that sibling content boxes inside each section don't intersect.
- [ ] **Step 3:** `npm run typecheck && npm run lint`. **Commit** `[D] Judge-facing home page in Brighter Sky`.

### Task 7: Finish: contract, review, docs, handoff

**Files:**
- Modify: `web/.impeccable/surfaces/app-elders-id-page-tsx.md` (OWN-WORLD and FIRST VIEWPORT to the spec's palette and layout; gentle note below the newest snapshot; no overlaps)
- Create: `web/DESIGN.md`, `web/.impeccable/design.json` (via the documenter)
- Modify: `echo-docs/echo-docs/docs/HANDOFF.md` (D section)

- [ ] **Step 1:** Update the direction contract with `impeccable surface-brief write` and re-read it.
- [ ] **Step 2:** `impeccable detect --json web/app web/components` → fix real findings; any ignore narrow and justified.
- [ ] **Step 3:** Capture `web/.impeccable/review/desktop.png` (1440, `/`, full page) and `mobile.png` (390), plus `/elders/elder-hal` both tabs at both widths; spawn Impeccable's finish reviewer with the spec, contract and screenshots; apply one fix batch.
- [ ] **Step 4:** Spawn Impeccable's documenter for `web/DESIGN.md` + `.impeccable/design.json`.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`; update HANDOFF; **commit** `[D] Redesign finish: contract, review fixes, DESIGN.md, handoff`. Ask the user before `git push`.

## Next plan (not this one)

D4 seed (`web/scripts/seed.ts`, currently B's stub; reuse `scripts/demo-data.ts`) so the live API holds Hal's drift history and a judge's call appears on the page; then `/setup` and `/manage`, including Kevin's memory-moments and emergency-contact fields.
