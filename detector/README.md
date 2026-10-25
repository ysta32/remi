# Remi repeat detector

Standalone Node.js 24+ ES module for repeated caller stories and questions across **all earlier calls**, with separate `unprompted`, `prompted`, and `uncertain` elicitation labels. It uses a structured extraction request, summary embeddings, cosine similarity, and a provisional threshold of `0.85`. It performs no LLM match-verification pass and has no dependencies, database writes, frontend changes, or agent integration.

Repeat counts are descriptive signals, not diagnoses. Prompted retelling can be a successful companion interaction. The threshold has not been calibrated; no detection accuracy claim is made.

## Setup and CLI

From the repository root:

```sh
node --version  # 24+
npm --prefix detector test
npm --prefix detector run check
node detector/cli.mjs --help
```

No package installation is required. For a user-authorized live run, copy the example environment file once, fill in the private copy locally, and explicitly select a Responses model that supports strict structured output:

```sh
# Run this copy only when detector/.env.local does not already exist.
cp -n detector/.env.example detector/.env.local
# Edit detector/.env.local privately: set OPENAI_API_KEY and OPENAI_EXTRACT_MODEL.
mkdir -p detector/output
node --env-file-if-exists=detector/.env.local detector/cli.mjs \
  --input detector/fixtures/example-input.json \
  --output detector/output/example-result.json
```

The example call is fictional and marked `isSimulated:true`; it contains no planted labels. This command calls OpenAI and requires the user's key and explicit model configuration. No live provider test was run during implementation because credentials were not configured. Deterministic tests intercept the HTTP boundary and never call OpenAI.

`OPENAI_API_KEY` is accepted only from the environment, never CLI arguments or the input JSON. The primary team variables are `OPENAI_EXTRACT_MODEL` and `OPENAI_EMBED_MODEL`; `OPENAI_EXTRACTION_MODEL` and `EMBEDDING_MODEL` are standalone aliases. Team variables take precedence. `EMBEDDING_DIMENSIONS` defaults to `1536`, `REPEAT_THRESHOLD` to `0.85`, and the embedding model to `text-embedding-3-small`. Extraction has no hardcoded model default.

The CLI requires an explicit output path. It reserves that path exclusively before provider work, refuses existing files and symlinks, and writes JSON with permissions `0600`. Success produces no stdout or stderr. Unavailable results are saved with `counts:null`, a safe error code on stderr, and a nonzero exit status. Invalid arguments/input and output-file errors produce safe stderr codes only. `--help` writes usage to stdout and needs no key. To run again, choose a new output path. The module does not load `.env.local` automatically; the Node flag above is explicit. Keep transcripts, results, and credentials private; `detector/output/`, `.env.local`, and `*.private.json` are ignored.

## Direct import for Siyuan's TypeScript backend

Import the module using the relative path from the consuming source file; `src/index.d.mts` provides declarations for this direct `.mjs` import without changing the backend's package manifest:

```ts
import { analyzeCall, type SavedItem } from '/absolute/path/to/remi/detector/src/index.mjs';

const history: SavedItem[] = []; // Load authorized detector-format prior items.
const result = await analyzeCall({
  call: {
    elderId: 'fictional-elder',
    callId: 'fictional-call',
    startedAt: '2026-10-24T14:00:00Z',
    isSimulated: true,
    utterances: [{ speaker: 'caller', text: 'When does the library open?' }],
  },
  history,
  processingAllowed: true, // Set only after the caller verifies current consent.
}, {
  apiKey: process.env.OPENAI_API_KEY,
  extractionModel: process.env.OPENAI_EXTRACT_MODEL,
  embeddingModel: process.env.OPENAI_EMBED_MODEL,
});

if (result.status === 'ok') {
  // Recheck consent, call existence/ownership and revision, then transact.
  // Replace this call's detector rows; upsert eligible historyUpdates.
  // Store counts, matches and provenance separately from other analyses.
} else {
  // counts is null: this is unavailable, not a measured zero.
}
```

Public runtime exports are `analyzeCall`, `DetectorError`, `parseCall`, `parseHistory`, `makeItemId`, `postOpenAI`, `extractItems`, `embedItems`, `prepareHistory`, `cosineSimilarity`, `findCandidates`, and `classifyCandidates`. Types are exported from the same import path. Individual algorithms throw sanitized `DetectorError`s; `analyzeCall` returns the result union below.

## Input and processing

Input JSON has exactly the CLI fields `{call, history, processingAllowed}`. `call` contains `elderId`, `callId`, timezone-qualified ISO `startedAt`, optional `isSimulated` (default false), and `utterances`. Each utterance has `speaker:'caller'|'agent'`, `text`, and optionally both integer `startMs`/`endMs` offsets. Empty utterance arrays and blank caller text are valid. IDs are nonblank strings up to 200 characters. No raw audio is needed.

The pipeline:

1. Require `processingAllowed === true`, then validate and copy the call and saved history. The caller remains responsible for real consent and authorization.
2. Extract one item per distinct incident/question within this call, with literal caller quote, source turn index, and elicitation evidence. Earlier calls are never sent to extraction. Trusted instructions are separate from serialized transcript input; Responses requests use `store:false`.
3. Embed current item summaries only. Quotes and full transcripts are excluded from embedding input.
4. Before historical embedding, retain only the same elder, a different call, a strictly earlier timestamp, and an extracted kind. Reuse compatible vectors; embed missing eligible vectors. Incompatible eligible models/dimensions fail instead of mixing vector spaces.
5. Compare each current item with eligible earlier items of the same kind using cosine similarity. Do not compare current items with each other. Ties favor the latest prior item, then lexical item ID.
6. Classify the strongest candidate at `similarity >= threshold` and count repeat labels and kinds separately.

