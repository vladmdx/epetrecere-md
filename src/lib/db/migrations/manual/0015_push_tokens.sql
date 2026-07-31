CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expo_token" text NOT NULL,
  "platform" text NOT NULL,
  "device_label" text,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_push_token_unique"
  ON "push_tokens" ("expo_token");

CREATE INDEX IF NOT EXISTS "idx_push_user"
  ON "push_tokens" ("user_id");
