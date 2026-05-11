-- Phase 4B — moderation toggle + per-photo favorite star.
-- All columns default to legacy behavior:
--   require_approval=false → guest uploads auto-approve (Phase 0 behavior).
--   is_favorite=false → no photo is starred until owner clicks the star.

BEGIN;

ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_require_approval" boolean DEFAULT false NOT NULL;

ALTER TABLE "event_photos"
  ADD COLUMN IF NOT EXISTS "is_favorite" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_event_photos_plan_approved"
  ON "event_photos" ("plan_id", "is_approved");

COMMIT;
