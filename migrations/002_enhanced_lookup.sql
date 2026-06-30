-- Enhanced lookup schema for OMDb improvements
-- Created to support fuzzy matching, caching, and user corrections for VHS tape metadata

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
  source lookup_source NOT NULL,
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL
);

-- Lookup alternatives: tracks alternative titles that matched during OMDb searches
CREATE TABLE IF NOT EXISTS lookup_alternatives (
  id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL,
  alternative_title TEXT NOT NULL,
  alternative_type TEXT NOT NULL,
  similarity REAL,
  source lookup_source,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User corrections: stores manual title approvals/corrections from users
CREATE TABLE IF NOT EXISTS user_corrections (
  id TEXT PRIMARY KEY,
  original_title TEXT NOT NULL,
  corrected_title TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT FALSE
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_omdb_lookups_title_hash
  ON omdb_lookups(title_hash);

CREATE INDEX IF NOT EXISTS idx_omdb_lookups_normalized_title
  ON omdb_lookups(normalized_title);

CREATE INDEX IF NOT EXISTS idx_omdb_lookups_source
  ON omdb_lookups(source);

CREATE INDEX IF NOT EXISTS idx_omdb_lookups_success
  ON omdb_lookups(success);

CREATE INDEX IF NOT EXISTS idx_omdb_lookups_title_hash_success
  ON omdb_lookups(title_hash, success);

CREATE INDEX IF NOT EXISTS idx_lookup_alternatives_original_title
  ON lookup_alternatives(original_title);

CREATE INDEX IF NOT EXISTS idx_lookup_alternatives_alternative_title
  ON lookup_alternatives(alternative_title);

CREATE INDEX IF NOT EXISTS idx_user_corrections_original_title
  ON user_corrections(original_title);

CREATE INDEX IF NOT EXISTS idx_user_corrections_approved
  ON user_corrections(approved);

-- Cleanup function: removes old lookup records to maintain database performance
CREATE OR REPLACE FUNCTION cleanup_old_lookups()
RETURNS void AS $$
BEGIN
  DELETE FROM omdb_lookups
  WHERE last_attempt < (CURRENT_TIMESTAMP - INTERVAL '30 days');

  DELETE FROM lookup_alternatives
  WHERE created_at < (CURRENT_TIMESTAMP - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;
