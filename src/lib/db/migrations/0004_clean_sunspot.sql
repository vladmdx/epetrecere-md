CREATE TYPE "public"."checklist_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'accepted', 'declined', 'maybe');--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"priority" "checklist_priority" DEFAULT 'medium' NOT NULL,
	"due_days_before" integer,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"user_id" uuid,
	"url" text NOT NULL,
	"caption" text,
	"tagged_artist_id" integer,
	"tagged_venue_id" integer,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"event_type" text,
	"event_date" date,
	"location" text,
	"guest_count_target" integer,
	"budget_target" integer,
	"seats_per_table" integer DEFAULT 10,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"group" text,
	"plus_ones" integer DEFAULT 0 NOT NULL,
	"dietary" text,
	"rsvp" "rsvp_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_id" integer NOT NULL,
	"guest_id" integer NOT NULL,
	"seat_number" integer,
	CONSTRAINT "seat_assignments_guest_id_unique" UNIQUE("guest_id")
);
--> statement-breakpoint
CREATE TABLE "seating_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"name" text NOT NULL,
	"seats" integer DEFAULT 10 NOT NULL,
	"pos_x" integer,
	"pos_y" integer,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_plan_id_event_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."event_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_plan_id_event_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."event_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_tagged_artist_id_artists_id_fk" FOREIGN KEY ("tagged_artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_tagged_venue_id_venues_id_fk" FOREIGN KEY ("tagged_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_plans" ADD CONSTRAINT "event_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_list" ADD CONSTRAINT "guest_list_plan_id_event_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."event_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_table_id_seating_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."seating_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_guest_id_guest_list_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_tables" ADD CONSTRAINT "seating_tables_plan_id_event_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."event_plans"("id") ON DELETE cascade ON UPDATE no action;