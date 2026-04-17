// Applies the planner-booking schema changes to the live Neon DB via a
// real TCP pool. Hardcoded to the 0007 migration so we don't have to
// fight PostgreSQL's lexer from JavaScript for a one-shot script.

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const statements: Array<{ label: string; sql: string }> = [
  {
    label: "enum booking_paid_status",
    sql: `DO $$ BEGIN
      CREATE TYPE "public"."booking_paid_status" AS ENUM ('unpaid', 'partial', 'paid');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
  {
    label: "enum event_plan_status",
    sql: `DO $$ BEGIN
      CREATE TYPE "public"."event_plan_status" AS ENUM ('active', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
  {
    label: "booking_requests ADD columns",
    sql: `ALTER TABLE "booking_requests"
      ADD COLUMN IF NOT EXISTS "event_plan_id" integer,
      ADD COLUMN IF NOT EXISTS "agreed_price" integer,
      ADD COLUMN IF NOT EXISTS "paid_status" "booking_paid_status" DEFAULT 'unpaid' NOT NULL,
      ADD COLUMN IF NOT EXISTS "price_offers" jsonb DEFAULT '[]'::jsonb`,
  },
  {
    label: "booking_requests FK event_plan_id (IF NOT EXISTS via DO block)",
    sql: `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'booking_requests_event_plan_id_fkey'
      ) THEN
        ALTER TABLE "booking_requests"
          ADD CONSTRAINT "booking_requests_event_plan_id_fkey"
          FOREIGN KEY ("event_plan_id") REFERENCES "event_plans"("id") ON DELETE SET NULL;
      END IF;
    END $$`,
  },
  {
    label: "idx_booking_event_plan",
    sql: `CREATE INDEX IF NOT EXISTS "idx_booking_event_plan"
      ON "booking_requests" ("event_plan_id")`,
  },
  {
    label: "event_plans ADD columns",
    sql: `ALTER TABLE "event_plans"
      ADD COLUMN IF NOT EXISTS "venue_needed" boolean DEFAULT false NOT NULL,
      ADD COLUMN IF NOT EXISTS "selected_categories" jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "status" "event_plan_status" DEFAULT 'active' NOT NULL,
      ADD COLUMN IF NOT EXISTS "archived_at" timestamp`,
  },
  {
    label: "idx_event_plan_user_status",
    sql: `CREATE INDEX IF NOT EXISTS "idx_event_plan_user_status"
      ON "event_plans" ("user_id", "status")`,
  },
  {
    label: "venue_booking_requests table",
    sql: `CREATE TABLE IF NOT EXISTS "venue_booking_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "venue_id" integer NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
      "event_plan_id" integer REFERENCES "event_plans"("id") ON DELETE SET NULL,
      "client_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
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
    )`,
  },
  {
    label: "idx_venue_booking_venue_status",
    sql: `CREATE INDEX IF NOT EXISTS "idx_venue_booking_venue_status"
      ON "venue_booking_requests" ("venue_id", "status")`,
  },
  {
    label: "idx_venue_booking_client_user",
    sql: `CREATE INDEX IF NOT EXISTS "idx_venue_booking_client_user"
      ON "venue_booking_requests" ("client_user_id")`,
  },
  {
    label: "idx_venue_booking_event_plan",
    sql: `CREATE INDEX IF NOT EXISTS "idx_venue_booking_event_plan"
      ON "venue_booking_requests" ("event_plan_id")`,
  },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  console.log(`Applying ${statements.length} statements…`);
  try {
    for (const [i, { label, sql }] of statements.entries()) {
      process.stdout.write(`  [${i + 1}/${statements.length}] ${label} … `);
      await client.query(sql);
      console.log("ok");
    }
    console.log("Done.");
  } catch (err) {
    console.log("FAILED");
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
