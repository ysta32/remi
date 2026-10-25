# Contracts — source of truth

Every cross-workstream interface is defined here. `web/lib/types.ts` mirrors the TypeScript section exactly. Change only via the `[contract]` process in `CLAUDE.md`.

Conventions: IDs are `crypto.randomUUID()` strings. Timestamps are ISO-8601 UTC strings. In-call offsets are integer milliseconds since call start. JSON bodies are validated with zod at every boundary; invalid input → `400 {"error": "...", "issues": [...]}`.

---

## 1. Environment variables

`.env.example` at the repo root lists names with placeholder values. Real values live in `agent/.env.local` and `web/.env.local` (gitignored). Never print them.

| Var | Used by | Meaning |
|---|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | agent, Chert CLI | Same LiveKit project for both |
| `OPENAI_API_KEY` | agent (Realtime); web if `LLM_PROVIDER=openai` | |
| `AGENT_NAME` | agent, `chert dev --agent` | Dispatch name; must match exactly |
| `ECHO_API_BASE` | agent | Default `http://localhost:3000` |
| `AGENT_API_TOKEN` | agent, web | Shared bearer token for `/api/agent/*` |
| `ELDER_ID` | agent | Elder this line serves (one line = one elder) |
| `MOCK_CONTEXT` | agent | `1` = use `agent/fixtures/context.json`, no API calls |
| `CAPTURE_AUDIO` | agent | `1` = record caller audio to `tmp/calls/<callId>.wav` |
| `DEMO_MODE` | agent, web | `1` = compressed call flow; timeline shows demo hints |
| `TURN_SILENCE_MS` | agent | End-of-turn silence threshold, default `1000` |
| `LLM_PROVIDER` | web | `gemini` \| `openai` |
| `GEMINI_API_KEY` | web | If `LLM_PROVIDER=gemini` |
| `STT_PROVIDER` | web | `deepgram` \| `openai` \| `none` |
| `DEEPGRAM_API_KEY` | web | If `STT_PROVIDER=deepgram` |
| `EMBEDDINGS_PROVIDER` | web | `gemini` \| `openai` \| `none` (falls back to LLM matching) |
| `DATABASE_PATH` | web | Default `./data/echo.db` |
| `UPLOAD_DIR` | web | Default `./data/uploads` |
| `DEV_TOOLS` | web | `1` enables `/dev` page and `/api/dev/*` |
| `NEXT_PUBLIC_FACETIME_ADDRESS` | web | The Chert line's FaceTime address, shown on the setup "done" step (not a secret) |

---

## 2. Database schema (SQLite)

Drizzle schema in `web/db/schema.ts` must produce exactly these tables/columns. Booleans are `INTEGER` 0/1.

