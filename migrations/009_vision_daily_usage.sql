-- Daily Workers AI scan counter so vhs stays inside the free 10,000 neuron
-- allocation (resets 00:00 UTC, same as Workers AI). One row per UTC day.
CREATE TABLE IF NOT EXISTS vision_daily_usage (
  day         DATE PRIMARY KEY,
  scans       INTEGER NOT NULL DEFAULT 0,
  neurons_est NUMERIC NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
