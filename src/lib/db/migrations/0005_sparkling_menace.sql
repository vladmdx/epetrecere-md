ALTER TABLE "reviews" ADD COLUMN "booking_request_id" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "author_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_request_id_unique" UNIQUE("booking_request_id");