-- Cross-session review queue: one row per tape per scan result
CREATE TABLE IF NOT EXISTS review_items (
  id          TEXT PRIMARY KEY,
  job_id      TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  thumb       TEXT,
  source      TEXT NOT NULL DEFAULT 'scan',
  status      TEXT NOT NULL DEFAULT 'pending',
  fail_reason TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_items_status   ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_items_created  ON review_items(created_at);