```sql
CREATE TABLE elders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,            -- "Harold Bennett"
  preferred_name TEXT NOT NULL,          -- "Hal"
  language TEXT NOT NULL CHECK (language IN ('en','zh')),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  about TEXT NOT NULL DEFAULT '',        -- family-written background, <= 600 chars
  primary_contact_name TEXT NOT NULL,    -- "Linda"
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE family_members (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL                 -- "daughter", "grandson"
);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,               -- relative to UPLOAD_DIR
  mime TEXT NOT NULL,
  caption TEXT NOT NULL,
  people TEXT NOT NULL DEFAULT '',
  last_shown_at TEXT,
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE family_questions (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  asked_by TEXT NOT NULL,                -- "Sam"
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','asked','answered')),
  asked_call_id TEXT,
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE consents (
  elder_id TEXT PRIMARY KEY REFERENCES elders(id) ON DELETE CASCADE,
  fam_summaries INTEGER NOT NULL DEFAULT 1,
  fam_fun_facts INTEGER NOT NULL DEFAULT 1,
  fam_speech_trends INTEGER NOT NULL DEFAULT 0,
  fam_mood INTEGER NOT NULL DEFAULT 0,
  elder_summaries INTEGER,               -- NULL = not yet asked
  elder_fun_facts INTEGER,
  elder_speech_trends INTEGER,
  elder_mood INTEGER,
  elder_confirmed_call_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,                   -- "First jobs"
  prompt_en TEXT NOT NULL,
  prompt_zh TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_s INTEGER,
  language TEXT NOT NULL CHECK (language IN ('en','zh')),
  status TEXT NOT NULL CHECK (status IN ('in_progress','processing','done','failed')),
  failed_step TEXT,
  error TEXT,
  end_reason TEXT,
  bridge_identity TEXT,
  theme_id TEXT,
  utterances_json TEXT,                  -- Utterance[]
  summary TEXT,
  mood_label TEXT CHECK (mood_label IN ('positive','neutral','low')),
  mood_score REAL,
  mood_evidence_json TEXT,               -- string[]
  audio_path TEXT,                       -- cleared after deletion
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE call_events (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo_shown','question_asked','consent','safety')),
  payload_json TEXT NOT NULL,
  at_ms INTEGER NOT NULL
);

CREATE TABLE fun_facts (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  question_id TEXT,
  text TEXT NOT NULL,                    -- English, family-facing
  quote TEXT NOT NULL,                   -- caller's words, original language, <= 200 chars
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('story','question')),
  summary TEXT NOT NULL,                 -- <= 140 chars, English
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('caller','agent')),
  embedding_json TEXT,                   -- number[] or NULL
  repeat_of_topic_id TEXT,
  is_simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE call_markers (
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  marker TEXT NOT NULL,                  -- MarkerKey
  value REAL,                            -- NULL when not computable
  unit TEXT NOT NULL,
  z REAL,                                -- signed so positive = concerning; NULL before baseline
  confidence TEXT NOT NULL CHECK (confidence IN ('high','low','na')),
  PRIMARY KEY (call_id, marker)
);

CREATE TABLE baselines (
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  marker TEXT NOT NULL,
  language TEXT NOT NULL,
  median REAL NOT NULL,
  mad REAL NOT NULL,
  n INTEGER NOT NULL,
  call_ids_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (elder_id, marker, language)
);

CREATE TABLE nudges (
  id TEXT PRIMARY KEY,
  elder_id TEXT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cognitive_checkup','wellbeing')),
  reason_json TEXT NOT NULL,             -- NudgeReason
  created_at TEXT NOT NULL,
  dismissed_at TEXT,
  is_simulated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE safety_events (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('self_harm','medical_emergency','other')),
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Themes seed (B inserts on migrate): First jobs · Childhood home · Favorite meals · Music and dancing · Friends and neighbors · Travel and trips · Holidays · Proud moments. Each with a one-line `prompt_en` and `prompt_zh`.

---

## 3. Shared TypeScript types (`web/lib/types.ts`)

```ts
export type Lang = 'en' | 'zh';
export type ConsentKey = 'summaries' | 'funFacts' | 'speechTrends' | 'mood';
export type ConsentMap = Record<ConsentKey, boolean>;

export interface Word { w: string; startMs: number; endMs: number }

export interface Utterance {
  speaker: 'caller' | 'agent';
  text: string;
  startMs: number;
  endMs: number;
  words?: Word[];          // caller only; present after post-call STT
}

export interface CallContext {
  elder: { id: string; displayName: string; preferredName: string; language: Lang; timezone: string; about: string };
  family: { primaryContactName: string; members: { name: string; relation: string }[] };
  consent: { proposed: ConsentMap; elderConfirmed: boolean; effective: ConsentMap };
  lastCall: { id: string; endedAt: string; summary: string } | null;
  knownFacts: string[];    // <= 10 most recent fun_facts.text
  recentStories: string[]; // <= 8 caller-initiated story summaries, last 14 days (continuity only)
  photos: { id: string; caption: string; people: string; imageUrl: string }[]; // <= 5, least recently shown first
  familyQuestion: { id: string; text: string; askedBy: string } | null;       // oldest pending
  theme: { id: string; title: string; prompt: string };                       // prompt in elder's language
  isFirstCall: boolean;
  demoMode: boolean;
}

