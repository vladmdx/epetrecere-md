-- Manual migration — Phase 4A of Photo Moments.
-- Adds shot prompts (per-film mission list) + per-photo emoji reactions.
--
-- Run via the inline tsx script in apply step.

BEGIN;

-- Prompts list lives on the plan as a JSONB array of strings.
-- NULL / [] = legacy free-form mode (no missions).
ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_prompts" jsonb;

-- Each uploaded photo records which prompt it answers (when prompts mode is on).
ALTER TABLE "event_photos"
  ADD COLUMN IF NOT EXISTS "prompt" text;

CREATE TABLE IF NOT EXISTS "photo_reactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "photo_id" integer NOT NULL REFERENCES "event_photos"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "emoji" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_photo_reactions_photo"
  ON "photo_reactions" ("photo_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_photo_reactions_device_emoji"
  ON "photo_reactions" ("photo_id", "device_id", "emoji");

COMMIT;
