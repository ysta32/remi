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


## Isolated synthetic transcript demo

Use the offline importer for the generated transcript corpus. This setup needs no provider credentials and makes no model requests. Reuse the existing `synthetic/output-release` corpus; if absent, generate it from the repository root with `node synthetic/cli.mjs --output synthetic/output-release`. Keep your usual database separate, and do not run `seed`, `/api/dev/reset` or `scripts/smoke.sh` for this setup.

From the **repository root**, with the installed web dependencies:

```sh
mkdir -p web/data
# Dry run: validates and computes without writing a database.
npm --prefix web run import:synthetic -- --input "$PWD/synthetic/output-release" --database "$PWD/web/data/synthetic-demo.db"
# Apply once into an absent, explicitly named database.
npm --prefix web run import:synthetic -- --input "$PWD/synthetic/output-release" --database "$PWD/web/data/synthetic-demo.db" --apply
# Read that database through the existing live API and family app.
DATABASE_PATH="$PWD/web/data/synthetic-demo.db" NEXT_PUBLIC_USE_FIXTURES=0 NEXT_PUBLIC_DEMO_ELDER_ID=elder-synthetic-hal-bennett DEV_TOOLS=0 npm --prefix web run dev -- --hostname 127.0.0.1 --port 3100
```

The importer rejects lexical `.`/`..` path components, symlink ancestors, existing destinations and SQLite sidecar collisions. Use absolute paths from a canonical repository directory. The database parent must already exist. If apply fails after reserving a new database, retain it for inspection and choose a fresh filename; there is no overwrite/reset option. Source validation never reads ground-truth labels. The default successful import reports twelve calls, 96 marker rows and seven baselines.

Visit `http://127.0.0.1:3100/elders/elder-synthetic-hal-bennett` and `http://127.0.0.1:3100/elders/elder-synthetic-hal-bennett?tab=doing`. The home/nav demo link uses the optional `NEXT_PUBLIC_DEMO_ELDER_ID` override as an encoded path segment. Without it, the existing `elder-hal-demo` ID stays the default. Without `NEXT_PUBLIC_USE_FIXTURES=0`, the app continues to use fixture data. Both public variables must be supplied before dev startup or production build; production bundles embed their build-time values.

The dashboard displays the imported provenance notice only for the matching imported profile and nonempty all-simulated calls. Cards contain labeled transcript excerpts, not model summaries. Seven speech readings per call are computed from source-authored word timing with existing baseline helpers. Repetition is not analyzed: NULL/na repeat rows show **Not analyzed yet**, including when older weeks have real counts; measured zero still means **About his usual**. No model summary, topic extraction, repeat detection, embeddings, facts, mood or nudges are generated. Fictional demo sharing choices enable summaries/speech trends and disable fun facts/mood, without a forged spoken consent event.

Separate audio files have already been generated ([verification](../docs/superpowers/specs/2026-10-25-openai-audio-verification.md)). The importer attaches no audio and performs no STT: chart timing remains authored source timing, not measured acoustic timing. Full corpus/import limitations are in [synthetic/README.md](../synthetic/README.md#offline-transcript-dashboard-demo).
