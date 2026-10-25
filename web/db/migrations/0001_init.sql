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

CREATE INDEX idx_calls_elder_started ON calls(elder_id, started_at);
CREATE INDEX idx_topics_elder ON topics(elder_id);
CREATE INDEX idx_fun_facts_elder ON fun_facts(elder_id);
CREATE INDEX idx_call_events_call ON call_events(call_id);
