-- 0040 — Per-hall, editable rejection feedback. Apply strictly after 0039.
-- Server-only DDL source of truth; do not duplicate in supabase/migrations.
-- No shared Preview/staging/Production application by this branch.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF to_regclass('public.venue_halls') IS NULL THEN
    RAISE EXCEPTION '0040 requires public.venue_halls from migration 0028';
  END IF;
END $$;

ALTER TABLE public.venue_halls
  ADD COLUMN IF NOT EXISTS review_reason text;

DO $$
DECLARE reason_column record;
BEGIN
  SELECT a.atttypid, a.attnotnull, a.atthasdef
  INTO reason_column
  FROM pg_attribute a
  WHERE a.attrelid = 'public.venue_halls'::regclass
    AND a.attname = 'review_reason'
    AND NOT a.attisdropped;
  IF reason_column.atttypid IS DISTINCT FROM 'pg_catalog.text'::regtype
    OR reason_column.attnotnull IS DISTINCT FROM false
    OR reason_column.atthasdef IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'public.venue_halls.review_reason has an incompatible existing shape';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.venue_halls'::regclass
      AND conname = 'venue_halls_review_reason_length_chk'
  ) THEN
    ALTER TABLE public.venue_halls
      ADD CONSTRAINT venue_halls_review_reason_length_chk
      CHECK (review_reason IS NULL OR char_length(review_reason) <= 1000);
  END IF;
END $$;

COMMENT ON COLUMN public.venue_halls.review_reason IS
  'Latest admin rejection reason for this hall; cleared on resubmission or approval.';

ALTER TABLE public.venue_halls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venue_halls FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.venue_halls FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
