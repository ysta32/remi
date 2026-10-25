-- Standalone all-history detector results, independent of legacy story markers.
CREATE TABLE detector_results (
  call_id TEXT PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  corpus_hash TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  analyzed_at TEXT NOT NULL
);
