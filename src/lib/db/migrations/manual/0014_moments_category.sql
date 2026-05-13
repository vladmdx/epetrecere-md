-- Phase 5/E1 — Claude-classified photo category.
-- "ceremonie" | "dans" | "grup" | "portret" | "decor" | "mancare" |
-- "candid" | "other". NULL = not yet categorized.

BEGIN;

ALTER TABLE "event_photos"
  ADD COLUMN IF NOT EXISTS "category" text;

COMMIT;
