-- Manual migration — Phase 3 of the once.film-inspired Photo Moments.
-- Adds the vintage filter toggle. Boolean default false so every
-- existing film keeps its original photos.
--
-- Run via:
--   npx tsx scripts/apply-migration.ts 0009_moments_vintage

BEGIN;

ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_vintage" boolean DEFAULT false NOT NULL;

COMMIT;
