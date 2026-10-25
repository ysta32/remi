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

The dashboard displays the imported provenance notice only for the matching imported profile and nonempty all-simulated calls. Cards contain labeled transcript excerpts, not model summaries. Seven speech readings per call are computed from source-authored word timing with existing baseline helpers. The import alone leaves repetition unprocessed: NULL/na legacy repeat rows show **Not analyzed yet**, including when older weeks have real counts; measured zero still means **About his usual**. The importer generates no model summary, topic extraction, repeat detection, embeddings, facts, mood or nudges. The separate optional analysis below adds actual standalone detector results. Fictional demo sharing choices enable summaries/speech trends and disable fun facts/mood, without a forged spoken consent event.

Separate audio files have already been generated ([verification](../docs/superpowers/specs/2026-10-25-openai-audio-verification.md)). The importer attaches no audio and performs no STT: chart timing remains authored source timing, not measured acoustic timing. Full corpus/import limitations are in [synthetic/README.md](../synthetic/README.md#offline-transcript-dashboard-demo).


## Optional synthetic repeat analysis

After importing the corpus, validate it against the existing isolated database (no credentials, network, migrations or writes):

```sh
# From repository root; use canonical absolute paths.
npm --prefix web run analyze:synthetic -- --input "$PWD/synthetic/output-release" --database "$PWD/web/data/synthetic-demo.db"
```

For an explicitly authorized paid run, supply `OPENAI_API_KEY` privately through an environment file. The CLI loads no environment file itself. From `web/`:

```sh
node --env-file=.env.local --import tsx scripts/analyze-synthetic-repeats.ts --input "$(cd .. && pwd -P)/synthetic/output-release" --database "$PWD/data/synthetic-demo.db" --apply
```

Apply processes all calls chronologically with the standalone detector and actual earlier extracted history. Defaults are the detector's extraction model, `text-embedding-3-small` (1536 dimensions), and provisional threshold **0.85**. Optional environment settings are `OPENAI_EXTRACT_MODEL`, `OPENAI_EMBED_MODEL`, `EMBEDDING_DIMENSIONS`, `REPEAT_THRESHOLD`, `OPENAI_TIMEOUT_MS` and `OPENAI_MAX_RETRIES`; selected model/threshold provenance appears in the dashboard. Changing source or settings requires full replay; a complete unchanged batch is reused. Missing consent or provider failure aborts the batch and preserves previously stored results. The runner never reads planted labels or writes legacy topics, repeat markers or nudges.

Both **Chats** and **How he's doing** show “Repeated stories and questions” when valid consent-filtered analysis exists: total, Unprompted repeat / Prompted retelling / Uncertain counts, stories/questions, analyzed coverage and expandable current/prior evidence. Comparisons span all earlier calls, including beyond seven days. Earlier-call links open Chats and reveal the linked card. Similarity is not a probability; 0.85 is provisional, not a validated accuracy threshold. A complete zero says no repeats were detected at this threshold; partial results identify unanalyzed calls. Sharing choices can hide summaries and quotes. Without standalone results, existing legacy tiles and demo notice remain available.

The entire fictional demo corpus is used for this integration, not a held-out evaluation. Detection counts can differ from planted annotations and make no clinical or accuracy claim. Summary generation and audio/STT are unchanged; timing remains authored even after repeat analysis.
- `npm run pitch:check` — voice markers: TTS flat vs expressive (needs `OPENAI_API_KEY`), or `-- --file x.wav` for any recording

### Family Drift Index

“How he’s doing” now computes a consent-filtered Drift Index view from stored high-confidence
markers and available validated standalone repeat detector results. Only unprompted repeated
stories contribute to its repeat rule; unknown detector coverage is shown separately from zero.
The card displays familiarization/baseline progress, monitored calls and completed monitoring
weeks. The twelve-call synthetic profile has two familiarization calls, eight baseline calls,
two subsequent calls and no completed monitoring week: all four week buckets overlap the
baseline. Its authored timing is not measured audio. The separate audio-analysis output does
not replace these stored markers. Computed nudge flags never mean a notification was sent.

`/research` remains a longer **static simulation** of possible trajectories, distinct from the
family view’s actual stored evidence and detector coverage. Research chart defaults are preserved;
the family card overrides all notification-related chart labels with computed-state wording.
