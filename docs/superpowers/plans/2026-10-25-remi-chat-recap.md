# Chat Recap Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every chat on Hal's page opens a recap page (summary, highlights, small month calendar, "How he sounded" chart), earlier-chat cards become roomy clickable cards, and a call in progress shows what has happened so far and refreshes quickly.

**Architecture:** Pure helpers in `web/lib/recap.ts` compute everything the recap shows from the existing `Timeline` contract (no API or contract change). Polling moves out of `TimelineView` into a shared `useTimelinePoll` hook used by both Hal's page and the new route `/elders/[id]/chats/[callId]`. Presentational components live in `web/components/recap/`.

**Tech Stack:** Next.js 16 App Router (client components, `PageProps<'/route'>` typegen as in `app/elders/[id]/page.tsx`), Tailwind 4 tokens from `app/globals.css`, vitest.

**Spec:** the approved mockup `chat-mock/template.html` (built with the user, Oct 25 2026, 3:40–4:05 AM; kept in the session scratchpad) plus the surface brief `web/.impeccable/surfaces/app-elders-id-page-tsx.md` and `docs/superpowers/specs/2026-10-24-remi-family-frontend-design.md`.

## Global Constraints

- Contract shapes unchanged (`web/lib/types.ts`); D owns only `web/app/` pages, `web/components/`, and D-side `web/lib` helpers.
- Claims policy: no detect/diagnose/screen wording; plain words only; no red. "Different" uses peach (`--family-strong`), "usual" uses mint (`--ok`).
- Every simulated call shows a Simulated tag.
- No transcripts. Only `CallCard`, `funFacts`, `markers`, `repeats` from the timeline.
- Nothing overlaps; no dead zones; not cramped (user rule).
- Body text ≥16px; WCAG AA; reduced motion respected.
- Thresholds come from `lib/analysis/config.ts`: `DRIFT_Z = 1.5`, band = median ± `MAD_SCALE` × mad.
- Highlight dot (peach `#f28a5c`, top-right corner, no legend) = the chat has an answered family question or a fun fact.
- Calendar: one month beside the title on desktop (320px column), below the summary on phones; only month arrows; a chat is picked by clicking its day.
- Links keep the `?fixture=` query when `USE_FIXTURES`.

## Review Focus

1. A call `in_progress` must poll at the busy rate (3 s), not idle (15 s). Test: `isBusy` in Task 1.
2. An unknown `callId` in the URL shows a friendly "We couldn't find that chat" with a link back, never a crash. Test: `findCall` returns null in Task 1.
3. The recap of a chat with no fun fact, no photo and no question shows only the summary and the chart, with no empty boxes. Test: `recapHighlights` returns empty lists in Task 1.
4. Pace "different" must read "Slower than usual" when the value is below his usual (the z sign follows the concern direction, not up/down). Test in Task 1.
5. Not-yet-confirmed consent (`elderConfirmed=false`): calls have no summary/photos. The recap shows "Hal hasn't said yes to sharing details yet" instead of an empty lede. Test: `recapHighlights` with `summary: null` in Task 1.

---

### Task 1: Pure recap helpers + busy polling rule

**Files:**
- Create: `web/lib/recap.ts`
- Modify: `web/lib/live.ts` (add `isBusy`)
- Test: `web/lib/__tests__/recap.test.ts`, `web/lib/__tests__/live.test.ts`

**Interfaces:**
- Produces (`web/lib/recap.ts`):
  - `dayKey(iso: string, tz?: string): string` → `"2026-10-09"` in the elder's zone (default `America/New_York`).
  - `findCall(t: Timeline, callId: string): CallCard | null`
  - `hasHighlight(t: Timeline, call: CallCard): boolean`: answered family question, or a fun fact on the same day.
  - `recapHighlights(t: Timeline, call: CallCard): { facts: Timeline['funFacts']; retold: { summary: string; nth: number; total: number }[] }`
  - `type SoundStatus = 'usual' | 'more' | 'less' | 'learning'`
  - `interface SoundRow { key: 'pauses' | 'pace' | 'vague'; title: string; status: SoundStatus | null; words: string; detail: string | null; rough: boolean; points: { callId: string; at: string; value: number }[]; band: [number, number] | null }`
  - `soundRows(t: Timeline, callId: string): SoundRow[]`: built from `buildSignals(t.markers)` for points and band. `status` is null when this call has no point. `learning` when the call is among the first `baseline.n` calls of `speech_rate`. Otherwise compare this call's value with the band centre: pauses use the signal value (a z; ≥ `DRIFT_Z` → more, ≤ −`DRIFT_Z` → less); pace and vague use `|z| ≥ DRIFT_Z` from the marker point and direction from value vs median. Words: pauses `More pauses than usual` / `Fewer pauses than usual`; pace `Faster than usual` / `Slower than usual`; vague `More “thing” and “stuff”` / `Fewer vague words`; usual `About his usual`; learning `Helping Remi learn his usual`. `detail`: pace `124 words a minute (usually 134)`, vague `1.8 per 100 words (usually 1.2)`, pauses null. `rough` = point confidence `low`.
  - `interface MonthCell { day: number | null; callId?: string; highlight?: boolean; live?: boolean }`
  - `monthCells(t: Timeline, year: number, month: number, tz?: string): MonthCell[]`: leading nulls for weekday offset (Sunday first); the latest call of that day wins.
  - `axisTicks(t: Timeline): { at: string; label: string }[]`: first chat, first chat of each new month, latest chat.
  - `xPercent(t: Timeline, iso: string): number`: 0–100 between the first and last call (50 when only one call).
