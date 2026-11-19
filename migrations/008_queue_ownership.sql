-- Scope the scan queue to the signed-in user: owner columns on queue tables.
-- Nullable so pre-existing rows survive; legacy rows are claimed at the
-- designated owner's first sign-in (same mechanism as tapes, see 005).

ALTER TABLE upload_jobs
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_owner ON upload_jobs(owner_id);

ALTER TABLE review_items
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_review_items_owner ON review_items(owner_id);

ALTER TABLE scan_analytics
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_scan_analytics_owner ON scan_analytics(owner_id);