No usable caller text succeeds without network or model/key configuration. Empty extraction skips embeddings and historical preparation. Structurally malformed history fails even if the malformed entry would be ineligible; it is not silently ignored. Provider, extraction, or cache failures return unavailable, never partial results. A request has at most one retry; requests use the fixed OpenAI endpoint and bounded timeouts.

`history` is an array of detector-format saved items: item identity/call metadata, `kind`, `summary` (up to 280 characters), literal source `quote` (up to 1200), `sourceTurnIndex`, `elicitation`, `promptTurnIndex`, and optional original `extractionModel`/`promptVersion`. Vectors may be absent/null. A present vector requires `embeddingModel` and matching `embeddingDimensions`. Previous quotes cannot be re-grounded without their original transcripts; history validation checks structure. All history entries must have unique item IDs. Rebuild authorized history explicitly when changing embedding settings.

## Result and persistence

A successful result has:

- `status:'ok'`, validated `elderId`/`callId`, and `persistenceKey` equal to `call_` plus SHA-256 of `JSON.stringify([elderId,callId])`. Structured hashing avoids collisions when IDs contain colons.
- `items`: current extracted evidence, vectors/model/dimensions, and extraction model/prompt version. Stable item IDs hash the elder/call/kind/source-turn/quote tuple.
- `historyUpdates`: **only** eligible historical items newly embedded during this run, preserving their source call IDs and original extraction provenance. Compatible cached items are not returned again here.
- `matches`: one entry per current item, including kind, elicitation, repeat flag, similarity, eligible count, best `candidateItemId`/`candidateCallId`, and `matchedItemId`/`matchedCallId` only for repeats. No prior candidate means null score and links, never a repeat even at threshold zero.
- `counts`: integer `total`, `unprompted`, `prompted`, `uncertain`, `stories`, and `questions`, counting repeats only.
- `provenance`: detector version `1.0.0`, extraction model (null when not invoked), prompt version `remi-items-v1`, embedding settings, threshold, and `isSimulated`.

There is no raw transcript in the result, but source quotes and summaries remain sensitive. An unavailable result contains `items:[]`, `historyUpdates:[]`, `matches:[]`, `counts:null`, safe `{code,message}`, and validated identifiers or null. It has no persistence key and must not replace a measured result with a false zero.

The module enforces no durable idempotency or storage transaction. A caller must recheck current consent, call ownership/existence, and input revision, then **transactionally replace** detector-owned current-call rows/results using the persistence key and stable item IDs, never append on retry. A successful re-extraction may differ. Upsert `historyUpdates` only for still-authorized existing history; never restore deleted data from a stale job or overwrite original historical provenance. Preserve analyses owned by other backend code. Family-sharing access remains a backend responsibility.

## Existing backend mapping and pending integration

See [integration notes](../docs/superpowers/specs/2026-10-24-repeat-detector-integration.md). The checked remote `ws/bc-backend` at `b26a1c27bb517c53e19a39903600d43e04cb9edf` has `extractCall`, `embed`, and `findRepeats`, while `processCall` in `pipeline.ts` remains a stub that marks calls done. It is a TypeScript backend using `OPENAI_EXTRACT_MODEL`/`OPENAI_EMBED_MODEL`. Existing extraction/fun-fact output is separate from this narrower, evidence-bearing detector. This module does not replace those adapters or edit the backend, agent, frontend, or database schema.

Existing `docs/contracts.md` topics columns can represent IDs, elder/call IDs, kind, summary, embedding JSON, repeat-of links, and simulated status. They do not yet express uncertain elicitation, source evidence, embedding model/dimensions, prompt version, or detector version. Their older summary limit of 140 differs from this module's 280; never silently truncate already embedded descriptions. Agree an additive storage contract with Siyuan before production wiring.

Keep all-label totals and kind/elicitation buckets distinguishable. Do not put the combined total into the old caller-initiated `repeat_stories` marker in `call_markers`. Save full links and provenance alongside appropriately mapped counts. Existing family-facing authorization and filtering still apply.

Legacy topics without quotes, source indices, or known embedding metadata cannot be assumed to be detector-format records. Reprocess authorized full transcripts chronologically with consistent settings, or agree an explicit enrichment/adapter step. Never invent source evidence or infer an embedding model from vector dimensions.

## Verification and remaining work

Tests use controlled OpenAI-shaped HTTP responses with production extraction, embedding, comparison, and classification code. Coverage includes chronological two-call replay, all labels and kinds, consent/no-network behavior, empty calls, history eligibility and lazy embedding, incompatible cache rejection, provider/cache failures, threshold behavior, retry identities, collision-free persistence keys, TypeScript declarations, and private CLI output. These tests validate mechanics and integration, not real-model incident recognition.

Task 2 (labeled fictional calls) and task 3 (threshold tuning/evaluation) remain deferred. Keep golden labels outside extraction input and embedding summaries. Evaluation should tune on one split and report held-out precision/recall, false positives/negatives, and dataset size. Within-call semantic deduplication and elicitation accuracy rely on extraction quality and need this evaluation. Long-term runtime/storage cost and false-positive behavior also need measurement. Live provider verification remains blocked until the user supplies credentials and runs an authorized test; no other project's secrets should be reused.
