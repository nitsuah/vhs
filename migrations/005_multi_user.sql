-- Multi-user support: users table + owner/sharing columns on tapes

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,        -- Google "sub" claim (stable across logins)
  email          TEXT UNIQUE NOT NULL,
  display_name   TEXT,
  avatar_url     TEXT,
  share_slug     TEXT UNIQUE,             -- UUID generated on first share; NULL = never shared
  collection_public BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tapes
  ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_tapes_owner
  ON tapes(owner_id);

CREATE INDEX IF NOT EXISTS idx_users_slug
  ON users(share_slug)
  WHERE share_slug IS NOT NULL;
