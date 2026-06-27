ALTER TABLE upload_jobs
ADD COLUMN photo_spine_bbox JSONB,
ADD COLUMN photo_face_bbox JSONB;
