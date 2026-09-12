-- 0029 — Calendar hall scope + booking-linked projections (ADR 0028 phase 4)
-- Idempotent. Does not rewrite historical rows. drizzle-kit generate/push is forbidden.
--
-- hall_id integrity (correction pass):
--   * composite FK (hall_id, entity_id) → venue_halls(id, venue_id) so a venue
--     calendar row cannot point at another location's hall;
--   * CHECK: hall_id is allowed only when entity_type = 'venue' (artist rows
--     share the integer entity_id namespace and must not ride the composite FK);
--   * ON DELETE SET NULL (hall_id) on PG15+ so deleting a hall keeps the event
--     and the venue entity_id; PG < 15 falls back to RESTRICT (archive instead).
-- booking projection:
--   * calendar_events_booking_fk (booking_id → booking_requests.id ON DELETE SET NULL);
--   * UNIQUE INDEX calendar_events_booking_id_unique on booking_id (NULLs allowed).
-- schema.ts must not declare onDelete on the composite hall FK: Drizzle would
-- SET NULL both hall_id and entity_id. SQL in this file is authoritative.

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

ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_hall_requires_venue_entity_chk;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_hall_requires_venue_entity_chk
  CHECK (hall_id IS NULL OR entity_type = 'venue');

DO $$
DECLARE v int := current_setting('server_version_num')::int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_hall_venue_fk') THEN
    ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_hall_venue_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_hall_fk') THEN
    ALTER TABLE calendar_events DROP CONSTRAINT calendar_events_hall_fk;
  END IF;
  IF v >= 150000 THEN
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_hall_venue_fk
      FOREIGN KEY (hall_id, entity_id) REFERENCES venue_halls(id, venue_id)
      ON DELETE SET NULL (hall_id);
  ELSE
    ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_hall_venue_fk
      FOREIGN KEY (hall_id, entity_id) REFERENCES venue_halls(id, venue_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Idempotent unique projection: one calendar_events row per booking_id.
-- Multiple NULL booking_id values remain valid. Duplicate non-null booking_id
-- rows cause this statement to fail loudly; do not rewrite history to force it.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_booking_id_unique
  ON calendar_events (booking_id);

COMMIT;
