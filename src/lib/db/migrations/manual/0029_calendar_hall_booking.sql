-- 0029 — Calendar hall scope + booking-linked projections (ADR 0028 phase 4)
-- Idempotent. Does not rewrite historical rows. drizzle-kit generate/push is forbidden.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS hall_id integer;

CREATE INDEX IF NOT EXISTS idx_cal_booking ON calendar_events (booking_id);
CREATE INDEX IF NOT EXISTS idx_cal_hall ON calendar_events (hall_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_booking_fk') THEN
    ALTER TABLE calendar_events
      ADD CONSTRAINT calendar_events_booking_fk
      FOREIGN KEY (booking_id) REFERENCES booking_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
