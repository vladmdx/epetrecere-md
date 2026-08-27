-- legal_acceptances: make the signed-contract evidence actually survive.
--
-- Three code comments claimed this table was "append-only at the database
-- level". Nothing enforced it: no trigger, no rule, no revoked grant — and
-- `user_id` was ON DELETE CASCADE, so /api/me/delete-account erased the proof
-- that a partner had ever signed. A signed contract that disappears when the
-- signer asks it to is the opposite of evidence.
--
-- What this migration does:
--   1. Creates the table if it is missing (it was only ever created by
--      `drizzle-kit push`, so no migration described it until now).
--   2. Turns the user_id foreign key from CASCADE into SET NULL, and drops
--      its NOT NULL. Account erasure (Law 195/2024 art. 17 / GDPR art. 17)
--      still removes the user row; the acceptance row stays, carrying its own
--      copy of the signer's name, e-mail, phone, signature image, IP,
--      user-agent and content hash, which is what the Venue Agreement
--      Anexa 2 record has to preserve. Art. 17(3) allows exactly this:
--      retention for a legal obligation and for the defence of legal claims.
--   3. Installs the append-only guard the comments always claimed:
--        - every DELETE is rejected, for every role, including the app's own
--          connection (the app connects as table owner, so a REVOKE would be
--          decorative — a trigger is not);
--        - every UPDATE is rejected too, with exactly two carve-outs:
--            a) a linkage column being cleared to NULL, which is what the
--               ON DELETE SET NULL foreign keys do when a user / artist /
--               venue row is deleted;
--            b) artist_id or venue_id going from NULL to an id — the
--               backfill in register-artist / register-venue, which links a
--               signature to the profile that is created seconds after it.
--          A linkage column can never be re-pointed from one id to another,
--          and user_id can never be set (only cleared), so a signature can
--          never be re-attributed to a different account.
--      Everything evidentiary — signature_name, signature_image, ip_address,
--      user_agent, content_hash, accepted_at, the document slug and version —
--      is frozen the moment the row is written.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "legal_acceptances" (
  "id" serial PRIMARY KEY,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "subject_type" text NOT NULL,
  "artist_id" integer REFERENCES "artists"("id") ON DELETE SET NULL,
  "venue_id" integer REFERENCES "venues"("id") ON DELETE SET NULL,
  "document_slug" text NOT NULL,
  "document_version" text NOT NULL,
  "pack_version" text NOT NULL,
  "locale" text NOT NULL,
  "signature_name" text NOT NULL,
  "signature_image" text,
  "representative_role" text,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "email" text,
  "phone" text,
  "content_hash" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "legal_acceptances_unique"
  ON "legal_acceptances" ("user_id", "subject_type", "document_slug", "document_version");

CREATE INDEX IF NOT EXISTS "legal_acceptances_user_idx"
  ON "legal_acceptances" ("user_id");

-- (2) user_id: NOT NULL → nullable, CASCADE → SET NULL.
ALTER TABLE "legal_acceptances" ALTER COLUMN "user_id" DROP NOT NULL;

DO $$
DECLARE
  fk_name text;
BEGIN
  -- Look the constraint up by column rather than by name: on prod it was
  -- created by `drizzle-kit push`, so the name is not guaranteed.
  SELECT con.conname INTO fk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE ns.nspname = 'public'
    AND rel.relname = 'legal_acceptances'
    AND con.contype = 'f'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'user_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.legal_acceptances DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.legal_acceptances
    ADD CONSTRAINT legal_acceptances_user_id_users_id_fk
    FOREIGN KEY ("user_id") REFERENCES public.users("id") ON DELETE SET NULL;
END
$$;

-- (3) The append-only guard.
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be deleted (id=%)',
      OLD.id
      USING ERRCODE = '42501';
  END IF;

  -- Everything that is not a linkage column must be byte-identical.
  IF (to_jsonb(NEW) - 'user_id' - 'artist_id' - 'venue_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'user_id' - 'artist_id' - 'venue_id') THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: the signature record cannot be modified (id=%)',
      OLD.id
      USING ERRCODE = '42501';
  END IF;

  -- user_id may only be cleared (by ON DELETE SET NULL), never assigned.
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be re-assigned to another account (id=%)',
      OLD.id
      USING ERRCODE = '42501';
  END IF;

  -- artist_id / venue_id may be set once (NULL → id) or cleared by the
  -- foreign key, never swapped for a different profile.
  IF (OLD.artist_id IS NOT NULL AND NEW.artist_id IS NOT NULL
      AND NEW.artist_id <> OLD.artist_id)
     OR (OLD.venue_id IS NOT NULL AND NEW.venue_id IS NOT NULL
      AND NEW.venue_id <> OLD.venue_id) THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be moved to another profile (id=%)',
      OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS legal_acceptances_append_only ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_append_only();

-- The live database already carried an older trigger under the name
-- `legal_acceptances_no_update`, pointing at this same function — which the
-- repo had no record of, and which is why the artist_id/venue_id backfill in
-- register-artist/register-venue had never once succeeded: its body rejected
-- every UPDATE, and the call site swallowed the error in a try/catch. The
-- CREATE OR REPLACE above already fixed the behaviour for both names; this
-- drops the duplicate so one guard runs, under one name.
DROP TRIGGER IF EXISTS legal_acceptances_no_update ON public.legal_acceptances;
