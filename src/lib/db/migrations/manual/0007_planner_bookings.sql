-- Manual migration — run with psql or via `npm run db:push` after pulling.
-- Adds: booking_paid_status enum, event_plan_status enum, booking negotiation
-- fields, event plan lifecycle fields, and a parallel venue_booking_requests
-- table for hall bookings (they don't count toward the budget).

BEGIN;

-- ─── New enums ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."booking_paid_status" AS ENUM ('unpaid', 'partial', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."event_plan_status" AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── booking_requests — negotiation + plan link ────────────────────────
ALTER TABLE "booking_requests"
  ADD COLUMN IF NOT EXISTS "event_plan_id" integer
    REFERENCES "event_plans"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "agreed_price" integer,
  ADD COLUMN IF NOT EXISTS "paid_status" "booking_paid_status"
    DEFAULT 'unpaid' NOT NULL,
  ADD COLUMN IF NOT EXISTS "price_offers" jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "idx_booking_event_plan"
  ON "booking_requests" ("event_plan_id");

-- ─── event_plans — lifecycle + wizard metadata ─────────────────────────
ALTER TABLE "event_plans"
  ADD COLUMN IF NOT EXISTS "venue_needed" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "selected_categories" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "status" "event_plan_status"
    DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_event_plan_user_status"
  ON "event_plans" ("user_id", "status");

-- ─── venue_booking_requests — parallel to booking_requests, for halls ──
CREATE TABLE IF NOT EXISTS "venue_booking_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "venue_id" integer NOT NULL
    REFERENCES "venues"("id") ON DELETE CASCADE,
  "event_plan_id" integer
    REFERENCES "event_plans"("id") ON DELETE SET NULL,
  "client_user_id" uuid
    REFERENCES "users"("id") ON DELETE CASCADE,
  "client_name" text NOT NULL,
  "client_phone" text NOT NULL,
  "client_email" text,
  "event_date" date NOT NULL,
  "start_time" text,
  "end_time" text,
  "event_type" text,
  "guest_count" integer,
  "message" text,
  "status" "booking_request_status" DEFAULT 'pending' NOT NULL,
  "agreed_price" integer,
  "price_offers" jsonb DEFAULT '[]'::jsonb,
  "venue_reply" text,
  "admin_notes" text,
  "admin_seen" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_venue_booking_venue_status"
  ON "venue_booking_requests" ("venue_id", "status");
CREATE INDEX IF NOT EXISTS "idx_venue_booking_client_user"
  ON "venue_booking_requests" ("client_user_id");
CREATE INDEX IF NOT EXISTS "idx_venue_booking_event_plan"
  ON "venue_booking_requests" ("event_plan_id");

COMMIT;
