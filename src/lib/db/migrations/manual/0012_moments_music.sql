-- Phase 5/C1 — slideshow background music. Owner pastes a direct
-- audio URL; slideshow page loops it via <audio>. NULL = silent.

BEGIN;

ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_music_url" text;

COMMIT;
