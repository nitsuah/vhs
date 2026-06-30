-- Enhanced lookup schema for OMDb improvements
-- Created to support fuzzy matching, caching, and user corrections for VHS tape metadata

-- OMDb lookups cache: stores successful OMDb API responses for faster future lookups
CREATE TABLE IF NOT EXISTS omdb_lookups (
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
  found_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  INDEX idx_title_hash (title_hash),
  INDEX idx_normalized_title (normalized_title),
  INDEX idx_source (source),
  INDEX idx_success (success)
);

-- Lookup alternatives: tracks alternative titles that matched during OMDb searches
-- Used for fuzzy matching and improving future lookup accuracy
CREATE TABLE IF NOT EXISTS lookup_alternatives (
  id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL,
  alternative_title TEXT NOT NULL,
  alternative_type TEXT NOT NULL,
  similarity REAL,
  source TEXT,
  created_at TEXT NOT NULL,
  INDEX idx_original_title (original_title),
  INDEX idx_alternative_title (alternative_title)
);

-- User corrections: stores manual title approvals/corrections from users
-- Allows community refinement of OMDb lookup results
CREATE TABLE IF NOT EXISTS user_corrections (
  id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL,
  corrected_title TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX idx_original_title (original_title),
  INDEX idx_approved (approved)
);

-- Enum type for lookup sources
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lookup_source') THEN
    CREATE TYPE lookup_source AS ENUM (
      'omdb_exact',
      'omdb_fuzzy',
      'upc',
      'openlibrary',
      'imdb',
      'ai_suggestion',
      'manual',
      'correction'
    );
  END IF;
END $$;

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_omdb_lookups_title_hash_success
  ON omdb_lookups(title_hash, success);  -- Fast lookup by title with success filtering

CREATE INDEX IF NOT EXISTS idx_omdb_lookups_normalized_title
  ON omdb_lookups(normalized_title);      -- Support fuzzy matching searches

CREATE INDEX IF NOT EXISTS idx_lookup_alternatives_original
  ON lookup_alternatives(original_title);  -- Find alternatives for titles

-- Cleanup trigger: automatically removes old lookup records to maintain database performance
CREATE OR REPLACE FUNCTION cleanup_old_lookups()
RETURNS void AS $$
BEGIN
  DELETE FROM omdb_lookups
  WHERE last_attempt < (CURRENT_TIMESTAMP - INTERVAL '30 days');

  DELETE FROM lookup_alternatives
  WHERE created_at < (CURRENT_TIMESTAMP - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;