export type CallEvent =
  | { type: 'photo_shown'; atMs: number; payload: { photoId: string } }
  | { type: 'question_asked'; atMs: number; payload: { questionId: string } }
  | { type: 'consent'; atMs: number; payload: Partial<ConsentMap> }
  | { type: 'safety'; atMs: number; payload: { category: 'self_harm' | 'medical_emergency' | 'other'; note: string } };

export type MarkerKey =
  | 'speech_rate' | 'pause_rate' | 'mean_pause_ms' | 'wfp_rate'
  | 'filler_rate' | 'vague_rate' | 'mattr' | 'repeat_stories';
export type MarkerGroup = 'pace' | 'pauses' | 'words' | 'repetition';

export interface MarkerResult {
  marker: MarkerKey;
  value: number | null;
  unit: string;                       // 'wpm' | 'cpm' | 'per100w' | 'per100c' | 'ms' | 'ratio' | 'count'
  confidence: 'high' | 'low' | 'na';
}

export interface NudgeReason {
  weeks: { isoWeek: string; driftingGroups: MarkerGroup[]; markerZ: Partial<Record<MarkerKey, number>> }[];
  plainLanguage: string[];            // e.g. "speaking a bit more slowly than usual"
}

export interface CallCard {
  id: string;
  startedAt: string;
  durationS: number | null;
  status: 'in_progress' | 'processing' | 'done' | 'failed';
  summary: string | null;             // null unless summaries consented
  photosShown: { id: string; caption: string }[];
  familyQuestion: { text: string; askedBy: string; answer: string | null } | null;
  mood: 'positive' | 'neutral' | 'low' | null; // null unless mood consented
  isSimulated: boolean;
}

export interface MarkerSeries {
  key: MarkerKey;
  label: string;
  explainer: string;                  // one plain-language sentence
  unit: string;
  concern: 'up' | 'down';
  group: MarkerGroup;
  baseline: { median: number; mad: number; n: number } | null;
  points: { callId: string; at: string; value: number | null; z: number | null; confidence: 'high' | 'low' | 'na'; isSimulated: boolean }[];
}