- Produces (`web/lib/live.ts`): `isBusy(t: Pick<Timeline, 'processing' | 'calls'>): boolean`. True if `processing` or any call is `in_progress`.

- [ ] **Step 1: Write failing tests** in `recap.test.ts` using `fixtures/demo/timeline.json` (drift) and `timeline-after-call.json`:
  - `findCall(drift, 'nope')` → `null`; `findCall(drift, 'call-09').id` → `'call-09'`.
  - `hasHighlight` true for `call-05` (answered question) and `call-09` (fact on Oct 9); false for `call-10`.
  - `recapHighlights(drift, call-10)` → `{ facts: [], retold: [{ summary: /1977 blizzard/, nth: 2, total: 4 }] }`; for `call-11` with no fact → `facts: []`.
  - `recapHighlights` on a copy of `call-05` with `summary: null` still returns its `facts` (consent hides only details).
  - `soundRows(drift, 'call-09')`: pace row `status: 'less'`, `words: 'Slower than usual'`, `detail: '124 words a minute (usually 134)'`; vague row `status: 'more'`; pauses row `status: 'more'`.
  - `soundRows(drift, 'call-02')` every status `'learning'`.
  - `soundRows(afterCall, 'call-live')` pace `rough: true`.
  - `monthCells(drift, 2026, 10)`: Oct 1 2026 is a Thursday, so `cells.slice(0, 4).every(c => c.day === null)`; the cell for day 9 has `callId: 'call-09', highlight: true`.
  - `axisTicks(drift).map(t => t.label)` → `['Sep 21', 'Oct 2', 'Oct 16']`.
  - In `live.test.ts`: `isBusy({ processing: false, calls: [{ status: 'in_progress' }] })` → `true`; all `done` and `processing: false` → `false`.

- [ ] **Step 2:** Run `cd web && npx vitest run lib/__tests__/recap.test.ts lib/__tests__/live.test.ts`. Expected: FAIL (module not found / isBusy undefined).
- [ ] **Step 3:** Implement the signatures above in `web/lib/recap.ts` and `isBusy` in `web/lib/live.ts`.
- [ ] **Step 4:** Re-run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `[D] Recap helpers: highlights, how-he-sounded rows, month cells; poll fast mid-call`.

### Task 2: Shared polling hook, roomy earlier-chat cards, live "so far"

**Files:**
- Create: `web/components/useTimelinePoll.ts`, `web/components/ChatCard.tsx`, `web/components/recap/LiveSoFar.tsx`
- Modify: `web/components/TimelineView.tsx` (use the hook; earlier chats become a `ChatCard` grid; no "show all" cap), `web/components/SnapshotCard.tsx` (feature variant: "See the full recap →" link when done; in-progress body renders `LiveSoFar`), `web/components/home/TodayRow.tsx` (snapshot links to the recap)

**Interfaces:**
- Consumes: `isBusy`, `hasHighlight` (Task 1); `getTimeline`, `getElder`, `settled`, `freshIds`, `pollDelay` (existing).
- Produces:
  - `useTimelinePoll(id: string, variant: FixtureVariant): { timeline: Timeline | null; elder: ElderProfile | null; error: string | null; newIds: Set<string> }`. Same behaviour as today's effect, but the delay uses `pollDelay(isBusy(timeline))`.
  - `recapHref(elderId: string, callId: string, fixture?: FixtureVariant): string` exported from `ChatCard.tsx` → `/elders/${elderId}/chats/${callId}` plus `?fixture=` when given.
  - `<ChatCard call elderId fixture highlight />`: whole card is a `Link`. Date (`formatDay`, bold 20px), meta line (mood text with mint dot · outlined `Simulated`), summary clamped to 3 lines, tags (`{askedBy}'s question answered`, `Fun fact`, `N photo(s)`), divider, `See the full recap →`. Padding 26/28px, gap 14px, grid gap 24px, `minmax(320px,1fr)`.
  - `<LiveSoFar call />`: list of "Remi said hello at {time}", one line per `photosShown` ("Showed the photo “{caption}”"), "Asked {askedBy}'s question: “{text}”", then `processing` → "He hung up. Writing up the chat now…", else a muted "More shows up here as they talk". `<LivePill call />` reads `Chatting now · m:ss` (ticks every second) or `Just finished`.

