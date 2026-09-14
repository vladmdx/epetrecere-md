-- 0031 — Durable booking-confirmation external-effect outbox.
--
-- The booking row is a coordinator. Each recipient/channel gets an immutable
-- child delivery row, so a failed email never repeats a successful push or
-- WhatsApp delivery. Existing 0030 one-shot markers are re-queued as pending.
--
-- Idempotent/self-healing. Apply with scripts/apply-sql-file.ts; never use
-- drizzle push. Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Artist deletion must preserve the booking, its financial history and its
-- durable confirmation evidence. The snapshot is populated for every legacy
-- row before the FK changes from CASCADE to SET NULL.
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS artist_name_snapshot text;

-- The original schema declared artist_id NOT NULL. ON DELETE SET NULL is not
-- usable until the column itself permits NULL, and Drizzle's current nullable
-- declaration does not alter an existing database by itself.
ALTER TABLE booking_requests
  ALTER COLUMN artist_id DROP NOT NULL;

UPDATE booking_requests AS booking
SET artist_name_snapshot = artist.name_ro
FROM artists AS artist
WHERE booking.artist_id = artist.id
  AND NULLIF(btrim(booking.artist_name_snapshot), '') IS NULL;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_requests'::regclass
      AND c.contype = 'f'
      AND (
        c.conname = 'booking_requests_artist_fk'
        OR (
          SELECT array_agg(a.attname ORDER BY k.ordinality)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) = ARRAY['artist_id']::name[]
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_requests DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  ALTER TABLE booking_requests
    ADD CONSTRAINT booking_requests_artist_fk
    FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL;
END $$;

ALTER TABLE booking_effect_outbox
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS attempts integer,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_status text,
  ADD COLUMN IF NOT EXISTS referral_attempts integer,
  ADD COLUMN IF NOT EXISTS referral_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_last_error text,
  ADD COLUMN IF NOT EXISTS materialization_status text,
  ADD COLUMN IF NOT EXISTS materialization_attempts integer,
  ADD COLUMN IF NOT EXISTS materialization_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS materialization_last_error text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE booking_effect_outbox
SET
  status = COALESCE(status, 'pending'),
  attempts = COALESCE(attempts, 0),
  next_attempt_at = COALESCE(next_attempt_at, now()),
  referral_status = COALESCE(referral_status, 'pending'),
  referral_attempts = COALESCE(referral_attempts, 0),
  referral_next_attempt_at = COALESCE(referral_next_attempt_at, now()),
  materialization_status = COALESCE(materialization_status, 'pending'),
  materialization_attempts = COALESCE(materialization_attempts, 0),
  materialization_next_attempt_at = COALESCE(materialization_next_attempt_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

-- Preserve logical statuses while repairing invalid technical state left by a
-- partial/old 0031 application.
UPDATE booking_effect_outbox
SET
  lease_token = CASE
    WHEN status = 'processing' THEN COALESCE(lease_token, gen_random_uuid())
    ELSE NULL
  END,
  lease_until = CASE
    WHEN status = 'processing' THEN COALESCE(lease_until, now())
    ELSE NULL
  END,
  delivered_at = CASE
    WHEN status = 'delivered' THEN COALESCE(delivered_at, updated_at, now())
    ELSE NULL
  END;

ALTER TABLE booking_effect_outbox
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 0,
  ALTER COLUMN attempts SET NOT NULL,
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN next_attempt_at SET NOT NULL,
  ALTER COLUMN referral_status SET DEFAULT 'pending',
  ALTER COLUMN referral_status SET NOT NULL,
  ALTER COLUMN referral_attempts SET DEFAULT 0,
  ALTER COLUMN referral_attempts SET NOT NULL,
  ALTER COLUMN referral_next_attempt_at SET DEFAULT now(),
  ALTER COLUMN referral_next_attempt_at SET NOT NULL,
  ALTER COLUMN materialization_status SET DEFAULT 'pending',
  ALTER COLUMN materialization_status SET NOT NULL,
  ALTER COLUMN materialization_attempts SET DEFAULT 0,
  ALTER COLUMN materialization_attempts SET NOT NULL,
  ALTER COLUMN materialization_next_attempt_at SET DEFAULT now(),
  ALTER COLUMN materialization_next_attempt_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- 0030 originally let PostgreSQL invent the UNIQUE constraint name and used
-- ON DELETE CASCADE. Normalize both definitions so schema.ts, clean installs
-- and upgraded installs converge to exactly the same shape.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_outbox'::regclass
      AND c.contype = 'u'
      AND (
        c.conname = 'booking_effect_outbox_booking_key_unique'
        OR (
          SELECT array_agg(a.attname ORDER BY k.ordinality)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) = ARRAY['booking_id', 'effect_key']::name[]
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_outbox DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  ALTER TABLE booking_effect_outbox
    ADD CONSTRAINT booking_effect_outbox_booking_key_unique
    UNIQUE (booking_id, effect_key);

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_outbox'::regclass
      AND c.contype = 'f'
      AND (
        c.conname = 'booking_effect_outbox_booking_fk'
        OR (
          SELECT array_agg(a.attname ORDER BY k.ordinality)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) = ARRAY['booking_id']::name[]
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_outbox DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  ALTER TABLE booking_effect_outbox
    ADD CONSTRAINT booking_effect_outbox_booking_fk
    FOREIGN KEY (booking_id) REFERENCES booking_requests(id) ON DELETE RESTRICT;
END $$;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_outbox'::regclass
      AND c.contype = 'c'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_outbox DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE booking_effect_outbox
  ADD CONSTRAINT booking_effect_outbox_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered', 'cancelled', 'dead_letter')),
  ADD CONSTRAINT booking_effect_outbox_attempts_chk
    CHECK (attempts >= 0),
  ADD CONSTRAINT booking_effect_outbox_step_status_chk
    CHECK (
      referral_status IN ('pending', 'failed', 'delivered', 'dead_letter')
      AND materialization_status IN ('pending', 'failed', 'delivered', 'dead_letter')
    ),
  ADD CONSTRAINT booking_effect_outbox_step_attempts_chk
    CHECK (referral_attempts >= 0 AND materialization_attempts >= 0),
  ADD CONSTRAINT booking_effect_outbox_state_chk
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND delivered_at IS NULL)
      OR (status = 'delivered' AND delivered_at IS NOT NULL AND lease_token IS NULL AND lease_until IS NULL)
      OR (status IN ('pending', 'failed', 'cancelled', 'dead_letter')
          AND delivered_at IS NULL AND lease_token IS NULL AND lease_until IS NULL)
    );

DROP INDEX IF EXISTS booking_effect_outbox_due_idx;
CREATE INDEX booking_effect_outbox_due_idx
  ON booking_effect_outbox (effect_key, status, next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
DROP INDEX IF EXISTS booking_effect_outbox_expired_lease_idx;
CREATE INDEX booking_effect_outbox_expired_lease_idx
  ON booking_effect_outbox (effect_key, lease_until, id)
  WHERE status = 'processing';

-- CREATE TABLE IF NOT EXISTS alone does not repair an old/partial 0031 table.
-- Start with the stable identity column, add every missing column, normalize
-- technical state, then recreate every owned constraint and index by shape.
CREATE TABLE IF NOT EXISTS booking_effect_deliveries (
  id serial PRIMARY KEY
);

ALTER TABLE booking_effect_deliveries
  ADD COLUMN IF NOT EXISTS effect_id integer,
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS attempts integer,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE booking_effect_deliveries
SET
  status = COALESCE(status, 'pending'),
  attempts = COALESCE(attempts, 0),
  next_attempt_at = COALESCE(next_attempt_at, now()),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

UPDATE booking_effect_deliveries
SET
  lease_token = CASE
    WHEN status IN ('processing', 'dispatching')
      THEN COALESCE(lease_token, gen_random_uuid())
    ELSE NULL
  END,
  lease_until = CASE
    WHEN status IN ('processing', 'dispatching')
      THEN COALESCE(lease_until, now())
    ELSE NULL
  END,
  dispatch_started_at = CASE
    WHEN status = 'dispatching'
      THEN COALESCE(dispatch_started_at, updated_at, now())
    ELSE dispatch_started_at
  END,
  delivered_at = CASE
    WHEN status = 'delivered' THEN COALESCE(delivered_at, updated_at, now())
    ELSE NULL
  END;

ALTER TABLE booking_effect_deliveries
  ALTER COLUMN effect_id SET NOT NULL,
  ALTER COLUMN recipient_user_id SET NOT NULL,
  ALTER COLUMN channel SET NOT NULL,
  ALTER COLUMN dedupe_key SET NOT NULL,
  ALTER COLUMN payload SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 0,
  ALTER COLUMN attempts SET NOT NULL,
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN next_attempt_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
DECLARE constraint_name text;
DECLARE primary_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
  INTO primary_definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
    AND c.contype = 'p';

  IF primary_definition IS NULL THEN
    ALTER TABLE booking_effect_deliveries
      ADD CONSTRAINT booking_effect_deliveries_pkey PRIMARY KEY (id);
  ELSIF primary_definition <> 'PRIMARY KEY (id)'
        OR NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
            AND c.contype = 'p'
            AND c.conname = 'booking_effect_deliveries_pkey'
        ) THEN
    FOR constraint_name IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
        AND c.contype = 'p'
    LOOP
      EXECUTE format(
        'ALTER TABLE public.booking_effect_deliveries DROP CONSTRAINT %I',
        constraint_name
      );
    END LOOP;
    ALTER TABLE booking_effect_deliveries
      ADD CONSTRAINT booking_effect_deliveries_pkey PRIMARY KEY (id);
  END IF;

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
      AND c.contype = 'f'
      AND (
        c.conname = 'booking_effect_deliveries_effect_fk'
        OR (
          SELECT array_agg(a.attname ORDER BY k.ordinality)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) = ARRAY['effect_id']::name[]
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_deliveries DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
      AND c.contype = 'u'
      AND (
        c.conname IN (
          'booking_effect_deliveries_effect_recipient_channel_unique',
          'booking_effect_deliveries_dedupe_unique'
        )
        OR (
          SELECT array_agg(a.attname ORDER BY k.ordinality)
          FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        ) IN (
          ARRAY['effect_id', 'recipient_user_id', 'channel']::name[],
          ARRAY['dedupe_key']::name[]
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_deliveries DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.booking_effect_deliveries'::regclass
      AND c.contype = 'c'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.booking_effect_deliveries DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE booking_effect_deliveries
  ADD CONSTRAINT booking_effect_deliveries_effect_fk
    FOREIGN KEY (effect_id) REFERENCES booking_effect_outbox(id) ON DELETE RESTRICT,
  ADD CONSTRAINT booking_effect_deliveries_effect_recipient_channel_unique
    UNIQUE (effect_id, recipient_user_id, channel),
  ADD CONSTRAINT booking_effect_deliveries_dedupe_unique
    UNIQUE (dedupe_key),
  ADD CONSTRAINT booking_effect_deliveries_channel_chk
    CHECK (channel IN ('in_app', 'push', 'whatsapp', 'email')),
  ADD CONSTRAINT booking_effect_deliveries_status_chk
    CHECK (status IN ('pending', 'processing', 'dispatching', 'failed', 'delivered', 'cancelled', 'dead_letter')),
  ADD CONSTRAINT booking_effect_deliveries_attempts_chk
    CHECK (attempts >= 0),
  ADD CONSTRAINT booking_effect_deliveries_state_chk
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND delivered_at IS NULL)
      OR (status = 'dispatching' AND lease_token IS NOT NULL AND lease_until IS NOT NULL
          AND dispatch_started_at IS NOT NULL AND delivered_at IS NULL)
      OR (status = 'delivered' AND delivered_at IS NOT NULL AND lease_token IS NULL AND lease_until IS NULL)
      OR (status IN ('pending', 'failed', 'cancelled', 'dead_letter')
          AND delivered_at IS NULL AND lease_token IS NULL AND lease_until IS NULL)
    );

DROP INDEX IF EXISTS booking_effect_deliveries_due_idx;
CREATE INDEX booking_effect_deliveries_due_idx
  ON booking_effect_deliveries (status, next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
DROP INDEX IF EXISTS booking_effect_deliveries_expired_lease_idx;
CREATE INDEX booking_effect_deliveries_expired_lease_idx
  ON booking_effect_deliveries (lease_until, id)
  WHERE status IN ('processing', 'dispatching');

ALTER TABLE booking_effect_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_effect_deliveries ENABLE ROW LEVEL SECURITY;

-- These are server-only tables. Revoke table, column and sequence privileges
-- from PUBLIC, the Data API roles and every inherited parent role so effective
-- access is zero even when an older deployment granted through membership.
DO $$
DECLARE target_table text;
DECLARE sequence_name text;
DECLARE role_name text;
DECLARE column_list text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'booking_effect_outbox',
    'booking_effect_deliveries'
  ] LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO column_list
    FROM pg_attribute a
    WHERE a.attrelid = format('public.%I', target_table)::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',
      target_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC',
      column_list,
      target_table
    );

    FOR role_name IN
      WITH RECURSIVE inherited_roles AS (
        SELECT r.oid, r.rolname
        FROM pg_roles r
        WHERE r.rolname IN ('anon', 'authenticated')
        UNION
        SELECT parent.oid, parent.rolname
        FROM inherited_roles child
        JOIN pg_auth_members membership ON membership.member = child.oid
        JOIN pg_roles parent ON parent.oid = membership.roleid
      )
      SELECT DISTINCT inherited_roles.rolname
      FROM inherited_roles
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        target_table,
        role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I',
        column_list,
        target_table,
        role_name
      );
    END LOOP;
  END LOOP;

  FOREACH sequence_name IN ARRAY ARRAY[
    'booking_effect_outbox_id_seq',
    'booking_effect_deliveries_id_seq'
  ] LOOP
    IF to_regclass(format('public.%I', sequence_name)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC',
        sequence_name
      );
      FOR role_name IN
        WITH RECURSIVE inherited_roles AS (
          SELECT r.oid, r.rolname
          FROM pg_roles r
          WHERE r.rolname IN ('anon', 'authenticated')
          UNION
          SELECT parent.oid, parent.rolname
          FROM inherited_roles child
          JOIN pg_auth_members membership ON membership.member = child.oid
          JOIN pg_roles parent ON parent.oid = membership.roleid
        )
        SELECT DISTINCT inherited_roles.rolname
        FROM inherited_roles
      LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
          sequence_name,
          role_name
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
