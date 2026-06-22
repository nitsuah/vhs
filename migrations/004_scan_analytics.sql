CREATE TABLE IF NOT EXISTS scan_analytics (
  id          TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  job_id      TEXT,
  ai_model    TEXT,
  image_type  TEXT,
  suggestions JSONB,
  final_title TEXT,
  final_year  TEXT,
  final_label TEXT,
  imdb_id     TEXT,
  omdb_verified BOOLEAN DEFAULT FALSE,
  action      TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_analytics_captured ON scan_analytics(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_analytics_action   ON scan_analytics(action);
