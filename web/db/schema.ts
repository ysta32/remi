// Drizzle mirror of db/migrations/0001_init.sql (contracts §2), for typed queries only.
// The DDL itself comes from the SQL file; test/schema-parity.test.ts keeps the two in sync.
import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

export const elders = sqliteTable('elders', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  preferredName: text('preferred_name').notNull(),
  language: text('language', { enum: ['en', 'zh'] }).notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  about: text('about').notNull().default(''),
  primaryContactName: text('primary_contact_name').notNull(),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const familyMembers = sqliteTable('family_members', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  relation: text('relation').notNull(),
});

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  mime: text('mime').notNull(),
  caption: text('caption').notNull(),
  people: text('people').notNull().default(''),
  lastShownAt: text('last_shown_at'),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const familyQuestions = sqliteTable('family_questions', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  askedBy: text('asked_by').notNull(),
  status: text('status', { enum: ['pending', 'asked', 'answered'] }).notNull().default('pending'),
  askedCallId: text('asked_call_id'),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const consents = sqliteTable('consents', {
  elderId: text('elder_id').primaryKey().references(() => elders.id, { onDelete: 'cascade' }),
  famSummaries: integer('fam_summaries').notNull().default(1),
  famFunFacts: integer('fam_fun_facts').notNull().default(1),
  famSpeechTrends: integer('fam_speech_trends').notNull().default(0),
  famMood: integer('fam_mood').notNull().default(0),
  elderSummaries: integer('elder_summaries'),
  elderFunFacts: integer('elder_fun_facts'),
  elderSpeechTrends: integer('elder_speech_trends'),
  elderMood: integer('elder_mood'),
  elderConfirmedCallId: text('elder_confirmed_call_id'),
  updatedAt: text('updated_at').notNull(),
});

export const themes = sqliteTable('themes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  promptEn: text('prompt_en').notNull(),
  promptZh: text('prompt_zh').notNull(),
  sort: integer('sort').notNull(),
});

export const calls = sqliteTable('calls', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  durationS: integer('duration_s'),
  language: text('language', { enum: ['en', 'zh'] }).notNull(),
  status: text('status', { enum: ['in_progress', 'processing', 'done', 'failed'] }).notNull(),
  failedStep: text('failed_step'),
  error: text('error'),
  endReason: text('end_reason'),
  bridgeIdentity: text('bridge_identity'),
  themeId: text('theme_id'),
  utterancesJson: text('utterances_json'),
  summary: text('summary'),
  moodLabel: text('mood_label', { enum: ['positive', 'neutral', 'low'] }),
  moodScore: real('mood_score'),
  moodEvidenceJson: text('mood_evidence_json'),
  audioPath: text('audio_path'),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const callEvents = sqliteTable('call_events', {
  id: text('id').primaryKey(),
  callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['photo_shown', 'question_asked', 'consent', 'safety'] }).notNull(),
  payloadJson: text('payload_json').notNull(),
  atMs: integer('at_ms').notNull(),
});

export const funFacts = sqliteTable('fun_facts', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
  questionId: text('question_id'),
  text: text('text').notNull(),
  quote: text('quote').notNull(),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['story', 'question'] }).notNull(),
  summary: text('summary').notNull(),
  initiatedBy: text('initiated_by', { enum: ['caller', 'agent'] }).notNull(),
  embeddingJson: text('embedding_json'),
  repeatOfTopicId: text('repeat_of_topic_id'),
  isSimulated: integer('is_simulated').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const callMarkers = sqliteTable(
  'call_markers',
  {
    callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
    marker: text('marker').notNull(),
    value: real('value'),
    unit: text('unit').notNull(),
    z: real('z'),
    confidence: text('confidence', { enum: ['high', 'low', 'na'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.callId, t.marker] })],
);

export const baselines = sqliteTable(
  'baselines',
  {
    elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
    marker: text('marker').notNull(),
    language: text('language').notNull(),
    median: real('median').notNull(),
    mad: real('mad').notNull(),
    n: integer('n').notNull(),
    callIdsJson: text('call_ids_json').notNull(),
    computedAt: text('computed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.elderId, t.marker, t.language] })],
);

export const nudges = sqliteTable('nudges', {
  id: text('id').primaryKey(),
  elderId: text('elder_id').notNull().references(() => elders.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['cognitive_checkup', 'wellbeing'] }).notNull(),
  reasonJson: text('reason_json').notNull(),
  createdAt: text('created_at').notNull(),
  dismissedAt: text('dismissed_at'),
  isSimulated: integer('is_simulated').notNull().default(0),
});

export const safetyEvents = sqliteTable('safety_events', {
  id: text('id').primaryKey(),
  callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
  category: text('category', { enum: ['self_harm', 'medical_emergency', 'other'] }).notNull(),
  note: text('note').notNull(),
  createdAt: text('created_at').notNull(),
});

export const detectorResults = sqliteTable('detector_results', {
  callId: text('call_id').primaryKey().references(() => calls.id, { onDelete: 'cascade' }),
  corpusHash: text('corpus_hash').notNull(),
  settingsHash: text('settings_hash').notNull(),
  resultJson: text('result_json').notNull(),
  analyzedAt: text('analyzed_at').notNull(),
});

export const liveDetectorResults = sqliteTable('live_detector_results', {
  callId: text('call_id').primaryKey().references(() => calls.id, { onDelete: 'cascade' }),
  prefixHash: text('prefix_hash').notNull(),
  historyHash: text('history_hash').notNull(),
  settingsHash: text('settings_hash').notNull(),
  resultJson: text('result_json').notNull(),
  analyzedAt: text('analyzed_at').notNull(),
});
