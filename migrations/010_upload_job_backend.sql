-- Scan backend chosen in the UI (auto / workers-ai / ollama / manual) and an
-- optional Ollama model, carried from POST /api/jobs to the background worker.
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS vision_backend TEXT;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS vision_model TEXT;
