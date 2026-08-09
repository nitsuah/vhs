-- Drop the UNIQUE constraint on users.email.
-- The upsert in the OAuth callback conflicts on `id` (Google sub) only.
-- If two different Google accounts share the same email (e.g. after account
-- deletion and recreation), the INSERT would fail with a unique_violation on
-- email before ON CONFLICT (id) can catch it, locking that user out permanently.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
