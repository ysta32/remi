# Workstream B — Backend and memory API (`web/` server side)

**Human owner:** Engineer 2. **You own:** `web/db/`, `web/app/api/`, `web/lib/server/`, `scripts/smoke.sh`; you also create the `web/` scaffold and shared `web/lib/types.ts` and `web/lib/config.ts`. **Read first:** `CLAUDE.md`, `SPEC.md` §7–8 and §12, `docs/contracts.md` (all).

## Mission
The memory of the system: store elders, photos, questions, consent, calls, events, and analysis results; give the agent a fast context bundle at call start; accept transcripts at call end and kick off the pipeline; serve a consent-filtered timeline to the family app.

## Tasks (in order; report after each ✅)

**B0 — Scaffold (first 20 minutes; others are waiting) ✅**
- `web/`: Next.js App Router, TypeScript strict, Tailwind, ESLint, vitest. Add deps: `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `zod`. Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `db:migrate`, `seed` (seed target may be a stub D fills).
- `web/lib/types.ts` = `docs/contracts.md` §3 verbatim. `web/lib/config.ts`: `APP_NAME = 'Echo'`, flags read from env.
- `.env.example` at repo root with every var from contracts §1 (placeholders only). `.gitignore`: `web/data/`, `.env*`, `!.env.example`, `node_modules`, `agent/tmp/`.
- Push to `main` immediately and tell the human so C and D can start.

**B1 — Schema + migrations**
- `web/db/schema.ts` matching contracts §2 exactly; `web/db/client.ts` singleton (WAL mode, `foreign_keys=ON`). Migration inserts the 8 themes (English and Mandarin prompts, one line each).
- ✅ `npm run db:migrate` on an empty dir creates `web/data/echo.db` with all tables.

**B2 — Family endpoints** (contracts §5)
- All route handlers `export const runtime = 'nodejs'`; zod-validate bodies; consistent error shape.
- Photo upload: multipart, jpeg/png only (reject HEIC with a helpful message), ≤ 8 MB, save to `UPLOAD_DIR` under a random filename; never trust the client filename.
- ✅ smoke tests for each.

**B3 — Agent endpoints** (contracts §4)
- Bearer-token middleware for `/api/agent/*`.
- `web/lib/server/context.ts` builds `CallContext`: last `done` call summary; ≤ 10 most recent fun facts; ≤ 8 caller-initiated story summaries from the last 14 days; ≤ 5 photos ordered by `last_shown_at` NULLS FIRST; oldest pending question; theme = next theme after the last call's `theme_id` in `sort` order (prompt in elder's language); `isFirstCall` = no prior calls; `demoMode` from env. Return < 300 ms.
- `complete`: store utterances, compute `duration_s`, set `processing`, call `processCall(callId)` without awaiting (`void processCall(id)`), return 202. Import from `web/lib/analysis/pipeline.ts`; until C lands it, use a stub that sets `done`.
- Events: side effects per contracts §4. Safety events also `console.warn` a one-line operator alert (no transcript content).
- ✅ smoke tests; context for the seeded elder returns in < 300 ms.

**B4 — Timeline + consent filter**
- `web/lib/server/consent.ts`: `effectiveConsent(row)` per contracts §3; unit tests for NULL/false/true combinations.
- `web/lib/server/timeline.ts` builds `Timeline`, **removing** unconsented data server-side (summaries → `null`, `funFacts`/`markers`/`repeats` → `[]`, mood → `null`, nudges filtered by their consent category). Use C's `markerMeta()` for labels/explainers (stub until available). Nudge `message` rendered from the templates in `docs/safety-and-copy.md` §3.
- ✅ unit test: an elder who hasn't confirmed sees only dates/durations.

**B5 — Dev endpoints** (contracts §6) behind `DEV_TOOLS=1`; `status` includes per-step pipeline timings if C records them.

**B6 — Hardening**
- `scripts/smoke.sh`: curls every endpoint with fixtures and checks status codes; exits non-zero on failure.
- Pipeline concurrency: one in-process queue so two calls finishing together don't race on `recomputeElder`.

## Do not
Return unconsented fields and rely on the UI to hide them · expose transcripts on any family endpoint · store raw audio paths after deletion · add auth providers · switch databases.

## Handoff
Update "B" in `docs/HANDOFF.md`: endpoints done, how to run smoke tests, stubs still in place, requests.