export interface Timeline {
  elder: { id: string; displayName: string; preferredName: string; language: Lang };
  consent: { proposed: ConsentMap; elderConfirmed: boolean; effective: ConsentMap };
  calls: CallCard[];                  // newest first
  funFacts: { id: string; text: string; quote: string; askedBy: string | null; at: string; isSimulated: boolean }[]; // [] unless consented
  markers: MarkerSeries[];            // [] unless speechTrends consented
  repeats: { summary: string; dates: string[]; isSimulated: boolean }[]; // [] unless speechTrends consented
  nudges: { id: string; type: 'cognitive_checkup' | 'wellbeing'; createdAt: string; message: string; link: string | null; isSimulated: boolean }[];
  processing: boolean;
  generatedAt: string;
}
```

Consent semantics: `effective[k] = proposed[k] && elder_k === 1`. If the elder has not been asked (`NULL`), effective is `false`. `elderConfirmed` = all four elder columns non-NULL.

---

## 4. Agent-facing endpoints

All require `Authorization: Bearer $AGENT_API_TOKEN` → else `401`.

### `GET /api/agent/context?elderId=<id>` → `200 CallContext`
`imageUrl` is absolute (`${origin}/api/agent/photos/<id>`). Must respond in < 300 ms locally. `404` if elder unknown.

### `GET /api/agent/photos/:id` → image bytes
Correct `Content-Type`. Sets `photos.last_shown_at` only via the `photo_shown` event, not on fetch (the agent may prefetch).

### `POST /api/agent/calls`
```json
{ "elderId": "…", "startedAt": "2026-10-25T14:02:11Z", "language": "en", "bridgeIdentity": "chert-bridge-abc123", "themeId": "…" }
```
→ `201 { "callId": "…" }`. Creates `calls` row with `status: in_progress`.

### `POST /api/agent/calls/:callId/events`
Body: one `CallEvent`. → `204`. Side effects: `photo_shown` updates `photos.last_shown_at`; `question_asked` sets question `status=asked`, `asked_call_id`; `consent` writes the provided `elder_*` columns (and `elder_confirmed_call_id`); `safety` inserts `safety_events` and logs a console warning for the operator.

### `POST /api/agent/calls/:callId/complete`
```json
{
  "endedAt": "2026-10-25T14:09:40Z",
  "endReason": "caller_hangup",
  "utterances": [
    { "speaker": "caller", "text": "Hello?", "startMs": 1200, "endMs": 1700 },
    { "speaker": "agent", "text": "Hi Hal! Good to hear you again.", "startMs": 2300, "endMs": 4100 }
  ],
  "audioPath": "/abs/path/agent/tmp/calls/<callId>.wav"
}
```
→ `202 { "status": "processing" }`. Saves utterances, computes `duration_s`, sets `status=processing`, starts the pipeline asynchronously. Idempotent: a second call with the same `callId` overwrites utterances and re-runs. `audioPath` may be `null`.

---

## 5. Family-facing endpoints

| Method + path | Body | Response |
|---|---|---|
| `GET /api/elders` | — | `{ id, displayName, preferredName }[]` |
| `POST /api/elders` | `{ displayName, preferredName, language, timezone?, about?, primaryContactName, members?: {name, relation}[] }` | `201 { id }` (also creates `consents` row with defaults) |
| `GET /api/elders/:id` | — | profile + members + photos (with `imageUrl` at `/api/photos/:id/file`) + questions + consent |
| `PATCH /api/elders/:id` | any subset of create fields | `200` profile |
| `POST /api/elders/:id/photos` | multipart: `file` (jpeg/png/heic→ convert or reject), `caption`, `people?` | `201` photo (max 8 MB) |
| `GET /api/photos/:id/file` | — | image bytes |
| `DELETE /api/photos/:id` | — | `204` (deletes file) |
| `POST /api/elders/:id/questions` | `{ text, askedBy }` | `201` question |
| `DELETE /api/questions/:id` | — | `204` |
| `PUT /api/elders/:id/consent` | `{ summaries, funFacts, speechTrends, mood }` (family-proposed) | `200 { proposed, elderConfirmed, effective }` |
| `GET /api/elders/:id/timeline` | — | `Timeline` (consent filtering done **here**, server-side) |
| `POST /api/nudges/:id/dismiss` | — | `204` |

## 6. Dev endpoints (`DEV_TOOLS=1`, else `404`)

| Method + path | Body | Effect |
|---|---|---|
| `POST /api/dev/reset` | — | Delete all rows and uploads; re-insert themes |
| `POST /api/dev/seed` | `{ "scenario": "drift" \| "stable" }` | Reset, then run `web/scripts/seed.ts` logic; returns `{ elderId }` |
| `POST /api/dev/calls/:id/process` | — | Re-run pipeline for one call |
| `GET /api/dev/status` | — | Last 20 calls with status, failed_step, error; pipeline timings |

---

## 7. Pipeline module interface (C implements, B calls)

```ts
// web/lib/analysis/pipeline.ts
export async function processCall(callId: string): Promise<void>; // never throws; writes status/failed_step/error

// Rebuild baselines, z-scores, repeat_stories counts (from topics.repeat_of_topic_id), and nudges
// for one elder from stored rows. Makes NO model calls (story matching happens in processCall).
// Used by processCall after each call and by the demo seed. Idempotent.
export async function recomputeElder(elderId: string): Promise<void>;

// web/lib/markers/index.ts  (pure, no I/O)
export function computeMarkers(utterances: Utterance[], lang: Lang): MarkerResult[]; // all keys except repeat_stories

// web/lib/analysis/timeline-helpers.ts
export function markerMeta(key: MarkerKey): { label: string; explainer: string; unit: string; concern: 'up'|'down'; group: MarkerGroup };
```

## 8. Agent fixture (`agent/fixtures/context.json`)

A valid `CallContext` for Hal (see `docs/demo.md`), with `imageUrl`s pointing at `agent/fixtures/photos/*.jpg` via `file://` paths for `MOCK_CONTEXT=1`.
