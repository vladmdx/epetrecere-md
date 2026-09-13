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

ALTER TABLE booking_effect_outbox
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS attempts integer,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE booking_effect_outbox
SET
  status = COALESCE(status, 'pending'),
  attempts = COALESCE(attempts, 0),
  next_attempt_at = COALESCE(next_attempt_at, now()),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE status IS NULL
   OR attempts IS NULL
   OR next_attempt_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE booking_effect_outbox
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 0,
  ALTER COLUMN attempts SET NOT NULL,
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN next_attempt_at SET NOT NULL,
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

ALTER TABLE booking_effect_outbox
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_status_chk,
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_attempts_chk,
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_state_chk;

ALTER TABLE booking_effect_outbox
  ADD CONSTRAINT booking_effect_outbox_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered', 'cancelled', 'dead_letter')),
  ADD CONSTRAINT booking_effect_outbox_attempts_chk
    CHECK (attempts >= 0),
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
CREATE INDEX IF NOT EXISTS booking_effect_outbox_expired_lease_idx
  ON booking_effect_outbox (effect_key, lease_until, id)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS booking_effect_deliveries (
  id serial PRIMARY KEY,
  effect_id integer NOT NULL,
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_effect_deliveries_effect_fk
    FOREIGN KEY (effect_id) REFERENCES booking_effect_outbox(id) ON DELETE RESTRICT,
  CONSTRAINT booking_effect_deliveries_effect_recipient_channel_unique
    UNIQUE (effect_id, recipient_user_id, channel),
  CONSTRAINT booking_effect_deliveries_dedupe_unique UNIQUE (dedupe_key),
  CONSTRAINT booking_effect_deliveries_channel_chk
    CHECK (channel IN ('in_app', 'push', 'whatsapp', 'email')),
  CONSTRAINT booking_effect_deliveries_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered', 'cancelled', 'dead_letter')),
  CONSTRAINT booking_effect_deliveries_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT booking_effect_deliveries_state_chk CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND delivered_at IS NULL)
    OR (status = 'delivered' AND delivered_at IS NOT NULL AND lease_token IS NULL AND lease_until IS NULL)
    OR (status IN ('pending', 'failed', 'cancelled', 'dead_letter')
        AND delivered_at IS NULL AND lease_token IS NULL AND lease_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS booking_effect_deliveries_due_idx
  ON booking_effect_deliveries (status, next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS booking_effect_deliveries_expired_lease_idx
  ON booking_effect_deliveries (lease_until, id)
  WHERE status = 'processing';

ALTER TABLE booking_effect_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_effect_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.booking_effect_outbox FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON TABLE public.booking_effect_deliveries FROM %I',
        role_name
      );
      IF to_regclass('public.booking_effect_outbox_id_seq') IS NOT NULL THEN
        EXECUTE format(
          'REVOKE ALL ON SEQUENCE public.booking_effect_outbox_id_seq FROM %I',
          role_name
        );
      END IF;
      IF to_regclass('public.booking_effect_deliveries_id_seq') IS NOT NULL THEN
        EXECUTE format(
          'REVOKE ALL ON SEQUENCE public.booking_effect_deliveries_id_seq FROM %I',
          role_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
