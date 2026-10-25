# web/ — Remi API, analysis pipeline and family app

Next.js 16 (App Router) + SQLite (better-sqlite3 + Drizzle). Spec and contracts: `../echo-docs/echo-docs/`.

```bash
npm install
cp ../.env.example .env.local   # then fill in values (never commit; never paste keys in chat)
npm run db:migrate              # creates data/echo.db (also happens automatically on first request)
npm run dev                     # http://localhost:3000
npm test && npm run typecheck && npm run lint
bash ../scripts/smoke.sh        # contract smoke test; WARNING: calls /api/dev/reset on that server's DB
```

Minimum `.env.local` for local work: `AGENT_API_TOKEN` (any string, same as the agent's), `DEV_TOOLS=1`,
and `OPENAI_API_KEY` for summaries/fun facts (without it the pipeline still finishes with a neutral summary).
`npm run db:migrate` and `npm run seed` load `.env.local` too, so they use the same `DATABASE_PATH`.

- `app/api/` — routes from contracts §4–6 · `lib/server/` — context, consent filter, timeline
- `lib/markers/` — pure speech markers · `lib/analysis/` — pipeline, baselines, drift, nudges, model adapters
- `scripts/seed.ts` — demo seed (workstream D); `scripts/try-extract.ts`, `scripts/tune-repeat.ts` — live model checks
- `npm run pitch:check` — voice markers: TTS flat vs expressive (needs `OPENAI_API_KEY`), or `-- --file x.wav` for any recording
