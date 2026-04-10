CREATE TYPE "public"."blog_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."booking_request_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'accepted', 'declined', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."calendar_source" AS ENUM('manual', 'google_sync', 'booking');--> statement-breakpoint
CREATE TYPE "public"."calendar_status" AS ENUM('available', 'booked', 'tentative', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('artist', 'service', 'venue');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('artist', 'venue');--> statement-breakpoint
CREATE TYPE "public"."homepage_section_type" AS ENUM('hero', 'search_bar', 'categories', 'featured_artists', 'featured_venues', 'event_planner', 'services', 'process', 'testimonials', 'stats', 'clients', 'blog', 'cta');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lead_activity_type" AS ENUM('note', 'email', 'call', 'sms', 'status_change', 'assignment');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('form', 'wizard', 'direct', 'import');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'proposal_sent', 'negotiation', 'confirmed', 'completed', 'lost', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."redirect_status" AS ENUM('301', '302');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'editor', 'artist', 'user');--> statement-breakpoint
CREATE TYPE "public"."video_platform" AS ENUM('youtube', 'vimeo');--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"context" text NOT NULL,
	"messages" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt_ro" text,
	"alt_ru" text,
	"alt_en" text,
	"sort_order" integer DEFAULT 0,
	"is_cover" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"name_ro" text NOT NULL,
	"name_ru" text,
	"name_en" text,
	"description_ro" text,
	"description_ru" text,
	"description_en" text,
	"price" integer,
	"duration_hours" real,
	"is_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"platform" "video_platform" NOT NULL,
	"video_id" text NOT NULL,
	"title" text,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name_ro" text NOT NULL,
	"name_ru" text,
	"name_en" text,
	"slug" text NOT NULL,
	"description_ro" text,
	"description_ru" text,
	"description_en" text,
	"category_ids" integer[],
	"price_from" integer,
	"price_currency" varchar(3) DEFAULT 'EUR',
	"location" text,
	"phone" text,
	"email" text,
	"website" text,
	"instagram" text,
	"facebook" text,
	"youtube" text,
	"tiktok" text,
	"rating_avg" real DEFAULT 0,
	"rating_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"calendar_enabled" boolean DEFAULT false NOT NULL,
	"buffer_hours" integer DEFAULT 2,
	"sort_order" integer DEFAULT 0,
	"seo_title_ro" text,
	"seo_title_ru" text,
	"seo_title_en" text,
	"seo_desc_ro" text,
	"seo_desc_ru" text,
	"seo_desc_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title_ro" text NOT NULL,
	"title_ru" text,
	"title_en" text,
	"slug" text NOT NULL,
	"content_ro" text,
	"content_ru" text,
	"content_en" text,
	"excerpt_ro" text,
	"excerpt_ru" text,
	"excerpt_en" text,
	"cover_image_url" text,
	"category" text,
	"tags" text[],
	"author_id" uuid,
	"status" "blog_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"seo_title_ro" text,
	"seo_title_ru" text,
	"seo_title_en" text,
	"seo_desc_ro" text,
	"seo_desc_ru" text,
	"seo_desc_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"client_user_id" uuid,
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
	"artist_reply" text,
	"admin_notes" text,
	"admin_seen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer,
	"artist_id" integer,
	"venue_id" integer,
	"event_date" date,
	"event_type" text,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"price_agreed" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" "calendar_status" DEFAULT 'available' NOT NULL,
	"booking_id" integer,
	"note" text,
	"source" "calendar_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_ro" text NOT NULL,
	"name_ru" text,
	"name_en" text,
	"slug" text NOT NULL,
	"description_ro" text,
	"description_ru" text,
	"description_en" text,
	"icon" text,
	"image_url" text,
	"price_from" integer,
	"sort_order" integer DEFAULT 0,
	"parent_id" integer,
	"type" "category_type" DEFAULT 'artist' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"seo_title_ro" text,
	"seo_title_ru" text,
	"seo_title_en" text,
	"seo_desc_ro" text,
	"seo_desc_ru" text,
	"seo_desc_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"booking_request_id" integer NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homepage_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "homepage_section_type" NOT NULL,
	"config" jsonb,
	"sort_order" integer DEFAULT 0,
	"is_visible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"type" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0,
	"processed_rows" integer DEFAULT 0,
	"error_log" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"user_id" uuid,
	"type" "lead_activity_type" NOT NULL,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone_prefix" varchar(5) DEFAULT '+373',
	"email" text,
	"event_type" text,
	"event_date" date,
	"location" text,
	"guest_count" integer,
	"budget" integer,
	"message" text,
	"source" "lead_source" DEFAULT 'form' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"assigned_to" uuid,
	"score" integer DEFAULT 0,
	"wizard_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"action_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer,
	"venue_id" integer,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"client_email" text,
	"event_type" text,
	"event_date" date,
	"message" text,
	"source" text DEFAULT 'form' NOT NULL,
	"admin_seen" boolean DEFAULT false NOT NULL,
	"admin_comment" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title_ro" text NOT NULL,
	"title_ru" text,
	"title_en" text,
	"content_ro" text,
	"content_ru" text,
	"content_en" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"seo_title_ro" text,
	"seo_title_ru" text,
	"seo_title_en" text,
	"seo_desc_ro" text,
	"seo_desc_ru" text,
	"seo_desc_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" "redirect_status" DEFAULT '301' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer,
	"venue_id" integer,
	"author_name" text NOT NULL,
	"event_type" text,
	"event_date" date,
	"rating" integer NOT NULL,
	"text" text,
	"reply" text,
	"reply_at" timestamp,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"avatar_url" text,
	"language_pref" varchar(2) DEFAULT 'ro',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venue_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"url" text NOT NULL,
	"alt_ro" text,
	"alt_ru" text,
	"alt_en" text,
	"sort_order" integer DEFAULT 0,
	"is_cover" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name_ro" text NOT NULL,
	"name_ru" text,
	"name_en" text,
	"slug" text NOT NULL,
	"description_ro" text,
	"description_ru" text,
	"description_en" text,
	"address" text,
	"city" text,
	"lat" real,
	"lng" real,
	"capacity_min" integer,
	"capacity_max" integer,
	"price_per_person" integer,
	"phone" text,
	"email" text,
	"website" text,
	"facilities" jsonb DEFAULT '[]'::jsonb,
	"menu_url" text,
	"calendar_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"rating_avg" real DEFAULT 0,
	"rating_count" integer DEFAULT 0,
	"seo_title_ro" text,
	"seo_title_ru" text,
	"seo_title_en" text,
	"seo_desc_ro" text,
	"seo_desc_ru" text,
	"seo_desc_en" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "venues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "work_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_working" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_images" ADD CONSTRAINT "artist_images_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_packages" ADD CONSTRAINT "artist_packages_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_videos" ADD CONSTRAINT "artist_videos_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_booking_request_id_booking_requests_id_fk" FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_requests" ADD CONSTRAINT "offer_requests_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_requests" ADD CONSTRAINT "offer_requests_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_images" ADD CONSTRAINT "venue_images_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;