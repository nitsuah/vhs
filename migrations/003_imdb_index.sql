-- Fast lookup by IMDB/OMDb id stored in tape JSONB
CREATE INDEX IF NOT EXISTS idx_tapes_imdb_id
  ON tapes ((data->>'imdb_id'))
  WHERE data->>'imdb_id' IS NOT NULL;
