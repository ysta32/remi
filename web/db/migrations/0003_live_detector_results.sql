-- Real-call evidence is independent of frozen synthetic batches.
CREATE TABLE live_detector_results (
  call_id TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  prefix_hash TEXT NOT NULL,
  history_hash TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  analyzed_at TEXT NOT NULL
);
