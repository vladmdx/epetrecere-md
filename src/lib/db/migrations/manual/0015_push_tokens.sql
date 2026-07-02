-- 0015 — push_tokens (Expo push notification tokens for the mobile app).
--
-- Why a hand-written idempotent migration instead of `drizzle-kit push`:
-- push stalls on an interactive prompt about the users.referral_code
-- unique constraint, so it can't run non-interactively / in CI. This file
-- creates only the push_tokens table and its indexes, guarded so it's safe
-- to run (and re-run) against prod. It mirrors `pushTokens` in
-- src/lib/db/schema.ts exactly — keep the two in sync.
--
-- Apply with:
--   DATABASE_URL=… npx tsx scripts/apply-sql-file.ts \
--     src/lib/db/migrations/manual/0015_push_tokens.sql
-- or:
--   psql "$DATABASE_URL" -f src/lib/db/migrations/manual/0015_push_tokens.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "expo_token" text NOT NULL,
  "platform" text NOT NULL,
  "device_label" text,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- FK → users(id) ON DELETE CASCADE. Constraint name matches Drizzle's
-- default convention so a future `drizzle-kit push` sees it as present.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'push_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "push_tokens"
      ADD CONSTRAINT "push_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_push_token_unique"
  ON "push_tokens" ("expo_token");
CREATE INDEX IF NOT EXISTS "idx_push_user"
  ON "push_tokens" ("user_id");

COMMIT;
