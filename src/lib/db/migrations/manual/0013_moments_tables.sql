-- Phase 5/C3 — per-table QR rolls.
-- New text label on each photo + a JSON list of table names on the plan.

BEGIN;

ALTER TABLE "event_photos"
  ADD COLUMN IF NOT EXISTS "table_label" text;

ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "moments_tables" jsonb;

COMMIT;
