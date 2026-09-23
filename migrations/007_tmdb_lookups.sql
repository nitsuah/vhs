-- TMDb lookups cache: stores successful TMDb API responses for faster future lookups
-- Mirrors omdb_lookups structure for consistency

CREATE TABLE IF NOT EXISTS tmdb_lookups (
  id TEXT PRIMARY KEY,
  title_hash TEXT NOT NULL,
  original_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  lookup_data JSONB NOT NULL,
  year TEXT,
  label TEXT,
  imdb_id TEXT,
  poster TEXT,
  genres TEXT[],
  source TEXT NOT NULL,
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_tmdb_lookups_title_hash
  ON tmdb_lookups(title_hash);

CREATE INDEX IF NOT EXISTS idx_tmdb_lookups_normalized_title
  ON tmdb_lookups(normalized_title);

CREATE INDEX IF NOT EXISTS idx_tmdb_lookups_source
  ON tmdb_lookups(source);

CREATE INDEX IF NOT EXISTS idx_tmdb_lookups_success
  ON tmdb_lookups(success);

CREATE INDEX IF NOT EXISTS idx_tmdb_lookups_title_hash_success
  ON tmdb_lookups(title_hash, success);

-- Cleanup function: removes old TMDb lookup records
CREATE OR REPLACE FUNCTION cleanup_old_tmdb_lookups()
RETURNS void AS $$
BEGIN
  DELETE FROM tmdb_lookups
  WHERE last_attempt < (CURRENT_TIMESTAMP - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;