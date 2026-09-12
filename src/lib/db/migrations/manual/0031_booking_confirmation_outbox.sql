-- 0031 — Durable booking-confirmation external-effect outbox.
--
-- Existing 0030 rows were one-shot claim markers created before delivery.
-- Re-queue them as pending: this can repeat an external delivery once, which
-- is preferable to silently losing a confirmation. The notification table's
-- dedupe key still guarantees exactly one in-app notification row.
--
-- Idempotent. Apply with scripts/apply-sql-file.ts; never use drizzle push.

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

ALTER TABLE booking_effect_outbox
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_status_chk,
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_attempts_chk,
  DROP CONSTRAINT IF EXISTS booking_effect_outbox_state_chk;

ALTER TABLE booking_effect_outbox
  ADD CONSTRAINT booking_effect_outbox_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered')),
  ADD CONSTRAINT booking_effect_outbox_attempts_chk
    CHECK (attempts >= 0),
  ADD CONSTRAINT booking_effect_outbox_state_chk
    CHECK (
      (status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND delivered_at IS NULL)
      OR (status = 'delivered' AND delivered_at IS NOT NULL AND lease_token IS NULL AND lease_until IS NULL)
      OR (status IN ('pending', 'failed') AND delivered_at IS NULL AND lease_token IS NULL AND lease_until IS NULL)
    );

CREATE INDEX IF NOT EXISTS booking_effect_outbox_due_idx
  ON booking_effect_outbox (effect_key, status, next_attempt_at);

ALTER TABLE booking_effect_outbox ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.booking_effect_outbox FROM %I',
        role_name
      );
      IF to_regclass('public.booking_effect_outbox_id_seq') IS NOT NULL THEN
        EXECUTE format(
          'REVOKE ALL ON SEQUENCE public.booking_effect_outbox_id_seq FROM %I',
          role_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
