-- Manual migration — Phase 1 of the once.film-inspired Photo Moments
-- redesign. Adds the upload window (open/close), the reveal date, the
-- per-device shot limit, and a device_id fingerprint on event_photos.
--
-- All columns are nullable so legacy moments-enabled plans keep working
-- exactly as before (NULL window = always open, NULL reveal = visible
-- immediately, NULL limit = unlimited).
--
-- Run with psql against the prod DATABASE_URL:
--   psql "$DATABASE_URL" -f src/lib/db/migrations/manual/0008_moments_phase_1.sql

BEGIN;

ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_open_at" timestamp,
  ADD COLUMN IF NOT EXISTS "moments_close_at" timestamp,
  ADD COLUMN IF NOT EXISTS "moments_reveal_at" timestamp,
  ADD COLUMN IF NOT EXISTS "moments_shot_limit" integer;

ALTER TABLE "event_photos"
  ADD COLUMN IF NOT EXISTS "device_id" text;

-- Per-device shot-count lookups happen on every guest upload; an index
-- on (plan_id, device_id) makes the count() fast even on big galleries.
CREATE INDEX IF NOT EXISTS "idx_event_photos_plan_device"
  ON "event_photos" ("plan_id", "device_id")
  WHERE "device_id" IS NOT NULL;

COMMIT;
