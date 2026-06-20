-- Initial schema: tapes and upload_jobs tables
CREATE TABLE IF NOT EXISTS tapes (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  scanned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id          TEXT PRIMARY KEY,
  image_data  TEXT NOT NULL,
  thumb       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  result      JSONB,
  error       TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