- [ ] **Step 1:** Move the polling effect into `useTimelinePoll` and switch `TimelineView` to it; run `npx vitest run && npx tsc --noEmit`. Expected: all pass (behaviour unchanged).
- [ ] **Step 2:** Build `ChatCard`, `LiveSoFar`; wire the earlier grid, the SnapshotCard link and in-progress body, and the TodayRow link.
- [ ] **Step 3:** Verify in the browser at 1280 and 400 wide on `/elders/elder-hal-demo` (`?fixture=drift`, `?fixture=processing`): footers align per row, no overlap, no horizontal scroll, a card click opens the recap URL.
- [ ] **Step 4:** Commit `[D] Chats list: roomy clickable cards, live so-far, shared polling hook`.

### Task 3: Recap route and page

**Files:**
- Create: `web/app/elders/[id]/chats/[callId]/page.tsx`, `web/components/recap/ChatRecapView.tsx`, `web/components/recap/RecapCalendar.tsx`, `web/components/recap/SoundedChart.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: the route. The page mirrors `app/elders/[id]/page.tsx` (Suspense around a client view taking `params`/`searchParams` promises).
  - `ChatRecapView`: `SiteNav variant="app"`, `← All chats with {name}` link (keeps fixture), title (`Today` when same day, else `formatDay`), meta (minutes · mood pill · Simulated; live pill when busy), lede = summary at 23px max 62ch (or `LiveSoFar` when the call is live; consent fallback text when summary is null), `RecapCalendar` in a `1fr 320px` grid, then highlight cards (family question peach, fun fact butter-soft `#fff4cf` with Patrick Hand quote, photos via existing `PhotoWindow`), then `SoundedChart`. Unknown call → "We couldn't find that chat." + back link.
  - `RecapCalendar({ timeline, selectedId, elderId, fixture })`: month state starts at the selected call's month; ‹ › change month only; day buttons are `Link`s to `recapHref`; selected = ink fill; highlight dot top-right; live day = mint inset ring.
  - `SoundedChart({ timeline, call, elderId, fixture })`: heading `How he sounded {today|on Weekday}`, one-line legend, rows from `soundRows` in a `290px 1fr` grid (stacked under 700px). Each lane is 60px: sky-soft band, polyline (`vector-effect: non-scaling-stroke`), dots as `Link`s (selected 18px ink), faint vertical line at this chat. A Retold row uses `recapHighlights().retold` text (Patrick Hand story line) and peach dots at `t.repeats` dates. Axis row from `axisTicks`. Footer note: "One chat on its own doesn't mean much. Remi only suggests a check-in when several of these stay different for a few weeks." While the call is live: "These fill in a minute or so after he hangs up."

- [ ] **Step 1:** Create the route and views.
- [ ] **Step 2:** Run `npx tsc --noEmit && npx eslint app components lib && npx vitest run`. Expected: clean, all tests pass.
- [ ] **Step 3:** Browser check at 1280 and 400: `/elders/elder-hal-demo/chats/call-09`, `call-05`, `call-11`, `nope`, and `?fixture=processing` on the live call. Run the overlap scan from the mockup review (no overlapping boxes, `scrollWidth === innerWidth`).
- [ ] **Step 4:** Run `impeccable detect --json app components` once and fix any finding.
- [ ] **Step 5:** Commit `[D] Chat recap page: calendar beside, how-he-sounded chart, live states`.

### Task 4: Handoff

**Files:**
- Modify: `echo-docs/echo-docs/docs/HANDOFF.md` (D section only)

- [ ] **Step 1:** Update D status: the recap route, mid-call fast polling, and the item list (seed done by Siyuan; voice chart pending `ws/bc-backend`).
- [ ] **Step 2:** `npx vitest run && npx tsc --noEmit && npm run build` in `web/`. Expected: pass.
- [ ] **Step 3:** Commit `[D] HANDOFF: chat recap page`. Ask the user before pushing or merging.
