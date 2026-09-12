-- 0030 — Legal acceptance sessions, pack-scoped uniqueness, notification
-- dedupe, booking effect outbox.
--
-- Idempotent. drizzle-kit generate/push is forbidden. SQL is authoritative.
-- Do NOT apply this file to Preview or Production from this correction pass.
--
-- Why: pack 2.2 kept reguli-marketplace at document_version 1.0, the same as
-- pack 2.1. Unique indexes on (user/org, slug, document_version) made
-- onConflictDoNothing skip the colliding row, insert the rest, and freeze a
-- partial 2.2 session that onboardingAgreementStatus treats as blocked.
--
-- Recovery for any already-partial 2.2 rows: keep them as append-only
-- evidence. Do not UPDATE/DELETE signatures. After this schema lands, a
-- complete new pack session can insert because uniqueness includes
-- pack_version + acceptance_session_id. If a target already has a partial
-- current-pack session, the app refuses further writes of that pack
-- (PACK_SESSION_INCOMPLETE) until a new pack is published.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS acceptance_session_id uuid;

-- Allow a one-time NULL → uuid fill of acceptance_session_id (same carve-out
-- as artist_id / venue_id / organization_id). Everything else stays frozen.
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be deleted (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id' - 'acceptance_session_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id' - 'acceptance_session_id') THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: the signature record cannot be modified (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be re-assigned to another account (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF (OLD.artist_id IS NOT NULL AND NEW.artist_id IS NOT NULL AND NEW.artist_id <> OLD.artist_id)
     OR (OLD.venue_id IS NOT NULL AND NEW.venue_id IS NOT NULL AND NEW.venue_id <> OLD.venue_id)
     OR (OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT NULL AND NEW.organization_id <> OLD.organization_id)
     OR (OLD.acceptance_session_id IS NOT NULL AND NEW.acceptance_session_id IS NOT NULL AND NEW.acceptance_session_id <> OLD.acceptance_session_id) THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be moved to another profile (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

WITH keys AS (
  SELECT
    COALESCE(organization_id, -1) AS org_id,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid) AS uid,
    subject_type,
    pack_version,
    date_trunc('millisecond', accepted_at) AS ts,
    signature_name,
    COALESCE(md5(COALESCE(signature_image, '')), '') AS sig,
    gen_random_uuid() AS sid
  FROM legal_acceptances
  WHERE acceptance_session_id IS NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7
)
UPDATE legal_acceptances la
SET acceptance_session_id = keys.sid
FROM keys
WHERE la.acceptance_session_id IS NULL
  AND COALESCE(la.organization_id, -1) = keys.org_id
  AND COALESCE(la.user_id, '00000000-0000-0000-0000-000000000000'::uuid) = keys.uid
  AND la.subject_type = keys.subject_type
  AND la.pack_version = keys.pack_version
  AND date_trunc('millisecond', la.accepted_at) = keys.ts
  AND la.signature_name = keys.signature_name
  AND COALESCE(md5(COALESCE(la.signature_image, '')), '') = keys.sig;

UPDATE legal_acceptances
SET acceptance_session_id = gen_random_uuid()
WHERE acceptance_session_id IS NULL;

ALTER TABLE legal_acceptances
  ALTER COLUMN acceptance_session_id SET DEFAULT gen_random_uuid();
ALTER TABLE legal_acceptances
  ALTER COLUMN acceptance_session_id SET NOT NULL;

DROP INDEX IF EXISTS legal_acceptances_unique;
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_unique
  ON legal_acceptances (user_id, subject_type, document_slug, document_version, pack_version)
  WHERE organization_id IS NULL;

DROP INDEX IF EXISTS legal_acceptances_org_unique;
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_org_unique
  ON legal_acceptances (organization_id, document_slug, document_version, pack_version)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_session_document_unique
  ON legal_acceptances (acceptance_session_id, document_slug);

CREATE INDEX IF NOT EXISTS legal_acceptances_session_idx
  ON legal_acceptances (acceptance_session_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_unique
  ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_effect_outbox (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  effect_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, effect_key)
);

ALTER TABLE booking_effect_outbox ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.booking_effect_outbox FROM %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
